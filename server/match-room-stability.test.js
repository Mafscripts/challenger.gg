import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createMatchChatFeed } from "../src/lib/matchChatFeed.js";
import { cancelledMatchDestination, latestRoomRecord } from "../src/lib/cancelledMatchRoom.js";
import functionRoutes from "./routes/functions.js";
import { prisma } from "./prisma.js";
import { signUser } from "./auth.js";

const message = (id, room = "room", content = id) => ({ id: String(id), conversation_id: room, content, created_date: new Date(Number(id) * 1000).toISOString() });
function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}
function fixture(read, options = {}) {
  const changes = [], errors = [];
  const feed = createMatchChatFeed({ conversationId: "room", read, onChange: (rows) => changes.push(rows), onError: (error) => errors.push(error), ...options });
  return { feed, changes, errors };
}

test("chat coalesces poll, focus and retry while a slow read is in flight", async () => {
  const gate = deferred();
  let requests = 0;
  const f = fixture(() => { requests++; return gate.promise; });
  const first = f.feed.refresh();
  assert.equal(f.feed.refresh(), first);
  assert.equal(f.feed.refresh(), first);
  await Promise.resolve();
  assert.equal(requests, 1);
  gate.resolve([message(1)]);
  assert.equal(await first, true);
  assert.equal(f.changes.length, 1);
});

test("a poll started before a confirmed send cannot remove or duplicate that message", async () => {
  const gate = deferred();
  let rows = [message(1)];
  let slow = false;
  const f = fixture(() => slow ? gate.promise : rows);
  await f.feed.refresh();
  slow = true;
  const polling = f.feed.refresh();
  f.feed.addConfirmed(message(2));
  gate.resolve([message(1)]);
  await polling;
  assert.deepEqual(f.changes.at(-1).map((row) => row.id), ["1", "2"]);
  const changeCount = f.changes.length;
  rows = [message(2), message(1)];
  slow = false;
  await f.feed.refresh();
  f.feed.addConfirmed(message(2));
  assert.equal(f.changes.length, changeCount);
  assert.deepEqual(f.changes.at(-1).map((row) => row.id), ["1", "2"]);
});

test("a transient error preserves messages and the next read recovers", async () => {
  let failing = false;
  const f = fixture(() => { if (failing) throw new Error("offline"); return [message(1)]; });
  await f.feed.refresh();
  failing = true;
  assert.equal(await f.feed.refresh(), false);
  assert.equal(f.errors.length, 1);
  assert.equal(f.changes.length, 1);
  assert.equal(f.changes[0][0].id, "1");
  failing = false;
  assert.equal(await f.feed.refresh(), true);
  assert.equal(f.changes.length, 1);
});

test("disposed room ignores late reads and late sends; new room stays isolated", async () => {
  const gate = deferred();
  const f = fixture(() => gate.promise);
  const pending = f.feed.refresh();
  f.feed.dispose();
  gate.resolve([message(1)]);
  assert.equal(await pending, false);
  assert.equal(f.feed.addConfirmed(message(2)), false);
  assert.deepEqual(f.changes, []);
  const other = fixture(() => [message(3, "other"), message(4, "room")], { conversationId: "other" });
  await other.feed.refresh();
  assert.deepEqual(other.changes[0].map((row) => row.id), ["3"]);
  assert.equal(other.feed.addConfirmed(message(5, "room")), false);
});

test("unchanged snapshots do not redraw chat, changed content still updates", async () => {
  let rows = [message(2), message(1), message(1)];
  const f = fixture(() => rows);
  await f.feed.refresh();
  await f.feed.refresh();
  assert.equal(f.changes.length, 1);
  assert.deepEqual(f.changes[0].map((row) => row.id), ["1", "2"]);
  rows = [message(1), message(2, "room", "edited")];
  await f.feed.refresh();
  assert.equal(f.changes.length, 2);
  assert.equal(f.changes.at(-1)[1].content, "edited");
});

test("new messages update a full rolling window even when its count is unchanged", async () => {
  let rows = Array.from({ length: 100 }, (_, i) => message(i + 1));
  const f = fixture(() => rows, { limit: 50 });
  await f.feed.refresh();
  rows = [...rows, message(101)];
  await f.feed.refresh();
  assert.equal(f.changes.length, 2);
  assert.equal(f.changes[0].length, 50);
  assert.equal(f.changes[1].length, 50);
  assert.equal(f.changes[1].at(-1).id, "101");
});

test("cancelled rooms always return to their own competition; live/completed rooms remain accessible", () => {
  for (const [type, matchType, destination] of [
    ["8s", "8s", "/ranked/8s"], ["8s", "money8s", "/ranked/8s?mode=money"],
    ["wager", "money8s", "/ranked/8s?mode=money"], ["wager", "wagers", "/wagers"],
    ["xp", "xp", "/xp"], ["ranked", "ranked", "/ranked"], ["tournament", "tournament", "/tournaments/t1"],
  ]) {
    assert.equal(cancelledMatchDestination({ status: "cancelled", match_type: matchType, tournament_id: "t1" }, type), destination);
    for (const status of ["open", "in_progress", "completed", "disputed"]) assert.equal(cancelledMatchDestination({ status, match_type: matchType }, type), null);
  }
  assert.equal(cancelledMatchDestination({ status: "in_progress", tournament_id: "t1" }, "tournament", { status: "cancelled" }), "/tournaments/t1");
  assert.equal(cancelledMatchDestination(null, "8s"), null);
});

test("late room polls cannot undo cancellation or overwrite newer results", () => {
  const live = { id: "room", status: "in_progress", updated_date: "2026-10-07T12:00:00Z" };
  const cancelled = { ...live, status: "cancelled" };
  const complete = { ...live, status: "completed", updated_date: "2026-10-07T12:01:00Z", winner_id: "a" };
  const correction = { ...complete, updated_date: "2026-10-07T12:02:00Z", winner_id: "b" };
  assert.equal(latestRoomRecord(cancelled, live), cancelled);
  assert.equal(latestRoomRecord(live, cancelled), cancelled);
  assert.equal(latestRoomRecord(complete, live), complete);
  assert.equal(latestRoomRecord(complete, correction), correction);
  assert.equal(latestRoomRecord(null, live), live);
  assert.equal(latestRoomRecord(live, null), null);
});

test("server rejects new chat in cancelled rooms and preserves completed history", async (t) => {
  let status = "cancelled", parentStatus = "open", creates = 0;
  const user = { id: "host", role: "user", email_verified: true, metadata: {} };
  const override = (target, name, implementation) => {
    const previous = target[name];
    target[name] = implementation;
    t.after(() => { target[name] = previous; });
  };
  override(prisma.user, "findUnique", async () => user);
  override(prisma.ban, "findMany", async () => []);
  override(prisma.playerProfile, "findMany", async () => []);
  for (const name of ["wager", "rankedMatch", "xPMatch", "tournamentMatch"]) override(prisma[name], "findUnique", async ({ where }) => ({ id: where.id, metadata: { status, host_id: "host", tournament_id: "t1" } }));
  override(prisma.tournament, "findUnique", async () => ({ id: "t1", metadata: { status: parentStatus } }));
  override(prisma.wagerParticipant, "findMany", async () => [{ id: "p1", metadata: { wager_id: "room", user_id: "host", team: "host" } }]);
  override(prisma.chatMessage, "create", async ({ data }) => { creates++; return { id: "new-message", created_date: new Date(), ...data }; });
  const app = express();
  app.use(express.json());
  app.use("/api/functions", functionRoutes);
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const request = async (type, auth = true) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/functions/sendMatchRoomMessage`, { method: "POST", headers: { "Content-Type": "application/json", ...(auth ? { Authorization: `Bearer ${signUser(user)}` } : {}) }, body: JSON.stringify({ match_type: type, match_id: "room", content: "test" }) });
    return { response, data: await response.json() };
  };
  assert.equal((await request("8s", false)).response.status, 401);
  for (const type of ["8s", "money8s", "wager", "ranked", "xp", "tournament"]) {
    const { data } = await request(type);
    assert.equal(data.success, false);
    assert.equal(data.code, "MATCH_CANCELLED");
  }
  assert.equal(creates, 0);
  status = "in_progress";
  parentStatus = "cancelled";
  assert.equal((await request("tournament")).data.code, "MATCH_CANCELLED");
  assert.equal(creates, 0);
  status = "completed";
  assert.equal((await request("wager")).data.success, true);
  assert.equal(creates, 1);
});

test("Free 8s cancellation persists once and a stale lobby sync cannot reopen it", async (t) => {
  const user = { id: "host", role: "user", email_verified: true, metadata: {} };
  let stored = { id: "room", metadata: { status: "open", match_type: "8s", host_id: "host", eights_score_vote_status: "pending", eights_score_vote_user_ids: ["host"], roster_locked: false } };
  let updates = 0;
  const override = (target, name, implementation) => {
    const previous = target[name]; target[name] = implementation;
    t.after(() => { target[name] = previous; });
  };
  override(prisma.user, "findUnique", async () => user);
  override(prisma.ban, "findMany", async () => []);
  override(prisma.wager, "findUnique", async () => stored);
  override(prisma.wager, "update", async ({ data }) => { updates++; stored = { ...stored, ...data }; return stored; });
  override(prisma.wagerParticipant, "findMany", async () => [{ id: "p1", metadata: { user_id: "host", wager_id: "room", entry_fee_paid: 0 } }]);
  override(prisma.dispute, "findMany", async () => []);
  override(prisma.notification, "create", async ({ data }) => ({ id: "notification", ...data }));
  override(prisma.eightsStats, "update", async () => { assert.fail("Cancellation must not award ELO"); });
  const app = express();
  app.use(express.json()); app.use("/api/functions", functionRoutes);
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const request = async (name) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/functions/${name}`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${signUser(user)}` }, body: JSON.stringify({ wager_id: "room" }) });
    assert.equal(response.status, 200);
    return response.json();
  };
  const cancelled = await request("refundWager");
  assert.equal(cancelled.success, true);
  assert.equal(cancelled.wager.status, "cancelled");
  assert.equal(cancelled.wager.eights_score_vote_status, "cancelled");
  assert.deepEqual(cancelled.wager.eights_score_vote_user_ids, []);
  assert.equal(cancelled.wager.roster_locked, true);
  assert.equal((await request("refundWager")).success, false);
  const synced = await request("syncEightsLobby");
  assert.equal(synced.success, true);
  assert.equal(synced.wager.status, "cancelled");
  assert.equal(updates, 1);
});
