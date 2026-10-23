import test from "node:test";
import assert from "node:assert/strict";
import { readLiveSupport, sendLiveSupport, updateLiveSupport, readLiveSupportRecords, manageLiveSupportRecord } from "./live-support.js";
import { isDevSupportMessage, isLiveSupportStaff, supportTicketForViewer } from "../src/lib/liveSupport.js";
import { deleteAdminTicket } from "./admin-tickets.js";
import entityRoutes from "./routes/entities.js";
import { prisma } from "./prisma.js";

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

test("favorites and archive preserve messages, record the actor and restore without reopening", async () => {
  const s = store(), { ticket } = await sendLiveSupport(s.db, player, request());
  const messages = structuredClone(s.messages);
  const action = (name, value) => manageLiveSupportRecord(s.db, admin, { ticket_id: ticket.id, action: name, value, actor_name: "Spoofed" });
  await assert.rejects(() => action("archive", true), error => error.status === 409);
  let result = await action("favorite", true);
  assert.equal(result.ticket.support_favorite, true);
  assert.equal(result.ticket.history[0].actor_name, "Helper");
  await action("favorite", true);
  assert.equal(s.tickets.get(ticket.id).metadata.support_record_history.length, 1);
  await updateLiveSupport(s.db, admin, { ticket_id: ticket.id }, true);
  result = await action("archive", true);
  assert.equal(result.ticket.support_archived, true);
  assert.equal(result.ticket.support_archived_by, "Helper");
  result = await action("archive", false);
  assert.equal(result.ticket.status, "closed");
  assert.equal(result.ticket.support_archived, false);
  assert.equal(result.ticket.support_archived_at, null);
  assert.deepEqual(s.messages, messages);
  assert.equal((await readLiveSupportRecords(s.db, admin, { ticket_id: ticket.id })).messages.length, 1);
});

test("notes are staff-only through live chat and legacy Ticket views, and retries do not duplicate", async () => {
  const s = store(), { ticket } = await sendLiveSupport(s.db, player, request());
  const notificationsBefore = s.notifications.length;
  const body = { ticket_id: ticket.id, action: "note", note: "Private follow-up: refund investigation", request_id: crypto.randomUUID() };
  const note = await manageLiveSupportRecord(s.db, admin, body);
  assert.equal(note.ticket.notes[0].author_name, "Helper");
  await manageLiveSupportRecord(s.db, admin, body);
  assert.equal((await readLiveSupportRecords(s.db, admin, { ticket_id: ticket.id })).ticket.notes.length, 1);
  assert.equal(s.notifications.length, notificationsBefore);
  assert.equal(JSON.stringify(await readLiveSupport(s.db, player, { ticket_id: ticket.id })).includes("Private follow-up"), false);
  const metadata = s.tickets.get(ticket.id).metadata;
  assert.equal(JSON.stringify(supportTicketForViewer(metadata, player)).includes("Private follow-up"), false);
  assert.equal(supportTicketForViewer(metadata, admin).support_record_notes.length, 1);
  for (const actor of [player, { id: "intruder", role: "user" }]) {
    await assert.rejects(() => readLiveSupportRecords(s.db, actor, {}), error => error.status === 403);
    await assert.rejects(() => readLiveSupportRecords(s.db, actor, { ticket_id: ticket.id }), error => error.status === 403);
    await assert.rejects(() => manageLiveSupportRecord(s.db, actor, body), error => error.status === 403);
  }
});

test("concurrent staff notes keep both authors and reject invalid actions or notes", async () => {
  const s = store(), { ticket } = await sendLiveSupport(s.db, player, request());
  await Promise.all([admin, { id: "moderator", role: "moderator", display_name: "Mod" }].map(actor => manageLiveSupportRecord(s.db, actor, { ticket_id: ticket.id, action: "note", note: actor.id, request_id: crypto.randomUUID() })));
  const result = await readLiveSupportRecords(s.db, { id: "developer", role: "developer" }, { ticket_id: ticket.id });
  assert.deepEqual(result.ticket.notes.map(note => note.author_id), ["admin", "moderator"]);
  for (const body of [{ action: "delete" }, { action: "archive", value: "true" }, { action: "favorite" }, { action: "note", note: " " }, { action: "note", note: "x".repeat(4001), request_id: crypto.randomUUID() }]) {
    await assert.rejects(() => manageLiveSupportRecord(s.db, admin, { ticket_id: ticket.id, ...body }), error => error.status === 400);
  }
  await assert.rejects(() => manageLiveSupportRecord(s.db, admin, { ticket_id: "missing", action: "favorite", value: true }), error => error.status === 404);
});

test("record pages are bounded and search strings stay SQL parameters", async () => {
  const s = store(); let captured;
  s.db.$queryRaw = async (strings, ...values) => { captured = { sql: strings.join("?"), values }; return Array.from({ length: 26 }, (_, index) => ({ id: `row-${index}`, metadata: { username: "Player" } })); };
  const search = "'; DROP TABLE Ticket; --";
  const result = await readLiveSupportRecords(s.db, admin, { view: "archived", search, page: 2 });
  assert.equal(result.rows.length, 25);
  assert.equal(result.next_page, 3);
  assert.equal(captured.sql.includes(search), false);
  assert.ok(captured.values.includes(search));
  assert.equal(captured.values.at(-1), 50);
  assert.match(captured.sql, /support_archived/);
  assert.equal(result.rows[0].notes, undefined);
});

test("only admins delete completed support conversations, including favorites and archived records", async () => {
  for (const flag of ["support_favorite", "support_archived"]) {
    const s = store(), { ticket } = await sendLiveSupport(s.db, player, request());
    const row = s.tickets.get(ticket.id); row.metadata[flag] = true;
    const audits = [];
    s.db.$queryRaw = async strings => strings.join("").includes('FROM "Ticket"') ? [...s.tickets.values()] : [];
    s.db.$executeRaw = async strings => {
      const sql = Array.isArray(strings) ? strings.join("") : strings.sql;
      if (sql.includes('DELETE FROM "Message"')) s.messages.length = 0;
      if (sql.includes('DELETE FROM "Notification"')) s.notifications.length = 0;
    };
    s.db.dispute = { deleteMany: async () => {} };
    s.db.ticket.deleteMany = async ({ where }) => where.id.in.forEach(id => s.tickets.delete(id));
    s.db.adminAction = { create: async ({ data }) => audits.push(data.metadata) };
    for (const actor of [player, { id: "mod", role: "moderator" }, { id: "other", role: "developer" }]) {
      await assert.rejects(() => deleteAdminTicket(s.db, actor, { id: ticket.id, kind: "ticket" }), error => error.status === 403);
    }
    await assert.rejects(() => deleteAdminTicket(s.db, admin, { id: ticket.id, kind: "ticket" }), error => error.status === 409);
    assert.equal(s.messages.length, 1);
    row.metadata.status = "closed";
    const result = await deleteAdminTicket(s.db, admin, { id: ticket.id, kind: "ticket" });
    assert.deepEqual(result.deleted_ticket_ids, [ticket.id]);
    assert.equal(s.tickets.has(ticket.id), false);
    assert.equal(s.messages.length, 0);
    assert.equal(s.notifications.length, 0);
    assert.equal(audits[0].admin_id, admin.id);
    await assert.rejects(() => readLiveSupport(s.db, player, { ticket_id: ticket.id }), error => error.status === 404);
    assert.equal((await readLiveSupport(s.db, player)).threads.length, 0);
  }
});

test("only the dev support label gets the red name treatment", () => {
  assert.equal(isDevSupportMessage({ sender_name: "dev", sender_staff: true }), true);
  assert.equal(isDevSupportMessage({ sender_name: "dev", sender_staff: false }), false);
  assert.equal(isDevSupportMessage({ sender_name: "Helper", sender_staff: true }), false);
});

test("legacy Ticket GET routes hide staff notes in both list and detail responses", async t => {
  const row = { id: "private-record", metadata: { request_type: "live_support", user_id: player.id, username: "dev", status: "closed",
    support_record_notes: [{ content: "STAFF_SECRET" }], support_record_history: [{ description: "STAFF_SECRET" }],
    internal_notes: [{ content: "STAFF_SECRET" }], messages: [{ id: "visible", content: "Public reply" }, { id: "private", content: "STAFF_SECRET", internal: true }] } };
  for (const method of ["findUnique", "findMany"]) {
    const old = prisma.ticket[method]; prisma.ticket[method] = async () => method === "findMany" ? [structuredClone(row)] : structuredClone(row);
    t.after(() => { prisma.ticket[method] = old; });
  }
  const invoke = (path, actor) => new Promise((resolve, reject) => {
    const handler = entityRoutes.stack.find(layer => layer.route?.path === path && layer.route.methods.get).route.stack.at(-1).handle;
    handler({ user: actor, params: { entity: "Ticket", id: row.id }, query: {} }, { status() { return this; }, json: resolve }, reject);
  });
  for (const path of ["/:entity", "/:entity/:id"]) {
    const own = await invoke(path, player);
    assert.equal(JSON.stringify(own).includes("STAFF_SECRET"), false);
    assert.equal(JSON.stringify(own).includes("Public reply"), true);
    const staff = await invoke(path, admin);
    assert.equal(JSON.stringify(staff).includes("STAFF_SECRET"), true);
    const other = await invoke(path, { id: "intruder", role: "user" });
    assert.equal(JSON.stringify(other).includes("Public reply"), false);
  }
});
