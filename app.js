const state = {
  preferences: null,
  basePreferences: null,
  rules: null,
  players: [],
  missingScoreDefault: 1,
  adminUnlocked: false,
};

const dom = {};

const CLUBS_LEAGUE_KEY = "clubs - league";
const FIVE_PLAYER_PRIORITY = new Set(["valorant", "counterstrike", "dota 2"]);
const ADMIN_PASSCODE = "0670";
const OVERRIDES_KEY = "whichGameOverridesV1";

document.addEventListener("DOMContentLoaded", () => {
  dom.playersList = document.getElementById("playersList");
  dom.playersEmpty = document.getElementById("playersEmpty");
  dom.topGame = document.getElementById("topGame");
  dom.topGameEmpty = document.getElementById("topGameEmpty");
  dom.otherGames = document.getElementById("otherGames");
  dom.otherGamesEmpty = document.getElementById("otherGamesEmpty");
  dom.clearAll = document.getElementById("clearAll");
  dom.adminLogin = document.getElementById("adminLogin");
  dom.adminModal = document.getElementById("adminModal");
  dom.adminClose = document.getElementById("adminClose");
  dom.adminPasscode = document.getElementById("adminPasscode");
  dom.adminUnlock = document.getElementById("adminUnlock");
  dom.adminAuth = document.getElementById("adminAuth");
  dom.adminPanel = document.getElementById("adminPanel");
  dom.adminAuthError = document.getElementById("adminAuthError");
  dom.adminTable = document.getElementById("adminTable");
  dom.adminSave = document.getElementById("adminSave");
  dom.adminReset = document.getElementById("adminReset");

  if (dom.adminModal) {
    dom.adminModal.classList.add("hidden");
    dom.adminModal.setAttribute("aria-hidden", "true");
  }

  if (dom.clearAll) {
    dom.clearAll.addEventListener("click", () => toggleAllPlayers(false));
  }
  if (dom.adminLogin) {
    dom.adminLogin.addEventListener("click", openAdminModal);
  }
  if (dom.adminClose) {
    dom.adminClose.addEventListener("click", closeAdminModal);
  }
  if (dom.adminUnlock) {
    dom.adminUnlock.addEventListener("click", handleAdminUnlock);
  }
  if (dom.adminPasscode) {
    dom.adminPasscode.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        handleAdminUnlock();
      }
    });
  }
  if (dom.adminSave) {
    dom.adminSave.addEventListener("click", saveAdminChanges);
  }
  if (dom.adminReset) {
    dom.adminReset.addEventListener("click", resetAdminChanges);
  }

  if (window.WHICH_GAME_DATA) {
    loadEmbeddedData(window.WHICH_GAME_DATA);
  }
});

function loadEmbeddedData(data) {
  if (!data || !data.preferences) {
    return;
  }
  const prefParsed = parsePreferencesData(data.preferences);
  const rulesParsed = data.rulesText
    ? parseRulesText(data.rulesText)
    : data.rules
      ? parseRulesData(data.rules)
      : { rules: new Map(), warnings: [] };

  state.basePreferences = clonePreferences(prefParsed.preferences);
  state.preferences = clonePreferences(prefParsed.preferences);
  state.players = prefParsed.players;
  state.rules = rulesParsed.rules;
  applyStoredOverrides();
  renderPlayers();
  computeAndRender();
}

function clonePreferences(preferences) {
  const clone = new Map();
  for (const [gameKey, entry] of preferences.entries()) {
    const scores = new Map(entry.scores);
    clone.set(gameKey, { name: entry.name, scores });
  }
  return clone;
}

function applyStoredOverrides() {
  const overrides = loadOverrides();
  if (!overrides) {
    return;
  }
  applyOverrides(state.preferences, overrides);
}

function loadOverrides() {
  if (!window.localStorage) {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(OVERRIDES_KEY);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

function applyOverrides(preferences, overrides) {
  if (!overrides || !Array.isArray(overrides.entries)) {
    return;
  }
  for (const entry of overrides.entries) {
    if (!entry || !entry.gameKey) {
      continue;
    }
    let target = preferences.get(entry.gameKey);
    if (!target) {
      target = { name: entry.name || entry.gameKey, scores: new Map() };
      preferences.set(entry.gameKey, target);
    }
    if (entry.name) {
      target.name = entry.name;
    }
    if (entry.scores && typeof entry.scores === "object") {
      for (const [player, value] of Object.entries(entry.scores)) {
        const score = Number(value);
        if (Number.isFinite(score)) {
          target.scores.set(player, score);
        }
      }
    }
  }
}

function saveOverrides() {
  if (!window.localStorage || !state.preferences) {
    return;
  }
  const entries = [];
  for (const [gameKey, entry] of state.preferences.entries()) {
    const scores = {};
    for (const player of state.players) {
      if (entry.scores.has(player)) {
        scores[player] = entry.scores.get(player);
      }
    }
    entries.push({ gameKey, name: entry.name, scores });
  }
  try {
    window.localStorage.setItem(OVERRIDES_KEY, JSON.stringify({ entries }));
  } catch (error) {
    return;
  }
}

function clearOverrides() {
  if (!window.localStorage) {
    return;
  }
  try {
    window.localStorage.removeItem(OVERRIDES_KEY);
  } catch (error) {
    return;
  }
}

function parsePairedPreferences(data, warnings) {
  const fields = data.fields && data.fields.length ? data.fields : [];
  const pairs = [];

  for (let i = 0; i < fields.length - 1; i++) {
    const playerField = cleanValue(fields[i]);
    const scoreField = cleanValue(fields[i + 1]);
    if (!playerField || !scoreField) {
      continue;
    }
    if (!normalizeHeader(scoreField).includes("score")) {
      continue;
    }
    if (normalizeHeader(playerField) === "game") {
      continue;
    }
    pairs.push({
      player: playerField,
      gameField: fields[i],
      scoreField: fields[i + 1],
    });
    i += 1;
  }

  if (pairs.length < 1) {
    return null;
  }

  const preferences = new Map();
  const playersSet = new Set();
  const mismatchRows = new Set();

  for (const pair of pairs) {
    playersSet.add(pair.player);
  }

  for (let rowIndex = 0; rowIndex < data.rows.length; rowIndex++) {
    const row = data.rows[rowIndex];
    let gameName = "";
    for (const pair of pairs) {
      const candidate = cleanValue(row[pair.gameField]);
      if (!candidate) {
        continue;
      }
      if (!gameName) {
        gameName = candidate;
      } else if (
        normalizeName(candidate) !== normalizeName(gameName) &&
        !mismatchRows.has(rowIndex)
      ) {
        warnings.push(
          `Row ${rowIndex + 2} has mismatched game names across player columns.`
        );
        mismatchRows.add(rowIndex);
      }
    }
    if (!gameName) {
      continue;
    }
    for (const pair of pairs) {
      const score = parseScore(row[pair.scoreField], warnings, gameName, pair.player);
      addPreference(preferences, gameName, pair.player, score);
    }
  }

  return {
    preferences,
    players: Array.from(playersSet).sort(),
    warnings,
  };
}

function parsePreferencesData(data) {
  const warnings = [];
  const fields = data.fields && data.fields.length ? data.fields : [];
  if (!fields.length) {
    throw new Error("No header row found for preferences.");
  }

  const gameField = findField(fields, ["game", "game_name", "game name", "title"]);
  const playerField = findField(fields, ["player", "player_name", "player name", "person"]);
  const scoreField = findField(fields, ["score", "rating", "weight", "preference", "pref"]);

  const preferences = new Map();
  const playersSet = new Set();

  if (gameField && playerField && scoreField) {
    for (const row of data.rows) {
      const gameName = cleanValue(row[gameField]);
      const playerName = cleanValue(row[playerField]);
      if (!gameName || !playerName) {
        continue;
      }
      const score = parseScore(row[scoreField], warnings, gameName, playerName);
      addPreference(preferences, gameName, playerName, score);
      playersSet.add(playerName);
    }
  } else {
    const paired = parsePairedPreferences(data, warnings);
    if (paired) {
      return paired;
    }
  }

  if (gameField) {
    const playerFields = fields.filter((field) => field !== gameField);
    if (!playerFields.length) {
      throw new Error("No player columns found in preferences.");
    }
    for (const playerFieldName of playerFields) {
      const cleanedPlayer = cleanValue(playerFieldName);
      if (cleanedPlayer) {
        playersSet.add(cleanedPlayer);
      }
    }
    for (const row of data.rows) {
      const gameName = cleanValue(row[gameField]);
      if (!gameName) {
        continue;
      }
      for (const playerFieldName of playerFields) {
        const playerName = cleanValue(playerFieldName);
        if (!playerName) {
          continue;
        }
        const score = parseScore(row[playerFieldName], warnings, gameName, playerName);
        addPreference(preferences, gameName, playerName, score);
      }
    }
  }

  if (!gameField) {
    throw new Error("Preferences must include a game column.");
  }

  return {
    preferences,
    players: Array.from(playersSet).sort(),
    warnings,
  };
}

function parseRulesData(data) {
  const warnings = [];
  const fields = data.fields && data.fields.length ? data.fields : [];
  if (!fields.length) {
    throw new Error("No header row found for game rules.");
  }

  const gameField = findField(fields, ["game", "game_name", "game name", "title"]);
  if (!gameField) {
    throw new Error("Rules must include a game column.");
  }

  const minField = findField(fields, [
    "min_players",
    "min players",
    "min",
    "minimum",
    "minplayers",
  ]);
  const maxField = findField(fields, [
    "max_players",
    "max players",
    "max",
    "maximum",
    "maxplayers",
  ]);
  const idealMinField = findField(fields, [
    "ideal_min",
    "ideal min",
    "best_min",
    "idealmin",
  ]);
  const idealMaxField = findField(fields, [
    "ideal_max",
    "ideal max",
    "best_max",
    "idealmax",
  ]);
  const onlineField = findField(fields, [
    "online_cap",
    "online cap",
    "online_max",
    "onlinecap",
  ]);
  const notesField = findField(fields, ["notes", "note", "comment"]);

  const rules = new Map();

  for (const row of data.rows) {
    const gameName = cleanValue(row[gameField]);
    if (!gameName) {
      continue;
    }
    const minPlayers = parseNumber(row[minField], 1);
    const maxPlayers = parseNumber(row[maxField], Infinity);
    const idealMin = parseNumber(row[idealMinField], null);
    const idealMax = parseNumber(row[idealMaxField], null);
    const onlineCap = parseNumber(row[onlineField], null);
    const notes = notesField ? cleanValue(row[notesField]) : "";

    if (Number.isFinite(minPlayers) && Number.isFinite(maxPlayers) && minPlayers > maxPlayers) {
      warnings.push(`Rule issue for ${gameName}: min_players is greater than max_players.`);
    }

    const gameKey = normalizeName(gameName);
    rules.set(gameKey, {
      name: gameName,
      minPlayers,
      maxPlayers,
      idealMin,
      idealMax,
      onlineCap,
      notes,
      allowedCounts: new Set(),
      disallowedCounts: new Set(),
      rangeAllowed: false,
    });
  }

  return { rules, warnings };
}

function parseRulesText(text) {
  const warnings = [];
  const rules = new Map();
  const blocks = text
    .split(/\r?\n\s*\r?\n/)
    .map((block) => block.trim())
    .filter(Boolean);

  for (const block of blocks) {
    const { name, content } = splitRuleBlock(block);
    if (!name) {
      warnings.push("Could not determine a game name in gameRules.txt.");
      continue;
    }
    const rule = {
      name,
      minPlayers: 1,
      maxPlayers: Infinity,
      idealMin: null,
      idealMax: null,
      onlineCap: null,
      notes: content,
      allowedCounts: new Set(),
      disallowedCounts: new Set(),
      rangeAllowed: false,
    };

    const sentences = content
      .replace(/\r?\n/g, " ")
      .split(/[.!?]/)
      .map((sentence) => sentence.trim())
      .filter(Boolean);

    for (const sentence of sentences) {
      applyRuleSentence(rule, sentence, warnings);
    }

    rules.set(normalizeName(name), rule);
  }

  return { rules, warnings };
}

function splitRuleBlock(block) {
  const normalized = block.replace(/\s+/g, " ").trim();
  const parts = normalized.split(" - ");
  if (parts.length === 1) {
    return { name: guessGameName(normalized), content: normalized };
  }

  for (let i = parts.length - 2; i >= 0; i--) {
    const candidate = parts.slice(0, i + 1).join(" - ").trim();
    const remainder = parts.slice(i + 1).join(" - ").trim();
    if (!candidate || !remainder) {
      continue;
    }
    const candidateNorm = normalizeLoose(candidate);
    const remainderNorm = normalizeLoose(remainder);
    if (remainderNorm.startsWith(candidateNorm)) {
      return { name: candidate, content: remainder };
    }
  }

  return { name: parts[0].trim(), content: parts.slice(1).join(" - ").trim() };
}

function guessGameName(text) {
  const match = text.match(/^(.*?)\s+(can|cannot|is)\b/i);
  if (match) {
    return match[1].trim();
  }
  return text.split(".")[0].trim();
}

function normalizeLoose(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function applyRuleSentence(rule, sentence, warnings) {
  const lower = sentence.toLowerCase();
  const numbers = extractNumbers(lower);

  if (lower.includes("best") && lower.includes("played with") && numbers.length) {
    const best = numbers[0];
    rule.idealMin = best;
    rule.idealMax = best;
    rule.allowedCounts.add(best);
    return;
  }

  if (lower.includes("cannot be played with")) {
    const moreMatch = lower.match(/cannot be played with (\d+)\s*or more/);
    if (moreMatch) {
      const value = Number(moreMatch[1]);
      rule.maxPlayers = Math.min(rule.maxPlayers, value - 1);
      return;
    }
    const moreThanMatch = lower.match(/cannot be played with more than (\d+)/);
    if (moreThanMatch) {
      const value = Number(moreThanMatch[1]);
      rule.maxPlayers = Math.min(rule.maxPlayers, value);
      return;
    }
    if (numbers.length) {
      numbers.forEach((value) => rule.disallowedCounts.add(value));
      return;
    }
  }

  if (lower.includes("can be played with")) {
    const moreThanMatch = lower.match(/can be played with more than (\d+)/);
    if (moreThanMatch) {
      const value = Number(moreThanMatch[1]);
      rule.minPlayers = Math.max(rule.minPlayers, value + 1);
      rule.rangeAllowed = true;
      return;
    }
    const orMoreMatch = lower.match(/can be played with (\d+)\s*or more/);
    if (orMoreMatch) {
      const value = Number(orMoreMatch[1]);
      rule.minPlayers = Math.max(rule.minPlayers, value);
      rule.rangeAllowed = true;
      return;
    }
    const upToMatch = lower.match(/can be played with up to (\d+)/);
    if (upToMatch) {
      const value = Number(upToMatch[1]);
      rule.maxPlayers = Math.min(rule.maxPlayers, value);
      rule.rangeAllowed = true;
      return;
    }
    const betweenMatch = lower.match(/can be played with between (\d+)\s*and\s*(\d+)/);
    if (betweenMatch) {
      const minValue = Number(betweenMatch[1]);
      const maxValue = Number(betweenMatch[2]);
      rule.minPlayers = Math.max(rule.minPlayers, minValue);
      rule.maxPlayers = Math.min(rule.maxPlayers, maxValue);
      rule.rangeAllowed = true;
      return;
    }
    const rangeMatch = lower.match(/can be played with (\d+)\s*to\s*(\d+)/);
    if (rangeMatch) {
      const minValue = Number(rangeMatch[1]);
      const maxValue = Number(rangeMatch[2]);
      rule.minPlayers = Math.max(rule.minPlayers, minValue);
      rule.maxPlayers = Math.min(rule.maxPlayers, maxValue);
      rule.rangeAllowed = true;
      return;
    }
    if (numbers.length) {
      numbers.forEach((value) => rule.allowedCounts.add(value));
      return;
    }
  }

  if (numbers.length && lower.includes("cannot")) {
    warnings.push(`Unparsed rule: "${sentence}".`);
  }
}

function extractNumbers(text) {
  const matches = text.match(/\d+/g);
  if (!matches) {
    return [];
  }
  return matches.map((value) => Number(value));
}

function addPreference(preferences, gameName, playerName, score) {
  const gameKey = normalizeName(gameName);
  if (!gameKey) {
    return;
  }
  let entry = preferences.get(gameKey);
  if (!entry) {
    entry = { name: gameName, scores: new Map() };
    preferences.set(gameKey, entry);
  }
  if (gameName && gameName.trim()) {
    entry.name = gameName.trim();
  }
  if (score !== null && score !== undefined) {
    entry.scores.set(playerName, score);
  }
}

function parseScore(value, warnings, gameName, playerName) {
  if (value === null || value === undefined || String(value).trim() === "") {
    return null;
  }
  const num = Number(value);
  if (!Number.isFinite(num)) {
    warnings.push(`Score for ${playerName} on ${gameName} is not a number.`);
    return null;
  }
  if (num < 0 || num > 3) {
    warnings.push(`Score for ${playerName} on ${gameName} is outside 0-3.`);
    return null;
  }
  return num;
}

function parseNumber(value, fallback) {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return fallback;
  }
  return num;
}

function cleanValue(value) {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value).trim();
}

function findField(fields, candidates) {
  const lookup = new Map();
  for (const field of fields) {
    lookup.set(normalizeHeader(field), field);
  }
  for (const candidate of candidates) {
    const match = lookup.get(candidate);
    if (match) {
      return match;
    }
  }
  return null;
}

function normalizeHeader(value) {
  return String(value).trim().toLowerCase();
}

function normalizeName(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function renderPlayers() {
  dom.playersList.innerHTML = "";
  if (!state.players.length) {
    dom.playersEmpty.style.display = "block";
    return;
  }

  dom.playersEmpty.style.display = "none";
  for (const player of state.players) {
    const label = document.createElement("label");
    label.className = "player-pill";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = false;
    checkbox.dataset.player = player;
    checkbox.addEventListener("change", computeAndRender);
    const span = document.createElement("span");
    span.textContent = player;
    label.appendChild(checkbox);
    label.appendChild(span);
    dom.playersList.appendChild(label);
  }
}

function toggleAllPlayers(checked) {
  const checkboxes = dom.playersList.querySelectorAll("input[type='checkbox']");
  checkboxes.forEach((checkbox) => {
    checkbox.checked = checked;
  });
  computeAndRender();
}

function openAdminModal() {
  if (!dom.adminModal) {
    return;
  }
  dom.adminModal.classList.remove("hidden");
  dom.adminModal.setAttribute("aria-hidden", "false");
  dom.adminAuthError.textContent = "";
  if (state.adminUnlocked) {
    showAdminPanel();
  } else {
    showAdminAuth();
  }
  if (dom.adminPasscode) {
    dom.adminPasscode.value = "";
    dom.adminPasscode.focus();
  }
}

function closeAdminModal() {
  if (!dom.adminModal) {
    return;
  }
  dom.adminModal.classList.add("hidden");
  dom.adminModal.setAttribute("aria-hidden", "true");
  dom.adminAuthError.textContent = "";
}

function showAdminAuth() {
  if (!dom.adminAuth || !dom.adminPanel) {
    return;
  }
  dom.adminAuth.classList.remove("hidden");
  dom.adminPanel.classList.add("hidden");
}

function showAdminPanel() {
  if (!dom.adminAuth || !dom.adminPanel) {
    return;
  }
  dom.adminAuth.classList.add("hidden");
  dom.adminPanel.classList.remove("hidden");
  renderAdminTable();
}

function handleAdminUnlock() {
  if (!dom.adminPasscode) {
    return;
  }
  const passcode = dom.adminPasscode.value.trim();
  if (passcode !== ADMIN_PASSCODE) {
    dom.adminAuthError.textContent = "Incorrect passcode.";
    return;
  }
  state.adminUnlocked = true;
  dom.adminAuthError.textContent = "";
  showAdminPanel();
}

function renderAdminTable() {
  if (!dom.adminTable || !state.preferences) {
    return;
  }
  dom.adminTable.innerHTML = "";

  const header = document.createElement("thead");
  const headerRow = document.createElement("tr");
  const gameHeader = document.createElement("th");
  gameHeader.textContent = "Game";
  headerRow.appendChild(gameHeader);
  for (const player of state.players) {
    const th = document.createElement("th");
    th.textContent = player;
    headerRow.appendChild(th);
  }
  header.appendChild(headerRow);
  dom.adminTable.appendChild(header);

  const body = document.createElement("tbody");
  const entries = Array.from(state.preferences.entries()).map(([gameKey, entry]) => ({
    gameKey,
    name: entry.name,
    scores: entry.scores,
  }));
  entries.sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    const row = document.createElement("tr");
    const nameCell = document.createElement("td");
    nameCell.textContent = entry.name;
    row.appendChild(nameCell);

    for (const player of state.players) {
      const cell = document.createElement("td");
      const select = document.createElement("select");
      select.dataset.game = entry.gameKey;
      select.dataset.player = player;
      const existing = entry.scores.has(player) ? entry.scores.get(player) : null;
      const value =
        existing === null || existing === undefined
          ? state.missingScoreDefault
          : existing;
      for (let score = 0; score <= 3; score += 1) {
        const option = document.createElement("option");
        option.value = String(score);
        option.textContent = String(score);
        if (score === value) {
          option.selected = true;
        }
        select.appendChild(option);
      }
      cell.appendChild(select);
      row.appendChild(cell);
    }
    body.appendChild(row);
  }

  dom.adminTable.appendChild(body);
}

function saveAdminChanges() {
  if (!dom.adminTable || !state.preferences) {
    return;
  }
  const selects = dom.adminTable.querySelectorAll("select[data-game][data-player]");
  selects.forEach((select) => {
    const gameKey = select.dataset.game;
    const player = select.dataset.player;
    const value = Number(select.value);
    if (!Number.isFinite(value)) {
      return;
    }
    let entry = state.preferences.get(gameKey);
    if (!entry) {
      entry = { name: gameKey, scores: new Map() };
      state.preferences.set(gameKey, entry);
    }
    entry.scores.set(player, value);
  });
  saveOverrides();
  computeAndRender();
}

function resetAdminChanges() {
  if (!state.basePreferences) {
    return;
  }
  state.preferences = clonePreferences(state.basePreferences);
  clearOverrides();
  renderAdminTable();
  computeAndRender();
}

function getSelectedPlayers() {
  return Array.from(dom.playersList.querySelectorAll("input[type='checkbox']"))
    .filter((checkbox) => checkbox.checked)
    .map((checkbox) => checkbox.dataset.player);
}

function computeAndRender() {
  const recommendations = [];

  if (!state.preferences) {
    renderRecommendations(recommendations, "Data not loaded.");
    return;
  }

  const selectedPlayers = getSelectedPlayers();
  const playerCount = selectedPlayers.length;
  if (playerCount < 3) {
    renderRecommendations(recommendations, "Select at least 3 players.");
    return;
  }

  const gameKeys = new Set([
    ...Array.from(state.preferences.keys()),
    ...(state.rules ? Array.from(state.rules.keys()) : []),
  ]);

  for (const gameKey of gameKeys) {
    const pref = state.preferences.get(gameKey);
    const rules = state.rules ? state.rules.get(gameKey) : null;
    const name = (rules && rules.name) || (pref && pref.name) || gameKey;

    const minPlayers = rules && Number.isFinite(rules.minPlayers) ? rules.minPlayers : 1;
    const maxPlayers =
      rules && Number.isFinite(rules.maxPlayers) ? rules.maxPlayers : Infinity;
    const onlineCap = rules && Number.isFinite(rules.onlineCap) ? rules.onlineCap : null;
    const allowedCounts = rules ? rules.allowedCounts : null;
    const disallowedCounts = rules ? rules.disallowedCounts : null;
    const rangeAllowed = rules ? rules.rangeAllowed : false;

    const reasons = [];
    if (gameKey === CLUBS_LEAGUE_KEY && playerCount < 5) {
      continue;
    }

    let countAllowed = true;

    if (disallowedCounts && disallowedCounts.has(playerCount)) {
      reasons.push(`${playerCount} players not allowed`);
      countAllowed = false;
    }

    if (countAllowed && allowedCounts && allowedCounts.size > 0) {
      let allowed = allowedCounts.has(playerCount);
      if (!allowed && rangeAllowed) {
        allowed = playerCount >= minPlayers && playerCount <= maxPlayers;
      }
      if (!allowed) {
        reasons.push(`rules do not allow ${playerCount} players`);
        countAllowed = false;
      }
    }

    const explicitlyAllowed =
      allowedCounts && allowedCounts.size > 0 && allowedCounts.has(playerCount);

    if (countAllowed && !explicitlyAllowed) {
      if (playerCount < minPlayers) {
        reasons.push(`needs at least ${minPlayers} players`);
      }
      if (Number.isFinite(maxPlayers) && playerCount > maxPlayers) {
        reasons.push(`max ${maxPlayers} players`);
      }
    }
    if (countAllowed && onlineCap && playerCount > onlineCap) {
      reasons.push(`online cap ${onlineCap}`);
    }

    let totalScore = 0;
    let vetoedBy = null;

    for (const player of selectedPlayers) {
      let score = pref && pref.scores.has(player) ? pref.scores.get(player) : null;
      if (score === null || score === undefined) {
        score = state.missingScoreDefault;
      }
      if (score === 0) {
        vetoedBy = player;
        break;
      }
      totalScore += score;
    }

    if (vetoedBy) {
      reasons.unshift(`${vetoedBy} vetoed`);
    }

    if (reasons.length) {
      continue;
    }

    const averageScore = totalScore / selectedPlayers.length;
    const bonus =
      rules &&
      Number.isFinite(rules.idealMin) &&
      Number.isFinite(rules.idealMax) &&
      selectedPlayers.length >= rules.idealMin &&
      selectedPlayers.length <= rules.idealMax
        ? 1
        : 0;
    recommendations.push({
      name,
      totalScore,
      averageScore,
      bonus,
      idealRange:
        rules && Number.isFinite(rules.idealMin) && Number.isFinite(rules.idealMax)
          ? `${rules.idealMin}-${rules.idealMax}`
          : null,
    });
  }

  recommendations.sort((a, b) => {
    if (b.totalScore + b.bonus !== a.totalScore + a.bonus) {
      return b.totalScore + b.bonus - (a.totalScore + a.bonus);
    }
    if (b.averageScore !== a.averageScore) {
      return b.averageScore - a.averageScore;
    }
    return a.name.localeCompare(b.name);
  });

  let finalRecommendations = recommendations;
  if (playerCount === 5) {
    const priorityGame = recommendations.find((item) =>
      FIVE_PLAYER_PRIORITY.has(normalizeName(item.name))
    );
    if (priorityGame && recommendations[0] !== priorityGame) {
      finalRecommendations = [
        priorityGame,
        ...recommendations.filter((item) => item !== priorityGame),
      ];
    }
  }

  renderRecommendations(finalRecommendations, "No eligible games.");
}

function renderRecommendations(recommendations, emptyMessage) {
  if (!recommendations.length) {
    setTopGame("", emptyMessage);
    setOtherGames([], emptyMessage);
    return;
  }

  const [top, ...others] = recommendations;
  setTopGame(top.name, emptyMessage);
  setOtherGames(
    others.map((item) => item.name),
    "No other eligible games."
  );
}

function setTopGame(name, emptyMessage) {
  if (name) {
    dom.topGame.textContent = name;
    dom.topGame.style.display = "block";
    dom.topGameEmpty.style.display = "none";
  } else {
    dom.topGame.textContent = "";
    dom.topGame.style.display = "none";
    dom.topGameEmpty.textContent = emptyMessage;
    dom.topGameEmpty.style.display = "block";
  }
}

function setOtherGames(names, emptyMessage) {
  dom.otherGames.innerHTML = "";
  if (names.length) {
    dom.otherGames.style.display = "grid";
    dom.otherGamesEmpty.style.display = "none";
    for (const name of names) {
      const item = document.createElement("li");
      item.textContent = name;
      dom.otherGames.appendChild(item);
    }
  } else {
    dom.otherGames.style.display = "none";
    dom.otherGamesEmpty.textContent = emptyMessage;
    dom.otherGamesEmpty.style.display = "block";
  }
}
