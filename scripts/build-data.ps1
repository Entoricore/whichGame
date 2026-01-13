$ErrorActionPreference = 'Stop'

Copy-Item -Path 'UserData.xlsx' -Destination 'UserData_copy.xlsx' -Force

Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead('UserData_copy.xlsx')
$sheetEntry = $zip.GetEntry('xl/worksheets/sheet1.xml')
$sharedEntry = $zip.GetEntry('xl/sharedStrings.xml')

[xml]$sheetXml = New-Object System.Xml.XmlDocument
$sheetXml.Load($sheetEntry.Open())
[xml]$sharedXml = New-Object System.Xml.XmlDocument
$sharedXml.Load($sharedEntry.Open())

$ns = New-Object System.Xml.XmlNamespaceManager($sheetXml.NameTable)
$ns.AddNamespace('main','http://schemas.openxmlformats.org/spreadsheetml/2006/main')
$nsShared = New-Object System.Xml.XmlNamespaceManager($sharedXml.NameTable)
$nsShared.AddNamespace('main','http://schemas.openxmlformats.org/spreadsheetml/2006/main')

$siNodes = $sharedXml.SelectNodes('//main:si', $nsShared)
$sharedStrings = @()
foreach ($si in $siNodes) {
    $t = $si.SelectSingleNode('main:t', $nsShared)
    if ($t -ne $null) {
        $sharedStrings += $t.InnerText
    } else {
        $runs = $si.SelectNodes('main:r/main:t', $nsShared)
        $text = ''
        foreach ($run in $runs) { $text += $run.InnerText }
        $sharedStrings += $text
    }
}

$colToNumber = {
    param($letters)
    $col = 0
    foreach ($ch in $letters.ToCharArray()) {
        $col = $col * 26 + ([int][char]$ch - [int][char]'A' + 1)
    }
    return $col
}

$cells = @{}
$cellNodes = $sheetXml.SelectNodes('//main:c', $ns)
foreach ($cell in $cellNodes) {
    $ref = $cell.GetAttribute('r')
    $type = $cell.GetAttribute('t')
    $vNode = $cell.SelectSingleNode('main:v', $ns)
    $value = $null
    if ($vNode -ne $null) {
        $value = $vNode.InnerText
        if ($type -eq 's') {
            if ($value -ne '') { $value = $sharedStrings[[int]$value] }
        } else {
            $numValue = 0
            if ([double]::TryParse($value, [ref]$numValue)) {
                if ($value -match '^\d+$') {
                    $value = [int]$numValue
                } else {
                    $value = $numValue
                }
            }
        }
    } else {
        $isNode = $cell.SelectSingleNode('main:is/main:t', $ns)
        if ($isNode -ne $null) { $value = $isNode.InnerText }
    }
    if ($null -ne $value -and -not [string]::IsNullOrWhiteSpace([string]$value)) {
        $cells[$ref] = $value
    }
}

$zip.Dispose()

$headers = @()
foreach ($ref in $cells.Keys) {
    if ($ref -match '^([A-Z]+)1$') {
        $letters = $matches[1]
        $headers += [pscustomobject]@{
            Name = $cells[$ref]
            ColLetters = $letters
            ColNumber = & $colToNumber $letters
        }
    }
}
$headers = $headers | Sort-Object ColNumber

$headerCols = $headers.ColLetters
$maxRow = 1
foreach ($ref in $cells.Keys) {
    if ($ref -match '^([A-Z]+)([0-9]+)$') {
        $letters = $matches[1]
        $row = [int]$matches[2]
        if ($row -le 1) { continue }
        if ($headerCols -contains $letters) {
            if ($row -gt $maxRow) { $maxRow = $row }
        }
    }
}

$rows = @()
for ($r = 2; $r -le $maxRow; $r++) {
    $obj = [ordered]@{}
    $hasValue = $false
    foreach ($header in $headers) {
        $ref = "$($header.ColLetters)$r"
        $val = $null
        if ($cells.ContainsKey($ref)) { $val = $cells[$ref] }
        if ($null -ne $val -and -not [string]::IsNullOrWhiteSpace([string]$val)) { $hasValue = $true }
        $obj[$header.Name] = $val
    }
    if ($hasValue) { $rows += $obj }
}

$rulesText = [string](Get-Content -Raw -Path 'gameRules.txt')

$data = [ordered]@{
    preferences = [ordered]@{
        fields = $headers.Name
        rows = $rows
    }
    rulesText = $rulesText
}

$json = $data | ConvertTo-Json -Depth 8
$js = "window.WHICH_GAME_DATA = $json;"
$js | Set-Content -Path 'data.js'

Write-Output 'Generated data.js'
