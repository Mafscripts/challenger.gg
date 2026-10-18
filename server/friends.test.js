import test from "node:test";
import assert from "node:assert/strict";
import { changeFriendship, friendStatus, listFriendRequests } from "./friends.js";

function matches(row, query = {}) {
  if (query.OR && !query.OR.some((part) => matches(row, part))) return false;
  if (query.AND && !query.AND.every((part) => matches(row, part))) return false;
  if (query.NOT && matches(row, query.NOT)) return false;
  if (query.id?.in && !query.id.in.includes(row.id)) return false;
  if (typeof query.id === "string" && query.id !== row.id) return false;
  if (query.metadata && row.metadata?.[query.metadata.path[0]] !== query.metadata.equals) return false;
  if (query.created_date?.gte && new Date(row.created_date) < query.created_date.gte) return false;
  return true;
}
function fixture() {
  const state = { users: ["a", "b", "c"].map((id) => ({ id, username: id, display_name: `Player ${id}`, metadata: { email: "private", avatar_url: "/avatar.png" } })),
    requests: [], friends: [], blocks: [], notifications: [] };
  let sequence = 0;
  const delegate = (key) => ({
    findMany: async ({ where, skip = 0, take } = {}) => state[key].filter((row) => matches(row, where)).sort((a, b) => new Date(b.created_date || 0) - new Date(a.created_date || 0)).slice(skip, take ? skip + take : undefined).map((row) => structuredClone(row)),
    findFirst: async ({ where }) => structuredClone(state[key].find((row) => matches(row, where)) || null),
    findUnique: async ({ where }) => structuredClone(state[key].find((row) => matches(row, where)) || null),
    count: async ({ where }) => state[key].filter((row) => matches(row, where)).length,
    create: async ({ data }) => { const row = { id: `${key}-${++sequence}`, created_date: new Date(), ...structuredClone(data) }; state[key].push(row); return structuredClone(row); },
    update: async ({ where, data }) => { const row = state[key].find((row) => matches(row, where)); Object.assign(row, structuredClone(data)); return structuredClone(row); },
    deleteMany: async ({ where }) => { const count = state[key].filter((row) => matches(row, where)).length; state[key] = state[key].filter((row) => !matches(row, where)); return { count }; },
  });
  let lockQueue = Promise.resolve();
  const db = { user: delegate("users"), friendRequest: delegate("requests"), friendship: delegate("friends"), blockedUser: delegate("blocks"), notification: delegate("notifications"), $executeRaw: async () => 1 };
  db.$transaction = async (run) => {
    const previous = lockQueue; let release;
    lockQueue = new Promise((resolve) => { release = resolve; });
    await previous;
    const before = structuredClone(state);
    try { return await run(db); } catch (error) { Object.assign(state, before); throw error; } finally { release(); }
  };
  return { db, state };
}

test("send, accept and remove form a real symmetric friendship and notify the right players", async () => {
  const { db, state } = fixture();
  assert.equal((await friendStatus(db, "a", "b")).status, "none");
  assert.equal((await changeFriendship(db, "a", "b", "send")).status, "outgoing");
  assert.equal((await friendStatus(db, "b", "a")).status, "incoming");
  assert.equal(state.friends.length, 0);
  assert.equal(state.notifications[0].metadata.user_id, "b");
  assert.equal((await changeFriendship(db, "b", "a", "accept")).status, "friends");
  assert.equal((await friendStatus(db, "a", "b")).status, "friends");
  assert.equal(state.requests[0].metadata.status, "accepted");
  assert.equal(state.friends.length, 1);
  assert.equal(state.notifications[1].metadata.user_id, "a");
  await changeFriendship(db, "a", "b", "remove");
  assert.equal((await friendStatus(db, "b", "a")).status, "none");
});

test("a sender cannot accept or decline their own request; only its sender may cancel", async () => {
  const { db, state } = fixture();
  await changeFriendship(db, "a", "b", "send");
  for (const action of ["accept", "decline"]) await assert.rejects(changeFriendship(db, "a", "b", action), { status: 403 });
  await assert.rejects(changeFriendship(db, "b", "a", "cancel"), { status: 403 });
  await assert.rejects(changeFriendship(db, "c", "a", "accept"), { status: 409 });
  assert.equal(state.requests[0].metadata.status, "pending");
  await changeFriendship(db, "a", "b", "cancel");
  assert.equal(state.requests[0].metadata.status, "cancelled");
  await assert.rejects(changeFriendship(db, "b", "a", "accept"), { status: 409 });
});

test("decline creates no friendship; immediately repeating a closed request is rate limited", async () => {
  const { db, state } = fixture();
  await changeFriendship(db, "a", "b", "send");
  await changeFriendship(db, "b", "a", "decline");
  assert.equal(state.friends.length, 0);
  assert.equal(state.requests[0].metadata.status, "declined");
  await assert.rejects(changeFriendship(db, "a", "b", "send"), { status: 429 });
});

test("duplicates, simultaneous sends and crossed requests cannot create duplicate friendships or bypass acceptance", async () => {
  const { db, state } = fixture();
  await Promise.all([changeFriendship(db, "a", "b", "send"), changeFriendship(db, "a", "b", "send"), changeFriendship(db, "b", "a", "send")]);
  assert.equal(state.requests.length, 1);
  assert.equal(state.notifications.length, 1);
  assert.equal(state.friends.length, 0);
  await Promise.all([changeFriendship(db, "b", "a", "accept"), changeFriendship(db, "b", "a", "accept")]);
  assert.equal(state.friends.length, 1);
  assert.equal(state.notifications.length, 2);
});

test("self, missing players and invalid actions are rejected", async () => {
  const { db } = fixture();
  assert.equal((await friendStatus(db, "a", "a")).status, "self");
  await assert.rejects(changeFriendship(db, "a", "a", "send"), { status: 400 });
  await assert.rejects(changeFriendship(db, "a", "missing", "send"), { status: 404 });
  await assert.rejects(changeFriendship(db, "a", "b", "approve-admin"), { status: 400 });
});

test("blocks in either direction and active bans prevent requests; expired bans do not", async () => {
  for (const [userId, blockedId] of [["a", "b"], ["b", "a"]]) {
    const { db, state } = fixture();
    state.blocks.push({ id: "block", metadata: { user_id: userId, blocked_user_id: blockedId } });
    assert.equal((await friendStatus(db, "a", "b")).status, "unavailable");
    await assert.rejects(changeFriendship(db, "a", "b", "send"), { status: 403 });
  }
  const { db, state } = fixture();
  state.users[1].is_banned = true;
  await assert.rejects(changeFriendship(db, "a", "b", "send"), { status: 403 });
  state.users[1].metadata.ban_expires = "2020-01-01";
  assert.equal((await changeFriendship(db, "a", "b", "send")).status, "outgoing");
});

test("request inbox is personal, paginates by 25 and publishes no private user metadata", async () => {
  const { db, state } = fixture();
  for (let i = 0; i < 27; i++) state.requests.push({ id: `request-${i}`, created_date: new Date(2026, 0, i + 1), metadata: { sender_id: "a", recipient_id: "b", status: "pending" } });
  state.requests.push({ id: "unrelated", metadata: { sender_id: "c", recipient_id: "a", status: "pending" } });
  const page = await listFriendRequests(db, "b");
  assert.equal(page.requests.length, 25);
  assert.equal(page.next_offset, 25);
  assert.equal(page.requests[0].direction, "incoming");
  assert.equal(JSON.stringify(page).includes("private"), false);
  assert.equal((await listFriendRequests(db, "b", 25)).requests.length, 2);
  assert.equal((await listFriendRequests(db, "c")).requests.length, 1);
});

test("notification failure rolls back the request and friendship changes", async () => {
  const { db, state } = fixture();
  db.notification.create = async () => { throw new Error("notification write failed"); };
  await assert.rejects(changeFriendship(db, "a", "b", "send"));
  assert.equal(state.requests.length, 0);
  assert.equal(state.friends.length, 0);
});

test("daily outgoing request limit prevents notification spam across different profiles", async () => {
  const { db, state } = fixture();
  for (let i = 0; i < 50; i++) state.requests.push({ id: `old-${i}`, created_date: new Date(), metadata: { sender_id: "a", recipient_id: `other-${i}`, status: "pending" } });
  await assert.rejects(changeFriendship(db, "a", "b", "send"), { status: 429 });
  assert.equal(state.notifications.length, 0);
});
