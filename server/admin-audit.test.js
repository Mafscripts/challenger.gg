import test from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { getAdminAuditEntry, getAdminAuditLogs } from "./admin-audit.js";

const asSql = (input, values) => Array.isArray(input) ? Prisma.sql(input, ...values) : input;
const staff = { id: "staff", role: "moderator" };
const fixture = (rows = []) => {
  const reads = [];
  return { reads, db: { $queryRaw: async (input, ...values) => {
    const sql = asSql(input, values); reads.push(sql);
    return sql.sql.includes("COUNT(*)::int AS total") ? [{ total: rows.length }] : rows;
  } } };
};

test("audit filtering keeps action, search and source parameterized on both page and total", async () => {
  const f = fixture();
  const result = await getAdminAuditLogs(f.db, staff, { source: "system", action: "rank' OR true --", search: "DEV' OR true --", period: "week" });
  assert.equal(result.success, true);
  for (const read of f.reads) {
    assert.match(read.sql, /action_code = \?/);
    assert.ok(read.values.includes("rank' OR true --"));
    assert.ok(read.values.includes("dev' or true --"));
    assert.ok(read.values.includes("system"));
    assert.equal(read.sql.includes("OR true"), false);
    assert.match(read.sql, /created_date >= \?::timestamp/);
    assert.ok(read.values.some(value => typeof value === "string" && /^\d{4}-.*T/.test(value) && !value.endsWith("Z")));
  }
});

test("audit cursor uses an explicit UTC wall time for native timestamp columns", async () => {
  const rows = Array.from({ length: 26 }, (_, index) => ({ id: `event-${index}`, source: "admin", created_date: new Date("2026-10-24T14:00:00.000Z") }));
  const first = await getAdminAuditLogs(fixture(rows).db, staff);
  assert.equal(first.rows.length, 25);
  assert.ok(first.next_cursor);
  const f = fixture();
  await getAdminAuditLogs(f.db, staff, { cursor: first.next_cursor });
  assert.match(f.reads[0].sql, /\(created_date, source, id\) < \(\?::timestamp, \?, \?\)/);
  assert.ok(f.reads[0].values.includes("2026-10-24T14:00:00.000"));
  assert.equal(f.reads[1].values.includes("event-24"), false, "totals are independent of the current page");
});

test("non-staff cannot read audit logs or sensitive entry details", async () => {
  const f = fixture();
  await assert.rejects(getAdminAuditLogs(f.db, { role: "user" }), { status: 403 });
  await assert.rejects(getAdminAuditEntry(f.db, { role: "user" }, { source: "admin", id: "event" }), { status: 403 });
  assert.equal(f.reads.length, 0);
});

test("audit entry keeps credentials private and restricts IP details to admins", async () => {
  const record = { metadata: { api_key: "private-key", details: { ip_address: "192.0.2.1", token: "private-token", result: "approved" } } };
  const db = { adminAction: { findUnique: async () => record } };
  const moderator = await getAdminAuditEntry(db, staff, { source: "admin", id: "event" });
  assert.deepEqual(moderator.details, { api_key: "[redacted]", details: { ip_address: "[redacted]", token: "[redacted]", result: "approved" } });
  const admin = await getAdminAuditEntry(db, { role: "admin" }, { source: "admin", id: "event" });
  assert.equal(admin.details.details.ip_address, "192.0.2.1");
  assert.equal(admin.details.api_key, "[redacted]");
});

test("audit pagination and current display names stay correct in UTC and Phoenix", { skip: process.env.ADMIN_AUDIT_DB_TESTS !== "1" }, async () => {
  await import("dotenv/config");
  const { prisma } = await import("./prisma.js");
  const events = Array.from({ length: 30 }, (_, index) => ({ id: `audit-${String(index).padStart(2, "0")}`,
    created_date: `2026-10-24T14:${String(index).padStart(2, "0")}:00.000`,
    metadata: { admin_id: "staff", admin_name: "topfragg-staff", action_type: index % 2 ? "role_change" : "rank_review", target_user_id: "player", target_username: "topfragg-dev" } }));
  const tables = Prisma.sql`"AdminAction" AS (SELECT * FROM jsonb_to_recordset(${JSON.stringify(events)}::jsonb) AS fixture(id text, created_date timestamp, metadata jsonb)),
    "SystemLog" AS (SELECT id, created_date, metadata FROM "AdminAction" WHERE FALSE),
    "User" AS (SELECT * FROM jsonb_to_recordset(${JSON.stringify([
      { id: "staff", username: "topfragg-staff", display_name: "Helper", full_name: null },
      { id: "player", username: "topfragg-dev", display_name: "dev", full_name: null },
    ])}::jsonb) AS fixture(id text, username text, display_name text, full_name text))`;
  try {
    await prisma.$transaction(async tx => {
      await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
      const db = { $queryRaw: async (input, ...values) => {
        const query = asSql(input, values), strings = [...query.strings];
        strings[0] = strings[0].replace(/^\s*WITH\s+/, "");
        return tx.$queryRaw`WITH ${tables}, ${Prisma.sql(strings, ...query.values)}`;
      } };
      for (const timezone of ["UTC", "America/Phoenix"]) {
        await tx.$queryRaw`SELECT set_config('TimeZone', ${timezone}, TRUE)`;
        const first = await getAdminAuditLogs(db, staff), second = await getAdminAuditLogs(db, staff, { cursor: first.next_cursor });
        assert.equal(first.rows.length, 25);
        assert.equal(second.rows.length, 5);
        assert.equal(new Set([...first.rows, ...second.rows].map(row => row.id)).size, 30);
        assert.ok(first.rows.every(row => row.actor_name === "Helper" && row.target_name === "dev"), "current display names replace recorded account handles");
        const filtered = await getAdminAuditLogs(db, staff, { action: "role_change", search: "dev", period: "all" });
        assert.equal(filtered.rows.length, 15);
        assert.equal(filtered.total, 15);
        assert.ok(filtered.rows.every(row => row.action_code === "role_change"));
      }
    }, { timeout: 30000 });
  } finally { await prisma.$disconnect(); }
});
