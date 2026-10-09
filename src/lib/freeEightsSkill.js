import { getFreeEightsRank, normalizeFreeEightsElo } from "./freeEightsRanks.js";
import { screenshotRankFor } from "./screenshotRanks.js";

// Provisional strength values, not awarded ELO. Only Topfragger overrides a game rank.
export const FREE_EIGHTS_SCREENSHOT_STRENGTH = { diamond: 200, crimson: 350, iridescent: 450, top250: 550 };

export function getFreeEightsSkill(elo = 0, screenshotRank) {
  const normalized = normalizeFreeEightsElo(elo);
  const ownRank = getFreeEightsRank(normalized);
  const screenshot = screenshotRankFor(screenshotRank);
  if (normalized >= 800 || !screenshot) return { ...ownRank, source: "free_eights", elo: normalized, strength: normalized };
  return {
    key: screenshot.id, name: screenshot.label, style: screenshot.style,
    source: "screenshot", elo: normalized,
    strength: FREE_EIGHTS_SCREENSHOT_STRENGTH[screenshot.id] + Math.round(normalized / 800 * 24),
  };
}

export function balanceFreeEightsTeams(players, random = Math.random, { avoidCurrentTeams = false } = {}) {
  if (players.length !== 8 || players.some((player) => !player.user_id) || new Set(players.map((player) => player.user_id)).size !== 8) throw new Error("Free 8s balancing requires eight distinct players");
  const skills = players.map((player) => getFreeEightsSkill(player.free_eights_elo, player.screenshot_rank));
  const ranks = [...new Set(skills.map((skill) => skill.key))];
  let best = [], bestEliteImbalance = Infinity, bestImbalance = Infinity, bestGap = Infinity;
  let partitionsChecked = 0;
  // Anchor player 0: exactly 35 unique 4v4 partitions, without mirror duplicates.
  for (let a = 1; a < 6; a++) for (let b = a + 1; b < 7; b++) for (let c = b + 1; c < 8; c++) {
    const indices = new Set([0, a, b, c]);
    // A veto must change teammates, not merely exchange the team labels.
    if (avoidCurrentTeams && ["host", "challenger"].some((side) => players.filter((player) => player.team === side).length === 4
      && players.every((player, index) => indices.has(index) === (player.team === side)))) continue;
    partitionsChecked++;
    // Spread the strongest ranks first, then let a weaker player compensate
    // the side with the extra Top 250/Topfragger rather than stacking elites.
    const eliteImbalance = ["topfragger", "top250"].reduce((sum, rank) => {
      const difference = skills.reduce((count, skill, index) => count + (skill.key === rank ? indices.has(index) ? 1 : -1 : 0), 0);
      return sum + difference ** 2;
    }, 0);
    const imbalance = ranks.reduce((sum, rank) => {
      const difference = skills.reduce((count, skill, index) => count + (skill.key === rank ? indices.has(index) ? 1 : -1 : 0), 0);
      return sum + difference ** 2;
    }, 0);
    const totalA = skills.reduce((sum, skill, index) => sum + (indices.has(index) ? skill.strength : 0), 0);
    const totalB = skills.reduce((sum, skill, index) => sum + (!indices.has(index) ? skill.strength : 0), 0);
    const gap = Math.abs(totalA - totalB);
    if (eliteImbalance < bestEliteImbalance || eliteImbalance === bestEliteImbalance
      && (gap < bestGap || gap === bestGap && imbalance < bestImbalance)) {
      best = []; bestEliteImbalance = eliteImbalance; bestImbalance = imbalance; bestGap = gap;
    }
    if (eliteImbalance === bestEliteImbalance && imbalance === bestImbalance && gap === bestGap) best.push({ indices, totalA, totalB });
  }
  const chosen = best[Math.min(best.length - 1, Math.max(0, Math.floor(random() * best.length)))];
  return {
    alpha: players.filter((_, index) => chosen.indices.has(index)),
    bravo: players.filter((_, index) => !chosen.indices.has(index)),
    balance: {
      strategy: "elite-spread-then-strength-v2", partitions_checked: partitionsChecked,
      elite_rank_imbalance: bestEliteImbalance,
      rank_imbalance: bestImbalance, strength_gap: bestGap,
      team_a_strength: chosen.totalA, team_b_strength: chosen.totalB,
      players: Object.fromEntries(players.map((player, index) => [player.user_id, {
        rank: skills[index].name, source: skills[index].source,
        free_eights_elo: skills[index].elo, strength: skills[index].strength,
      }])),
    },
  };
}
