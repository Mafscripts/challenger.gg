export const RANK_THRESHOLDS = [
  { name: "Bronze III", tier: "bronze", division: "III", min: 0, max: 199, color: "text-amber-400" },
  { name: "Bronze II", tier: "bronze", division: "II", min: 200, max: 399, color: "text-amber-400" },
  { name: "Bronze I", tier: "bronze", division: "I", min: 400, max: 599, color: "text-amber-400" },
  { name: "Silver III", tier: "silver", division: "III", min: 600, max: 799, color: "text-gray-300" },
  { name: "Silver II", tier: "silver", division: "II", min: 800, max: 999, color: "text-gray-300" },
  { name: "Silver I", tier: "silver", division: "I", min: 1000, max: 1199, color: "text-gray-300" },
  { name: "Gold III", tier: "gold", division: "III", min: 1200, max: 1399, color: "text-yellow-400" },
  { name: "Gold II", tier: "gold", division: "II", min: 1400, max: 1599, color: "text-yellow-400" },
  { name: "Gold I", tier: "gold", division: "I", min: 1600, max: 1799, color: "text-yellow-400" },
  { name: "Platinum III", tier: "platinum", division: "III", min: 1800, max: 1999, color: "text-teal-300" },
  { name: "Platinum II", tier: "platinum", division: "II", min: 2000, max: 2199, color: "text-teal-300" },
  { name: "Platinum I", tier: "platinum", division: "I", min: 2200, max: 2399, color: "text-teal-300" },
  { name: "Diamond III", tier: "diamond", division: "III", min: 2400, max: 2599, color: "text-cyan" },
  { name: "Diamond II", tier: "diamond", division: "II", min: 2600, max: 2799, color: "text-cyan" },
  { name: "Diamond I", tier: "diamond", division: "I", min: 2800, max: 2999, color: "text-cyan" },
  { name: "Master III", tier: "master", division: "III", min: 3000, max: 3199, color: "text-purple-400" },
  { name: "Master II", tier: "master", division: "II", min: 3200, max: 3399, color: "text-purple-400" },
  { name: "Master I", tier: "master", division: "I", min: 3400, max: 3599, color: "text-purple-400" },
  { name: "Pro III", tier: "pro", division: "III", min: 3600, max: 3799, color: "text-blue-400" },
  { name: "Pro II", tier: "pro", division: "II", min: 3800, max: 3999, color: "text-blue-400" },
  { name: "Pro I", tier: "pro", division: "I", min: 4000, max: 4199, color: "text-blue-400" },
  { name: "Champion", tier: "champion", division: "", min: 4200, max: Infinity, color: "text-orange" },
];

export const RANK_REWARDS = [
  { key: "bronze_iii_badge", name: "Bronze III Badge", required_elo: 0, category: "badge", rarity: "common", tradeable: false },
  { key: "silver_iii_frame", name: "Silver III Frame", required_elo: 600, category: "frame", rarity: "common", tradeable: false },
  { key: "gold_iii_card", name: "Gold III Calling Card", required_elo: 1200, category: "calling_card", rarity: "rare", tradeable: false },
  { key: "platinum_iii_trophy", name: "Platinum III Trophy", required_elo: 1800, category: "trophy", rarity: "epic", tradeable: false },
  { key: "diamond_iii_badge", name: "Diamond III Badge", required_elo: 2400, category: "badge", rarity: "epic", tradeable: false },
  { key: "master_iii_frame", name: "Master III Frame", required_elo: 3000, category: "frame", rarity: "legendary", tradeable: false },
  { key: "pro_iii_trophy", name: "Pro III Trophy", required_elo: 3600, category: "trophy", rarity: "mythic", tradeable: false },
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
