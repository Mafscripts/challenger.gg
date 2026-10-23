export const PREMIUM_PLANS = [
  { id: "weekly", label: "Weekly", price: "3.99", period: "week" },
  { id: "monthly", label: "Monthly", price: "9.99", period: "month" },
  { id: "yearly", label: "Yearly", price: "99.99", period: "year" },
];
export const MEMBER_TIERS = [
  { id: "member_1_month", label: "1 month", days: 30, name: "First Signal", color: "#53d8f7", mark: "I" },
  { id: "member_3_months", label: "3 months", days: 90, name: "Blue Vanguard", color: "#5597ff", mark: "III" },
  { id: "member_6_months", label: "6 months", days: 180, name: "Silver Sentinel", color: "#c3d6ee", mark: "VI" },
  { id: "member_1_year", label: "1 year", days: 365, name: "Golden Legacy", color: "#ffd36c", mark: "1Y" },
  { id: "member_2_years", label: "2 years", days: 730, name: "Diamond Elite", color: "#bba6ff", mark: "2Y" },
];
export const activePremium = (user, now = Date.now()) => user?.is_premium === true && (!user.premium_expires || Date.parse(user.premium_expires) > now);

// Count elapsed membership time, merging renewals so overlapping grants never
// earn double progress. Time between memberships and prepaid future time do not count.
export function membershipProgress(records = [], now = Date.now()) {
  const intervals = records.flatMap(record => {
    if (["refunded", "revoked"].includes(record.status) || !record.start_date || !record.end_date) return [];
    const start = Date.parse(record.start_date), end = Math.min(Date.parse(record.end_date), now);
    return Number.isFinite(start) && Number.isFinite(end) && end > start ? [[start, end]] : [];
  }).sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const interval of intervals) {
    const previous = merged.at(-1);
    if (previous && interval[0] <= previous[1]) previous[1] = Math.max(previous[1], interval[1]);
    else merged.push([...interval]);
  }
  const days = Math.floor(merged.reduce((sum, [start, end]) => sum + end - start, 0) / 86400000);
  const earned = MEMBER_TIERS.filter(tier => days >= tier.days), current = earned.at(-1) || null;
  const next = MEMBER_TIERS.find(tier => days < tier.days) || null;
  return { days, earned: earned.map(tier => tier.id), current: current?.id || null, next: next?.id || null,
    remaining_days: next ? next.days - days : 0,
    percent: next ? Math.min(100, Math.round((days - (current?.days || 0)) / (next.days - (current?.days || 0)) * 100)) : 100,
    has_history: intervals.length > 0 };
}

export function cashMatchMembershipFee(premium, entry, discount = 0) {
  const amount = Number(entry);
  if (!Number.isFinite(amount) || amount < (premium ? 50 : 20)) return 0;
  return Math.max(0, 1 - Math.max(0, Number(discount) || 0));
}
