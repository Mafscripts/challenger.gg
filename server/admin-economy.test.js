import test from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { getAdminInventory, getAdminWithdrawals, processAdminWithdrawal, withdrawalActions } from "./admin-economy.js";
import { getAdminWallets, getAdminWalletSummary } from "./admin-wallets.js";

const admin = { id: "staff", role: "admin", display_name: "Helper" };
const sqlFor = (strings, values) => Array.isArray(strings) ? Prisma.sql(strings, ...values) : strings;
const candidate = index => ({ id: `record-${index}`, created_date: new Date(Date.UTC(2026, 9, 24, 12, 59 - index)), metadata: { user_id: "player", status: "pending", amount: 20 }, player: { id: "player", display_name: "dev" } });
function readFixture(rows, kind = "withdrawals") {
  const reads = [];
  return { reads, db: { $queryRaw: async (input, ...values) => {
    const sql = sqlFor(input, values); reads.push(sql);
    if (sql.sql.includes("COUNT(*)")) return kind === "withdrawals" ? [{ status: "pending", total: 26 }, { status: "completed", total: 4 }] : [{ total: 26 }];
    return rows;
  } } };
}

test("economy directories deny lower roles before any reads", async () => {
  for (const role of ["user", "moderator", "developer"]) {
    const f = readFixture([]);
    await assert.rejects(getAdminWithdrawals(f.db, { role }), { status: 403 });
    await assert.rejects(getAdminInventory(f.db, { role }), { status: 403 });
    await assert.rejects(processAdminWithdrawal(f.db, { role }), { status: 403 });
    assert.equal(f.reads.length, 0);
  }
});

test("withdrawals use bounded pages with current names and global status counts", async () => {
  const f = readFixture(Array.from({ length: 26 }, (_, index) => candidate(index)));
  const result = await getAdminWithdrawals(f.db, admin, { status: "pending", search: "dev" });
  assert.equal(result.rows.length, 25); assert.equal(result.total, 26); assert.equal(result.counts.completed, 4);
  assert.equal(result.rows[0].player.display_name, "dev"); assert.equal(result.rows[0].status, "pending");
  assert.ok(result.next_cursor); assert.equal(f.reads.length, 2);
  assert.match(f.reads[0].sql, /LEFT JOIN "User"/); assert.match(f.reads[0].sql, /LIMIT 26/);
  assert.equal(f.reads[1].values.includes("pending"), false, "counts retain other statuses for the summary shortcuts");
  await getAdminWithdrawals(f.db, admin, { status: "pending", search: "dev", cursor: result.next_cursor });
  assert.match(f.reads[2].sql, /::timestamp/);
  assert.ok(f.reads[2].values.includes("2026-10-24T12:35:00.000"));
  await assert.rejects(getAdminWithdrawals(f.db, admin, { status: "completed", search: "dev", cursor: result.next_cursor }), /filters/);
});

test("inventory searches own items with server-side category filtering and scope-bound cursors", async () => {
  const f = readFixture(Array.from({ length: 26 }, (_, index) => candidate(index)), "inventory");
  const result = await getAdminInventory(f.db, admin, { search: "special trophy", category: "trophy" });
  assert.equal(result.rows.length, 25); assert.equal(result.total, 26); assert.ok(result.next_cursor);
  assert.match(f.reads[0].sql, /item_category/); assert.ok(f.reads[0].values.includes("trophy"));
  assert.ok(f.reads[0].values.includes("special trophy"));
  assert.equal(f.reads[0].sql.includes("SELECT *"), false, "the directory projects item and player fields");
  await assert.rejects(getAdminInventory(f.db, admin, { search: "different", category: "trophy", cursor: result.next_cursor }), /filters/);
});

function mutationFixture(status = "pending") {
  const row = { id: "withdrawal", created_date: new Date(), metadata: { user_id: "player", amount: 35, status } }, writes = [], reads = [];
  const tx = { $queryRaw: async (input, ...values) => { reads.push(sqlFor(input, values)); return [row]; },
    withdrawalRequest: { update: async input => { writes.push({ type: "withdrawal", ...input }); return { ...row, metadata: input.data.metadata }; } },
    adminAction: { create: async input => { writes.push({ type: "audit", ...input }); return { id: "audit" }; } },
  };
  return { writes, reads, db: { $transaction: async callback => callback(tx) } };
}

test("approval and paid recording are separate audited transitions without wallet changes", async () => {
  assert.deepEqual(withdrawalActions("approved"), ["completed", "cancelled"]);
  assert.deepEqual(withdrawalActions("completed"), []);
  for (const [previous, next] of [["pending", "approved"], ["approved", "completed"], ["processing", "completed"]]) {
    const f = mutationFixture(previous);
    const result = await processAdminWithdrawal(f.db, admin, { withdrawal_id: "withdrawal", expected_status: previous, status: next, notes: "Reviewed reference 123" });
    assert.equal(result.withdrawal.status, next); assert.match(f.reads[0].sql, /FOR UPDATE/);
    assert.equal(f.writes.length, 2); assert.equal(f.writes[1].data.metadata.action_type, "withdrawal_process");
    assert.equal(f.writes[1].data.metadata.target_user_id, "player");
    assert.deepEqual(f.writes[1].data.metadata.details.previous_status, previous);
    assert.equal(f.writes[0].data.metadata.processing_notes, "Reviewed reference 123");
  }
});

test("stale, resolved and invalid transitions cannot mutate a request", async () => {
  for (const [previous, expected, next] of [["approved", "pending", "rejected"], ["completed", "completed", "approved"], ["pending", "pending", "completed"]]) {
    const f = mutationFixture(previous);
    await assert.rejects(processAdminWithdrawal(f.db, admin, { withdrawal_id: "withdrawal", expected_status: expected, status: next, notes: "test" }), { status: 409 });
    assert.deepEqual(f.writes, []);
  }
});

test("rejection and cancellation require a retained reason", async () => {
  const f = mutationFixture();
  await assert.rejects(processAdminWithdrawal(f.db, admin, { withdrawal_id: "withdrawal", status: "rejected" }), /reason/);
  assert.equal(f.reads.length, 0);
  await processAdminWithdrawal(f.db, admin, { withdrawal_id: "withdrawal", status: "rejected", notes: "Payment details need correction" });
  assert.equal(f.writes[0].data.metadata.processing_notes, "Payment details need correction");
});

test("wallet cursors use UTC timestamp boundaries and reject another filter", async () => {
  const f = readFixture(Array.from({ length: 26 }, (_, index) => ({ ...candidate(index), available_balance: 5 })), "inventory");
  const first = await getAdminWallets(f.db, admin, { search: "dev", filter: "funded" });
  assert.equal(first.rows.length, 25); assert.ok(first.next_cursor);
  await getAdminWallets(f.db, admin, { search: "dev", filter: "funded", cursor: first.next_cursor });
  assert.match(f.reads[2].sql, /::timestamp/); assert.equal(f.reads[2].values.some(value => value instanceof Date), false);
  await assert.rejects(getAdminWallets(f.db, admin, { search: "dev", filter: "held", cursor: first.next_cursor }), /Invalid wallet page/);
});

test("read-only PostgreSQL verifies pagination and legacy balance safety in UTC and Phoenix", { skip: process.env.ADMIN_ECONOMY_DB_TESTS !== "1" }, async () => {
  await import("dotenv/config"); const { prisma } = await import("./prisma.js");
  const users = Array.from({ length: 30 }, (_, index) => ({ id: `player-${index}`, username: `account-${index}`, display_name: "dev", full_name: null, email: `user${index}@example.test`, credits: 3, wallet_balance: 2, created_date: candidate(index).created_date.toISOString() }));
  const records = users.map((row, index) => ({ id: `withdrawal-${index}`, created_date: row.created_date, updated_date: row.created_date, metadata: { user_id: row.id, status: "pending", item_category: "trophy", item_name: "Champion trophy", amount: 35 } }));
  const wallets = users.map((row, index) => ({ id: `wallet-${index}`, created_date: row.created_date, metadata: { user_id: row.id, available_balance: index === 0 ? "bad-old-value" : 5, pending_balance: "", escrow_balance: 0, total_earnings: "unknown" } }));
  const ctes = Prisma.sql`"User" AS (SELECT * FROM jsonb_to_recordset(${JSON.stringify(users)}::jsonb) AS fixture(id text, username text, display_name text, full_name text, email text, credits float8, wallet_balance float8, created_date timestamp)),
    "WithdrawalRequest" AS (SELECT * FROM jsonb_to_recordset(${JSON.stringify(records)}::jsonb) AS fixture(id text, created_date timestamp, updated_date timestamp, metadata jsonb)),
    "UserInventory" AS (SELECT * FROM jsonb_to_recordset(${JSON.stringify(records)}::jsonb) AS fixture(id text, created_date timestamp, updated_date timestamp, metadata jsonb)),
    "Wallet" AS (SELECT * FROM jsonb_to_recordset(${JSON.stringify(wallets)}::jsonb) AS fixture(id text, created_date timestamp, metadata jsonb))`;
  try { for (const zone of ["UTC", "America/Phoenix"]) await prisma.$transaction(async tx => {
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY"); await tx.$queryRaw`SELECT set_config('TimeZone', ${zone}, true)`;
    const db = { $queryRaw: (input, ...values) => { const sql = sqlFor(input, values), strings = [...sql.strings]; const isWith = /^WITH /.test(strings[0]); strings[0] = strings[0].replace(/^WITH /, ""); return tx.$queryRaw`WITH ${ctes}${isWith ? Prisma.sql`, ` : Prisma.sql` `}${Prisma.sql(strings, ...sql.values)}`; } };
    for (const [load, input] of [[getAdminWithdrawals, { status: "pending" }], [getAdminInventory, { category: "trophy" }], [getAdminWallets, {}]]) {
      const first = await load(db, admin, input), second = await load(db, admin, { ...input, cursor: first.next_cursor });
      assert.equal(first.rows.length, 25, zone); assert.equal(second.rows.length, 5, zone); assert.equal(second.next_cursor, null, zone);
      assert.equal(new Set([...first.rows, ...second.rows].map(row => row.id)).size, 30, zone);
    }
    const summary = await getAdminWalletSummary(db, admin);
    assert.equal(summary.available, 147); assert.equal(summary.pending, 0); assert.equal(summary.escrow, 0);
  }, { timeout: 30000 }); } finally { await prisma.$disconnect(); }
});
