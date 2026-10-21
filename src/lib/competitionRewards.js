export const REWARD_MODES = [
  { id: "xp", label: "XP Matches" }, { id: "ranked", label: "Ranked" },
  { id: "free8s", label: "Free 8s" }, { id: "money8s", label: "Money 8s" },
  { id: "wagers", label: "Cash Matches" }, { id: "tournament", label: "Tournament match drops" },
];
export const REWARD_EFFECTS = [
  { id: "xp", label: "Extra personal XP per win", mode: "xp", values: [5, 10, 15], unit: "XP" },
  { id: "ranked_elo", label: "Extra Ranked ELO per win", mode: "ranked", values: [5, 10, 15], unit: "ELO" },
  { id: "free8s_elo", label: "Extra Free 8s ELO per win", mode: "free8s", values: [5, 10, 15], unit: "ELO" },
  { id: "money8s_cash", label: "Extra Money 8s winnings", mode: "money8s", values: [5, 10, 15], unit: "cents" },
  { id: "wagers_cash", label: "Extra Cash Match winnings", mode: "wagers", values: [5, 10, 15], unit: "cents" },
  { id: "cash_fee", label: "Cash Match platform fee reduction", mode: "wagers", values: [1, 2, 3, 4, 5, 6], unit: "percentage points" },
  { id: "tournament_credit", label: "Extra credit per tournament championship", mode: "tournament", values: [1], unit: "credit" },
];
export const rewardEffect = (id) => REWARD_EFFECTS.find((effect) => effect.id === id);
export function rewardLabel(reward) {
  const effect = rewardEffect(reward?.effect);
  if (!effect) return "Collectible";
  return `${reward.effect === "cash_fee" ? "−" : "+"}${reward.value} ${effect.unit}${reward.effect === "cash_fee" ? " on Cash Match fees" : " per win"}`;
}
export function rewardSeason(date = new Date()) {
  const year = date.getUTCFullYear(), term = Math.floor(date.getUTCMonth() / 2);
  return { id: `${year}-S${term + 1}`, name: `${year} · Season ${term + 1}`, number: term + 1,
    start: new Date(Date.UTC(year, term * 2, 1)), end: new Date(Date.UTC(year, term * 2 + 2, 1)) };
}
export function validateRewardTemplate(input) {
  const fail = (message) => { throw Object.assign(new Error(message), { status: 400 }); };
  const name = String(input.name || "").trim(), description = String(input.description || "").trim(), image_url = String(input.image_url || "").trim();
  const effect = rewardEffect(input.effect), value = Number(input.value);
  if (!name || name.length > 80 || description.length > 1000) fail("Give the reward a name (up to 80 characters) and a description up to 1,000 characters");
  if (image_url.length > 2100000 || image_url && !/^(https:\/\/|\/assets\/|data:image\/(png|jpeg|webp|gif);base64,)/i.test(image_url)) fail("Use an HTTPS image, an asset image or upload a PNG, JPEG, WebP or GIF");
  if (!effect || !effect.values.includes(value)) fail("Choose a supported reward effect and value");
  const sources = [...new Set(Array.isArray(input.sources) ? input.sources : [])];
  const allowed = effect.id === "tournament_credit" || effect.id === "cash_fee" ? [effect.mode, "tournament", "event"] : [effect.mode, "event"];
  if (!sources.length || sources.some((source) => !allowed.includes(source))) fail("Choose valid drop pools for this effect");
  const duration_days = Number(input.duration_days || 0);
  if (!Number.isInteger(duration_days) || duration_days < 0 || duration_days > 730) fail("Bonus duration must be 0 (permanent) or 1–730 days");
  return { name, description, image_url, rarity: ["common", "rare", "epic", "legendary", "mythic", "exclusive"].includes(input.rarity) ? input.rarity : "epic",
    effect: effect.id, value, sources, duration_days, active: input.active !== false };
}
export function effectiveCashFee(premium, discount, settings = {}) {
  const base = premium ? Number(settings.premium_fee ?? 5) : Number(settings.standard_fee ?? 10);
  return Math.min(base, Math.max(Number(settings.minimum_fee ?? 0), base - Math.max(0, Math.min(6, Number(discount) || 0))));
}
