import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createDirectMessageInbox, clearSentDraft } from "../src/lib/directMessageInbox.js";
import { prisma } from "./prisma.js";
import { signUser } from "./auth.js";
import routes from "./routes/functions.js";

const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };
const message = (id, extra = {}) => ({ id: String(id), sender_id: "other", recipient_id: "me", message_type: "direct_message", content: `Message ${id}`, is_read: false, created_date: new Date(1700000000000 + Number(id) * 1000).toISOString(), ...extra });
function feed(read) {
  const changes = [], errors = [], users = [];
  const inbox = createDirectMessageInbox({ userId: "me", read, onMessages: (rows) => changes.push(rows), onUsers: (...args) => users.push(args), onError: (error) => errors.push(error.message) });
  return { inbox, changes, errors, users };
}

test("a poll started before a confirmed send cannot remove or duplicate the message", async () => {
  const gate = deferred(); let snapshot = gate.promise;
  const f = feed(() => snapshot);
  const pending = f.inbox.refresh();
  f.inbox.addConfirmed(message(2, { sender_id: "me", recipient_id: "other" }));
  gate.resolve({ success: true, messages: [message(1)], users: [] }); await pending;
  assert.deepEqual(f.changes.at(-1).map((m) => m.id), ["1", "2"]);
  snapshot = { success: true, messages: [message(1), message(2, { sender_id: "me", recipient_id: "other" })] };
  await f.inbox.refresh(); f.inbox.addConfirmed(message(2, { sender_id: "me", recipient_id: "other" }));
  assert.deepEqual(f.changes.at(-1).map((m) => m.id), ["1", "2"]);
});

test("failed reads preserve history, read acknowledgements survive stale polls, and unchanged polls do not redraw messages", async () => {
  let snapshot = { success: true, messages: [message(1)] };
  const f = feed(() => snapshot);
  await f.inbox.refresh(); f.inbox.markRead(["1"]);
  const count = f.changes.length;
  await f.inbox.refresh(); assert.equal(f.changes.length, count); assert.equal(f.changes.at(-1)[0].is_read, true);
  snapshot = { success: false, error: "temporarily unavailable" };
  assert.equal(await f.inbox.refresh(), false); assert.equal(f.changes.length, count);
  assert.deepEqual(f.errors, ["temporarily unavailable"]);
  snapshot = { success: true, messages: [message(1), message(2)] };
  await f.inbox.refresh(); assert.equal(f.changes.at(-1)[1].is_read, false);
});

test("overlapping refreshes coalesce; disposed inboxes ignore late reads and sends", async () => {
  const gate = deferred(); let reads = 0;
  const f = feed(() => { reads++; return gate.promise; });
  const pending = f.inbox.refresh(); assert.equal(f.inbox.refresh(), pending);
  await Promise.resolve(); assert.equal(reads, 1);
  f.inbox.dispose(); gate.resolve({ success: true, messages: [message(1)] });
  assert.equal(await pending, false); assert.equal(f.inbox.addConfirmed(message(2)), false);
  assert.deepEqual(f.changes, []); assert.deepEqual(f.users, []);
});

test("inbox snapshots exclude other users and invitations; each conversation retains its own edited draft", async () => {
  const f = feed(() => ({ success: true, messages: [message(1), message(2, { recipient_id: "stranger" }), message(3, { message_type: "tournament_invitation" })] }));
  await f.inbox.refresh(); assert.deepEqual(f.changes[0].map((m) => m.id), ["1"]);
  const drafts = { a: "sent text", b: "different recipient" };
  assert.deepEqual(clearSentDraft(drafts, "a", "sent text"), { a: "", b: "different recipient" });
  assert.equal(clearSentDraft({ ...drafts, a: "new text typed while sending" }, "a", "sent text").a, "new text typed while sending");
});

async function apiFixture(t) {
  const users = [{ id: "me", role: "user", email_verified: true, username: "Me" }, { id: "other", role: "user", email_verified: true, username: "Other" }];
  const tables = { message: [], notification: [], playerProfile: [], ban: [] };
  let readFailure = false, notificationFailure = false;
  const matches = (row, where) => !where || Object.entries(where).every(([key, value]) => {
    if (key === "AND") return value.every((clause) => matches(row, clause));
    if (key === "metadata") return row.metadata?.[value.path[0]] === value.equals;
    if (key === "created_date") return row.created_date > value.gt;
    if (value?.in) return value.in.includes(row[key]);
    return row[key] === value;
  });
  const override = (target, key, fn) => { const original = target[key]; target[key] = fn; t.after(() => { target[key] = original; }); };
  override(prisma.user, "findUnique", async ({ where }) => users.find((u) => u.id === where.id));
  override(prisma.user, "findMany", async ({ where }) => users.filter((u) => matches(u, where)));
  for (const [name, rows] of Object.entries(tables)) {
    override(prisma[name], "findMany", async ({ where, orderBy, take } = {}) => {
      if (name === "message" && readFailure) throw new Error("database unavailable");
      const selected = rows.filter((row) => matches(row, where));
      if (orderBy?.created_date) selected.sort((a, b) => (a.created_date - b.created_date) * (orderBy.created_date === "desc" ? -1 : 1));
      return structuredClone(selected.slice(0, take));
    });
    override(prisma[name], "findUnique", async ({ where }) => structuredClone(rows.find((row) => row.id === where.id)));
    override(prisma[name], "update", async ({ where, data }) => { const row = rows.find((r) => r.id === where.id); Object.assign(row, structuredClone(data)); return structuredClone(row); });
    override(prisma[name], "create", async ({ data }) => {
      if (name === "notification" && notificationFailure) throw new Error("notification unavailable");
      const row = { id: `${name}-${rows.length}`, created_date: new Date(), ...structuredClone(data) }; rows.push(row); return structuredClone(row);
    });
  }
  const app = express(); app.use(express.json()); app.use("/functions", routes);
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message }));
  const server = app.listen(0, "127.0.0.1"); await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const request = async (name, body = {}) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/functions/${name}`, { method: "POST", headers: { Authorization: `Bearer ${signUser(users[0])}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { status: response.status, data: await response.json() };
  };
  const add = (row) => tables.message.push({ id: row.id, created_date: new Date(row.created_date), metadata: row });
  return { tables, request, add, failRead: () => { readFailure = true; }, failNotice: () => { notificationFailure = true; } };
}

test("the real inbox finds DMs behind more than 500 newer invitations and never returns another player's conversation", async (t) => {
  const f = await apiFixture(t);
  f.add(message(1));
  for (let i = 2; i < 605; i++) f.add(message(i, { message_type: "tournament_invitation" }));
  f.add(message(606, { sender_id: "stranger", recipient_id: "outsider" }));
  f.add(message(607, { sender_id: "me", recipient_id: "other" }));
  const result = await f.request("getDirectMessages");
  assert.equal(result.status, 200); assert.deepEqual(result.data.messages.map((m) => m.id), ["1", "607"]);
  assert.deepEqual(result.data.users.map((u) => u.id), ["other"]);
  f.failRead(); assert.equal((await f.request("getDirectMessages")).status, 500);
});

test("read acknowledgements touch only displayed incoming DMs and acknowledge notifications even after a preview read", async (t) => {
  const f = await apiFixture(t);
  f.add(message(1, { is_read: true })); f.add(message(2));
  f.add(message(3, { sender_id: "stranger" })); f.add(message(4, { message_type: "tournament_invitation" }));
  f.tables.notification.push({ id: "notice", created_date: new Date(), metadata: { user_id: "me", related_entity_id: "1", related_entity_type: "Message", is_read: false } });
  const result = await f.request("markDirectConversationRead", { other_user_id: "other", message_ids: ["1", "3", "4"] });
  assert.equal(result.data.success, true); assert.deepEqual(result.data.read_message_ids, ["1"]);
  assert.equal(f.tables.notification[0].metadata.is_read, true);
  assert.equal(f.tables.message.find((r) => r.id === "2").metadata.is_read, false);
  assert.equal(f.tables.message.find((r) => r.id === "3").metadata.is_read, false);
  assert.equal(f.tables.message.find((r) => r.id === "4").metadata.is_read, false);
  const incoming = await f.request("markDirectConversationRead", { other_user_id: "other", message_ids: ["2"] });
  assert.equal(incoming.data.read_count, 1); assert.equal(f.tables.message.find((r) => r.id === "2").metadata.is_read, true);
  assert.equal((await f.request("markDirectConversationRead", { other_user_id: "other", message_ids: "invalid" })).data.success, false);
});

test("a saved DM stays successful when its notification fails; forged sender and non-text content are rejected or ignored", async (t) => {
  t.mock.method(console, "warn", () => {});
  const f = await apiFixture(t); f.failNotice();
  const result = await f.request("sendMessage", { recipient_id: "other", sender_id: "forged", content: "Hello" });
  assert.equal(result.data.success, true); assert.equal(result.data.message.sender_id, "me");
  assert.equal(f.tables.message.length, 1);
  assert.equal((await f.request("sendMessage", { recipient_id: "other", content: {} })).data.success, false);
  assert.equal((await f.request("sendMessage", { recipient_id: "me", content: "Hello" })).data.success, false);
  assert.equal(f.tables.message.length, 1);
});
