import { getFreeEightsRank, normalizeFreeEightsElo } from "./freeEightsRanks.js";
import { screenshotRankFor } from "./screenshotRanks.js";

// Provisional strength values, not awarded ELO. Challenger starts at 600.
export const FREE_EIGHTS_SCREENSHOT_STRENGTH = { diamond: 200, crimson: 350, iridescent: 450, top250: 550 };

export function getFreeEightsSkill(elo = 0, screenshotRank) {
  const normalized = normalizeFreeEightsElo(elo);
  const ownRank = getFreeEightsRank(normalized);
  const screenshot = screenshotRankFor(screenshotRank);
  if (normalized >= 600 || !screenshot) return { ...ownRank, source: "free_eights", elo: normalized, strength: normalized };
  return {
    key: screenshot.id, name: screenshot.label, style: screenshot.style,
    source: "screenshot", elo: normalized,
    strength: FREE_EIGHTS_SCREENSHOT_STRENGTH[screenshot.id] + Math.round(normalized / 600 * 24),
  };
}

export function balanceFreeEightsTeams(players, random = Math.random) {
  if (players.length !== 8 || players.some((player) => !player.user_id) || new Set(players.map((player) => player.user_id)).size !== 8) throw new Error("Free 8s balancing requires eight distinct players");
  const skills = players.map((player) => getFreeEightsSkill(player.free_eights_elo, player.screenshot_rank));
  const ranks = [...new Set(skills.map((skill) => skill.key))];
  let best = [], bestImbalance = Infinity, bestGap = Infinity;
  // Anchor player 0: exactly 35 unique 4v4 partitions, without mirror duplicates.
  for (let a = 1; a < 6; a++) for (let b = a + 1; b < 7; b++) for (let c = b + 1; c < 8; c++) {
    const indices = new Set([0, a, b, c]);
    const imbalance = ranks.reduce((sum, rank) => {
      const difference = skills.reduce((count, skill, index) => count + (skill.key === rank ? indices.has(index) ? 1 : -1 : 0), 0);
      return sum + difference ** 2;
    }, 0);
    const totalA = skills.reduce((sum, skill, index) => sum + (indices.has(index) ? skill.strength : 0), 0);
    const totalB = skills.reduce((sum, skill, index) => sum + (!indices.has(index) ? skill.strength : 0), 0);
    const gap = Math.abs(totalA - totalB);
    if (imbalance < bestImbalance || imbalance === bestImbalance && gap < bestGap) {
      best = []; bestImbalance = imbalance; bestGap = gap;
    }
    if (imbalance === bestImbalance && gap === bestGap) best.push({ indices, totalA, totalB });
  }
  const chosen = best[Math.min(best.length - 1, Math.max(0, Math.floor(random() * best.length)))];
  return {
    alpha: players.filter((_, index) => chosen.indices.has(index)),
    bravo: players.filter((_, index) => !chosen.indices.has(index)),
    balance: {
      strategy: "rank-spread-then-strength-v1", partitions_checked: 35,
      rank_imbalance: bestImbalance, strength_gap: bestGap,
      team_a_strength: chosen.totalA, team_b_strength: chosen.totalB,
      players: Object.fromEntries(players.map((player, index) => [player.user_id, {
        rank: skills[index].name, source: skills[index].source,
        free_eights_elo: skills[index].elo, strength: skills[index].strength,
      }])),
    },
  };
}
