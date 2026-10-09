import { getMapImage } from "./cdlMaps.js";

export const DEFAULT_EIGHTS_GAME = "bo7";
export const eightsGameId = (value) => String((typeof value === "object" ? value?.game_id : value) || DEFAULT_EIGHTS_GAME).toLowerCase();
export const eightsSlug = (value) => String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
const maps = (names, game) => names.map((name) => ({ name, image: game === "bo7" ? getMapImage(name) : `/assets/maps/${game}/${eightsSlug(name)}.webp` }));
const formats = [
  { id: "cdl_bo3", name: "CDL BO3", modes: ["hp", "snd", "hp"] },
  { id: "hp_bo3", name: "Hardpoint BO3", modes: ["hp", "hp", "hp"] },
  { id: "snd_bo3", name: "Search & Destroy BO3", modes: ["snd", "snd", "snd"] },
  { id: "hp_bo1", name: "Hardpoint BO1", modes: ["hp"] },
  { id: "snd_bo1", name: "Search & Destroy BO1", modes: ["snd"] },
];
const game = (id, name, number, color, hp, snd, extra = []) => ({
  id, name, number, color, enabled: true,
  modes: [{ id: "hp", name: "Hardpoint", maps: maps(hp, id) }, { id: "snd", name: "Search & Destroy", maps: maps(snd, id) }, ...extra],
  formats: structuredClone(formats),
});
export const DEFAULT_EIGHTS_GAMES = [
  game("bo7", "Black Ops", "7", "orange", ["Sake", "Colossus", "Den", "Scar", "Gridlock", "Hacienda"], ["Hacienda", "Gridlock", "Raid", "Scar", "Den", "Sake", "Fringe"], [{ id: "overload", name: "Overload", maps: maps(["Scar", "Gridlock", "Den", "Exposure"], "bo7") }]),
  game("bo6", "Black Ops", "6", "orange", ["Hacienda", "Red Card", "Rewind", "Skyline", "Vault"], ["Dealership", "Hacienda", "Protocol", "Red Card", "Rewind"]),
  game("mw3", "Modern Warfare", "3", "green", ["Invasion", "Karachi", "Sub Base", "Rio", "6 Star", "Vista"], ["Highrise", "Invasion", "Karachi", "Terminal", "Rio", "6 Star"]),
];
export const eightsGameName = (game) => `${game?.name || "Black Ops"}${game?.number ? ` ${game.number}` : ""}`;
export const eightsMatchGameName = (match) => match?.game_name || eightsGameName(DEFAULT_EIGHTS_GAMES.find((game) => game.id === eightsGameId(match)) || DEFAULT_EIGHTS_GAMES[0]);
export const eightsModeName = (match, mode) => match?.game_config?.modes?.find((row) => row.id === mode)?.name || ({ hp: "Hardpoint", snd: "Search & Destroy", overload: "Overload" }[mode] || mode);

// Old rooms have no game snapshot and remain BO7 with their original formats.
export function eightsSeriesForMatch(match) {
  if (match?.game_config && Array.isArray(match.series_mode_ids)) return match.series_mode_ids;
  return match?.series_format === "hp_bo3" ? ["hp", "hp", "hp"] : ["hp", "snd", "hp"];
}
export function generateEightsSeries(match, random = Math.random) {
  const config = match.game_config || DEFAULT_EIGHTS_GAMES[0];
  const used = new Map();
  return eightsSeriesForMatch(match).map((id) => {
    const mode = config.modes.find((row) => row.id === id);
    if (!mode?.maps?.length) throw new Error(`No maps configured for ${id}`);
    const previous = used.get(id) || new Set();
    const available = mode.maps.filter((map) => !previous.has(map.name));
    const pool = available.length ? available : mode.maps;
    const map = pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
    previous.add(map.name); used.set(id, previous);
    return { ...map, id: eightsSlug(map.name), mode: id, mode_name: mode.name };
  });
}
