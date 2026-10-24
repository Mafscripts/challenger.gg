import test from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { getAdminAlerts } from "./admin-alerts.js";

const enabled = process.env.ADMIN_ALERT_DB_TESTS === "1";
const actor = { id: "staff", role: "moderator" };
const scalar = value => `'${String(value).replaceAll("'", "''")}'`;
const record = (id, metadata, created = "2026-10-24 12:00:00") => `(${scalar(id)}::text, ${scalar(created)}::timestamp, ${scalar(JSON.stringify(metadata))}::jsonb)`;

// Every query executes against SELECT-only CTE fixtures, including the User
// join. It does not create, modify, or remove actual application records.
async function databaseFixture(alerts) {
  await import("dotenv/config");
  const { prisma } = await import("./prisma.js");
  const tables = ["AdminAlert", "Ticket", "Dispute", "Wager", "XPMatch", "RankedMatch", "TournamentMatch", "ChallengeMatch"];
  const fixtureRows = {
    AdminAlert: alerts,
    Ticket: [record("ticket-paid", { match_id: "paid-room", match_type: "Wager", assigned_admin_id: "staff", subject: "Proof needed", status: "waiting_for_admin" })],
    Dispute: [],
    Wager: [record("paid-room", { match_type: "money8s", host_id: "player", host_name: "Old player", challenger_id: "opponent", challenger_name: "Old opponent" }),
      record("free-room", { match_type: "8s", host_id: "player" })],
    XPMatch: [record("xp-room", { host_id: "player" })],
    RankedMatch: [record("ranked-room", { host_id: "player" })],
    TournamentMatch: [record("tournament-room", { team_a_name: "Alpha", team_b_name: "Bravo" })],
    ChallengeMatch: [record("challenge-room", { host_id: "player" })],
  };
  const ctes = tables.map(table => `fixture_${table} AS (${fixtureRows[table].length
    ? `SELECT * FROM (VALUES ${fixtureRows[table].join(",")}) v(id,created_date,metadata)`
    : "SELECT NULL::text id, NULL::timestamp created_date, '{}'::jsonb metadata WHERE FALSE"})`);
  ctes.push(`fixture_User AS (SELECT * FROM (VALUES ('player'::text,'Wong'::text,'Old Wong'::text,'twitter-player'::text),
    ('opponent','ouji',NULL,'twitter-opponent'),('staff','dev',NULL,'topfragg-dev')) v(id,display_name,full_name,username))`);
  const users = [{ id: "player", display_name: "Wong" }, { id: "opponent", display_name: "ouji" }, { id: "staff", display_name: "dev" }];
  const db = {
    $queryRaw: async (input, ...values) => {
      const query = Array.isArray(input) ? Prisma.sql(input, ...values) : input;
      if (query.sql.startsWith("SELECT tablename")) return tables.map(tablename => ({ tablename }));
      const strings = query.strings.map(part => part.replaceAll(/"(AdminAlert|Ticket|Dispute|Wager|XPMatch|RankedMatch|TournamentMatch|ChallengeMatch|User)"/g, (_, table) => `fixture_${table}`));
      strings[0] = strings[0].replace(/^WITH /, `WITH ${ctes.join(", ")}, `);
      return prisma.$queryRaw(Prisma.sql(strings, ...query.values));
    },
    user: { findMany: async args => users.filter(user => args.where.id.in.includes(user.id)) },
  };
  return { db, prisma };
}

test("PostgreSQL SELECT-only fixtures group repeat evidence and retain mixed review status with global counts", { skip: !enabled }, async () => {
  const f = await databaseFixture([
    record("proof-old", { ticket_id: "ticket-paid", subject: "Wager match admin request paid-room", message: "Proof is ready for staff review.", status: "acknowledged" }, "2026-10-24 12:00:00"),
    record("proof-new", { ticket_id: "ticket-paid", subject: "Wager match admin request paid-room", message: "Proof is ready for staff review.", status: "open" }, "2026-10-24 12:01:00"),
    record("call", { match_id: "paid-room", subject: "Admin request", status: "acknowledged", user_id: "player" }),
    record("platform", { subject: "Maintenance task", status: "open" }),
  ]);
  try {
    const result = await getAdminAlerts(f.db, actor);
    assert.equal(result.total, 2);
    assert.deepEqual(result.counts, { all: 3, needs_review: 2, reviewed: 1, categories: { calls: 0, evidence: 1, disputes: 0, platform: 1 } });
    const proof = result.rows.find(row => row.category === "evidence");
    assert.equal(proof.alert_count, 2);
    assert.equal(proof.needs_review_count, 1);
    assert.equal(proof.match.type, "money8s");
    assert.equal(proof.match.room_url, "/8s-match/paid-room");
    assert.equal(proof.match.title, "Wong vs ouji");
    assert.equal(proof.assigned_staff.name, "dev");
    const reviewed = await getAdminAlerts(f.db, actor, { view: "reviewed" });
    assert.equal(reviewed.total, 1);
    assert.equal(reviewed.rows[0].category, "calls");
    const evidence = await getAdminAlerts(f.db, actor, { category: "evidence", view: "all" });
    assert.deepEqual(evidence.counts, { all: 1, needs_review: 1, reviewed: 0, categories: { calls: 1, evidence: 1, disputes: 0, platform: 1 } });
  } finally { await f.prisma.$disconnect(); }
});

test("PostgreSQL SELECT-only fixtures resolve missing legacy type and every linked room family", { skip: !enabled }, async () => {
  const roomIds = ["free-room", "paid-room", "xp-room", "ranked-room", "tournament-room", "challenge-room"];
  const f = await databaseFixture(roomIds.map((id, index) => record(`legacy-${index}`, { related_entity_id: id, subject: "Admin request", user_id: "player" })));
  try {
    const result = await getAdminAlerts(f.db, actor);
    assert.equal(result.total, 6);
    assert.deepEqual(new Set(result.rows.map(row => row.match.type)), new Set(["free8s", "money8s", "xp", "ranked", "tournament", "challenge"]));
    assert.equal(result.rows.every(row => row.match.available && row.match.room_url), true);
    const match = await getAdminAlerts(f.db, actor, { search: "ouji" });
    assert.equal(match.total, 1, "current player names can find a linked match even when stored names changed");
    assert.equal(match.rows[0].match.id, "paid-room");
  } finally { await f.prisma.$disconnect(); }
});

test("PostgreSQL SELECT-only paging preserves equal timestamps and filter counts beyond page one", { skip: !enabled }, async () => {
  const f = await databaseFixture(Array.from({ length: 33 }, (_, index) => record(`item-${index}`, { subject: `Platform item ${index}`, status: index < 3 ? "acknowledged" : "open" })));
  try {
    const first = await getAdminAlerts(f.db, actor);
    assert.equal(first.total, 30);
    assert.equal(first.rows.length, 25);
    assert.equal(first.counts.reviewed, 3);
    assert.ok(first.next_cursor);
    const second = await getAdminAlerts(f.db, actor, { cursor: first.next_cursor });
    assert.equal(second.rows.length, 5);
    assert.equal(second.total, 30);
    assert.equal(second.next_cursor, null);
    assert.equal(new Set([...first.rows, ...second.rows].map(row => row.group_key)).size, 30);
  } finally { await f.prisma.$disconnect(); }
});
