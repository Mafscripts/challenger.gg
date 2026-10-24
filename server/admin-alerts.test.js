import test from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { getAdminAlerts, reviewAdminAlerts, presentAdminAlert } from "./admin-alerts.js";

const actor = { id: "staff", role: "moderator", display_name: "dev", username: "topfragg-dev" };
const key = "a".repeat(32);
const tableNames = ["AdminAlert", "Ticket", "Dispute", "Wager", "XPMatch", "RankedMatch", "TournamentMatch", "ChallengeMatch"];
const row = (index = 0, values = {}) => ({ group_key: `${index.toString(16).padStart(32, "0")}`, alert_count: 2, needs_review_count: 1, category: "calls",
  metadata: { user_id: "player", subject: "Admin request room-id", status: "open", priority: "high" },
  reporter_id: "player", reporter_name: "Old player", first_date: new Date("2026-10-24T12:00:00Z"), latest_date: new Date("2026-10-24T12:30:00Z"),
  case_id: "case-id", case_kind: "ticket", case_metadata: { subject: "Wager support room-id", status: "waiting_for_admin", assigned_admin_id: "staff", assigned_admin_name: "Old staff" },
  room_id: "room-id", mode: "wagers", room_metadata: { host_id: "player", host_name: "Old player", challenger_id: "opponent", challenger_name: "Old opponent" }, ...values });

function fixture({ rows = [], counts = {}, tables = tableNames, members = [], users = [] } = {}) {
  const reads = [], writes = [], audits = [], userReads = [];
  const db = {
    $queryRaw: async (input, ...values) => {
      const query = Array.isArray(input) ? Prisma.sql(input, ...values) : input;
      reads.push(query);
      if (query.sql.startsWith("SELECT tablename")) return tables.map(tablename => ({ tablename }));
      if (query.sql.includes("FOR UPDATE")) return members;
      if (query.sql.includes("SELECT COUNT(*) FILTER")) return [{ all_count: 37, needs_review: 30, reviewed: 7, total: 30, calls: 12, evidence: 8, disputes: 5, platform: 5, ...counts }];
      if (query.sql.includes("SELECT * FROM records")) return rows;
      throw new Error(`Unexpected query ${query.sql}`);
    },
    $executeRaw: async (input, ...values) => { writes.push(Array.isArray(input) ? Prisma.sql(input, ...values) : input); return members.length; },
    user: { findMany: async args => { userReads.push(args); return users; } },
    adminAction: { create: async args => { audits.push(args); return args.data; } },
  };
  db.$transaction = async work => work(db);
  return { db, reads, writes, audits, userReads };
}

test("alerts require staff before any database read or review", async () => {
  const f = fixture();
  await assert.rejects(getAdminAlerts(f.db, { role: "user" }), { status: 403 });
  await assert.rejects(reviewAdminAlerts(f.db, { role: "user" }, { group_keys: [key] }), { status: 403 });
  assert.equal(f.reads.length, 0);
  for (const role of ["moderator", "developer", "admin", "super_admin", "ceo"]) assert.equal((await getAdminAlerts(f.db, { role })).success, true);
});

test("alerts page bounds groups at 25, batches current names, and reports global filtered counts", async () => {
  const f = fixture({ rows: Array.from({ length: 26 }, (_, index) => row(index)), users: [
    { id: "player", display_name: "Wong", username: "twitter-handle" }, { id: "opponent", full_name: "ouji" }, { id: "staff", display_name: "dev" },
  ] });
  const result = await getAdminAlerts(f.db, actor);
  assert.equal(result.rows.length, 25);
  assert.ok(result.next_cursor);
  assert.equal(result.total, 30);
  assert.deepEqual(result.counts, { all: 37, needs_review: 30, reviewed: 7, categories: { calls: 12, evidence: 8, disputes: 5, platform: 5 } });
  assert.equal(result.rows[0].reporter.name, "Wong");
  assert.equal(result.rows[0].players[1].name, "ouji");
  assert.equal(result.rows[0].assigned_staff.name, "dev");
  assert.equal(result.rows[0].match.title, "Wong vs ouji");
  assert.equal(result.rows[0].case.title, "Wager support");
  assert.equal(f.userReads.length, 1);
  assert.deepEqual(f.userReads[0].where.id.in, ["player", "staff", "opponent"]);
  const page = f.reads.find(query => query.sql.includes("SELECT * FROM records"));
  assert.match(page.sql, /LIMIT 26/);
  assert.match(page.sql, /needs_review_count > 0/);
  assert.match(page.sql, /GROUP BY group_key/);
  assert.match(page.sql, /COUNT\(\*\) FILTER \(WHERE needs_review\)/);
  assert.equal(page.sql.includes("chat_logs"), false);
  assert.equal(page.sql.includes("submitted_proof"), false);
  assert.equal(result.rows[0].metadata, undefined);
});

test("alert filters and scoped cursor stay parameterized and use native UTC timestamps", async () => {
  const f = fixture({ rows: Array.from({ length: 26 }, (_, index) => row(index)) });
  const first = await getAdminAlerts(f.db, actor, { view: "all", category: "evidence", search: "  Player' OR TRUE --  " });
  const query = f.reads.find(item => item.sql.includes("SELECT * FROM records"));
  assert.equal(query.sql.includes("Player' OR TRUE"), false);
  assert.ok(query.values.includes("player' or true --"));
  assert.ok(query.values.includes("evidence"));
  const next = fixture();
  await getAdminAlerts(next.db, actor, { view: "all", category: "evidence", search: "Player' OR TRUE --", cursor: first.next_cursor });
  const page = next.reads.find(item => item.sql.includes("SELECT * FROM records"));
  assert.match(page.sql, /\(latest_date, group_key\) < \(\?::timestamp, \?\)/);
  assert.ok(page.values.includes("2026-10-24T12:30:00.000"));
  await assert.rejects(getAdminAlerts(next.db, actor, { view: "reviewed", category: "evidence", search: "Player' OR TRUE --", cursor: first.next_cursor }), { status: 400 });
  await assert.rejects(getAdminAlerts(next.db, actor, { category: "injected" }), { status: 400 });
  await assert.rejects(getAdminAlerts(next.db, actor, { cursor: "bad" }), { status: 400 });
});

test("status counters respect category while category counters respect selected view across all pages", async () => {
  const f = fixture();
  await getAdminAlerts(f.db, actor, { category: "evidence", view: "reviewed", search: "dev" });
  const counts = f.reads.find(query => query.sql.includes("SELECT COUNT(*) FILTER"));
  assert.match(counts.sql, /COUNT\(\*\) FILTER \(WHERE category = \?\)::int AS all_count/);
  assert.match(counts.sql, /needs_review_count = 0 AND category='calls'/);
  assert.equal(counts.sql.includes("LIMIT 26"), false);
  assert.equal(counts.sql.includes("latest_date, group_key) <"), false);
});

test("legacy match identity resolution checks installed sources including Wager 8s aliases", async () => {
  const f = fixture();
  await getAdminAlerts(f.db, actor);
  const query = f.reads.find(item => item.sql.includes("SELECT * FROM records"));
  assert.match(query.sql, /r\.id = l\.room_id/);
  assert.match(query.sql, /WHEN r\.metadata->>'match_type' = '8s' THEN 'free8s'/);
  assert.match(query.sql, /LOWER\(l.mode_hint\) IN \('wager', 'wagers', 'wagermatch'\)/);
  assert.match(query.sql, /WHEN 'xpmatch' THEN 'xp'/);
  assert.match(query.sql, /WHEN 'tournamentmatch' THEN 'tournament'/);
  assert.match(query.sql, /proof\|evidence\|screenshot/);
});

test("missing optional sources produce useful results without querying nonexistent tables", async () => {
  const missing = fixture({ tables: [] });
  const result = await getAdminAlerts(missing.db, actor);
  assert.deepEqual(result.rows, []);
  assert.equal(result.counts.all, 0);
  assert.equal(missing.reads.length, 1);
  const partial = fixture({ tables: ["AdminAlert"], rows: [row(0, { case_id: null, case_kind: null, case_metadata: {}, mode: null, room_metadata: {}, metadata: { ticket_id: "gone-case" } })] });
  const limited = await getAdminAlerts(partial.db, actor);
  const query = partial.reads.find(item => item.sql.includes("SELECT * FROM records"));
  assert.equal(query.sql.includes('FROM "Ticket"'), false);
  assert.equal(query.sql.includes('FROM "XPMatch"'), false);
  assert.equal(limited.rows[0].case.available, false);
  assert.equal(limited.rows[0].match.available, false);
  assert.equal(limited.rows[0].match.room_url, null);
});

test("presentation keeps maps/chats/private metadata out and room links correct for all types", () => {
  const urls = { free8s: "/8s-match/room-id", money8s: "/8s-match/room-id", wagers: "/wagers-match/room-id", ranked: "/ranked-match/room-id", xp: "/xp-match/room-id", tournament: "/tournament-match/room-id", challenge: "/challenge-a-team/room-id" };
  for (const [mode, url] of Object.entries(urls)) {
    const result = presentAdminAlert(row(0, { mode, metadata: { message: "Proof ready.\nMatch: room-id\nPlayers: Wong vs ouji", chat_logs: ["secret"] } }));
    assert.equal(result.match.room_url, url);
    assert.equal(result.message.includes("room-id"), false);
    assert.equal(result.chat_logs, undefined);
  }
  const reviewed = presentAdminAlert(row(0, { needs_review_count: 0, category: "evidence" }));
  assert.equal(reviewed.status, "reviewed");
  assert.equal(reviewed.title, "Evidence ready for review");
});

test("review locks current group members, acknowledges only open alerts, and audits once", async () => {
  const f = fixture({ members: [{ id: "open", metadata: { status: "open" } }, { id: "seen", metadata: { status: "acknowledged" } }, { id: "closed", metadata: { status: "closed" } }] });
  const result = await reviewAdminAlerts(f.db, actor, { group_keys: [key] });
  assert.deepEqual(result, { success: true, processed: 1, already_reviewed: 2 });
  const lock = f.reads.find(query => query.sql.includes("FOR UPDATE"));
  assert.match(lock.sql, /SELECT id FROM resolved WHERE group_key IN/);
  assert.ok(lock.values.includes(key));
  assert.equal(f.writes.length, 1);
  assert.match(f.writes[0].sql, /UPDATE "AdminAlert"/);
  assert.match(f.writes[0].sql, /COALESCE\(metadata->>'status','open'\) NOT IN/);
  assert.ok(f.writes[0].values.includes("open"));
  assert.equal(f.writes[0].values.includes("seen"), false);
  assert.equal(f.writes[0].values.includes("closed"), true, "closed is a status guard, not a target id");
  assert.equal(f.audits.length, 1);
  assert.deepEqual(f.audits[0].data.metadata.details.alert_ids, ["open"]);
  assert.equal(f.audits[0].data.metadata.admin_name, "dev");
  assert.equal(f.writes.some(query => /UPDATE "(?:Ticket|Dispute)"|DELETE/.test(query.sql)), false);
});

test("review is idempotent, rejects fabricated selections, and never closes cases", async () => {
  const f = fixture({ members: [{ id: "seen", metadata: { status: "resolved" } }] });
  assert.deepEqual(await reviewAdminAlerts(f.db, actor, { group_keys: [key] }), { success: true, processed: 0, already_reviewed: 1 });
  assert.equal(f.writes.length, 0);
  assert.equal(f.audits.length, 0);
  for (const group_keys of [[], ["injected"], Array.from({ length: 26 }, (_, index) => index.toString(16).padStart(32, "0"))]) {
    await assert.rejects(reviewAdminAlerts(f.db, actor, { group_keys }), { status: 400 });
  }
  await assert.rejects(reviewAdminAlerts(fixture().db, actor, { group_keys: [key] }), { status: 404 });
});
