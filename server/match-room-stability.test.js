import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createMatchChatFeed } from "../src/lib/matchChatFeed.js";
import { cancelledMatchDestination, excludeCancelledHeaderMatches, latestRoomRecord, matchCancelledEvent, notifyCancelledMatch, notifyCancelledMatchResponse } from "../src/lib/cancelledMatchRoom.js";
import functionRoutes from "./routes/functions.js";
import { prisma } from "./prisma.js";
import { signUser } from "./auth.js";

const message = (id, room = "room", content = id) => ({ id: String(id), conversation_id: room, content, created_date: new Date(Number(id) * 1000).toISOString() });
function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

test("confirmed cancellations update My Matches for each room type; failed requests and unfinished votes do not", (t) => {
  const originalWindow = globalThis.window;
  const browser = new EventTarget();
  globalThis.window = browser;
  t.after(() => { if (originalWindow === undefined) delete globalThis.window; else globalThis.window = originalWindow; });
  const events = [];
  browser.addEventListener(matchCancelledEvent, (event) => events.push(event.detail));
  for (const matchType of ["8s", "money8s", "wager"]) {
    notifyCancelledMatchResponse({ success: true, wager: { id: matchType, match_type: matchType, status: "cancelled" } }, "refundWager");
  }
  for (const [name, entityType] of [["cancelRankedMatch", "ranked"], ["voteRankedCancellation", "ranked"], ["cancelXPMatch", "xp"], ["cancelTournamentMatch", "tournament"]]) {
    notifyCancelledMatchResponse({ success: true, match: { id: name, status: "cancelled" } }, name);
    assert.deepEqual(events.at(-1), { entityType, id: name });
  }
  notifyCancelledMatchResponse({ success: true, tournament: { id: "parent", status: "cancelled" } }, "cancelTournament");
  assert.deepEqual(events.at(-1), { entityType: "tournament-parent", id: "parent" });
  assert.deepEqual(events.slice(0, 3), ["8s", "money8s", "wager"].map((id) => ({ entityType: "wager", id })));
  const count = events.length;
  notifyCancelledMatchResponse({ success: false, wager: { id: "failed", status: "cancelled" } }, "refundWager");
  notifyCancelledMatchResponse({ success: true, cancelled: false, match: { id: "vote", status: "in_progress" } }, "voteRankedCancellation");
  notifyCancelledMatch({ id: "unknown", status: "cancelled" }, "User");
  assert.equal(events.length, count);
});

test("My Matches cannot restore a cancellation from a late poll or remove another room with the same ID", async () => {
  const cancellations = new Set();
  const rows = [
    { id: "shared", entity_type: "wager", status: "in_progress" },
    { id: "shared", entity_type: "ranked", status: "in_progress" },
    { id: "a", entity_type: "tournament", tournament_id: "parent" },
    { id: "b", entity_type: "tournament", tournament_id: "other" },
  ];
  const oldPoll = deferred();
  const result = oldPoll.promise.then((matches) => excludeCancelledHeaderMatches(matches, cancellations));
  cancellations.add("wager:shared");
  cancellations.add("tournament-parent:parent");
  assert.deepEqual(excludeCancelledHeaderMatches(rows, cancellations), [rows[1], rows[3]]);
  oldPoll.resolve(rows);
  assert.deepEqual(await result, [rows[1], rows[3]]);
  cancellations.add("tournament:b");
  assert.deepEqual(excludeCancelledHeaderMatches(rows, cancellations), [rows[1]]);
});
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

test("send appears immediately before the network replies and stale polls retain its pending status", async () => {
  const gate = deferred();
  const f = fixture(() => gate.promise);
  const polling = f.feed.refresh();
  const local = { ...message(2), id: "sending:abc", sender_id: "me", client_message_id: "abc" };
  assert.equal(f.feed.beginSend(local), true);
  assert.equal(f.changes.at(-1)[0].content, 2);
  assert.equal(f.changes.at(-1)[0].sending, true);
  gate.resolve([message(1)]);
  await polling;
  assert.equal(f.changes.at(-1).length, 2);
  const created = { ...message(2), sender_id: "me", client_message_id: "abc" };
  f.feed.confirmSend(local.id, created);
  assert.deepEqual(f.changes.at(-1).map((row) => row.id), ["1", "2"]);
  assert.equal(f.changes.at(-1)[1].sending, undefined);
});

test("poll acknowledgement before send response replaces the local message exactly once", async () => {
  const local = { ...message(2), id: "sending:abc", sender_id: "me", client_message_id: "abc" };
  const created = { ...message(2), sender_id: "me", client_message_id: "abc" };
  const f = fixture(() => [created]);
  f.feed.beginSend(local);
  await f.feed.refresh();
  assert.deepEqual(f.changes.at(-1), [created]);
  assert.equal(f.feed.failSend(local.id), false);
  const changes = f.changes.length;
  f.feed.confirmSend(local.id, created);
  assert.equal(f.changes.length, changes);
});

test("rejected send rolls back only its pending bubble and does not lose existing history", async () => {
  const f = fixture(() => [message(1)]);
  await f.feed.refresh();
  f.feed.beginSend({ ...message(2), id: "sending:abc", sender_id: "me", client_message_id: "abc" });
  assert.equal(f.feed.failSend("sending:abc"), true);
  assert.deepEqual(f.changes.at(-1), [message(1)]);
});

test("another sender cannot acknowledge a pending message using the same correlation ID", async () => {
  const created = { ...message(2), sender_id: "other", client_message_id: "abc" };
  const f = fixture(() => [created]);
  f.feed.beginSend({ ...message(3), id: "sending:abc", sender_id: "me", client_message_id: "abc" });
  await f.feed.refresh();
  assert.equal(f.changes.at(-1).length, 2);
  assert.equal(f.changes.at(-1).at(-1).sending, true);
  assert.equal(f.feed.failSend("sending:abc"), true);
  assert.deepEqual(f.changes.at(-1), [created]);
});

test("leaving a room discards pending sends and their late confirmations", async () => {
  const f = fixture(() => []);
  f.feed.beginSend({ ...message(1), id: "sending:abc", sender_id: "me", client_message_id: "abc" });
  const changes = f.changes.length;
  f.feed.dispose();
  assert.equal(f.feed.confirmSend("sending:abc", message(1)), false);
  assert.equal(f.feed.failSend("sending:abc"), false);
  assert.equal(f.changes.length, changes);
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
  const notifications = [];
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
  override(prisma.notification, "create", async ({ data }) => { notifications.push(data.metadata); return { id: "notification", ...data }; });
  override(prisma.wallet, "findMany", async () => { assert.fail("Free 8s cancellation must not access wallets"); });
  override(prisma.walletTransaction, "create", async () => { assert.fail("Free 8s cancellation must not create a refund transaction"); });
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
  assert.equal(cancelled.wager.cancel_reason, "Cancelled");
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].title, "Free 8s lobby cancelled");
  assert.equal(notifications[0].message, "Match was cancelled.");
  assert.equal(notifications[0].action_url, "/ranked/8s");
  assert.equal((await request("refundWager")).success, false);
  assert.equal(notifications.length, 1, "a repeated cancellation must not send a second notification");
  const synced = await request("syncEightsLobby");
  assert.equal(synced.success, true);
  assert.equal(synced.wager.status, "cancelled");
  assert.equal(updates, 1);
});

test("send overlaps profile and match reads, reuses one wager roster and keeps server identity authoritative", async (t) => {
  const profileGate = deferred();
  const matchRead = deferred();
  let rosterReads = 0;
  let creates = 0;
  const user = { id: "member", role: "user", full_name: "Actual Player", email_verified: true, metadata: {} };
  const override = (target, name, implementation) => {
    const previous = target[name]; target[name] = implementation;
    t.after(() => { target[name] = previous; });
  };
  override(prisma.user, "findUnique", async () => user);
  override(prisma.ban, "findMany", async () => []);
  override(prisma.playerProfile, "findMany", async () => profileGate.promise);
  override(prisma.wager, "findUnique", async () => { matchRead.resolve(); return { id: "room", metadata: { match_type: "8s", status: "in_progress", host_id: "host" } }; });
  override(prisma.wagerParticipant, "findMany", async () => { rosterReads++; return [{ id: "p1", metadata: { user_id: "member", wager_id: "room", team: "challenger" } }]; });
  override(prisma.chatMessage, "create", async ({ data }) => { creates++; return { id: "server-message", ...data }; });
  const app = express();
  app.use(express.json()); app.use("/api/functions", functionRoutes);
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const pending = fetch(`http://127.0.0.1:${server.address().port}/api/functions/sendMatchRoomMessage`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${signUser(user)}` }, body: JSON.stringify({ match_type: "8s", match_id: "room", content: "hello", client_message_id: "abc-123", sender_id: "attacker", sender_role: "ceo", team_side: "a" }) });
  // The match read must begin while the profile read is still unresolved.
  let timeout;
  try {
    await Promise.race([matchRead.promise, new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error("Match read waited for profile")), 2000); })]);
  } finally {
    clearTimeout(timeout);
    profileGate.resolve([{ metadata: { user_id: "member", avatar_url: "/avatar.png" } }]);
  }
  const response = await pending;
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.success, true);
  assert.equal(result.message.sender_id, "member");
  assert.equal(result.message.sender_role, "user");
  assert.equal(result.message.sender_name, "Actual Player");
  assert.equal(result.message.team_side, "b");
  assert.equal(result.message.client_message_id, "abc-123");
  assert.equal(result.message.sender_avatar_url, "/avatar.png");
  assert.equal(rosterReads, 1);
  assert.equal(creates, 1);
});
