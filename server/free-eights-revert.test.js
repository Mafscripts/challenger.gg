import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { revertFreeEightsResult, captureFreeEightsRewards } from "./free-eights-revert.js";
import { completeFreeEightsWithElo } from "./free-eights-elo.js";
import { prisma } from "./prisma.js";
import { signUser } from "./auth.js";
import routes from "./routes/functions.js";

const admin = { id: "admin", role: "admin", email_verified: true };
const date = "2026-10-15T12:00:00.000Z";
function fixture() {
  let state = { wager: [{ id: "m1", updated_date: date, metadata: {
    match_type: "8s", game_id: "bo7", status: "completed", host_id: "p0", challenger_id: "p4",
    winner_id: "p0", match_completed_date: date, free_eights_elo_applied_at: date,
    confirmed_score_alpha: 2, confirmed_score_bravo: 0, scores_confirmed: true,
    eights_score_vote_status: "completed", series_maps: ["A", "B", "C"], teams_generated_at: date,
    free_eights_elo_changes: {}, xp_changes: {}, free_eights_reward_snapshot: {},
  } }], wagerParticipant: [], eightsStats: [], xPStats: [], playerProfile: [], user: [],
  wagerMatch: [{ id: "history", metadata: { wager_id: "m1" } }, { id: "other-history", metadata: { wager_id: "other" } }], adminAction: [] };
  for (let i = 0; i < 8; i++) {
    const id = `p${i}`, won = i < 4, amount = won ? 150 : 50;
    state.wagerParticipant.push({ id: `r${i}`, metadata: { wager_id: "m1", user_id: id, team: won ? "host" : "challenger" } });
    state.wager[0].metadata.free_eights_elo_changes[id] = { delta: won ? 20 : -20 };
    state.wager[0].metadata.xp_changes[id] = { won, amount, new_total_xp: 950 + amount };
    state.wager[0].metadata.free_eights_reward_snapshot[id] = { user_streak: 3, user_matches: 5, xp_streak: 3,
      profile_streak: 3, profile_best_streak: 3, profile_matches: 5, eights_streak: 3, eights_rating: 1000, eights_matches: 5 };
    state.eightsStats.push({ id: `e${i}`, free_eights_elo: won ? 420 : 380, metadata: { user_id: id,
      rating: won ? 1020 : 990, wins: won ? 4 : 3, losses: won ? 2 : 3, matches_played: 6,
      win_streak: won ? 4 : 0, monthly_key: "2026-10", monthly_wins: won ? 2 : 1,
      monthly_matches: 3, monthly_xp: 200 + amount, last_played_date: date } });
    state.xPStats.push({ id: `x${i}`, metadata: { user_id: id, level: 2, current_xp: won ? 100 : 0,
      total_xp: 950 + amount, weekly_xp: 950 + amount, xp_to_next_level: 1150, win_streak: won ? 4 : 0 } });
    state.playerProfile.push({ id: `f${i}`, metadata: { user_id: id, total_wins: won ? 4 : 3,
      total_losses: won ? 2 : 3, total_matches: 6, current_win_streak: won ? 4 : 0,
      best_win_streak: won ? 4 : 3, xp: 950 + amount, level: 2, last_active_date: date } });
    state.user.push({ id, wager_wins: won ? 4 : 3, wager_losses: won ? 2 : 3, current_win_streak: won ? 4 : 0, xp_level: 2 });
  }
  const db = { $executeRaw: async () => 1 };
  const select = (name, where = {}) => state[name].filter((r) => where.id ? r.id === where.id
    : where.metadata ? r.metadata[where.metadata.path[0]] === where.metadata.equals : true);
  for (const name of Object.keys(state)) db[name] = {
    findUnique: async ({ where }) => structuredClone(select(name, where)[0] || null),
    findFirst: async ({ where }) => structuredClone(select(name, where)[0] || null),
    findMany: async ({ where } = {}) => structuredClone(select(name, where)),
    update: async ({ where, data }) => { const r = select(name, where)[0]; Object.assign(r, structuredClone(data)); return structuredClone(r); },
    create: async ({ data }) => { const r = { id: `new-${state[name].length}`, ...structuredClone(data) }; state[name].push(r); return r; },
    deleteMany: async ({ where }) => { const remove = select(name, where); state[name] = state[name].filter((r) => !remove.includes(r)); },
  };
  let tail = Promise.resolve();
  db.$transaction = (operation) => {
    const pending = tail.then(async () => { const before = structuredClone(state); try { return await operation(db); } catch (error) { state = before; throw error; } });
    tail = pending.catch(() => {}); return pending;
  };
  return { db, state: () => state };
}

test("revert reopens Free 8s, reverses all eight rewards and level-ups, preserves maps, and permits a corrected winner", async (t) => {
  t.mock.method(console, "info", () => {});
  const f = fixture();
  const result = await revertFreeEightsResult(f.db, admin, "m1", date);
  assert.equal(result.status, "in_progress"); assert.equal(result.roster_locked, true);
  assert.equal(result.winner_id, null); assert.equal(result.confirmed_score_alpha, null);
  assert.equal(result.eights_score_vote_status, null); assert.equal(result.free_eights_elo_applied_at, null);
  assert.deepEqual(result.series_maps, ["A", "B", "C"]);
  for (let i = 0; i < 8; i++) {
    const s = f.state();
    assert.equal(s.eightsStats[i].free_eights_elo, 400);
    assert.equal(s.eightsStats[i].metadata.wins, 3); assert.equal(s.eightsStats[i].metadata.losses, 2);
    assert.equal(s.eightsStats[i].metadata.rating, 1000); assert.equal(s.eightsStats[i].metadata.win_streak, 3);
    assert.equal(s.eightsStats[i].metadata.monthly_matches, 2); assert.equal(s.eightsStats[i].metadata.monthly_xp, 200);
    assert.equal(s.xPStats[i].metadata.level, 1); assert.equal(s.xPStats[i].metadata.current_xp, 950);
    assert.equal(s.xPStats[i].metadata.total_xp, 950); assert.equal(s.xPStats[i].metadata.win_streak, 3);
    assert.equal(s.playerProfile[i].metadata.total_matches, 5); assert.equal(s.playerProfile[i].metadata.best_win_streak, 3);
    assert.equal(s.user[i].wager_wins, 3); assert.equal(s.user[i].wager_losses, 2); assert.equal(s.user[i].current_win_streak, 3);
  }
  assert.deepEqual(f.state().wagerMatch.map((r) => r.id), ["other-history"]);
  assert.equal(f.state().adminAction.length, 1);
  const corrected = await completeFreeEightsWithElo(f.db, "m1", { status: "completed", winner_id: "p4", match_completed_date: "new" });
  assert.equal(corrected.applied, true); assert.equal(f.state().eightsStats[4].free_eights_elo, 420);
  assert.equal(f.state().eightsStats[0].free_eights_elo, 380);
});

test("reversal preserves later rewards, other games and monthly rollovers", async () => {
  const f = fixture(), s = f.state();
  s.eightsStats.push({ id: "mw4", free_eights_elo: 800, metadata: { user_id: "p0", game_id: "mw4" } });
  Object.assign(s.eightsStats[0], { free_eights_elo: 460 });
  Object.assign(s.eightsStats[0].metadata, { matches_played: 7, wins: 5, win_streak: 5, monthly_key: "2026-11", monthly_matches: 1, monthly_xp: 150,
    monthly_history: [{ month: "2026-10", wins: 2, matches: 3, xp: 350 }] });
  Object.assign(s.xPStats[0].metadata, { total_xp: 1250, current_xp: 250, weekly_xp: 1250, win_streak: 5 });
  Object.assign(s.playerProfile[0].metadata, { total_matches: 7, total_wins: 5, current_win_streak: 5, best_win_streak: 5, xp: 1250 });
  Object.assign(s.user[0], { wager_wins: 5, current_win_streak: 5 });
  await revertFreeEightsResult(f.db, admin, "m1", date);
  assert.equal(f.state().eightsStats[0].free_eights_elo, 440); assert.equal(f.state().eightsStats[8].free_eights_elo, 800);
  assert.equal(f.state().eightsStats[0].metadata.win_streak, 5);
  assert.equal(f.state().eightsStats[0].metadata.monthly_matches, 1);
  assert.deepEqual(f.state().eightsStats[0].metadata.monthly_history, [{ month: "2026-10", wins: 1, matches: 2, xp: 200 }]);
  assert.equal(f.state().xPStats[0].metadata.total_xp, 1100); assert.equal(f.state().xPStats[0].metadata.win_streak, 5);
  assert.equal(f.state().user[0].current_win_streak, 5); assert.equal(f.state().playerProfile[0].metadata.best_win_streak, 5);
});

test("legacy results can be reversed without reward snapshots and zero-floor ELO uses its actual delta", async () => {
  const f = fixture(); delete f.state().wager[0].metadata.free_eights_reward_snapshot;
  f.state().eightsStats[4].free_eights_elo = 0;
  f.state().wager[0].metadata.free_eights_elo_changes.p4.delta = 0;
  await revertFreeEightsResult(f.db, admin, "m1", date);
  assert.equal(f.state().eightsStats[4].free_eights_elo, 0);
  assert.equal(f.state().xPStats[0].metadata.total_xp, 950);
});

test("players, moderators, paid matches, stale results and incomplete reward histories cannot revert", async () => {
  for (const role of ["user", "moderator"]) {
    const f = fixture(), before = structuredClone(f.state());
    await assert.rejects(revertFreeEightsResult(f.db, { id: "x", role }, "m1", date), { status: 403 }); assert.deepEqual(f.state(), before);
  }
  for (const patch of [{ match_type: "money8s" }, { entry_fee: 10 }, { status: "cancelled" }, { match_completed_date: "new" }, { xp_changes: {} }]) {
    const f = fixture(); Object.assign(f.state().wager[0].metadata, patch); const before = structuredClone(f.state());
    await assert.rejects(revertFreeEightsResult(f.db, admin, "m1", date)); assert.deepEqual(f.state(), before);
  }
});

test("concurrent reversals apply once and audit failures roll back every change", async () => {
  const f = fixture();
  const results = await Promise.allSettled([revertFreeEightsResult(f.db, admin, "m1", date), revertFreeEightsResult(f.db, admin, "m1", date)]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1); assert.equal(f.state().adminAction.length, 1);
  const broken = fixture(), before = structuredClone(broken.state());
  broken.db.adminAction.create = async () => { throw new Error("audit failed"); };
  await assert.rejects(revertFreeEightsResult(broken.db, admin, "m1", date), /audit failed/); assert.deepEqual(broken.state(), before);
});

test("reward snapshots capture pre-result streaks and counts", async () => {
  const f = fixture();
  const snapshot = await captureFreeEightsRewards(f.db, ["p0"], "bo7");
  assert.equal(snapshot.p0.user_streak, 4); assert.equal(snapshot.p0.eights_matches, 6);
});

test("authenticated endpoint reverts for admins and rejects ordinary players", async (t) => {
  const f = fixture();
  const override = (target, name, method) => { const previous = target[name]; target[name] = method; t.after(() => { target[name] = previous; }); };
  override(prisma.user, "findUnique", async ({ where }) => ({ id: where.id, role: where.id === "admin" ? "admin" : "user", email_verified: true }));
  override(prisma.ban, "findMany", async () => []);
  override(prisma, "$transaction", f.db.$transaction);
  override(prisma.chatMessage, "create", async ({ data }) => ({ id: "notice", ...data }));
  const app = express(); app.use(express.json()); app.use("/functions", routes);
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message }));
  const server = app.listen(0, "127.0.0.1"); await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const request = (user) => fetch(`http://127.0.0.1:${server.address().port}/functions/adminRevertFreeEightsResult`, {
    method: "POST", headers: { Authorization: `Bearer ${signUser(user)}`, "Content-Type": "application/json" },
    body: JSON.stringify({ wager_id: "m1", expected_match_completed_date: date }),
  });
  assert.equal((await request({ id: "p0", role: "user", email_verified: true })).status, 403);
  const response = await request(admin); assert.equal(response.status, 200);
  const result = await response.json(); assert.equal(result.success, true); assert.equal(result.wager.status, "in_progress");
});

test("an archived result cannot alter current Free 8s or XP progression after a reset", async () => {
  for (const table of ["eightsStats", "xPStats"]) {
    const f = fixture();
    f.state()[table][0].metadata.progression_reset_at = "2026-10-19T12:00:00.000Z";
    const before = structuredClone(f.state());
    await assert.rejects(revertFreeEightsResult(f.db, admin, "m1", date), /archived/);
    assert.deepEqual(f.state(), before, "the reopened match and all earlier player writes must roll back");
  }
});
