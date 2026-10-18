import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { removeFreeEightsPlayer } from "./free-eights-removal.js";
import { joinFreeEightsLobby, findActiveFreeEightsMatch } from "./free-eights-membership.js";
import { isExpiredOpenMatch, cancelExpiredMatchfinderPost } from "./matchfinder-expiry.js";
import { prisma } from "./prisma.js";
import { signUser } from "./auth.js";
import routes from "./routes/functions.js";

const admin = { id: "admin", username: "Staff", role: "admin", email_verified: true };
function fixture(size = 4, status = "open") {
  let state = {
    match: { id: "match", created_date: new Date(Date.now() - 2 * 60 * 60 * 1000), metadata: {
      match_type: "8s", status, team_size: `${size}v${size}`, required_players_per_team: size,
      host_id: "u0", host_name: "Player 0", challenger_id: `u${size}`, challenger_name: `Player ${size}`,
      roster_locked: status === "in_progress", roster_lock_deadline: new Date(Date.now() + 60000).toISOString(),
      teams_generated_at: "old", series_maps: ["Map A"], series_images: ["map.jpg"],
      free_eights_captain_vote_ids: ["u0", "u1"], free_eights_captain_draft: { status: "active", captains: { host: "u0", challenger: `u${size}` }, picks: [{ user_id: "u1" }] },
    } },
    players: Array.from({ length: size * 2 }, (_, i) => ({ id: `p${i}`, metadata: { wager_id: "match", user_id: `u${i}`, user_name: `Player ${i}`, team: i < size ? "host" : "challenger", is_captain: i === 0 || i === size, payment_status: "paid" } })),
    notifications: [], audits: [], messages: [],
  };
  const fits = (row, where) => !where || Object.entries(where).every(([key, value]) => {
    if (key === "AND") return value.every((part) => fits(row, part));
    if (key === "OR") return value.some((part) => fits(row, part));
    if (key === "NOT") return value.every((part) => !fits(row, part));
    if (key === "metadata") return row.metadata?.[value.path[0]] === value.equals;
    if (value?.in) return value.in.includes(row[key]);
    if (value?.not) return row[key] !== value.not;
    return row[key] === value;
  });
  const db = {
    $executeRaw: async () => 1,
    wager: {
      findUnique: async () => structuredClone(state.match),
      findMany: async ({ where }) => fits(state.match, where) ? [structuredClone(state.match)] : [],
      update: async ({ data }) => { Object.assign(state.match, structuredClone(data)); return structuredClone(state.match); },
    },
    wagerParticipant: {
      findMany: async ({ where } = {}) => structuredClone(state.players.filter((row) => fits(row, where))),
      delete: async ({ where }) => state.players.splice(state.players.findIndex((row) => row.id === where.id), 1)[0],
      update: async ({ where, data }) => { const row = state.players.find((row) => row.id === where.id); Object.assign(row, structuredClone(data)); return structuredClone(row); },
      create: async ({ data }) => { const row = { id: `new-${state.players.length}`, ...structuredClone(data) }; state.players.push(row); return structuredClone(row); },
    },
    adminAction: { create: async ({ data }) => { state.audits.push(structuredClone(data)); return data; } },
    notification: { create: async ({ data }) => { state.notifications.push(structuredClone(data)); return data; } },
    chatMessage: { create: async ({ data }) => { state.messages.push(structuredClone(data)); return data; } },
  };
  let tail = Promise.resolve();
  db.$transaction = (action) => {
    const result = tail.then(async () => { const before = structuredClone(state); try { return await action(db); } catch (error) { state = before; throw error; } });
    tail = result.catch(() => {}); return result;
  };
  return { db, state: () => state, input: (i = 0) => ({ player_id: `u${i}`, participant_id: `p${i}`, reason: "AFK in lobby" }) };
}

for (const size of [2, 3, 4]) test(`${size}v${size}: removal keeps the room and all other players, releases the captain and permits a replacement`, async () => {
  const f = fixture(size, "in_progress");
  const before = structuredClone(f.state().players.slice(1));
  const result = await removeFreeEightsPlayer(f.db, admin, "match", f.input());
  assert.equal(result.wager.id, "match"); assert.equal(result.wager.status, "open");
  assert.equal(result.wager.roster_locked, false); assert.equal(result.wager.teams_generated_at, "");
  assert.equal(result.wager.host_id, "u1"); assert.equal(result.wager.challenger_id, `u${size}`);
  assert.equal(result.wager.free_eights_captain_draft, null); assert.deepEqual(result.wager.free_eights_captain_vote_ids, []);
  assert.deepEqual(f.state().players.map((row) => row.id), before.map((row) => row.id));
  assert.ok(f.state().players.every((row) => row.metadata.payment_status === "paid"));
  assert.equal(f.state().players.filter((row) => row.metadata.is_captain).length, 2);
  assert.equal(await findActiveFreeEightsMatch(f.db, "u0"), null);
  assert.equal((await findActiveFreeEightsMatch(f.db, "u1")).id, "match");
  assert.equal((await joinFreeEightsLobby(f.db, "u0", "match", "Removed player")).code, "FREE_EIGHTS_REMOVED");
  assert.equal((await joinFreeEightsLobby(f.db, "replacement", "match", "New player")).success, true);
  assert.equal(f.state().players.length, size * 2);
  assert.equal(f.state().audits[0].metadata.target_user_id, "u0");
  assert.equal(f.state().notifications[0].metadata.message, "AFK in lobby");
  assert.equal(isExpiredOpenMatch(result.wager), false);
  assert.equal(await cancelExpiredMatchfinderPost(f.db, "Wager", "match"), null);
  assert.equal(isExpiredOpenMatch(result.wager, Date.parse(result.wager.free_eights_reopened_at) + 60 * 60 * 1000), true);
});

test("only admin, super admin and CEO can remove; paid, finished and score-review rooms cannot be changed", async () => {
  for (const role of ["user", "moderator"]) {
    const f = fixture(), before = structuredClone(f.state());
    await assert.rejects(removeFreeEightsPlayer(f.db, { id: "actor", role }, "match", f.input()), { status: 403 });
    assert.deepEqual(f.state(), before);
  }
  for (const role of ["admin", "super_admin", "ceo"]) {
    const f = fixture(); assert.equal((await removeFreeEightsPlayer(f.db, { id: "actor", role }, "match", f.input())).success, true);
  }
  for (const changes of [{ match_type: "money8s" }, { status: "completed" }, { status: "cancelled" }, { status: "disputed" }, { status: "awaiting_completion" }, { eights_score_vote_status: "pending" }, { scores_confirmed: true }, { free_eights_elo_applied_at: "done" }, { dispute_id: "ticket" }]) {
    const f = fixture(); Object.assign(f.state().match.metadata, changes); const before = structuredClone(f.state());
    await assert.rejects(removeFreeEightsPlayer(f.db, admin, "match", f.input())); assert.deepEqual(f.state(), before);
  }
});

test("bad targets, stale participant entries and duplicate removal cannot remove another player", async () => {
  const f = fixture();
  for (const input of [{ ...f.input(), player_id: "outsider" }, { ...f.input(), participant_id: "p1" }, { ...f.input(), reason: "x".repeat(501) }]) {
    const before = structuredClone(f.state()); await assert.rejects(removeFreeEightsPlayer(f.db, admin, "match", input)); assert.deepEqual(f.state(), before);
  }
  const results = await Promise.allSettled([removeFreeEightsPlayer(f.db, admin, "match", f.input()), removeFreeEightsPlayer(f.db, admin, "match", f.input())]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(f.state().players.length, 7); assert.equal(f.state().audits.length, 1); assert.equal(f.state().notifications.length, 1);
});

test("participant, audit and notification failures roll back the removal and roster reopening", async () => {
  for (const [delegate, method] of [["wagerParticipant", "update"], ["adminAction", "create"], ["notification", "create"]]) {
    const f = fixture(), before = structuredClone(f.state());
    f.db[delegate][method] = async () => { throw new Error("database unavailable"); };
    await assert.rejects(removeFreeEightsPlayer(f.db, admin, "match", f.input()), /database unavailable/);
    assert.deepEqual(f.state(), before);
  }
});

test("removing the final player leaves an empty room; a fresh player becomes its host", async () => {
  const f = fixture(2); f.state().players.splice(1);
  const result = await removeFreeEightsPlayer(f.db, admin, "match", f.input());
  assert.equal(result.wager.status, "open"); assert.equal(result.wager.host_id, ""); assert.equal(result.wager.challenger_id, "");
  const joined = await joinFreeEightsLobby(f.db, "replacement", "match", "Replacement");
  assert.equal(joined.success, true); assert.equal(joined.participant.is_captain, true);
  assert.equal(f.state().match.metadata.host_id, "replacement");
});

test("the authenticated removal action publishes a room notice and rejects non-admins", async (t) => {
  const f = fixture();
  const override = (delegate, key, value) => { const old = delegate[key]; delegate[key] = value; t.after(() => { delegate[key] = old; }); };
  override(prisma, "$transaction", f.db.$transaction);
  override(prisma.user, "findUnique", async ({ where }) => ({ ...admin, id: where.id, role: where.id === "admin" ? "admin" : "user" }));
  override(prisma.ban, "findMany", async () => []);
  override(prisma.playerProfile, "findMany", async () => []);
  override(prisma.chatMessage, "create", f.db.chatMessage.create);
  const app = express(); app.use(express.json()); app.use("/functions", routes);
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message }));
  const server = app.listen(0, "127.0.0.1"); await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const request = async (actor) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/functions/adminRemoveFreeEightsPlayer`, { method: "POST", headers: { Authorization: `Bearer ${signUser({ id: actor })}`, "Content-Type": "application/json" }, body: JSON.stringify({ wager_id: "match", ...f.input() }) });
    return { status: response.status, data: await response.json() };
  };
  assert.equal((await request("u0")).status, 403);
  const result = await request("admin"); assert.equal(result.data.success, true, JSON.stringify(result));
  assert.equal(result.data.wager.status, "open"); assert.equal(f.state().messages.length, 1);
  assert.match(f.state().messages[0].metadata.content, /room stays open/);
});
