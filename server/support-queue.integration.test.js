import test from "node:test";
import assert from "node:assert/strict";
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { getAdminTicketCounts, getAdminTickets, markSupportCaseRead, supportIncomingToken } from "./admin-tickets.js";

test("category view counts agree with scoped queues and retain global category badges (read only)", { skip: process.env.SUPPORT_QUEUE_READ_TEST !== "1" }, async () => {
  const db = new PrismaClient(), staff = { id: "support-category-read-check", role: "admin" };
  try {
    const global = await getAdminTicketCounts(db, staff);
    for (const category of ["live", "tournament", "disputes"]) {
      const scoped = await getAdminTicketCounts(db, staff, { category });
      assert.equal(scoped.open, Number(global.categories[category]));
      assert.equal(scoped.unread, Number(global.unread_categories[category]));
      assert.deepEqual(scoped.categories, global.categories); assert.deepEqual(scoped.unread_categories, global.unread_categories);
      for (const [view, field, filter] of [["new", "new", "open"], ["mine", "mine", "open"], ["waiting", "waiting", "open"], ["awaiting", "awaiting", "open"], ["saved", "saved", "all"]]) {
        const page = await getAdminTickets(db, staff, { category, filter, view });
        assert.ok(page.rows.length <= scoped[field]);
        if (!page.next_cursor) assert.equal(page.rows.length, scoped[field]);
      }
    }
  } finally { await db.$disconnect(); }
});

// Explicit opt in. Fixture inserts and read acknowledgements are rolled back;
// this test never deletes support records or changes a real case.
test("global unread counts include every page, ignore staff messages and retain legacy read tokens", { skip: process.env.SUPPORT_QUEUE_DB_TEST !== "1" }, async () => {
  const db = new PrismaClient(), rollback = new Error("ROLLBACK_QUEUE_ACTIVITY_FIXTURES");
  try {
    await assert.rejects(db.$transaction(async tx => {
      const marker = `queue-activity-${crypto.randomUUID()}`, staff = { id: marker, role: "admin" };
      await tx.$executeRaw`SET LOCAL TIME ZONE 'America/Phoenix'`;
      const baseline = await getAdminTicketCounts(tx, staff);
      const ids = Array.from({ length: 14 }, () => crypto.randomUUID());
      await tx.ticket.createMany({ data: ids.map((id, index) => ({ id, created_date: new Date(`2026-01-${String(index + 1).padStart(2, "0")}T10:00:00Z`), metadata: {
        username: marker, description: "Original request", request_type: "live_support", status: index === 1 ? "waiting_for_user" : "open",
      } })) });
      const external = await tx.message.create({ data: { created_date: new Date("2026-10-24T11:00:00.123Z"), metadata: { ticket_id: ids[0], sender_id: "player", sender_role: "user", content: 'New reply "hello"\n✓' } } });
      const embedded = { id: external.id, sender_id: "player", sender_role: "user", content: 'New reply "hello"\n✓', created_date: external.created_date.toISOString() };
      // Both storage paths can contain the same historical message. It counts once.
      await tx.ticket.update({ where: { id: ids[0] }, data: { metadata: { username: marker, description: "Original request", request_type: "live_support", status: "open", messages: [embedded, { sender_staff: true, content: "Staff follow-up", created_date: "2026-10-24T12:00:00Z" }, { internal: true, content: "Private", created_date: "2026-10-24T13:00:00Z" }] } } });
      const first = await getAdminTickets(tx, staff, { search: marker, filter: "open", category: "live" });
      assert.equal(first.rows[0].record_id, ids[0]); assert.equal(first.rows.length, 10); assert.ok(first.next_cursor);
      for (const row of first.rows) assert.equal(row.incoming_token, supportIncomingToken(row.ticket));
      const cursor = JSON.parse(Buffer.from(first.next_cursor, "base64url").toString());
      assert.equal(cursor.version, 2); assert.equal(cursor.unread, true); assert.ok(cursor.activity);
      const second = await getAdminTickets(tx, staff, { search: marker, filter: "open", category: "live", cursor: first.next_cursor });
      assert.equal(second.rows.length, 4); assert.equal(new Set([...first.rows, ...second.rows].map(row => row.id)).size, 14);
      let counts = await getAdminTicketCounts(tx, staff);
      assert.equal(counts.unread - baseline.unread, 14); assert.equal(counts.unread_categories.live - baseline.unread_categories.live, 14);
      const read = first.rows[0];
      await markSupportCaseRead(tx, staff, { kind: read.kind, id: read.record_id, token: read.incoming_token });
      counts = await getAdminTicketCounts(tx, staff);
      assert.equal(counts.new - baseline.new, 13); assert.equal(counts.unread_categories.live - baseline.unread_categories.live, 13);
      const newPage = await getAdminTickets(tx, staff, { search: marker, filter: "open", view: "new" });
      assert.ok(newPage.rows.every(row => row.unread)); assert.ok(!newPage.rows.some(row => row.id === read.id));
      const otherStaff = await getAdminTickets(tx, { ...staff, id: `${marker}-other` }, { record_id: read.record_id, kind: "ticket" });
      assert.equal(otherStaff.rows[0].unread, true);
      const awaiting = await getAdminTickets(tx, staff, { search: marker, view: "awaiting" });
      assert.deepEqual(awaiting.rows.map(row => row.record_id), [ids[1]]);
      // A new incoming message reopens attention for a previously acknowledged case.
      await tx.message.create({ data: { created_date: new Date("2026-10-24T14:00:00Z"), metadata: { conversation_id: ids[0], sender_id: "player", content: "One more question" } } });
      const changed = await getAdminTickets(tx, staff, { search: marker, view: "new" });
      assert.equal(changed.rows[0].id, read.id); assert.notEqual(changed.rows[0].incoming_token, read.incoming_token);
      const priority = await tx.ticket.create({ data: { created_date: new Date("2025-01-01T00:00:00Z"), metadata: { username: marker, requested_admin: true, description: "Admin needed", status: "open" } } });
      assert.equal((await getAdminTickets(tx, staff, { search: marker, filter: "open" })).rows[0].record_id, priority.id);
      await tx.ticket.update({ where: { id: ids[3] }, data: { metadata: { username: marker, description: "Historic request", messages: [{ id: "invalid-time", content: "Historic malformed date", created_date: "2026-02-31T20:00:00Z" }] } } });
      assert.equal((await getAdminTicketCounts(tx, staff)).success, true);
      throw rollback;
    }, { timeout: 30000 }), error => error === rollback);
  } finally { await db.$disconnect(); }
});
