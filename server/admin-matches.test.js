import test from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { getAdminMatches, getAdminMatchSources } from "./admin-matches.js";

const actor = { id: "staff", role: "moderator" };
const row = (id, mode = "xp", metadata = {}) => ({ id, mode, status: "in_progress", created_date: new Date("2026-10-24T12:00:00Z"), updated_date: new Date("2026-10-24T12:30:00Z"), metadata: { host_id: "host", host_name: "Old host name", challenger_id: "opponent", challenger_name: "Opponent", ...metadata } });
function fixture(candidates = [], { support = [], participants = [], wagerParticipants = [], users = [], tables = ["Wager", "XPMatch", "RankedMatch", "TournamentMatch", "ChallengeMatch", "TournamentParticipant", "WagerParticipant"] } = {}) {
  const reads = [], userReads = [];
  const db = { $queryRaw: async (input, ...values) => {
    const query = Array.isArray(input) ? Prisma.sql(input, ...values) : input;
    if (query.sql.startsWith("SELECT tablename")) return tables.map(tablename => ({ tablename }));
    reads.push(query);
    if (query.sql.startsWith("WITH rooms")) return candidates;
    if (query.sql.startsWith("WITH linked")) return support;
    if (query.sql.includes('FROM "WagerParticipant"')) return wagerParticipants;
    if (query.sql.includes('FROM "TournamentParticipant"')) return participants;
    throw new Error(`Unexpected read ${query.sql}`);
  }, user: { findMany: async args => { userReads.push(args); return users; } } };
  return { db, reads, userReads };
}

test("match center requires staff before reading any match", async () => {
  const f = fixture();
  for (const payload of [{}, { match: "xp:one" }]) await assert.rejects(getAdminMatches(f.db, { id: "player", role: "user" }, payload), { status: 403 });
  assert.equal(f.reads.length, 0);
  for (const role of ["moderator", "developer", "admin", "super_admin", "ceo"]) assert.equal((await getAdminMatches(f.db, { role })).success, true);
});

test("first match page is capped at 25 and batches players and linked support only for that page", async () => {
  const candidates = Array.from({ length: 26 }, (_, index) => row(`match-${index}`, "xp", { support_ticket_id: `ticket-${index}`, messages: [{ message: "Should never be returned in list" }] }));
  const f = fixture(candidates, { support: [{ id: "ticket-0", kind: "ticket", metadata: { match_id: "match-0", match_type: "xp", subject: "Help", status: "open" } }],
    users: [{ id: "host", display_name: "dev", username: "topfragg-dev" }, { id: "opponent", display_name: "ouji", username: "accountname" }] });
  const result = await getAdminMatches(f.db, actor);
  assert.equal(result.rows.length, 25);
  assert.ok(result.next_cursor);
  assert.match(f.reads[0].sql, /LIMIT 26/);
  assert.match(f.reads[0].sql, /SELECT id, created_date, updated_date, mode, status, jsonb_strip_nulls/);
  assert.equal(f.reads.length, 2, "one match page plus one batched support request");
  assert.equal(f.userReads.length, 1, "one roster name lookup for the entire page");
  assert.deepEqual(f.userReads[0].where.id.in, ["host", "opponent"]);
  assert.ok(f.reads[1].values.includes("match-24"));
  assert.equal(f.reads[1].values.includes("match-25"), false);
  assert.equal(f.reads[1].values.includes("ticket-25"), false);
  assert.match(f.reads[1].sql, /position <= 5/);
  assert.equal(result.rows[0].players[0].user_name, "dev", "the visible player name wins over the account username");
  assert.equal(result.rows[0].details, undefined, "full match details load on demand");
  assert.equal(result.rows[0].messages, undefined);
  assert.deepEqual(result.rows[0].support_cases[0], { id: "ticket:ticket-0", record_id: "ticket-0", kind: "ticket", title: "Help", status: "open", assigned_admin_name: "" });
});

test("filters and cursors stay parameterized and cursors cannot leak across different filters", async () => {
  const candidates = Array.from({ length: 26 }, (_, index) => row(`match-${index}`));
  const f = fixture(candidates);
  const result = await getAdminMatches(f.db, actor, { mode: "xp", state: "disputed", search: "  dev' OR TRUE --  " });
  assert.match(f.reads[0].sql, /status IN \('disputed', 'score_conflict'\)/);
  assert.equal(f.reads[0].sql.includes("dev' OR TRUE"), false);
  assert.ok(f.reads[0].values.includes("dev' or true --"));
  assert.ok(f.reads[0].values.includes("xp"));
  assert.match(f.reads[0].sql, /EXISTS \(SELECT 1 FROM "User"/);
  const next = fixture([]);
  await getAdminMatches(next.db, actor, { mode: "xp", state: "disputed", search: "dev' OR TRUE --", cursor: result.next_cursor });
  assert.match(next.reads[0].sql, /\(created_date, id, mode\) </);
  assert.ok(next.reads[0].values.includes("match-24"));
  await assert.rejects(getAdminMatches(next.db, actor, { mode: "ranked", state: "disputed", search: "dev' OR TRUE --", cursor: result.next_cursor }), { status: 400 });
  await assert.rejects(getAdminMatches(next.db, actor, { cursor: "bad cursor" }), { status: 400 });
  await assert.rejects(getAdminMatches(next.db, actor, { mode: "forged" }), { status: 400 });
});

test("selected match lookup is bounded and provides current map data without fetching chat logs", async () => {
  const f = fixture([row("selected", "xp", { series_maps: [{ name: "Raid", mode: "hp" }], maps: ["Raid", "Express"], final_map_name: "Raid", messages: Array(50).fill({ content: "chat" }), chat_logs: ["private"] })]);
  const result = await getAdminMatches(f.db, { role: "developer" }, { match: "xp:selected" });
  assert.match(f.reads[0].sql, /WHERE mode = \? AND id = \? LIMIT 1/);
  assert.equal(result.match.id, "xp:selected");
  assert.deepEqual(result.match.details.series_maps, [{ name: "Raid", mode: "hp" }]);
  assert.equal(result.match.details.messages, undefined);
  assert.equal(result.match.details.chat_logs, undefined);
  await assert.rejects(getAdminMatches(f.db, actor, { match: "xp:selected:extra" }), { status: 400 });
  await assert.rejects(getAdminMatches(fixture().db, actor, { match: "xp:missing" }), { status: 404 });
});

test("all match modes link to existing rooms and support does not cross mode when record IDs collide", async () => {
  const f = fixture([row("same", "free8s"), row("same", "money8s"), row("same", "wagers"), row("same", "xp"), row("same", "ranked"), row("same", "challenge"), row("same", "tournament")], {
    support: [
      { id: "free-help", kind: "ticket", metadata: { match_id: "same", match_type: "8s", status: "open" } },
      { id: "xp-help", kind: "dispute", metadata: { match_id: "same", related_entity_type: "XPMatch", status: "under_review" } },
    ],
  });
  const result = await getAdminMatches(f.db, actor);
  assert.deepEqual(result.rows.map(match => match.room_url), ["/8s-match/same", "/8s-match/same", "/wagers-match/same", "/xp-match/same", "/ranked-match/same", "/challenge-a-team/same", "/tournament-match/same"]);
  assert.deepEqual(result.rows.map(match => match.support_cases.map(item => item.record_id)), [["free-help"], [], [], ["xp-help"], [], [], []]);
});

test("wager aliases open Free 8s and participant-only rosters without joining the room", async () => {
  const f = fixture([row("free-room", "free8s")], { wagerParticipants: [
    { id: "joined-1", metadata: { wager_id: "free-room", user_id: "joined-player", user_name: "Joined player", team: "challenger" } },
  ] });
  const result = await getAdminMatches(f.db, actor, { match: "wager:free-room" });
  assert.match(f.reads[0].sql, /mode IN \('free8s', 'money8s', 'wagers'\)/);
  assert.equal(result.match.id, "free8s:free-room");
  assert.equal(result.match.players.find(player => player.user_id === "joined-player").team, "bravo");
  assert.equal(f.reads.filter(read => read.sql.includes('FROM "WagerParticipant"')).length, 1);
});

test("older deployments can list existing modes while optional XP or challenge tables are not installed", async () => {
  const f = fixture([], { tables: ["Wager", "RankedMatch", "TournamentMatch"] });
  const result = await getAdminMatches(f.db, actor, { search: "dev" });
  assert.equal(result.success, true);
  assert.deepEqual(result.unavailable_modes, ["xp", "challenge"]);
  assert.equal(f.reads[0].sql.includes('FROM "XPMatch"'), false);
  assert.equal(f.reads[0].sql.includes('FROM "ChallengeMatch"'), false);
  assert.equal(f.reads[0].sql.includes('FROM "TournamentParticipant"'), false);
  assert.equal(f.reads[0].sql.includes('FROM "WagerParticipant"'), false);
  assert.ok(f.reads[0].sql.includes('FROM "Wager"'));
  await assert.rejects(getAdminMatches(f.db, actor, { match: "xp:missing-source" }), { status: 503 });
});

test("dashboard can reuse discovered sources even when no competition tables are installed", async () => {
  const f = fixture([], { tables: [] });
  const sources = await getAdminMatchSources(f.db);
  assert.equal(sources.has_sources, false);
  assert.equal(sources.unavailable_modes.length, 7);
  assert.match(sources.sql.sql, /NULL::text AS mode, NULL::text AS status WHERE FALSE/);
  const result = await getAdminMatches(f.db, actor);
  assert.deepEqual(result.rows, []);
  assert.equal(f.reads.length, 0, "the empty list does not fetch another table");
});

test("tournament roster lookups stay scoped to linked participants and use current player names", async () => {
  const f = fixture([row("tournament-match", "tournament", { tournament_id: "tournament-1", team_a_participant_id: "entry-a", team_b_id: "team-b" })], {
    participants: [
      { id: "entry-a", metadata: { tournament_id: "tournament-1", captain_id: "captain", member_ids: ["captain", "member"] } },
      { id: "entry-b", metadata: { tournament_id: "tournament-1", team_id: "team-b", user_id: "player-b", user_name: "Saved player" } },
      { id: "unrelated", metadata: { tournament_id: "different", team_id: "team-b", user_id: "not-in-this-match" } },
    ], users: [{ id: "member", display_name: "Renamed player", username: "twitter-like-account-name" }],
  });
  const result = await getAdminMatches(f.db, actor);
  assert.equal(f.reads.filter(read => read.sql.startsWith("SELECT id, metadata")).length, 1);
  const players = result.rows[0].players;
  assert.equal(players.find(player => player.user_id === "member").user_name, "Renamed player");
  assert.equal(players.find(player => player.user_id === "member").team, "alpha");
  assert.equal(players.find(player => player.user_id === "player-b").team, "bravo");
  assert.equal(players.some(player => player.user_id === "not-in-this-match"), false);
});
