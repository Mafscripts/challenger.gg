import test from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { build } from "esbuild";
import { getAdminTickets, getSupportInboxSummary, saveSupportCase } from "./admin-tickets.js";
import { claimSupportTicket } from "./support-claims.js";
import { hasRole } from "./roles.js";

function claimStore(kind = "ticket") {
  let row = { id: "case", metadata: { status: "open", messages: [{ content: "Keep this" }] } }, writes = 0, tail = Promise.resolve();
  const tx = { $executeRaw: async strings => { assert.match(strings.join(""), /FOR UPDATE/); } };
  tx[kind] = { findUnique: async ({ where }) => where.id === row.id ? structuredClone(row) : null,
    update: async ({ data }) => { row = { ...row, ...structuredClone(data) }; writes++; return structuredClone(row); } };
  const db = { $transaction: operation => { const next = tail.then(() => operation(tx)); tail = next.catch(() => {}); return next; } };
  return { db, read: () => row, writes: () => writes };
}

test("simultaneous staff claims have exactly one owner; repeated claims do not duplicate assignment history", async () => {
  const s = claimStore(), staff = [{ id: "a", role: "moderator", display_name: "First" }, { id: "b", role: "developer", display_name: "Second" }];
  const results = await Promise.allSettled(staff.map(actor => claimSupportTicket(s.db, actor, { ticket_id: "case" })));
  assert.equal(results[0].status, "fulfilled"); assert.equal(results[1].reason.status, 409);
  assert.match(results[1].reason.message, /First is already helping/);
  assert.equal(s.read().metadata.assigned_admin_id, "a");
  await claimSupportTicket(s.db, staff[0], { ticket_id: "case" });
  assert.equal(s.writes(), 1); assert.equal(s.read().metadata.support_assignment_history.length, 1);
  assert.deepEqual(s.read().metadata.messages, [{ content: "Keep this" }]);
});
test("only an explicit admin takeover changes the owner; closed cases and ordinary users cannot be claimed", async () => {
  const s = claimStore();
  await claimSupportTicket(s.db, { id: "owner", role: "moderator" }, { ticket_id: "case" });
  for (const role of ["moderator", "developer"]) await assert.rejects(() => claimSupportTicket(s.db, { id: "second", role }, { ticket_id: "case", take_over: true }), error => error.status === 403);
  await assert.rejects(() => claimSupportTicket(s.db, { id: "admin", role: "admin" }, { ticket_id: "case" }), error => error.status === 409);
  await claimSupportTicket(s.db, { id: "admin", role: "admin", display_name: "Admin" }, { ticket_id: "case", take_over: true });
  assert.equal(s.read().metadata.assigned_admin_id, "admin");
  assert.equal(s.read().metadata.support_assignment_history[1].previous_staff_id, "owner");
  assert.equal(s.read().metadata.support_assignment_history[1].take_over, true);
  await assert.rejects(() => claimSupportTicket(s.db, { id: "player", role: "user" }, { ticket_id: "case" }), error => error.status === 403);
  s.read().metadata.status = "closed";
  await assert.rejects(() => claimSupportTicket(s.db, { id: "admin", role: "admin" }, { ticket_id: "case" }), error => error.status === 409);
});
test("legacy disputes without a linked ticket can be picked up safely", async () => {
  const s = claimStore("dispute");
  const result = await claimSupportTicket(s.db, { id: "developer", role: "developer" }, { dispute_id: "case" });
  assert.equal(result.ticket.status, "under_review"); assert.equal(result.ticket.assigned_admin_id, "developer");
  assert.equal(hasRole({ role: "developer" }, "moderator"), true);
  assert.equal(hasRole({ role: "developer" }, "admin"), false);
  assert.equal(hasRole({ role: "developer" }, "ceo"), false);
});

function queueStore() {
  const date = new Date("2026-10-23T12:00:00Z");
  const tickets = [
    { id: "live", metadata: { request_type: "live_support", user_id: "p", username: "Player", assigned_admin_name: "Helper", assigned_admin_id: "staff" } },
    { id: "money", metadata: { match_type: "money8s", requested_admin: true, match_id: "money-room" } },
    { id: "wager", metadata: { match_type: "wager", requested_admin: true, match_id: "cash-room" } },
    { id: "event", metadata: { match_type: "tournament", match_id: "event-room", dispute_id: "linked" } },
  ];
  const disputes = [{ id: "linked", metadata: { ticket_id: "event", match_type: "tournament", match_id: "event-room" } }, { id: "legacy", metadata: { match_type: "money8s", match_id: "old-room" } }];
  const queries = [];
  const db = {
    $queryRaw: async (strings, ...values) => {
      const query = Prisma.sql(strings, ...values); queries.push(query);
      if (query.sql.includes("COUNT(*)")) return [{ total: 5, open: 5, closed: 0 }];
      if (query.sql.includes("SELECT * FROM queue")) return [...tickets.map(row => ({ id: row.id, kind: "ticket", priority: 0, closed: false, created_date: date })), { id: "legacy", kind: "dispute", closed: false, created_date: date, priority: 1 }];
      if (query.sql.includes('FROM "Dispute"')) return disputes;
      return [];
    },
    ticket: { findMany: async () => tickets },
    notification: { findMany: async ({ where }) => { assert.equal(where.AND[0].metadata.equals, "staff"); return [{ id: "staff-notification" }]; } },
  };
  return { db, queries };
}
test("the shared queue includes live support, Money 8s, wagers, tournaments and unlinked disputes", async () => {
  const s = queueStore();
  const result = await getAdminTickets(s.db, { id: "staff", role: "developer" }, { filter: "open", category: "calls" });
  assert.deepEqual(result.rows.map(row => row.record_id), ["live", "money", "wager", "event", "legacy"]);
  assert.equal(result.rows.find(row => row.record_id === "event").disputes.length, 1);
  assert.equal(result.rows[0].ticket.assigned_admin_name, "Helper");
  assert.ok(s.queries[0].values.includes("calls"));
  assert.match(s.queries[0].sql, /ORDER BY priority DESC/);
  assert.match(s.queries[0].sql, /WHERE NOT EXISTS/);
  const summary = await getSupportInboxSummary(s.db, { id: "staff", role: "developer" });
  assert.equal(summary.open, 5); assert.deepEqual(summary.alerts, ["staff-notification"]);
  await assert.rejects(() => getSupportInboxSummary(s.db, { id: "player", role: "user" }), error => error.status === 403);
  await assert.rejects(() => getAdminTickets(s.db, { id: "player", role: "user" }), error => error.status === 403);
});
test("room links always target the correct internal room, ignoring supplied URLs", async () => {
  const compiled = await build({ entryPoints: ["src/lib/adminTickets.js"], bundle: true, write: false, platform: "node", format: "cjs" });
  const module = { exports: {} }; new Function("module", "exports", compiled.outputFiles[0].text)(module, module.exports);
  for (const [type, prefix] of [["money8s", "8s-match"], ["8s", "8s-match"], ["wager", "wagers-match"], ["tournament", "tournament-match"]]) {
    assert.equal(module.exports.ticketRoomPath({ ticket: { match_type: type, match_id: "room", match_url: "//outside.example" }, disputes: [] }), `/${prefix}/room`);
  }
  assert.equal(module.exports.ticketRoomPath({ ticket: null, disputes: [{ match_type: "tournament", match_id: "event" }] }), "/tournament-match/event");
});

test("saved cases support tickets and disputes, preserve conversation data and require staff", async () => {
  const statements = [];
  const db = { $executeRaw: async (strings, ...values) => { statements.push(Prisma.sql(strings, ...values)); return 1; } };
  const staff = { id: "staff", role: "moderator" };
  for (const kind of ["ticket", "dispute"]) {
    assert.equal((await saveSupportCase(db, staff, { kind, id: "case", saved: true })).success, true);
  }
  assert.match(statements[0].sql, /UPDATE "Ticket" SET metadata = jsonb_set/);
  assert.match(statements[1].sql, /UPDATE "Dispute" SET metadata = jsonb_set/);
  assert.ok(statements[0].values.includes("true"));
  await assert.rejects(() => saveSupportCase(db, { role: "user" }, { kind: "ticket", id: "case", saved: true }), error => error.status === 403);
  await assert.rejects(() => saveSupportCase(db, staff, { kind: "User", id: "case", saved: true }), error => error.status === 400);
  await assert.rejects(() => saveSupportCase({ $executeRaw: async () => 0 }, staff, { kind: "ticket", id: "missing", saved: false }), error => error.status === 404);
});
test("queue filters search safely and promote admin calls before premium and live requests", async () => {
  const s = queueStore();
  const search = "' OR 1=1 --";
  await getAdminTickets(s.db, { id: "staff", role: "moderator" }, { view: "saved", search });
  const query = s.queries[0];
  assert.ok(query.values.includes(search));
  assert.ok(!query.sql.includes(search));
  assert.match(query.sql, /AND saved AND strpos/);
  assert.match(query.sql, /requested_admin' = 'true' THEN 3/);
  assert.match(query.sql, /request_type' = 'live_support' THEN 1/);
  await getAdminTickets(s.db, { id: "staff", role: "moderator" }, { view: "mine" });
  assert.ok(s.queries.some(query => query.sql.includes('AND owner =') && query.values.includes('staff')));
});
