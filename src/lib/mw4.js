// Shared launch configuration; these are the twelve maps selected by staff.
export const PRIMARY_GAME_ID = "mw4";
export const LEGACY_GAME_ID = "bo7";
export const MW4_MAP_NAMES = ["Silkworm", "Reactor U92", "Rooftops", "Mumbai", "Lithium", "Munition", "Cachette", "Nautical", "Lotus", "Sentry", "Coal", "Transit 213"];
export const MW4_MODES = [{ id: "hp", name: "Hardpoint" }, { id: "hijacked", name: "Hijacked" }, { id: "snd", name: "Search & Destroy" }];
export const storedGameId = (row) => String(row?.metadata?.game_id || row?.game_id || LEGACY_GAME_ID).toLowerCase();
export const mw4MapImage = (name) => `/assets/maps/mw4/${name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}.webp`;
export const MW4_MAP_POOLS = Object.fromEntries(MW4_MODES.map(({ id }) => [id, [...MW4_MAP_NAMES]]));
export const MW4_GAME = {
  id: PRIMARY_GAME_ID, name: "Modern Warfare", number: "4", color: "yellow", enabled: true,
  modes: MW4_MODES.map((mode) => ({ ...mode, maps: MW4_MAP_NAMES.map((name) => ({ name, image: mw4MapImage(name) })) })),
  formats: [
    { id: "cdl_bo3", name: "MW4 Best of 3", modes: ["hp", "hijacked", "snd"] },
    ...MW4_MODES.flatMap(({ id, name }) => [
      { id: `${id}_bo3`, name: `${name} Best of 3`, modes: [id, id, id] },
      { id: `${id}_bo1`, name: `${name} Best of 1`, modes: [id] },
    ]),
  ],
};

export function hasMw4LaunchPools(game) {
  return game?.modes?.length === 3 && MW4_MODES.every(({ id }) => {
    const mode = game.modes.find((row) => row.id === id);
    return mode?.maps?.length === MW4_MAP_NAMES.length && MW4_MAP_NAMES.every((name) => mode.maps.some((map) => map.name === name));
  }) && game.formats?.length > 0 && game.formats.every((format) => format.modes.every((id) => MW4_MODES.some((mode) => mode.id === id)));
}
