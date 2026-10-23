import test from "node:test";
import assert from "node:assert/strict";
import { readLiveSupport, sendLiveSupport, updateLiveSupport } from "./live-support.js";
import { isLiveSupportStaff } from "../src/lib/liveSupport.js";

const player = { id: "player", role: "user", username: "account-name", display_name: "dev" };
const admin = { id: "admin", role: "admin", display_name: "Helper" };
const request = (message = "Help please", ticket_id) => ({ message, ticket_id, request_id: crypto.randomUUID() });
function store() {
  const tickets = new Map(), messages = [], notifications = [], locks = [];
  const matches = (row, where) => (where.AND || []).every(condition => row.metadata[condition.metadata.path[0]] === condition.metadata.equals)
    && !(where.NOT || []).some(condition => row.metadata[condition.metadata.path[0]] === condition.metadata.equals);
  const db = {
    $executeRaw: async (strings) => { locks.push(strings.join("")); },
    ticket: {
      findUnique: async ({ where }) => structuredClone(tickets.get(where.id)),
      findFirst: async ({ where }) => structuredClone([...tickets.values()].find(row => matches(row, where))),
      create: async ({ data }) => { const row = { id: `ticket-${tickets.size + 1}`, ...structuredClone(data) }; tickets.set(row.id, row); return structuredClone(row); },
      update: async ({ where, data }) => { const row = { id: where.id, ...structuredClone(data) }; tickets.set(row.id, row); return structuredClone(row); },
    },
    message: {
      findFirst: async ({ where }) => structuredClone(messages.find(row => matches(row, where))),
      create: async ({ data }) => { const row = { id: `message-${messages.length + 1}`, created_date: new Date(), ...structuredClone(data) }; messages.push(row); return structuredClone(row); },
    },
    user: { findMany: async ({ where }) => { assert.equal(where.email_verified, true); assert.equal(where.is_banned, false); assert.ok(where.OR[0].role.in.includes("developer")); return [{ id: "admin" }, { id: "moderator" }]; } },
    notification: { create: async ({ data }) => { notifications.push(data.metadata); } },
    $queryRaw: async (_strings, staff, userId) => [...tickets.values()].filter(row => staff || row.metadata.user_id === userId),
  };
  let tail = Promise.resolve();
  db.$transaction = action => { const result = tail.then(() => action(db)); tail = result.catch(() => {}); return result; };
  return { db, tickets, messages, notifications, locks };
}

test("messages use trusted identity, notify staff, and retries are idempotent", async () => {
  const s = store(), body = { ...request(), sender_staff: true, sender_name: "Fake admin" };
  const first = await sendLiveSupport(s.db, player, body);
  const again = await sendLiveSupport(s.db, player, body);
  assert.equal(first.message.sender_name, "dev");
  assert.equal(first.message.sender_staff, false);
  assert.equal(again.message.id, first.message.id);
  assert.equal(s.messages.length, 1); assert.equal(s.tickets.size, 1);
  assert.deepEqual(s.notifications.map(row => row.user_id), ["admin", "moderator"]);
  assert.ok(s.locks.some(value => value.includes("FOR UPDATE")));
});

test("owners and scoped support staff can read; other users cannot read, send or close", async () => {
  const s = store(), result = await sendLiveSupport(s.db, player, request());
  const body = { ticket_id: result.ticket.id };
  for (const action of [() => readLiveSupport(s.db, { id: "intruder" }, body), () => sendLiveSupport(s.db, { id: "intruder" }, request("Hack", result.ticket.id)), () => updateLiveSupport(s.db, { id: "intruder" }, body, true)]) {
    await assert.rejects(action, error => error.status === 403);
  }
  const row = s.tickets.get(result.ticket.id);
  row.metadata.internal_notes = [{ content: "PRIVATE" }];
  row.metadata.messages.push({ content: "PRIVATE", internal: true });
  const view = await readLiveSupport(s.db, player, body);
  assert.equal(view.messages.length, 1);
  assert.equal(JSON.stringify(view).includes("PRIVATE"), false);
  assert.equal((await readLiveSupport(s.db, player, { ...body, known_sequence: 1 })).messages, null);
  assert.equal((await readLiveSupport(s.db, player, { ...body, known_sequence: 0 })).messages.length, 1);
  assert.equal((await readLiveSupport(s.db, { id: "dev", role: "developer" }, body)).staff, true);
});

test("staff replies claim the chat and notify only its owner; read markers never go backwards", async () => {
  const s = store(), first = await sendLiveSupport(s.db, player, request());
  const reply = await sendLiveSupport(s.db, admin, request("Happy to help", first.ticket.id));
  assert.equal(reply.ticket.assigned_admin_id, admin.id);
  assert.equal(reply.ticket.status, "waiting_for_user");
  assert.equal(s.notifications.at(-1).user_id, player.id);
  let read = await updateLiveSupport(s.db, player, { ticket_id: first.ticket.id, sequence: 100 });
  assert.equal(read.ticket.support_user_read, 2);
  read = await updateLiveSupport(s.db, player, { ticket_id: first.ticket.id, sequence: 1 });
  assert.equal(read.ticket.support_user_read, 2);
});

test("closed conversations reject messages and permit a fresh conversation", async () => {
  const s = store(), first = await sendLiveSupport(s.db, player, request());
  await updateLiveSupport(s.db, player, { ticket_id: first.ticket.id }, true);
  await assert.rejects(() => sendLiveSupport(s.db, player, request("Again", first.ticket.id)), error => error.status === 409);
  const next = await sendLiveSupport(s.db, player, request("New question"));
  assert.notEqual(next.ticket.id, first.ticket.id);
});

test("simultaneous first messages share one conversation, with rate limiting", async () => {
  const s = store();
  const results = await Promise.allSettled([sendLiveSupport(s.db, player, request()), sendLiveSupport(s.db, player, request())]);
  assert.equal(results.filter(row => row.status === "fulfilled").length, 1);
  assert.equal(results.find(row => row.status === "rejected").reason.status, 429);
  assert.equal(s.tickets.size, 1);
});

test("input limits and staff role boundaries are enforced", async () => {
  const s = store();
  for (const body of [request(""), request("x".repeat(2001)), { message: "Help", request_id: "bad" }]) await assert.rejects(() => sendLiveSupport(s.db, player, body), error => error.status === 400);
  await assert.rejects(() => sendLiveSupport(s.db, admin, request()), /Select a player/);
  for (const role of ["moderator", "admin", "super_admin", "ceo", "developer"]) assert.equal(isLiveSupportStaff({ role }), true);
  assert.equal(isLiveSupportStaff({ role: "user" }), false);
});
