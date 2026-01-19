# Which Game

Static web app that ranks games for a group based on player preferences and game rules.
All parsing and scoring happens in the browser.

## Quick start

1. Open `index.html` in a browser.
2. Tick the players who are online.
3. Read the recommendations.

Data loads automatically from `data.js` (generated from `UserData.xlsx` and `gameRules.txt`).

## Admin edits

Use the "Admin login" button to edit player scores inside the page.
Passcode: `REDACTED`.
Changes save to this browser only (localStorage). Use "Reset to defaults" to revert.

## Preferences format

Wide format (recommended):

```csv
game,Mike,Chris,Kirill
Valorant,3,2,2
Counterstrike,2,3,1
```

Long format (also supported):

```csv
player,game,score
Mike,Valorant,3
Chris,Valorant,2
```

Paired-column XLSX format (used in `UserData.xlsx`):

```text
Mike | mikeScore | Chris | chrisScore | ...
Valorant | 3 | Valorant | 3 | ...
```

Scores use the 0-3 scale:
- 3 = love
- 2 = like
- 1 = ok with it
- 0 = veto (game is excluded if any selected player is 0)

If a score is missing, the app uses the default score of 1.

## Game rules format

```csv
game,min_players,max_players,ideal_min,ideal_max,online_cap,notes
Valorant,2,5,4,5,5,
Counterstrike,2,10,4,8,10,
```

- `min_players` and `max_players` are hard limits.
- `online_cap` is another hard limit (optional).
- `ideal_min` and `ideal_max` add a small bonus when the player count is in range.

You can also provide `gameRules.txt` with sentences like:

```text
Valorant - Valorant cannot be played with 4 players. Valorant is best played with 5 players.
```

The parser looks for phrases like "can be played with", "cannot be played with",
"best played with", and numeric ranges.

## Updating the embedded data

If you change `UserData.xlsx` or `gameRules.txt`, regenerate `data.js`:

```powershell
./scripts/build-data.ps1
```

## Scoring logic

- If any selected player has a score of 0, the game is excluded.
- If player count violates min/max/online cap, the game is excluded.
- Remaining games are ranked by total score (sum of player scores), plus a small bonus
  for ideal player count.

## Free hosting options

GitHub Pages:
1. Create a GitHub repo and push this folder.
2. In repo settings, enable Pages from the root.
3. Share the Pages URL with your group.

Netlify:
1. Drag and drop this folder into Netlify.
2. Netlify gives you a shareable URL instantly.

Cloudflare Pages:
1. Create a new Pages project and upload the folder.
2. Share the generated URL.
