import test from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { getAdminUsers } from "./admin-users.js";

const admin = { id: "staff", role: "admin" };
const user = (id) => ({ id, username: id, email: `${id}@example.test`, created_date: new Date("2026-10-01T00:00:00Z"),
  wallet_balance: 99, credits: 2, metadata: {} });

function fixture(candidates, wallets = []) {
  const reads = [];
  const db = { $queryRaw: async (strings, ...values) => {
    const query = Prisma.sql(strings, ...values);
    reads.push(query);
    if (query.sql.includes('FROM "Wallet"')) return wallets;
    if (query.sql.startsWith("SELECT COUNT(*)")) return [{ total: candidates.length }];
    if (query.sql.startsWith("SELECT *")) return candidates;
    throw new Error(`Unexpected database read: ${query.sql}`);
  } };
  return { db, reads, walletReads: () => reads.filter((query) => query.sql.includes('FROM "Wallet"')) };
}

test("admin directory reads wallet balances only for its 25 displayed players", async () => {
  const candidates = Array.from({ length: 26 }, (_, index) => user(`player-${index}`));
  const f = fixture(candidates, [{ user_id: "player-0", available_balance: 12.5 }, { user_id: "player-1", available_balance: 0 }]);
  const result = await getAdminUsers(f.db, admin, { include_security: false });
  assert.equal(result.rows.length, 25);
  assert.ok(result.next_cursor, "the extra candidate remains available on the next page");
  assert.equal(f.walletReads().length, 1, "all visible wallets use one request");
  assert.deepEqual(f.walletReads()[0].values, candidates.slice(0, 25).map((row) => row.id));
  assert.equal(f.walletReads()[0].values.includes("player-25"), false, "the next page's balance is not read early");
  assert.match(f.walletReads()[0].sql, /SELECT DISTINCT ON/);
  assert.match(f.walletReads()[0].sql, /created_date ASC, id ASC/);
  assert.equal(result.rows[0].available_balance, 12.5);
  assert.equal(result.rows[0].wallet_balance, 99, "the account wallet_balance keeps its original meaning");
  assert.equal(result.rows[1].available_balance, 0);
  assert.equal(result.rows[2].available_balance, 0, "accounts without a wallet retain the directory's zero default");
});

test("directory does not read or expose balances for moderators or developers", async () => {
  for (const actor of [{ id: "mod", role: "moderator" }, { id: "dev", role: "developer" }]) {
    const f = fixture([user("player")]);
    const result = await getAdminUsers(f.db, actor, { include_security: false });
    assert.equal(f.walletReads().length, 0);
    assert.equal(Object.hasOwn(result.rows[0], "available_balance"), false);
    assert.equal(Object.hasOwn(result.rows[0], "wallet_balance"), false);
  }
});

test("role-only requests can skip wallet data without changing account balance fields", async () => {
  const f = fixture([user("player")]);
  const result = await getAdminUsers(f.db, admin, { include_security: false, include_wallets: false });
  assert.equal(f.walletReads().length, 0);
  assert.equal(Object.hasOwn(result.rows[0], "available_balance"), false);
  assert.equal(result.rows[0].wallet_balance, 99);
});

test("empty directory pages skip wallet reads and cannot expose injected metadata balances", async () => {
  const empty = fixture([]);
  assert.deepEqual((await getAdminUsers(empty.db, admin, { include_security: false })).rows, []);
  assert.equal(empty.walletReads().length, 0);
  const spoofed = user("player");
  spoofed.metadata.available_balance = 1000000;
  const f = fixture([spoofed]);
  const result = await getAdminUsers(f.db, admin, { include_security: false });
  assert.equal(result.rows[0].available_balance, 0);
});

test("an ordinary player cannot request the admin directory or read wallets", async () => {
  const f = fixture([user("player")]);
  await assert.rejects(getAdminUsers(f.db, { id: "player", role: "user" }), { status: 403 });
  assert.equal(f.reads.length, 0);
});
