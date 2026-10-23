import test from "node:test";
import assert from "node:assert/strict";
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { deleteAdminTicket } from "./admin-tickets.js";

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
      const scopedDb = { $transaction: fn => fn(tx) }, admin = { id: "rollback-test-admin", role: "admin" };
      await assert.rejects(() => deleteAdminTicket(scopedDb, { id: "mod", role: "moderator" }, { kind: "ticket", id: ticket.id }), error => error.status === 403);
      await tx.dispute.update({ where: { id: dispute.id }, data: { metadata: { status: "open", ticket_id: ticket.id } } });
      await assert.rejects(() => deleteAdminTicket(scopedDb, admin, { kind: "ticket", id: ticket.id }), error => error.status === 409);
      assert.ok(await tx.message.findUnique({ where: { id: message.id } }));
      await tx.dispute.update({ where: { id: dispute.id }, data: { metadata: { status: "closed", ticket_id: ticket.id } } });
      const result = await deleteAdminTicket(scopedDb, admin, { kind: "ticket", id: ticket.id });
      assert.deepEqual(result.deleted_ticket_ids, [ticket.id]);
      assert.deepEqual(result.deleted_dispute_ids, [dispute.id]);
      for (const [model, id] of [["ticket", ticket.id], ["dispute", dispute.id], ["message", message.id], ["adminAlert", alert.id], ["notification", notification.id]]) {
        assert.equal(await tx[model].findUnique({ where: { id } }), null, model);
      }
      assert.deepEqual((await tx.wager.findUnique({ where: { id: wager.id } })).metadata, { status: "completed", score: 3, credits: 987 });
      assert.ok(await tx.adminAction.findFirst({ where: { metadata: { path: ["entity_id"], equals: ticket.id } } }));
      assert.equal((await deleteAdminTicket(scopedDb, admin, { kind: "ticket", id: ticket.id })).already_deleted, true);
      throw rollback;
    }, { timeout: 20000 }), error => error === rollback);
  } finally { await db.$disconnect(); }
});
