import test from "node:test";
import assert from "node:assert/strict";
import { rewardSeason, validateRewardTemplate, effectiveCashFee } from "../src/lib/competitionRewards.js";
import { buildRewardSeasonStandings } from "./competition-reward-ledger.js";
import { grantRandomReward, getRewardReveal, acknowledgeReward, loadRewardBonuses } from "./competition-rewards.js";

const template = (id, effect = "xp", value = 5, sources = ["xp"]) => ({ id, metadata: { name: id, description: "A personal bonus", image_url: "", rarity: "epic", reward: { effect, value, sources, duration_days: 0, active: true } } });

test("two-month UTC seasons cross the year and leap day without changing a global rating", () => {
  assert.equal(rewardSeason(new Date("2028-02-29T23:59:59Z")).id, "2028-S1");
  const last = rewardSeason(new Date("2028-12-31T23:59:59Z"));
  assert.equal(last.id, "2028-S6");
  assert.equal(last.end.toISOString(), "2029-01-01T00:00:00.000Z");
  assert.equal(rewardSeason(last.end).id, "2029-S1");
});

test("reward templates reject cross-mode effects and dollar-sized fee discounts", () => {
  const input = { name: "XP card", effect: "xp", value: 15, sources: ["xp", "event"] };
  assert.equal(validateRewardTemplate(input).duration_days, 0);
  assert.throws(() => validateRewardTemplate({ ...input, sources: ["money8s"] }), /pools/);
  assert.throws(() => validateRewardTemplate({ ...input, value: 90 }), /value/);
  assert.throws(() => validateRewardTemplate({ ...input, image_url: "javascript:alert(1)" }), /image/);
  assert.equal(validateRewardTemplate({ name: "Fee card", effect: "cash_fee", value: 6, sources: ["wagers", "tournament"] }).value, 6);
  assert.equal(effectiveCashFee(false, 6, { standard_fee: 10, minimum_fee: 0 }), 4);
  assert.equal(effectiveCashFee(true, 6, { premium_fee: 5, minimum_fee: 1 }), 1);
  assert.equal(effectiveCashFee(true, 6, { premium_fee: 0, minimum_fee: 0 }), 0);
});

test("season scores use the completion window, separate modes and formats, and deduplicate results", () => {
  const start = new Date("2026-09-01T00:00:00Z"), end = new Date("2026-11-01T00:00:00Z");
  const match = { id: "xp-1", mode: "xp", created_date: "2026-08-31T23:00:00Z", metadata: { status: "completed", match_completed_date: "2026-09-01T01:00:00Z", team_size: "2v2", xp_changes: { a: { delta: 35, won: true }, b: { delta: -20, won: false } } } };
  const free = { id: "free-1", mode: "free8s", metadata: { status: "completed", game_id: "bo7", match_completed_date: "2026-10-01T00:00:00Z", free_eights_elo_changes: { b: { delta: 0, won: false }, a: { delta: 30, won: true } } } };
  const outside = { ...match, id: "next-season", metadata: { ...match.metadata, match_completed_date: end.toISOString() } };
  const boards = buildRewardSeasonStandings([match, structuredClone(match), free, outside], start, end);
  assert.equal(boards.xp[0].score, 35);
  assert.equal(boards.xp[0].matches, 1);
  assert.equal(boards["xp:duos"][0].score, 35);
  assert.equal(boards["xp:solo"], undefined);
  assert.equal(boards["free8s:bo7"].find((row) => row.id === "b").losses, 1);
  assert.equal(match.metadata.xp_changes.a.delta, 35);
});

test("Challenge season rewards retain the winning team roster, while tournament wins are event-only", () => {
  const start = new Date("2026-09-01T00:00:00Z"), end = new Date("2026-11-01T00:00:00Z");
  const ledger = [{ id: "challenge", mode: "challenge", metadata: { status: "completed", completed_at: "2026-10-01T00:00:00Z", alpha_team: { id: "team", name: "Squad" }, players: [{ user_id: "a", team_id: "team" }, { user_id: "b", team_id: "team" }], xp_changes: [{ kind: "team", subject_id: "team", delta: 20, won: true }] } },
    { id: "tournament", mode: "tournament", metadata: { status: "completed", completed_date: "2026-10-01T00:00:00Z", reward_winner_user_ids: ["a"], reward_loser_user_ids: ["c"] } }];
  const board = buildRewardSeasonStandings(ledger, start, end);
  assert.deepEqual(board.challenge[0].player_ids, ["a", "b"]);
  assert.equal(board.challenge[0].kind, "team");
  assert.equal(board.tournament, undefined);
  assert.equal(buildRewardSeasonStandings(ledger, start, end, { includeTournaments: true }).tournament[0].wins, 1);
});

function grantsFixture() {
  const state = { grants: [], copies: [], notices: [], items: [template("card-a"), template("card-b")] };
  const copy = (value) => structuredClone(value);
  const db = {
    user: { findUnique: async () => ({ id: "a", is_banned: false, metadata: {} }) },
    competitionRewardGrant: {
      findUnique: async ({ where }) => copy(state.grants.find((row) => where.id ? row.id === where.id : row.grant_key === where.grant_key) || null),
      create: async ({ data }) => { assert.ok(!state.grants.some((row) => row.grant_key === data.grant_key)); const row = { revealed_at: null, ...copy(data) }; state.grants.push(row); return copy(row); },
      updateMany: async ({ where, data }) => { const row = state.grants.find((row) => row.id === where.id && row.user_id === where.user_id && row.revealed_at === null); if (row) Object.assign(row, copy(data)); return { count: row ? 1 : 0 }; },
    },
    userInventory: { create: async ({ data }) => { state.copies.push(copy(data)); return copy(data); } },
    notification: { create: async ({ data }) => { state.notices.push(copy(data)); } },
    marketplaceItem: { findMany: async ({ where }) => copy(state.items.filter((row) => where.id.in.includes(row.id))) },
  };
  return { state, db };
}

test("retries grant the same immutable random card once, with one owned copy and notification", async () => {
  const { state, db } = grantsFixture();
  const first = await grantRandomReward(db, "a", "season:2026-S5:xp", state.items);
  assert.ok(state.items.some((row) => row.id === first.metadata.item.id));
  state.items.forEach((row) => { row.metadata.reward.value = 15; });
  const second = await grantRandomReward(db, "a", "season:2026-S5:xp", state.items);
  assert.equal(second.id, first.id);
  assert.equal(second.metadata.item.reward.value, 5);
  assert.equal(state.copies.length, 1);
  assert.equal(state.notices.length, 1);
  assert.equal(state.copies[0].metadata.is_tradable, false);
  assert.equal(state.copies[0].metadata.reward_grant_id, first.id);
});

test("only the owner can reveal or acknowledge a card and the chosen snapshot survives template edits", async () => {
  const { state, db } = grantsFixture();
  const grant = await grantRandomReward(db, "a", "event:christmas", state.items);
  await assert.rejects(getRewardReveal(db, "b", grant.id), { status: 404 });
  await assert.rejects(acknowledgeReward(db, "b", grant.id), { status: 404 });
  state.items.forEach((row) => { row.metadata.name = "Edited later"; });
  const reveal = await getRewardReveal(db, "a", grant.id);
  assert.equal(reveal.grant.item.name, grant.metadata.item.name);
  assert.equal(reveal.cards.filter((row) => row.id === grant.metadata.item.id).length, 1);
  await acknowledgeReward(db, "a", grant.id);
  const date = state.grants[0].revealed_at;
  await acknowledgeReward(db, "a", grant.id);
  assert.deepEqual(state.grants[0].revealed_at, date);
});

test("personal bonuses keep only the highest eligible effect, ignoring expired and other-mode cards", async () => {
  const db = { competitionRewardGrant: {}, competitionRewardSettings: { findUnique: async () => ({ metadata: { enabled: true } }) }, $queryRaw: async () => [
    { user_id: "a", reward: { effect: "xp", value: 5 } }, { user_id: "a", reward: { effect: "xp", value: 10 } },
    { user_id: "a", reward: { effect: "xp", value: 15 }, expires_at: "2026-01-01T00:00:00Z" }, { user_id: "a", reward: { effect: "ranked_elo", value: 15 } },
  ] };
  assert.deepEqual(await loadRewardBonuses(db, ["a"], "xp", new Date("2026-10-01T00:00:00Z")), { a: { xp: 10 } });
});
