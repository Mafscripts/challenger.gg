export const RANK_THRESHOLDS = [
  { name: "Bronze", tier: "bronze", min: 0, max: 599, color: "text-amber-400" },
  { name: "Silver", tier: "silver", min: 600, max: 1199, color: "text-gray-300" },
  { name: "Gold", tier: "gold", min: 1200, max: 1799, color: "text-yellow-400" },
  { name: "Platinum", tier: "platinum", min: 1800, max: 2399, color: "text-teal-300" },
  { name: "Diamond", tier: "diamond", min: 2400, max: 2999, color: "text-cyan" },
  { name: "Master", tier: "master", min: 3000, max: 3599, color: "text-red-400" },
  { name: "Pro", tier: "pro", min: 3600, max: 4199, color: "text-fuchsia-400" },
  { name: "Champion", tier: "champion", min: 4200, max: Infinity, color: "text-white" },
];

export const RANK_REWARDS = [
  { key: "bronze_iii_badge", name: "Bronze Badge", required_elo: 0, category: "badge", rarity: "common", tradeable: false },
  { key: "silver_iii_frame", name: "Silver Frame", required_elo: 600, category: "frame", rarity: "common", tradeable: false },
  { key: "gold_iii_card", name: "Gold Calling Card", required_elo: 1200, category: "calling_card", rarity: "rare", tradeable: false },
  { key: "platinum_iii_trophy", name: "Platinum Trophy", required_elo: 1800, category: "trophy", rarity: "epic", tradeable: false },
  { key: "diamond_iii_badge", name: "Diamond Badge", required_elo: 2400, category: "badge", rarity: "epic", tradeable: false },
  { key: "master_iii_frame", name: "Master Frame", required_elo: 3000, category: "frame", rarity: "legendary", tradeable: false },
  { key: "pro_iii_trophy", name: "Pro Trophy", required_elo: 3600, category: "trophy", rarity: "mythic", tradeable: false },
  { key: "champion_bundle", name: "Champion Bundle", required_elo: 4200, category: "ranked_reward", rarity: "exclusive", tradeable: false },
];

export const getRankForElo = (elo = 0) => {
  const normalized = Math.max(0, Number(elo) || 0);
  return RANK_THRESHOLDS.find((rank) => normalized >= rank.min && normalized <= rank.max) || RANK_THRESHOLDS[0];
};

export const getNextRankForElo = (elo = 0) => {
  const normalized = Math.max(0, Number(elo) || 0);
  return RANK_THRESHOLDS.find((rank) => rank.min > normalized) || null;
};

export const getRankProgress = (elo = 0) => {
  const rank = getRankForElo(elo);
  if (!Number.isFinite(rank.max)) return 100;
  return Math.max(0, Math.min(100, Math.round(((Math.max(0, elo - rank.min)) / (rank.max - rank.min + 1)) * 100)));
};
