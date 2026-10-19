export const PROGRESSION_CATEGORIES = [
  { id: "money", label: "Money", description: "Wallet balances, including the balance shown on each account." },
  { id: "credits", label: "Credits", description: "Credits on accounts, profiles and wallets." },
  { id: "earnings", label: "Earnings", description: "Lifetime earnings, winnings and cash leaderboard totals." },
  { id: "xp", label: "XP & TP Rank", description: "XP, levels, prestige, weekly XP and the XP match record." },
  { id: "ranked", label: "Ranked ELO", description: "ELO, peak ELO, wins, losses, matches and streaks." },
  { id: "free8s", label: "Free 8s", description: "Each game's Free 8s ELO, rating, record and monthly progression." },
  { id: "records", label: "Overall records", description: "Cash match and tournament counters, profile totals and team records." },
  { id: "trophies", label: "Trophies", description: "Trophy counters, trophy inventory and trophy showcase selections." },
];
export const SEASON_LADDERS = PROGRESSION_CATEGORIES.filter((entry) => ["xp", "ranked", "free8s"].includes(entry.id));
export const seasonLadder = (season) => season?.ladder || "ranked";
export const matchAfterProgressionReset = (match, row, cutoff) => {
  if (!cutoff) return true;
  const completed = Date.parse(match?.match_completed_date || match?.completed_date || row?.created_date || "");
  return Number.isFinite(completed) && completed >= Date.parse(cutoff);
};
