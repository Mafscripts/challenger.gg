import test from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { auditCategoryFor, getAdminAuditEntry, getAdminAuditLogs } from "./admin-audit.js";
import { deleteAdminTicket } from "./admin-tickets.js";

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

test("categories use explicit precedence and selected totals keep all category counters", async () => {
  for (const [action, category] of [["delete_ticket", "support"], ["tournament_dispute", "support"], ["role_change", "players"],
    ["rank_review", "players"], ["cancel_xp_match", "competition"], ["wallet_adjustment", "economy"], ["variant_rules_update", "platform"],
    ["free_eights_games_update", "platform"], ["unexpected_event", "system"]]) assert.equal(auditCategoryFor(action, "system"), category);
  const reads = [];
  const db = { $queryRaw: async (input, ...values) => {
    const sql = asSql(input, values); reads.push(sql);
    return sql.sql.includes("COUNT(*)::int AS total") ? [{ total: 19, selected_total: 3, support: 3, players: 5, competition: 4, economy: 2, platform: 3, system: 2 }] : [];
  } };
  const result = await getAdminAuditLogs(db, staff, { category: "support", search: "Player" });
  assert.equal(result.total, 3);
  assert.deepEqual(result.categories, { all: 19, support: 3, players: 5, competition: 4, economy: 2, platform: 3, system: 2 });
  assert.match(reads[0].sql, /AND category = \?/);
  assert.match(reads[1].sql, /COUNT\(\*\) FILTER \(WHERE category = \?\)::int AS selected_total/);
  assert.equal(reads[1].sql.split("FROM records WHERE")[1].includes("category ="), false, "category counters remain independent of the selected category");
});

test("old deleted cases give exact recorded counts without inventing a player or subject", async () => {
  const db = { adminAction: { findUnique: async () => ({ metadata: { action: "delete_ticket", entity_type: "Ticket", entity_id: "gone",
    details: { ticket_ids: ["gone", "gone"], dispute_ids: ["dispute-1", "dispute-2"] } } }) } };
  const result = await getAdminAuditEntry(db, staff, { source: "admin", id: "event" });
  assert.equal(result.context.subject, null);
  assert.equal(result.context.player_name, null);
  assert.equal(result.context.historical_context_available, false);
  assert.equal(result.context.record_available, false);
  assert.equal(result.context.deleted_ticket_count, 1);
  assert.equal(result.context.deleted_dispute_count, 2);
});

test("competition records do not turn historical team or match targets into player identities", async () => {
  const db = { adminAction: { findUnique: async () => ({ metadata: { action_type: "tournament_match_reset", target_user_id: "match-1", target_username: "Alpha vs Bravo" } }) } };
  const result = await getAdminAuditEntry(db, staff, { source: "admin", id: "event" });
  assert.equal(result.category, "competition");
  assert.equal(result.context.player_id, null);
  assert.equal(result.context.player_name, null);
});

test("saved case context resolves the current public player name and only returns safe presentation keys", async () => {
  let lookup;
  const db = { adminAction: { findUnique: async () => ({ metadata: { action: "delete_ticket", entity_id: "gone", audit_context: {
    subject: "XP score dispute", player_id: "player", player_name: "old-name", ticket_count: 1, dispute_count: 1,
    deleted_ticket_count: 1, deleted_dispute_count: 1, private_notes: "staff secret", api_key: "never-context",
  } } }) }, user: { findMany: async options => { lookup = options; return [{ id: "player", display_name: "dev", username: "topfragg-dev" }]; } } };
  const result = await getAdminAuditEntry(db, staff, { source: "admin", id: "event" });
  assert.equal(result.context.subject, "XP score dispute");
  assert.equal(result.context.player_name, "dev");
  assert.equal(result.context.historical_context_available, true);
  assert.equal(result.context.private_notes, undefined);
  assert.equal(result.context.api_key, undefined);
  assert.equal(lookup.take, 25);
  assert.equal(lookup.select.email, undefined);
});

test("live support context uses bounded projections and safely tolerates an uninstalled match module", async () => {
  const reads = [];
  const db = { adminAction: { findUnique: async () => ({ metadata: { action: "support_season_cleanup", entity_type: "Ticket", entity_id: "case-1" } }) },
    user: { findMany: async () => [{ id: "player", display_name: "dev", username: "topfragg-dev" }] },
    $queryRaw: async (input, ...values) => {
      const sql = asSql(input, values); reads.push(sql);
      return sql.sql.includes('FROM "Ticket"') ? [{ id: "case-1", presentation: { subject: "Score dispute", player_id: "player", match_id: "match-1", match_type: "xp" } }] : [];
    } };
  const result = await getAdminAuditEntry(db, staff, { source: "admin", id: "event" });
  assert.equal(result.context.record_available, true);
  assert.equal(result.context.player_name, "dev");
  assert.equal(result.context.match_id, "match-1");
  assert.equal(result.context.match_name, null);
  assert.match(reads[0].sql, /LIMIT 50/);
  assert.ok(reads[0].values.includes("case-1"));
  assert.equal(reads[0].sql.includes("messages"), false);
  assert.equal(reads[1].sql.includes("pg_tables"), true);
  assert.equal(reads.length, 2, "no query references an unavailable optional table");
});

test("permanent case deletion records the useful context before removing its source", async () => {
  const ticket = { id: "case-1", metadata: { user_id: "player", username: "topfragg-dev", subject: "XP match dispute", match_id: "match-1", match_type: "xp", dispute_id: "dispute-1",
    messages: [{ content: "Private conversation is not audit presentation" }], internal_notes: ["Staff secret"] } };
  const dispute = { id: "dispute-1", metadata: { ticket_id: "case-1" } };
  let audit, deleted = false, nameReadBeforeDelete = false;
  const tx = { ticket: { findUnique: async () => ticket, deleteMany: async () => { deleted = true; } }, dispute: { deleteMany: async () => {} },
    user: { findUnique: async () => { nameReadBeforeDelete = !deleted; return { display_name: "dev", username: "topfragg-dev" }; } },
    adminAction: { create: async ({ data }) => { audit = data.metadata; } }, $executeRaw: async () => 0,
    $queryRaw: async (input, ...values) => { const sql = asSql(input, values).sql;
      if (sql.includes('SELECT * FROM "Dispute"')) return [dispute];
      if (sql.includes('SELECT * FROM "Ticket"')) return [ticket];
      return [];
    } };
  const db = { $transaction: run => run(tx) };
  await deleteAdminTicket(db, { id: "staff", role: "ceo", display_name: "Owner" }, { id: "case-1", kind: "ticket" });
  assert.equal(deleted, true);
  assert.equal(nameReadBeforeDelete, true);
  assert.deepEqual(audit.audit_context, { subject: "XP match dispute", player_id: "player", player_name: "dev", match_id: "match-1", match_type: "xp",
    match_name: null, ticket_count: 1, dispute_count: 1, deleted_ticket_count: 1, deleted_dispute_count: 1 });
  assert.equal(JSON.stringify(audit).includes("Staff secret"), false);
  assert.equal(JSON.stringify(audit).includes("Private conversation"), false);
});

test("audit pagination and current display names stay correct in UTC and Phoenix", { skip: process.env.ADMIN_AUDIT_DB_TESTS !== "1" }, async () => {
  await import("dotenv/config");
  const { prisma } = await import("./prisma.js");
  const events = Array.from({ length: 30 }, (_, index) => ({ id: `audit-${String(index).padStart(2, "0")}`,
    created_date: `2026-10-24T14:${String(index).padStart(2, "0")}:00.000`,
    metadata: { admin_id: "staff", admin_name: "topfragg-staff", action_type: index % 2 ? "role_change" : "rank_review", target_user_id: "player", target_username: "topfragg-dev",
      ...(index === 29 ? { details: { ticket_ids: ["case-1", "case-1", "case-2", 123, ""], dispute_ids: ["dispute-1"] } } : {}) } }));
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
        assert.equal(first.rows[0].context.ticket_count, 2);
        assert.equal(first.rows[0].context.dispute_count, 1);
        assert.equal(first.rows[0].context_metadata, undefined, "raw contextual metadata never leaves the server");
        const filtered = await getAdminAuditLogs(db, staff, { action: "role_change", search: "dev", period: "all" });
        assert.equal(filtered.rows.length, 15);
        assert.equal(filtered.total, 15);
        assert.ok(filtered.rows.every(row => row.action_code === "role_change"));
        const category = await getAdminAuditLogs(db, staff, { category: "economy" });
        assert.equal(category.total, 0);
        assert.equal(category.categories.all, 30);
        assert.equal(category.categories.players, 30);
        assert.equal(category.rows.length, 0);
      }
    }, { timeout: 30000 });
  } finally { await prisma.$disconnect(); }
});
