import { DEFAULT_EIGHTS_GAMES, eightsGameName } from "./freeEightsGames.js";
import { getMapImage } from "./cdlMaps.js";

export const TOURNAMENT_MODES = [
  { id: "snd", name: "Search & Destroy" },
  { id: "hp", name: "Hardpoint" },
  { id: "control", name: "Control" },
  { id: "overload", name: "Overload" },
];

export const TOURNAMENT_GAMES = [
  ...DEFAULT_EIGHTS_GAMES.map((game) => ({
    id: game.id,
    name: eightsGameName(game),
    pools: Object.fromEntries(TOURNAMENT_MODES.map(({ id }) => [id,
      game.modes.find((mode) => mode.id === id)?.maps.map((map) => map.name) || [],
    ])),
  })),
  { id: "mw4", name: "Modern Warfare 4", pools: { snd: [], hp: [], control: [], overload: [] } },
];
// Preserve the existing tournament pool for older BO7 events.
TOURNAMENT_GAMES[0].pools.snd = ["Hacienda", "Gridlock", "Raid", "Scar", "Den", "Sake", "Colossus"];

export function tournamentGameId(tournament = {}) {
  if (tournament.game_id) return String(tournament.game_id).toLowerCase();
  const name = String(tournament.game_name || tournament.game || "").toLowerCase();
  return TOURNAMENT_GAMES.find((game) => name.includes(game.name.toLowerCase()))?.id || "bo7";
}

export const tournamentGameName = (tournament = {}) => (
  TOURNAMENT_GAMES.find((game) => game.id === tournamentGameId(tournament))?.name
  || tournament.game_name || tournament.game || "Black Ops 7"
);

export function tournamentMapImage(name, gameId = "bo7") {
  if (gameId === "bo7") return getMapImage(name);
  const game = DEFAULT_EIGHTS_GAMES.find((row) => row.id === gameId);
  return game?.modes.flatMap((mode) => mode.maps).find((map) => map.name.toLowerCase() === String(name).toLowerCase())?.image;
}

export function parseTournamentMapList(value, fallback = []) {
  const rows = value == null ? fallback : Array.isArray(value) ? value : String(value).split(/[\n,]+/);
  return [...new Set(rows.map((row) => String(row || "").trim()).filter(Boolean))];
}

export function tournamentMapPools(tournament = {}) {
  const defaults = TOURNAMENT_GAMES.find((game) => game.id === tournamentGameId(tournament))?.pools || {};
  return Object.fromEntries(TOURNAMENT_MODES.map(({ id }) => [id, parseTournamentMapList(
    tournament.map_pools?.[id] ?? tournament[`${id}_map_pool`] ?? tournament[`${id}_maps`]
      ?? (id === "snd" ? tournament.maps : undefined),
    defaults[id],
  )]));
}

export function tournamentMapForm(tournament = {}) {
  return Object.fromEntries(Object.entries(tournamentMapPools(tournament)).map(([id, maps]) => [`${id}_maps`, maps.join("\n")]));
}

// Cache edits per game while switching the selector in the same form.
export function switchTournamentGame(form, gameId) {
  const mapFields = {
    ...Object.fromEntries(TOURNAMENT_MODES.map(({ id }) => [`${id}_maps`, form[`${id}_maps`] || ""])),
    game_mode_set: form.game_mode_set,
    custom_game_modes: [...(form.custom_game_modes || [])],
  };
  const drafts = { ...form.game_map_drafts, [form.game_id || "bo7"]: mapFields };
  return {
    ...form, game_id: gameId, game_map_drafts: drafts,
    game_mode_set: ["bo6", "mw3", "mw4"].includes(gameId) ? "cdl_control" : "cdl_var",
    ...(drafts[gameId] || tournamentMapForm({ game_id: gameId })),
  };
}
