export const CHALLENGE_RANKS = [
  { name: "Recruit", xp: 0, color: "#a6b4c6" },
  { name: "Contender", xp: 500, color: "#60a5fa" },
  { name: "Vanguard", xp: 1500, color: "#2dd4bf" },
  { name: "Elite", xp: 3000, color: "#c084fc" },
  { name: "Warlord", xp: 5500, color: "#fb923c" },
  { name: "Sovereign", xp: 9000, color: "#facc15" },
];
export const challengeRank = (xp = 0) => [...CHALLENGE_RANKS].reverse().find((rank) => xp >= rank.xp) || CHALLENGE_RANKS[0];
export const challengeExpected = (own, opponent) => 1 / (1 + 10 ** (Math.max(-4000, Math.min(4000, opponent - own)) / 1200));
// Higher XP reduces win rewards; upsets against a higher-rated side earn more.
// Losing to a lower-rated side costs more. All calculations use pre-match XP.
export function challengeXpChange(own, opponent, won) {
  const xp = Math.max(0, Number(own) || 0);
  const expected = challengeExpected(xp, Math.max(0, Number(opponent) || 0));
  const amount = won ? Math.max(8, Math.round((35 + 90 * (1 - expected)) / (1 + xp / 6000)))
    : -Math.max(15, Math.round(25 + 90 * expected));
  return Math.max(-xp, amount) || 0;
}
export const CHALLENGE_ACTIVE = ["open", "ready_check", "in_progress", "awaiting_confirmation", "disputed"];
export const challengeRoomPath = (id) => `/challenge-a-team/${encodeURIComponent(id)}`;
