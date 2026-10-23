import test from "node:test";
import assert from "node:assert/strict";
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { deleteAdminTicket, getAdminTickets, closeSupportCaseForCleanup, getSupportCaseChat } from "./admin-tickets.js";

// Opt in explicitly: all test data and audit rows are rolled back, even on success.
test("database deletion removes linked records and messages, preserves results, and tolerates absent optional match tables", { skip: process.env.SUPPORT_DB_TEST !== "1" }, async () => {
  const db = new PrismaClient();
  const rollback = new Error("ROLLBACK_SUPPORT_DELETE_TEST");
  try {
    await assert.rejects(db.$transaction(async tx => {
      const ticket = await tx.ticket.create({ data: { metadata: { status: "closed", request_type: "live_support", support_favorite: true, messages: [{ content: "Fixture" }] } } });
      const dispute = await tx.dispute.create({ data: { metadata: { status: "closed", ticket_id: ticket.id } } });
      const message = await tx.message.create({ data: { metadata: { ticket_id: ticket.id, content: "Fixture" } } });
      const alert = await tx.adminAlert.create({ data: { metadata: { ticket_id: ticket.id } } });
      const notification = await tx.notification.create({ data: { metadata: { related_entity_id: alert.id } } });
      const wager = await tx.wager.create({ data: { metadata: { support_ticket_id: ticket.id, admin_request_ticket_id: ticket.id, dispute_id: dispute.id, status: "completed", score: 3, credits: 987 } } });
      const scopedDb = { $transaction: fn => fn(tx) }, admin = { id: "rollback-test-admin", role: "ceo" };
      await assert.rejects(() => deleteAdminTicket(scopedDb, { id: "mod", role: "moderator" }, { kind: "ticket", id: ticket.id }), error => error.status === 403);
      await tx.dispute.update({ where: { id: dispute.id }, data: { metadata: { status: "open", ticket_id: ticket.id } } });
      assert.ok(await tx.message.findUnique({ where: { id: message.id } }));
      const result = await deleteAdminTicket(scopedDb, admin, { kind: "ticket", id: ticket.id });
      assert.deepEqual(result.deleted_ticket_ids, [ticket.id]);
      assert.deepEqual(result.deleted_dispute_ids, [dispute.id]);
      for (const [model, id] of [["ticket", ticket.id], ["dispute", dispute.id], ["message", message.id], ["adminAlert", alert.id], ["notification", notification.id]]) {
        assert.equal(await tx[model].findUnique({ where: { id } }), null, model);
      }
      assert.deepEqual((await tx.wager.findUnique({ where: { id: wager.id } })).metadata, { status: "completed", score: 3, credits: 987, requested_admin: false, admin_request_status: "resolved" });
      assert.ok(await tx.adminAction.findFirst({ where: { metadata: { path: ["entity_id"], equals: ticket.id } } }));
      assert.equal((await deleteAdminTicket(scopedDb, admin, { kind: "ticket", id: ticket.id })).already_deleted, true);
      throw rollback;
    }, { timeout: 20000 }), error => error === rollback);
  } finally { await db.$disconnect(); }
});

test("category queries recover after closed, saved, assignment and search filters are cleared", { skip: process.env.SUPPORT_DB_TEST !== "1" }, async () => {
  const db = new PrismaClient(), rollback = new Error("ROLLBACK_CATEGORY_TEST");
  try {
    await assert.rejects(db.$transaction(async tx => {
      const marker = `category-check-${crypto.randomUUID()}`;
      const live = await tx.ticket.create({ data: { metadata: { username: marker, request_type: "live_support", status: "open" } } });
      const call = await tx.ticket.create({ data: { metadata: { username: marker, requested_admin: true, match_type: "tournament", status: "open" } } });
      const closed = await tx.ticket.create({ data: { metadata: { username: marker, request_type: "live_support", status: "closed" } } });
      const staff = { id: marker, role: "admin" };
      const read = options => getAdminTickets(tx, staff, { search: marker, ...options });
      assert.equal((await read({ category: "live", filter: "open", view: "saved" })).rows.length, 0);
      assert.equal((await read({ category: "live", filter: "open", view: "mine" })).rows.length, 0);
      assert.deepEqual((await read({ category: "live", filter: "closed" })).rows.map(row => row.record_id), [closed.id]);
      assert.deepEqual((await read({ category: "live", filter: "open", view: "all" })).rows.map(row => row.record_id), [live.id]);
      assert.equal((await read({ category: "all", filter: "open", view: "all" })).rows.length, 2);
      for (const category of ["calls", "tournament"]) assert.deepEqual((await read({ category, filter: "open", view: "all" })).rows.map(row => row.record_id), [call.id]);
      throw rollback;
    }, { timeout: 20000 }), error => error === rollback);
  } finally { await db.$disconnect(); }
});

test("admins can close linked support cases; only CEO/Developer delete, and matching selection crosses page boundaries", { skip: process.env.SUPPORT_DB_TEST !== "1" }, async () => {
  const db = new PrismaClient(), rollback = new Error("ROLLBACK_BULK_CLEANUP_TEST");
  try {
    await assert.rejects(db.$transaction(async tx => {
      const marker = `bulk-check-${crypto.randomUUID()}`;
      const ids = Array.from({ length: 105 }, () => crypto.randomUUID());
      await tx.ticket.createMany({ data: ids.map(id => ({ id, metadata: { username: marker, request_type: "live_support", status: "open", messages: [{ content: "Preserve me" }] } })) });
      const staff = { id: marker, role: "admin" }, scopedDb = { $transaction: fn => fn(tx) };
      const page1 = await getAdminTickets(tx, staff, { search: marker, filter: "open", selection_only: true });
      assert.equal(page1.rows.length, 100); assert.ok(page1.next_cursor);
      assert.equal(page1.rows[0].ticket, undefined);
      const page2 = await getAdminTickets(tx, staff, { search: marker, filter: "open", selection_only: true, cursor: page1.next_cursor });
      assert.equal(page2.rows.length, 5); assert.equal(page2.next_cursor, null);
      assert.equal(new Set([...page1.rows, ...page2.rows].map(row => row.id)).size, 105);
      const dispute = await tx.dispute.create({ data: { metadata: { status: "open", ticket_id: ids[0] } } });
      const match = await tx.wager.create({ data: { metadata: { admin_request_ticket_id: ids[0], requested_admin: true, status: "completed", score: 3, credits: 456 } } });
      const input = { id: ids[0], kind: "ticket", reason: "New season cleanup" };
      await assert.rejects(() => closeSupportCaseForCleanup(scopedDb, { id: "mod", role: "moderator" }, input), error => error.status === 403);
      const result = await closeSupportCaseForCleanup(scopedDb, staff, input);
      assert.deepEqual(result.closed_dispute_ids, [dispute.id]);
      const ticket = await tx.ticket.findUnique({ where: { id: ids[0] } });
      assert.equal(ticket.metadata.status, "closed");
      assert.equal(ticket.metadata.messages[0].content, "Preserve me");
      assert.equal((await tx.dispute.findUnique({ where: { id: dispute.id } })).metadata.status, "closed");
      const updated = (await tx.wager.findUnique({ where: { id: match.id } })).metadata;
      assert.equal(updated.admin_request_status, "resolved"); assert.equal(updated.requested_admin, false);
      assert.equal(updated.status, "completed"); assert.equal(updated.score, 3); assert.equal(updated.credits, 456);
      await assert.rejects(() => deleteAdminTicket(scopedDb, staff, input), error => error.status === 403);
      await assert.rejects(() => deleteAdminTicket(scopedDb, { id: "super", role: "super_admin" }, input), error => error.status === 403);
      assert.equal((await deleteAdminTicket(scopedDb, { id: marker, role: "developer" }, input)).success, true);
      assert.equal(await tx.ticket.findUnique({ where: { id: ids[0] } }), null);
      assert.equal((await deleteAdminTicket(scopedDb, { id: marker, role: "developer" }, { ...input, id: ids[1] })).success, true);
      assert.equal(await tx.ticket.findUnique({ where: { id: ids[1] } }), null);
      assert.equal((await closeSupportCaseForCleanup(scopedDb, { id: marker, role: "ceo" }, { ...input, id: ids[2] })).success, true);
      throw rollback;
    }, { timeout: 20000 }), error => error === rollback);
  } finally { await db.$disconnect(); }
});

test("support chat logs load later XP and tournament room messages even when the ticket snapshot is empty", { skip: process.env.SUPPORT_DB_TEST !== "1" }, async () => {
  const db = new PrismaClient(), rollback = new Error("ROLLBACK_SUPPORT_CHAT_TEST");
  try {
    await assert.rejects(db.$transaction(async tx => {
      for (const type of ["xp", "tournament"]) {
        const matchId = crypto.randomUUID();
        const ticket = await tx.ticket.create({ data: { metadata: { status: "open", match_id: matchId, match_type: type, chat_logs: [] } } });
        const message = await tx.chatMessage.create({ data: { metadata: { conversation_id: matchId, sender_name: "Fixture player", content: "Message sent after ticket opened", match_type: type } } });
        await tx.chatMessage.create({ data: { metadata: { conversation_id: matchId, internal: true, content: "Private fixture" } } });
        await tx.chatMessage.create({ data: { metadata: { conversation_id: crypto.randomUUID(), content: "Unrelated fixture" } } });
        const payload = { kind: "ticket", id: ticket.id };
        const result = await getSupportCaseChat(tx, { id: "staff", role: "developer" }, payload);
        assert.deepEqual(result.messages.map(row => row.id), [message.id]);
        assert.equal(result.messages[0].content, "Message sent after ticket opened");
        assert.equal(result.has_match, true);
        await assert.rejects(() => getSupportCaseChat(tx, { id: "player", role: "user" }, payload), error => error.status === 403);
      }
      await assert.rejects(() => getSupportCaseChat(tx, { role: "admin" }, { kind: "ticket", id: "missing-fixture" }), error => error.status === 404);
      throw rollback;
    }, { timeout: 20000 }), error => error === rollback);
  } finally { await db.$disconnect(); }
});
