import { randomInt } from "node:crypto";
import { DEFAULT_EIGHTS_GAMES, generateEightsSeries } from "../src/lib/freeEightsGames.js";

const roundKey = (match) => `${match.lane}:${match.round}`;
const played = (match) => match.status === "completed" || Object.keys(match.reports || {}).length > 0;
const sameSeries = (a, b) => JSON.stringify(a?.map((map) => [map.name, map.mode])) === JSON.stringify(b?.map((map) => [map.name, map.mode]));
const sharedMaps = (maps) => maps.map(({ host_side, ...map }, index) => ({ ...map, number: index + 1 }));
export const partyMapsMissing = (bracket) => Boolean(bracket?.matches.some((match) => {
  if (match.status === "bye") return false;
  const schedule = bracket.round_maps?.[roundKey(match)];
  return !schedule?.maps?.length || !match.series_maps?.length || (!played(match) && !sameSeries(match.series_maps, schedule.maps));
}));

export function ensurePartyMatchMaps(bracket, choose = randomInt) {
  if (!bracket) return false;
  let changed = false;
  const groups = new Map();
  for (const match of bracket.matches.filter((match) => match.status !== "bye")) {
    const key = roundKey(match);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(match);
  }
  for (const [key, matches] of groups) {
    let schedule = bracket.round_maps?.[key];
    if (!schedule?.maps?.length) {
      // Older rooms used per-match maps. Keep an existing series as the round's
      // reference, prioritising a result/report so played maps are never rerolled.
      const source = matches.find((match) => played(match) && match.series_maps?.length) || matches.find((match) => match.series_maps?.length);
      const modes = bracket.game_mode === "cdl" ? (bracket.best_of === 5 ? ["hp", "snd", "overload", "hp", "snd"] : ["hp", "snd", "hp"].slice(0, bracket.best_of))
        : Array(bracket.best_of).fill(bracket.game_mode === "hardpoint" ? "hp" : "snd");
      schedule = { maps: sharedMaps(source?.series_maps || generateEightsSeries({ game_config: DEFAULT_EIGHTS_GAMES[0], series_mode_ids: modes }, () => choose(1_000_000) / 1_000_000)),
        generated_at: source?.maps_generated_at || new Date().toISOString() };
      bracket.round_maps = { ...bracket.round_maps, [key]: schedule };
      changed = true;
    }
    for (const match of matches) {
      if (match.series_maps?.length && (played(match) || sameSeries(match.series_maps, schedule.maps))) continue;
      const previousHost = match.series_maps?.[0]?.host_side;
      const firstHost = [0, 1].includes(previousHost) ? previousHost : choose(2);
      match.series_maps = schedule.maps.map((map, index) => ({ ...map, host_side: (firstHost + index) % 2 }));
      match.maps_generated_at = schedule.generated_at;
      changed = true;
    }
  }
  return changed;
}
