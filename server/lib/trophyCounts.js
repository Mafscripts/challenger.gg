const number = (value) => {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

// An explicit cosmetic category takes precedence over words in its name/rarity.
// Legacy awards without a category can still be recognized by their trophy name.
export function isInventoryTrophy(item = {}) {
  const category = String(item.item_category || item.category || "").trim().toLowerCase();
  if (category) return category === "trophy";
  return [item.item_name, item.unlock_key, item.purchase_method].filter(Boolean).join(" ").toLowerCase().includes("trophy");
}

export function countInventoryTrophies(items = []) {
  const counts = { gold: 0, silver: 0, bronze: 0, premium: 0, topfragg: 0, hosted: 0 };
  for (const item of items || []) {
    const text = [item.item_category, item.item_name, item.unlock_key, item.item_rarity, item.purchase_method]
      .filter(Boolean).join(" ").trim().toLowerCase();
    if (!isInventoryTrophy(item)) continue;
    if (text.includes("invit") || text.includes("champion")) continue;
    if (text.includes("topfrag")) counts.topfragg += 1;
    else if (text.includes("hosted") || text.includes("host trophy")) counts.hosted += 1;
    else if (text.includes("premium")) counts.premium += 1;
    else if (text.includes("gold")) counts.gold += 1;
    else if (text.includes("silver")) counts.silver += 1;
    else if (text.includes("bronze")) counts.bronze += 1;
    else if (["exclusive", "mythic"].includes(item.item_rarity)) continue;
    else if (["legendary", "epic"].includes(item.item_rarity)) counts.gold += 1;
    else if (item.item_rarity === "rare") counts.silver += 1;
    else counts.bronze += 1;
  }
  return counts;
}

// Stored counters and earned inventory trophies use the same rules everywhere.
export function trophyCountsFor(user, profile, inventory = [], matches = []) {
  const earned = countInventoryTrophies(inventory);
  const hosted = number(user?.hosted_count ?? user?.hosted_trophies ?? profile?.hosted_count ?? profile?.hosted_trophies);
  return {
    gold: number(user?.gold_count ?? profile?.gold_count) + earned.gold,
    silver: number(user?.silver_count ?? profile?.silver_count) + earned.silver,
    bronze: number(user?.bronze_count ?? profile?.bronze_count) + earned.bronze,
    premium: number(user?.premium_count ?? user?.premium_trophies ?? profile?.premium_count ?? profile?.premium_trophies) + earned.premium,
    topfragg: number(user?.topfragg_count ?? user?.topfrag_count ?? user?.topfragg_trophies ?? profile?.topfragg_count ?? profile?.topfrag_count ?? profile?.topfragg_trophies) + earned.topfragg,
    hosted: hosted + earned.hosted + (hosted || earned.hosted ? 0 : matches.filter((match) => String(match.host_id || "") === String(user?.id || "")).length),
  };
}

export function trophyFields(counts) {
  return {
    gold_count: number(counts?.gold),
    silver_count: number(counts?.silver),
    bronze_count: number(counts?.bronze),
    premium_count: number(counts?.premium),
  };
}

// Dated awards come first; old counter-only awards have no invented win date.
export function recentTrophiesFor(user, profile, inventory = []) {
  const tiers = ["gold", "silver", "bronze", "premium"];
  const awards = inventory.flatMap((item, index) => {
    const counts = countInventoryTrophies([item]);
    const tier = tiers.find((key) => counts[key] > 0);
    if (!tier) return [];
    const date = item.acquired_date || item.created_date;
    return [{ id: item.id || `award-${index}`, tier, name: item.item_name || `${tier} trophy`,
      event: item.source_tournament_name || "", earned_at: Number.isFinite(Date.parse(date)) ? new Date(date).toISOString() : null }];
  }).sort((a, b) => (Date.parse(b.earned_at) || 0) - (Date.parse(a.earned_at) || 0) || String(a.id).localeCompare(String(b.id)));
  const stored = trophyCountsFor(user, profile);
  for (const tier of tiers) {
    const count = Math.min(10, Math.max(0, Math.floor(stored[tier])));
    for (let index = 0; index < count && awards.length < 10; index++) {
      awards.push({ id: `legacy-${tier}-${index}`, tier, name: `${tier.charAt(0).toUpperCase() + tier.slice(1)} trophy`, event: "", earned_at: null });
    }
  }
  return awards.slice(0, 10);
}
