import test from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { getAdminUsers } from "./admin-users.js";

const admin = { id: "staff", role: "admin" };
const user = (id) => ({ id, username: id, email: `${id}@example.test`, created_date: new Date("2026-10-01T00:00:00Z"),
  wallet_balance: 99, credits: 2, metadata: {} });

function fixture(candidates, wallets = [], ranked = []) {
  const reads = [];
  const db = { $queryRaw: async (strings, ...values) => {
    const query = Prisma.sql(strings, ...values);
    reads.push(query);
    if (query.sql.includes('FROM "Wallet"')) return wallets;
    if (query.sql.includes('FROM "RankedStats"')) return ranked;
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

test("ranked player search reads only its current 25 players and chosen game", async () => {
  const candidates = Array.from({ length: 26 }, (_, index) => user(`player-${index}`));
  candidates[0].metadata.activision_id = "SearchOnly#123";
  const stats = { elo: 1450, wins: 4, losses: 1, game_id: "mw4" };
  const f = fixture(candidates, [], [{ user_id: "player-0", stats }]);
  const result = await getAdminUsers(f.db, admin, { include_security: false, include_wallets: false, include_ranked: true, search: "SearchOnly#123" });
  const reads = f.reads.filter(query => query.sql.includes('FROM "RankedStats"'));
  assert.equal(reads.length, 1);
  assert.equal(f.walletReads().length, 0);
  for (const row of candidates.slice(0, 25)) assert.ok(reads[0].values.includes(row.id));
  assert.equal(reads[0].values.includes("player-25"), false);
  assert.ok(reads[0].values.includes("mw4"));
  assert.ok(reads[0].values.includes("bo7"), "untagged old stats retain their legacy game");
  assert.match(reads[0].sql, /created_date DESC, id DESC/);
  assert.deepEqual(result.rows[0].ranked_stats, stats);
  assert.equal(result.rows[0].activision_id, "SearchOnly#123");
  assert.equal(result.rows[1].ranked_stats, null);
});

test("a selected ranked player can be refreshed exactly without loading other balances", async () => {
  const f = fixture([user("player")]);
  const result = await getAdminUsers(f.db, admin, { user_id: "player", include_security: false, include_wallets: false, include_ranked: true, game_id: "bo7" });
  assert.equal(result.rows[0].ranked_stats, null);
  const list = f.reads.find(query => query.sql.startsWith("SELECT *"));
  assert.match(list.sql, /u\.id = \?/);
  assert.ok(list.values.includes("player"));
  assert.equal(f.walletReads().length, 0);
  await assert.rejects(getAdminUsers(f.db, admin, { user_id: {} }), /valid player/);
  assert.equal(f.reads.length, 3);
});

test("ordinary directory and role searches do not fetch ranked data", async () => {
  const f = fixture([user("player")]);
  const result = await getAdminUsers(f.db, admin, { include_security: false, include_wallets: false });
  assert.equal(f.reads.some(query => query.sql.includes('FROM "RankedStats"')), false);
  assert.equal(Object.hasOwn(result.rows[0], "ranked_stats"), false);
});

test("ranked directory and exact player refresh run as read-only PostgreSQL queries", { skip: process.env.ADMIN_FILTER_DB_TESTS !== "1" }, async () => {
  const { prisma: db } = await import("./prisma.js");
  try {
    await db.$transaction(async tx => {
      await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
      for (const zone of ["UTC", "America/Phoenix"]) {
        await tx.$executeRawUnsafe(`SET LOCAL TIME ZONE '${zone}'`);
        const result = await getAdminUsers(tx, admin, { include_security: false, include_wallets: false, include_ranked: true });
        assert.ok(result.rows.length <= 25);
        if (result.rows[0]) {
          const selected = await getAdminUsers(tx, admin, { user_id: result.rows[0].id, include_security: false, include_wallets: false, include_ranked: true });
          assert.equal(selected.total, 1); assert.equal(selected.rows.length, 1);
          assert.equal(selected.rows[0].id, result.rows[0].id);
          assert.deepEqual(selected.rows[0].ranked_stats, result.rows[0].ranked_stats);
        }
      }
    });
  } finally { await db.$disconnect(); }
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
