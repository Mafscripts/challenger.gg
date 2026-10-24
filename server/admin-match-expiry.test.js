import test from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { getAdminMatches, getAdminMatchSources } from "./admin-matches.js";

const tables = ["Wager", "XPMatch", "RankedMatch", "TournamentMatch", "ChallengeMatch"];
test("shared match sources only derive expiry for unstarted open lobbies", async () => {
  const sources = await getAdminMatchSources({ $queryRaw: async () => tables.map(tablename => ({ tablename })) });
  assert.match(sources.sql.sql, /CASE WHEN status = 'open' AND CASE/);
  assert.match(sources.sql.sql, /WHEN mode = 'free8s' THEN GREATEST/);
  assert.match(sources.sql.sql, /WHEN mode = 'xp' AND NULLIF\(metadata->>'challenger_id', ''\) IS NULL/);
  assert.match(sources.sql.sql, /THEN 'expired' ELSE status END AS status/);
  assert.equal(sources.sql.sql.includes("UPDATE "), false, "expiry is read-time presentation rather than a match mutation");
});

test("real match cursors and UTC creation times remain stable across UTC and Phoenix sessions", { skip: process.env.ADMIN_MATCH_DB_TESTS !== "1" }, async () => {
  await import("dotenv/config");
  const { prisma } = await import("./prisma.js");
  let baseline;
  try {
    for (const zone of ["UTC", "America/Phoenix"]) await prisma.$transaction(async tx => {
      await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
      await tx.$queryRaw`SELECT set_config('TimeZone', ${zone}, true)`;
      const first = await getAdminMatches(tx, { role: "moderator" }, {});
      const snapshot = first.rows.map(row => [row.id, new Date(row.created_date).toISOString()]);
      if (baseline) assert.deepEqual(snapshot, baseline, "timezones cannot shift displayed creation times or reorder the same records");
      else baseline = snapshot;
      if (first.next_cursor) {
        const next = await getAdminMatches(tx, { role: "moderator" }, { cursor: first.next_cursor });
        assert.equal(next.rows.some(row => first.rows.some(previous => previous.id === row.id)), false, zone);
      }
      if (first.rows[0]) {
        const detail = await getAdminMatches(tx, { role: "moderator" }, { match: first.rows[0].id });
        assert.equal(new Date(detail.match.created_date).toISOString(), snapshot[0][1]);
      }
    }, { timeout: 30000 });
  } finally { await prisma.$disconnect(); }
});

test("real SQL expiry boundaries agree across Free 8s, money rooms, ranked and XP without changing started rooms", { skip: process.env.ADMIN_MATCH_DB_TESTS !== "1" }, async () => {
  await import("dotenv/config");
  const { prisma } = await import("./prisma.js");
  const fixtures = [
    { table: "Wager", id: "free-stale", age: 3601, metadata: { match_type: "8s" }, expected: "expired" },
    { table: "Wager", id: "free-boundary", age: 3600, metadata: { match_type: "8s" }, expected: "expired" },
    { table: "Wager", id: "free-fresh", age: 3599, metadata: { match_type: "8s" }, expected: "open" },
    { table: "Wager", id: "free-reopened", age: 7200, reopen_age: 600, metadata: { match_type: "8s" }, expected: "open" },
    { table: "Wager", id: "free-invalid-reopen", age: 7200, metadata: { match_type: "8s", free_eights_reopened_at: "2026-02-31T00:00:00Z" }, expected: "expired" },
    { table: "Wager", id: "free-garbage-reopen", age: 7200, metadata: { match_type: "8s", free_eights_reopened_at: "garbage" }, expected: "expired" },
    { table: "Wager", id: "money-boundary", age: 1800, metadata: { match_type: "money8s" }, expected: "expired" },
    { table: "Wager", id: "money-fresh", age: 1799, metadata: { match_type: "money8s" }, expected: "open" },
    { table: "Wager", id: "money-started", age: 7200, status: "in_progress", metadata: { match_type: "money8s" }, expected: "in_progress" },
    { table: "Wager", id: "wager-stale", age: 1801, metadata: { match_type: "wager" }, expected: "expired" },
    { table: "RankedMatch", id: "ranked-stale", age: 1801, expected: "expired" },
    { table: "RankedMatch", id: "ranked-completed", age: 7200, status: "completed", expected: "completed" },
    { table: "XPMatch", id: "xp-stale", age: 1801, expected: "expired" },
    { table: "XPMatch", id: "xp-fresh", age: 1799, expected: "open" },
    { table: "XPMatch", id: "xp-accepted", age: 7200, metadata: { challenger_id: "accepted-player" }, expected: "open" },
    { table: "XPMatch", id: "xp-empty-challenger", age: 7200, metadata: { challenger_id: "" }, expected: "expired" },
    { table: "TournamentMatch", id: "tournament-open", age: 7200, expected: "open" },
    { table: "TournamentMatch", id: "tournament-completed", age: 7200, metadata: { completed: true }, expected: "completed" },
    { table: "ChallengeMatch", id: "challenge-open", age: 7200, expected: "open" },
    { table: "ChallengeMatch", id: "challenge-cancelled", age: 7200, status: "cancelled", expected: "cancelled" },
  ].map(fixture => ({ metadata: {}, status: "open", reopen_age: null, ...fixture }));
  const sources = await getAdminMatchSources({ $queryRaw: async () => tables.map(tablename => ({ tablename })) });
  try {
    for (const zone of ["UTC", "America/Phoenix"]) await prisma.$transaction(async tx => {
      await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
      await tx.$queryRaw`SELECT set_config('TimeZone', ${zone}, true)`;
      const rows = await tx.$queryRaw`WITH raw_fixtures AS (SELECT * FROM jsonb_to_recordset(${JSON.stringify(fixtures)}::jsonb)
        AS fixture("table" text, id text, age int, reopen_age int, metadata jsonb, status text)), fixture AS (
        SELECT "table", id, ((NOW() - age * interval '1 second') AT TIME ZONE 'UTC')::timestamp AS created_date,
          (NOW() AT TIME ZONE 'UTC')::timestamp AS updated_date,
          metadata || jsonb_build_object('status', status) || CASE WHEN reopen_age IS NOT NULL
            THEN jsonb_build_object('free_eights_reopened_at', to_char((NOW() - reopen_age * interval '1 second') AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) ELSE '{}'::jsonb END AS metadata,
          status FROM raw_fixtures),
        "Wager" AS (SELECT * FROM fixture WHERE "table" = 'Wager'),
        "XPMatch" AS (SELECT * FROM fixture WHERE "table" = 'XPMatch'),
        "RankedMatch" AS (SELECT * FROM fixture WHERE "table" = 'RankedMatch'),
        "TournamentMatch" AS (SELECT * FROM fixture WHERE "table" = 'TournamentMatch'),
        "ChallengeMatch" AS (SELECT * FROM fixture WHERE "table" = 'ChallengeMatch')
        SELECT id, status FROM (${sources.sql}) rooms ORDER BY id`;
      assert.equal(rows.length, fixtures.length);
      for (const fixture of fixtures) assert.equal(rows.find(row => row.id === fixture.id)?.status, fixture.expected, `${zone}: ${fixture.id}`);
      const active = rows.filter(row => !["completed", "cancelled", "expired"].includes(row.status)).map(row => row.id).sort();
      assert.deepEqual(active, fixtures.filter(fixture => ["open", "in_progress"].includes(fixture.expected)).map(fixture => fixture.id).sort());
    }, { timeout: 30000 });
  } finally { await prisma.$disconnect(); }
});
