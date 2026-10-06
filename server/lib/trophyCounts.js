const number = (value) => {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

export function countInventoryTrophies(items = []) {
  const counts = { gold: 0, silver: 0, bronze: 0, premium: 0, topfragg: 0, hosted: 0 };
  for (const item of items || []) {
    const text = [item.item_category, item.item_name, item.unlock_key, item.item_rarity, item.purchase_method]
      .filter(Boolean).join(" ").trim().toLowerCase();
    if (item.item_category !== "trophy" && !text.includes("trophy")) continue;
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
