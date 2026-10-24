import test from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { adminUserFilterSql, adminUserRestrictionSql, getAdminUsers } from "./admin-users.js";
import { getAdminDashboard } from "./admin-dashboard.js";
import { adminTimestampSql } from "./lib/adminTimestampSql.js";

const sqlFor = (input, values) => Array.isArray(input) ? Prisma.sql(input, ...values) : input;
function fixture(candidates = []) {
  const reads = [];
  const db = { $queryRaw: async (input, ...values) => {
    const sql = sqlFor(input, values);
    reads.push(sql);
    if (sql.sql.startsWith("SELECT COUNT(*)")) return [{ total: candidates.length }];
    if (sql.sql.startsWith("SELECT *")) return candidates;
    throw new Error(`Unexpected directory read: ${sql.sql}`);
  } };
  return { db, reads };
}
const account = (id, overrides = {}) => ({ id, username: id, created_date: new Date("2026-10-01T00:00:00Z"), metadata: {}, ...overrides });

test("filtered pages and their totals use the same active account restrictions", async () => {
  for (const filter of ["all", "banned", "suspended", "premium", "new"]) {
    const f = fixture([]);
    const result = await getAdminUsers(f.db, { id: "moderator", role: "moderator" }, { filter, include_security: false, include_wallets: false });
    assert.equal(result.success, true);
    assert.equal(f.reads.length, 2);
    assert.ok(f.reads[0].sql.includes(adminUserFilterSql(filter).sql));
    assert.ok(f.reads[1].sql.includes(adminUserFilterSql(filter).sql));
    assert.match(f.reads[0].sql, /AS active_ban/);
    assert.match(f.reads[0].sql, /AS active_suspension/);
    if (["banned", "suspended"].includes(filter)) {
      assert.ok(f.reads[1].sql.includes('FROM "Ban" b'), "record bans contribute to both totals and page membership");
      assert.ok(f.reads[1].sql.includes("expires_date"));
    }
  }
});

test("computed restriction flags replace stale native flags and injected metadata flags", async () => {
  const f = fixture([
    account("expired-ban", { is_banned: true, active_ban: false, active_suspension: false, metadata: { active_ban: true, active_suspension: true } }),
    account("record-ban", { is_banned: false, active_ban: true, active_suspension: false, metadata: { active_ban: false } }),
    account("suspended", { is_banned: false, active_ban: false, active_suspension: true }),
  ]);
  const result = await getAdminUsers(f.db, { id: "developer", role: "developer" }, { include_security: false });
  assert.deepEqual(result.rows.map(row => [row.id, row.active_ban, row.active_suspension]), [["expired-ban", false, false], ["record-ban", true, false], ["suspended", false, true]]);
  assert.equal(result.rows[0].is_banned, true, "the underlying account flag retains its distinct meaning");
  assert.equal(result.rows.some(row => Object.hasOwn(row, "email")), false);
});

test("filtered user pagination keeps its filter and parameterized search on subsequent pages", async () => {
  const f = fixture(Array.from({ length: 26 }, (_, index) => account(`player-${index}`)));
  const first = await getAdminUsers(f.db, { role: "admin" }, { filter: "banned", search: "dev' OR TRUE --", include_security: false, include_wallets: false });
  assert.equal(first.rows.length, 25);
  assert.ok(first.next_cursor);
  const next = fixture([]);
  await getAdminUsers(next.db, { role: "admin" }, { filter: "banned", search: "dev' OR TRUE --", cursor: first.next_cursor, include_security: false, include_wallets: false });
  assert.ok(next.reads[0].sql.includes(adminUserFilterSql("banned").sql));
  assert.match(next.reads[0].sql, /\(created_date, id\) </);
  assert.match(next.reads[0].sql, /\?::timestamp/);
  assert.ok(next.reads[0].values.includes("2026-10-01T00:00:00.000"));
  assert.ok(next.reads[0].values.includes("player-24"));
  assert.ok(next.reads[0].values.includes("dev' or true --"));
  assert.equal(next.reads[0].sql.includes("dev'"), false);
  assert.equal(next.reads[1].values.includes("player-24"), false, "directory totals remain independent of the current cursor");
});

test("normal players cannot request filtered staff data", async () => {
  const f = fixture();
  await assert.rejects(getAdminUsers(f.db, { role: "user" }, { filter: "banned" }), { status: 403 });
  assert.equal(f.reads.length, 0);
});

test("user filters and dashboard player counts agree for expiring record bans, email bans and premium", { skip: process.env.ADMIN_FILTER_DB_TESTS !== "1" }, async () => {
  // The fixtures are SELECT-only CTEs. They do not create or change an account,
  // ban or table; the transaction rejects writes as an additional guard.
  await import("dotenv/config");
  const { prisma } = await import("./prisma.js");
  const recent = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
  const old = "2000-01-01T00:00:00Z", future = "2099-01-01T00:00:00Z";
  const users = [
    { id: "permanent", is_banned: true },
    { id: "expired", is_banned: true, metadata: { ban_expires: old } },
    { id: "temporary", is_banned: true, metadata: { ban_expires: future } },
    { id: "legacy-expiry", is_banned: true, metadata: { ban_expires: "never" } },
    { id: "invalid-calendar-ban", is_banned: true, metadata: { ban_expires: "2026-02-31T00:00:00Z" } },
    { id: "invalid-timezone-suspension", metadata: { suspended_until: "2099-01-01T00:00:00+99:99" } },
    { id: "invalid-record-date" },
    { id: "record-user" }, { id: "record-expired" }, { id: "record-revoked" },
    { id: "email-user", email: "Email@Example.test" }, { id: "wrong-email-scope", email: "wrong@example.test" },
    { id: "suspended", metadata: { suspended_until: future } },
    { id: "suspension-expired", metadata: { suspended_until: old } },
    { id: "banned-and-suspended", is_banned: true, metadata: { suspended_until: future } },
    { id: "premium-active", is_premium: true, premium_expires: future },
    { id: "premium-permanent", is_premium: true },
    { id: "premium-expired", is_premium: true, premium_expires: old },
    { id: "new-player", created_date: recent },
  ].map(user => ({ email: `${user.id}@example.test`, created_date: old, is_banned: false, is_premium: false, premium_expires: null, email_verified: true, role: "user", admin_role: null, is_admin: false, metadata: {}, ...user }));
  const bans = [
    { metadata: { user_id: "record-user", status: "active", expires_date: future } },
    { metadata: { user_id: "record-expired", status: "active", expires_date: old } },
    { metadata: { user_id: "record-revoked", status: "revoked", expires_date: future } },
    { metadata: { user_id: "invalid-record-date", status: "active", expires_date: "2026-13-01T00:00:00Z" } },
    { metadata: { scope: ["email"], email: "email@example.test", status: "active" } },
    { metadata: { scope: ["ip"], email: "wrong@example.test", status: "active" } },
  ];
  const ctes = Prisma.sql`"User" AS (SELECT * FROM jsonb_to_recordset(${JSON.stringify(users)}::jsonb) AS fixture(id text, email text,
    created_date timestamptz, is_banned boolean, is_premium boolean, premium_expires timestamptz, email_verified boolean, role text, admin_role text, is_admin boolean, metadata jsonb)),
    "Ban" AS (SELECT * FROM jsonb_to_recordset(${JSON.stringify(bans)}::jsonb) AS fixture(metadata jsonb))`;
  let dashboardPlayers;
  await getAdminDashboard({ $queryRaw: async (input, ...values) => {
    const sql = sqlFor(input, values);
    if (/^\s*WITH active_bans AS/.test(sql.sql)) dashboardPlayers = sql;
    return [];
  } }, { id: "readonly-staff", role: "moderator" });
  assert.ok(dashboardPlayers, "the real dashboard's player-count query is checked");
  const dashboardStrings = [...dashboardPlayers.strings];
  dashboardStrings[0] = dashboardStrings[0].replace(/^\s*WITH\s+/, "");
  const dashboardWithoutWith = Prisma.sql(dashboardStrings, ...dashboardPlayers.values);
  try {
    await prisma.$transaction(async tx => {
      await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
      const actual = {};
      for (const filter of ["all", "banned", "suspended", "premium", "new"]) {
        actual[filter] = (await tx.$queryRaw`WITH ${ctes} SELECT u.id FROM "User" u WHERE ${adminUserFilterSql(filter)} ORDER BY u.id`).map(row => row.id);
      }
      assert.equal(actual.all.length, 19);
      assert.deepEqual(actual.banned, ["banned-and-suspended", "email-user", "invalid-calendar-ban", "invalid-record-date", "legacy-expiry", "permanent", "record-user", "temporary"]);
      assert.deepEqual(actual.suspended, ["suspended"]);
      assert.deepEqual(actual.premium, ["premium-active", "premium-permanent"]);
      assert.deepEqual(actual.new, ["new-player"]);
      const restrictions = adminUserRestrictionSql();
      const flags = await tx.$queryRaw`WITH ${ctes} SELECT u.id, ${restrictions.banned} AS active_ban,
        (${restrictions.suspended}) AS active_suspension FROM "User" u ORDER BY u.id`;
      assert.deepEqual(flags.filter(row => row.active_ban).map(row => row.id), actual.banned);
      assert.deepEqual(flags.filter(row => row.active_suspension).map(row => row.id), actual.suspended);
      const [dashboard] = await tx.$queryRaw`WITH ${ctes}, ${dashboardWithoutWith}`;
      assert.equal(dashboard.total, actual.all.length);
      assert.equal(dashboard.banned, actual.banned.length);
      assert.equal(dashboard.suspended, actual.suspended.length);
      assert.equal(dashboard.premium, actual.premium.length);
      assert.equal(dashboard.new_7d, actual.new.length);
    }, { timeout: 30000 });
  } finally { await prisma.$disconnect(); }
});

test("timestamp SQL rejects invalid calendar dates, times and zones before casting", { skip: process.env.ADMIN_FILTER_DB_TESTS !== "1" }, async () => {
  await import("dotenv/config");
  const { prisma } = await import("./prisma.js");
  const invalid = [null, "", "garbage", "2026-02-31T00:00:00Z", "2100-02-29T00:00:00Z", "2026-13-01T00:00:00Z", "2026-00-01T00:00:00Z", "2026-01-00T00:00:00Z", "0000-01-01T00:00:00Z", "2026-01-01T24:00:00Z", "2026-01-01T00:60:00Z", "2026-01-01T00:00:60Z", "2026-01-01T00:00:00+99:99", "2026-01-01T00:00:00+16:00", "2026-01-01T00:00:00+00:60", "2026-01-01 trailing garbage"];
  const valid = ["2000-01-01", "2000-01-01T00:00:00Z", "2024-02-29T23:59:59.123456789Z", "2099-01-01T00:00:00+02:30", "2026-10-24 12:00:00+0000", "2026-10-24T12:00:00+00", "0001-01-01T00:00:00Z"];
  const fixtures = [...invalid.map((value, id) => ({ id, value, valid: false })), ...valid.map((value, index) => ({ id: index + invalid.length, value, valid: true }))];
  try {
    await prisma.$transaction(async tx => {
      await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
      const timestamp = adminTimestampSql(Prisma.sql`fixture.value`);
      const rows = await tx.$queryRaw`WITH fixture AS (SELECT * FROM jsonb_to_recordset(${JSON.stringify(fixtures)}::jsonb) AS value(id int, value text, valid boolean))
        SELECT id, (${timestamp}) IS NOT NULL AS parsed, (${timestamp}) < NOW() AS expired FROM fixture ORDER BY id`;
      assert.deepEqual(rows.map(row => row.parsed), fixtures.map(row => row.valid));
      assert.equal(rows[invalid.length].expired, true, "a legitimate expired date remains expired");
      assert.equal(rows[invalid.length + 3].expired, false, "a future date retains its timezone");
    }, { timeout: 30000 });
  } finally { await prisma.$disconnect(); }
});

test("UTC user cursors page timestamp-without-time-zone columns correctly in UTC and Phoenix", { skip: process.env.ADMIN_FILTER_DB_TESTS !== "1" }, async () => {
  await import("dotenv/config");
  const { prisma } = await import("./prisma.js");
  const users = Array.from({ length: 30 }, (_, index) => ({ id: `paging-${String(index).padStart(2, "0")}`, username: `Player ${index}`,
    email: `paging-${index}@example.test`, is_banned: false, metadata: {},
    created_date: new Date(Date.UTC(2026, 9, 24, 12, 59 - index)).toISOString(), updated_date: "2026-10-24T13:00:00.000Z" }));
  const ctes = Prisma.sql`"User" AS (SELECT * FROM jsonb_to_recordset(${JSON.stringify(users)}::jsonb)
    AS fixture(id text, username text, email text, is_banned boolean, metadata jsonb, created_date timestamp, updated_date timestamp)),
    "Ban" AS (SELECT '{}'::jsonb AS metadata WHERE FALSE)`;
  try {
    for (const zone of ["UTC", "America/Phoenix"]) await prisma.$transaction(async tx => {
      await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
      await tx.$queryRaw`SELECT set_config('TimeZone', ${zone}, true)`;
      const db = { $queryRaw: (input, ...values) => tx.$queryRaw`WITH ${ctes} ${sqlFor(input, values)}` };
      const input = { include_security: false, include_wallets: false };
      const first = await getAdminUsers(db, { id: "paging-staff", role: "moderator" }, input);
      assert.equal(first.rows.length, 25, zone);
      assert.ok(first.next_cursor, zone);
      const next = await getAdminUsers(db, { id: "paging-staff", role: "moderator" }, { ...input, cursor: first.next_cursor });
      assert.equal(next.rows.length, 5, zone);
      assert.equal(next.next_cursor, null, zone);
      assert.equal(new Set([...first.rows, ...next.rows].map(row => row.id)).size, 30, zone);
      assert.equal(next.total, 30);
      // Negative control reproduces the old mixed-type paging bug without
      // changing a stored record: Phoenix would lose the final five accounts.
      const oldBoundary = new Date(JSON.parse(Buffer.from(first.next_cursor, "base64url").toString("utf8")).date);
      const [unsafe] = await tx.$queryRaw`WITH ${ctes} SELECT COUNT(*)::int AS total FROM "User" WHERE created_date < ${oldBoundary}`;
      if (zone === "America/Phoenix") assert.notEqual(unsafe.total, 5, "the old Date/timestamptz boundary demonstrates the regression");
    }, { timeout: 30000 });
  } finally { await prisma.$disconnect(); }
});
