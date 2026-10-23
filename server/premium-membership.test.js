import test from "node:test";
import assert from "node:assert/strict";
import { MEMBER_TIERS, activePremium, cashMatchMembershipFee, membershipProgress } from "../src/lib/premiumMembership.js";
import { getPremiumMembershipStatus } from "./premium-membership.js";
const start = Date.parse("2024-01-01T00:00:00Z"), day = 86400000;
const period = (from, to, extra = {}) => ({ start_date: new Date(start + from * day).toISOString(), end_date: new Date(start + to * day).toISOString(), ...extra });

test("membership progression counts elapsed coverage, never overlap, breaks or prepaid future time", () => {
  const progress = membershipProgress([period(0, 60), period(30, 90), period(120, 200), period(300, 400)], start + 150 * day);
  assert.equal(progress.days, 120);
  assert.deepEqual(progress.earned, ["member_1_month", "member_3_months"]);
  assert.equal(progress.current, "member_3_months");
  assert.equal(progress.next, "member_6_months");
  assert.equal(progress.remaining_days, 60);
  assert.equal(progress.percent, 33);
});
test("each member badge unlocks at its elapsed-time boundary, including the final milestone", () => {
  for (const tier of MEMBER_TIERS) {
    assert.equal(membershipProgress([period(0, 900)], start + (tier.days - 1) * day).earned.includes(tier.id), false);
    assert.equal(membershipProgress([period(0, 900)], start + tier.days * day).earned.includes(tier.id), true);
  }
  const max = membershipProgress([period(0, 900)], start + 800 * day);
  assert.equal(max.next, null); assert.equal(max.percent, 100);
  assert.equal(membershipProgress([period(0, 90, { status: "refunded" }), period(100, 130, { status: "revoked" }), { start_date: "bad", end_date: "bad" }], start + 300 * day).days, 0);
});
test("expired membership stops growing but keeps previously earned milestones", () => {
  assert.equal(membershipProgress([period(0, 90)], start + 1000 * day).days, 90);
  assert.equal(activePremium({ is_premium: true, premium_expires: new Date(start + day).toISOString() }, start + 2 * day), false);
});
test("membership status awards real earned badges once, retaining unrelated badges and metadata", async () => {
  let account = { id: "member", metadata: { unrelated: "keep", badges: [{ type: "verified_player" }] } }, writes = 0;
  const records = [period(0, 120)];
  const db = {
    premiumMembership: { findMany: async ({ where }) => { assert.equal(where.metadata.equals, "member"); return records.map(metadata => ({ metadata })); } },
    user: { findUnique: async () => structuredClone(account), update: async ({ data }) => { account = { ...account, ...data }; writes++; } },
    $executeRaw: async () => {},
    $transaction: async operation => operation(db),
  };
  const actor = { id: "member", is_premium: true, premium_expires: new Date(start + 200 * day).toISOString() };
  const first = await getPremiumMembershipStatus(db, actor, start + 100 * day);
  assert.equal(first.awarded, true); assert.equal(first.active, true);
  assert.deepEqual(account.metadata.badges.map(badge => badge.type), ["verified_player", "member_1_month", "member_3_months"]);
  assert.equal(account.metadata.unrelated, "keep");
  await getPremiumMembershipStatus(db, actor, start + 100 * day);
  assert.equal(writes, 1);
});
test("fee thresholds charge 1% only from $20 Free or $50 Premium and coupons never create negative fees", () => {
  for (const premium of [false, true]) {
    const boundary = premium ? 50 : 20;
    assert.equal(cashMatchMembershipFee(premium, boundary - .01), 0);
    assert.equal(cashMatchMembershipFee(premium, boundary), 1);
    assert.equal(cashMatchMembershipFee(premium, boundary + 100), 1);
    assert.equal(cashMatchMembershipFee(premium, boundary, 2), 0);
    for (const invalid of [NaN, "not-an-amount", -100, Infinity]) assert.equal(cashMatchMembershipFee(premium, invalid), 0);
  }
});
