import { normalizeMatchXP } from "./xpMatchRating.js";

// TP RANK belongs exclusively to XP Matches. Global XP, Ranked ELO and
// Free 8s ranks never qualify an account for its first star.
export const TP_RANK_TIERS = [
  { level: 1, minXp: 0, name: "Spark", color: "#cbd5e1" },
  { level: 2, minXp: 1000, name: "Pulse", color: "#67e8f9" },
  { level: 3, minXp: 2500, name: "Nova", color: "#60a5fa" },
  { level: 4, minXp: 5000, name: "Orbit", color: "#a78bfa" },
  { level: 5, minXp: 10000, name: "Supernova", color: "#f0abfc" },
  { level: 6, minXp: 20000, name: "Solar", color: "#fb923c" },
  { level: 7, minXp: 35000, name: "Astral", color: "#facc15" },
  { level: 8, minXp: 50000, name: "Cosmic", color: "#fef3c7" },
];

export function tpRank({ xp = 0, matchesPlayed = 0, position = null } = {}) {
  const totalXp = normalizeMatchXP(xp);
  const played = normalizeMatchXP(matchesPlayed);
  if (!played) return { key: "unranked", name: "Unranked", level: 0, color: "#64748b", xp: totalXp, matchesPlayed: 0, position: null, elite: false };
  const tier = [...TP_RANK_TIERS].reverse().find((rank) => totalXp >= rank.minXp);
  const rankPosition = Number.isInteger(position) && position > 0 ? position : null;
  const elite = rankPosition !== null && rankPosition <= 1000;
  return { ...tier, key: elite ? "top1000" : `tp-${tier.level}`, name: elite ? "Top 1000" : tier.name,
    tierName: tier.name, xp: totalXp, matchesPlayed: played, position: rankPosition, elite };
}
