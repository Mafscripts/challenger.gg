import { randomInt } from "node:crypto";
import { DEFAULT_EIGHTS_GAMES, generateEightsSeries } from "../src/lib/freeEightsGames.js";

const needsMaps = (match) => match.status !== "bye" && !match.series_maps?.length;
export const partyMapsMissing = (bracket) => Boolean(bracket?.matches.some(needsMaps));

export function ensurePartyMatchMaps(bracket, choose = randomInt) {
  if (!bracket) return false;
  let changed = false;
  for (const match of bracket.matches.filter(needsMaps)) {
    const modes = bracket.game_mode === "cdl" ? (bracket.best_of === 5 ? ["hp", "snd", "overload", "hp", "snd"] : ["hp", "snd", "hp"].slice(0, bracket.best_of))
      : Array(bracket.best_of).fill(bracket.game_mode === "hardpoint" ? "hp" : "snd");
    const firstHost = choose(2);
    match.series_maps = generateEightsSeries({ game_config: DEFAULT_EIGHTS_GAMES[0], series_mode_ids: modes }, () => choose(1_000_000) / 1_000_000)
      .map((map, index) => ({ ...map, number: index + 1, host_side: (firstHost + index) % 2 }));
    match.maps_generated_at = new Date().toISOString();
    changed = true;
  }
  return changed;
}
