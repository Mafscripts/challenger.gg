import { Prisma } from "@prisma/client";
import { hasRole } from "./roles.js";
import { adminTimestampSql } from "./lib/adminTimestampSql.js";

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const modes = ["all", "eights", "free8s", "money8s", "xp", "ranked", "wagers", "challenge", "tournament"];
const states = ["all", "active", "disputed", "completed", "cancelled"];
const terminal = ["completed", "finished", "cancelled", "canceled", "closed", "expired", "resolved", "rejected", "draft"];
const names = { free8s: "Free 8s", money8s: "Money 8s", xp: "XP match", ranked: "Ranked match", wagers: "Wager", challenge: "Team challenge", tournament: "Tournament match" };
const paths = { free8s: "8s-match", money8s: "8s-match", xp: "xp-match", ranked: "ranked-match", wagers: "wagers-match", challenge: "challenge-a-team", tournament: "tournament-match" };
const tablesByMode = { free8s: "Wager", money8s: "Wager", wagers: "Wager", xp: "XPMatch", ranked: "RankedMatch", tournament: "TournamentMatch", challenge: "ChallengeMatch" };
const refs = (metadata, id) => Prisma.sql`jsonb_path_exists(${metadata}, '$.** ? (@ == $userId)'::jsonpath, jsonb_build_object('userId', ${id}::text))`;
const roomSources = {
  Wager: Prisma.sql`SELECT id, created_date, updated_date, metadata,
    CASE WHEN metadata->>'match_type' = '8s' THEN 'free8s'
      WHEN metadata->>'match_type' = 'money8s' THEN 'money8s' ELSE 'wagers' END AS mode,
    LOWER(COALESCE(metadata->>'status', 'open')) AS status FROM "Wager"`,
  XPMatch: Prisma.sql`SELECT id, created_date, updated_date, metadata, 'xp' AS mode, LOWER(COALESCE(metadata->>'status', 'open')) AS status FROM "XPMatch"`,
  RankedMatch: Prisma.sql`SELECT id, created_date, updated_date, metadata, 'ranked' AS mode, LOWER(COALESCE(metadata->>'status', 'open')) AS status FROM "RankedMatch"`,
  TournamentMatch: Prisma.sql`SELECT id, created_date, updated_date, metadata, 'tournament' AS mode,
    CASE WHEN metadata->>'completed' = 'true' THEN 'completed' ELSE LOWER(COALESCE(metadata->>'status', 'pending')) END AS status FROM "TournamentMatch"`,
  ChallengeMatch: Prisma.sql`SELECT id, created_date, updated_date, metadata, 'challenge' AS mode, LOWER(status) AS status FROM "ChallengeMatch"`,
};
const listFields = ["host_id", "host_name", "challenger_id", "challenger_name", "player1_id", "player1_name", "player2_id", "player2_name",
  "team_alpha_player_ids", "team_bravo_player_ids", "team_a_player_ids", "team_b_player_ids", "team_alpha", "team_bravo", "players", "player_ids",
  "alpha_team", "bravo_team", "team_a_name", "team_b_name", "team_a_id", "team_b_id", "team_a_participant_id", "team_b_participant_id", "tournament_id",
  "support_ticket_id", "confirmed_score_alpha", "confirmed_score_bravo", "team_a_score", "team_b_score", "score", "game_name", "game_id", "game_mode_display", "game_mode", "format_name"];
const listMetadata = Prisma.sql`jsonb_strip_nulls(jsonb_build_object(${Prisma.join(listFields.flatMap(key => [Prisma.sql`${key}::text`, Prisma.sql`metadata->${key}::text`]))}))`;

// Shared by the list and dashboard so one missing optional mode never takes
// down every match counter. All table names and SQL sources are fixed here.
export async function getAdminMatchSources(db) {
  const schema = await db.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname = current_schema()
    AND tablename IN ('Wager', 'XPMatch', 'RankedMatch', 'TournamentMatch', 'ChallengeMatch', 'TournamentParticipant', 'WagerParticipant', 'RankVerification', 'BanAppeal')`;
  const installed = new Set(schema.map(row => row.tablename));
  const unavailable_modes = Object.entries(tablesByMode).filter(([, table]) => !installed.has(table)).map(([mode]) => mode);
  const sources = Object.entries(roomSources).filter(([table]) => installed.has(table)).map(([, sql]) => sql);
  const sql = sources.length ? Prisma.sql`SELECT id, created_date, updated_date, metadata, mode,
    CASE WHEN status = 'open' AND CASE
      WHEN mode = 'free8s' THEN GREATEST(${adminTimestampSql(Prisma.sql`metadata->>'free_eights_reopened_at'`)}, created_date) + interval '1 hour' <= NOW()
      WHEN mode IN ('money8s', 'wagers', 'ranked') THEN created_date + interval '30 minutes' <= NOW()
      WHEN mode = 'xp' AND NULLIF(metadata->>'challenger_id', '') IS NULL THEN created_date + interval '30 minutes' <= NOW()
      ELSE FALSE END THEN 'expired' ELSE status END AS status
    FROM (SELECT id, created_date AT TIME ZONE 'UTC' AS created_date, updated_date AT TIME ZONE 'UTC' AS updated_date,
      metadata, mode, status FROM (${Prisma.join(sources, " UNION ALL ")}) stored_rooms) utc_rooms` : Prisma.sql`SELECT NULL::text AS id, NULL::timestamptz AS created_date,
      NULL::timestamptz AS updated_date, '{}'::jsonb AS metadata, NULL::text AS mode, NULL::text AS status WHERE FALSE`;
  return { installed, unavailable_modes, has_sources: sources.length > 0,
    sql };
}

function flat(row) { return { ...row.metadata, ...row, metadata: undefined }; }
function slotIds(match, side) {
  return [match[`${side}_participant_id`], match[`${side}_id`]].filter(value => typeof value === "string" && value);
}
function participantFor(match, participant, side) {
  return participant.tournament_id === match.tournament_id && slotIds(match, side).some(id => [participant.id, participant.team_id, participant.user_id].includes(id));
}
function roster(match, participants = [], wagerParticipants = []) {
  const result = new Map();
  const add = (value, side, savedName) => {
    const id = typeof value === "string" ? value : value?.user_id || value?.id;
    if (typeof id !== "string" || !id || id.length > 200 || result.size >= 50) return;
    const team = ({ alpha: "alpha", team_a: "alpha", a: "alpha", host: "alpha", bravo: "bravo", team_b: "bravo", b: "bravo", challenger: "bravo" })[side] || result.get(id)?.team || "";
    result.set(id, { ...result.get(id), user_id: id, team, user_name: savedName || value?.user_name || value?.display_name || value?.name || result.get(id)?.user_name || "Player" });
  };
  for (const player of Array.isArray(match.players) ? match.players : []) add(player, player.side || player.team);
  for (const [side, keys] of [["alpha", ["team_alpha_player_ids", "team_a_player_ids", "team_alpha"]], ["bravo", ["team_bravo_player_ids", "team_b_player_ids", "team_bravo"]]]) {
    for (const key of keys) for (const player of Array.isArray(match[key]) ? match[key] : []) add(player, side);
  }
  add(match.host_id, "alpha", match.host_name);
  add(match.challenger_id, "bravo", match.challenger_name);
  add(match.player1_id, "alpha", match.player1_name);
  add(match.player2_id, "bravo", match.player2_name);
  for (const player of Array.isArray(match.player_ids) ? match.player_ids : []) add(player);
  for (const player of wagerParticipants.filter(player => player.wager_id === match.id)) add(player, player.team);
  for (const [side, key] of [["alpha", "team_a"], ["bravo", "team_b"]]) {
    for (const participant of participants.filter(player => participantFor(match, player, key))) {
      add(participant.user_id, side, participant.user_name);
      add(participant.captain_id, side, participant.captain_name);
      const ids = participant.member_ids || participant.team_member_ids;
      for (const member of Array.isArray(ids) ? ids : []) add(member, side);
      for (const member of Array.isArray(participant.members) ? participant.members : []) add(member, side);
    }
  }
  return [...result.values()];
}
const supportMode = (value) => ({ "8s": "free8s", eights: "free8s", free8s: "free8s", free_8s: "free8s", money8s: "money8s", money_8s: "money8s", "money-8s": "money8s", xp: "xp", xpmatch: "xp", ranked: "ranked", rankedmatch: "ranked", tournament: "tournament", tournamentmatch: "tournament", challenge: "challenge", challengematch: "challenge", challenge_team: "challenge", challenge_money: "challenge", wager: "wagers", wagers: "wagers" })[String(value || "").toLowerCase()];
const supportMatchId = (row) => row.metadata?.match_id || row.metadata?.wager_id || row.metadata?.related_entity_id;

async function enrich(db, rows, detail, installed) {
  if (!rows.length) return [];
  const matches = rows.map(flat), matchIds = rows.map(row => row.id);
  const linkedIds = [...new Set(matches.map(match => match.support_ticket_id).filter(id => typeof id === "string"))];
  const participantIds = [...new Set(matches.filter(match => match.mode === "tournament").flatMap(match => [...slotIds(match, "team_a"), ...slotIds(match, "team_b")]))];
  const wagerIds = matches.filter(match => ["free8s", "money8s", "wagers"].includes(match.mode)).map(match => match.id);
  const [supportRows, participantRows, wagerParticipantRows] = await Promise.all([
    // Both support tables are fetched together, capped per linked room. Never
    // fetch a ticket's conversation just to draw a match list.
    db.$queryRaw`WITH linked AS (
      SELECT id, created_date, 'ticket' AS kind, jsonb_build_object('match_id', metadata->'match_id', 'wager_id', metadata->'wager_id',
        'related_entity_id', metadata->'related_entity_id', 'match_type', metadata->'match_type', 'related_entity_type', metadata->'related_entity_type',
        'subject', metadata->'subject', 'status', metadata->'status', 'assigned_admin_name', metadata->'assigned_admin_name') AS metadata
        FROM "Ticket" WHERE metadata->>'match_id' IN (${Prisma.join(matchIds)}) OR metadata->>'wager_id' IN (${Prisma.join(matchIds)})
          OR metadata->>'related_entity_id' IN (${Prisma.join(matchIds)}) OR id IN (${Prisma.join(linkedIds.length ? linkedIds : [""])})
      UNION ALL SELECT id, created_date, 'dispute', jsonb_build_object('match_id', metadata->'match_id', 'wager_id', metadata->'wager_id',
        'related_entity_id', metadata->'related_entity_id', 'match_type', metadata->'match_type', 'related_entity_type', metadata->'related_entity_type',
        'subject', metadata->'subject', 'status', metadata->'status', 'assigned_admin_name', metadata->'assigned_admin_name')
        FROM "Dispute" WHERE metadata->>'match_id' IN (${Prisma.join(matchIds)}) OR metadata->>'wager_id' IN (${Prisma.join(matchIds)})
          OR metadata->>'related_entity_id' IN (${Prisma.join(matchIds)})
    ), ranked AS (SELECT *, ROW_NUMBER() OVER (PARTITION BY COALESCE(metadata->>'match_id', metadata->>'wager_id', metadata->>'related_entity_id', id)
      ORDER BY CASE WHEN metadata->>'status' IN ('closed', 'resolved', 'rejected') THEN 1 ELSE 0 END, created_date DESC, id DESC) AS position FROM linked)
      SELECT * FROM ranked WHERE position <= 5 ORDER BY created_date DESC, id DESC LIMIT 150`,
    participantIds.length && installed.has("TournamentParticipant") ? db.$queryRaw`SELECT id, metadata FROM "TournamentParticipant" WHERE id IN (${Prisma.join(participantIds)})
      OR metadata->>'team_id' IN (${Prisma.join(participantIds)}) OR metadata->>'user_id' IN (${Prisma.join(participantIds)}) ORDER BY id LIMIT 100` : [],
    wagerIds.length && installed.has("WagerParticipant") ? db.$queryRaw`SELECT id, jsonb_build_object('wager_id', metadata->'wager_id', 'user_id', metadata->'user_id', 'user_name', metadata->'user_name', 'team', metadata->'team') AS metadata
      FROM "WagerParticipant" WHERE metadata->>'wager_id' IN (${Prisma.join(wagerIds)}) ORDER BY created_date, id LIMIT 1250` : [],
  ]);
  const participants = participantRows.map(flat), wagerParticipants = wagerParticipantRows.map(flat), rosters = matches.map(match => roster(match, participants, wagerParticipants));
  const playerIds = [...new Set(rosters.flatMap(players => players.map(player => player.user_id)))];
  const users = playerIds.length ? await db.user.findMany({ where: { id: { in: playerIds } }, select: { id: true, display_name: true, full_name: true, username: true } }) : [];
  const userNames = new Map(users.map(user => [user.id, user.display_name || user.full_name || user.username || "Player"]));
  return matches.map((match, index) => {
    const teamA = match.alpha_team?.name || match.team_a_name || userNames.get(match.host_id || match.player1_id) || match.host_name || match.player1_name || "Team Alpha";
    const teamB = match.bravo_team?.name || match.team_b_name || userNames.get(match.challenger_id || match.player2_id) || match.challenger_name || match.player2_name || "Open slot";
    return { id: `${match.mode}:${match.id}`, record_id: match.id, mode: match.mode,
      title: `${teamA} vs ${teamB}`, mode_label: names[match.mode], status: match.status, created_date: match.created_date,
      updated_date: match.updated_date, team_a_name: teamA, team_b_name: teamB,
      score_a: match.confirmed_score_alpha ?? match.team_a_score ?? match.score?.alpha ?? null,
      score_b: match.confirmed_score_bravo ?? match.team_b_score ?? match.score?.bravo ?? null,
      game_name: match.game_name || match.game_id || "", game_mode: match.game_mode_display || match.game_mode || match.format_name || "",
      players: rosters[index].map(player => ({ ...player, user_name: userNames.get(player.user_id) || player.user_name })),
      room_url: `/${paths[match.mode]}/${encodeURIComponent(match.id)}`,
      support_cases: supportRows.filter(row => (row.kind === "ticket" && row.id === match.support_ticket_id)
        || (supportMatchId(row) === match.id && (!supportMode(row.metadata?.match_type || row.metadata?.related_entity_type) || supportMode(row.metadata?.match_type || row.metadata?.related_entity_type) === match.mode)))
        .sort((a, b) => Number(["closed", "resolved", "rejected"].includes(a.metadata?.status)) - Number(["closed", "resolved", "rejected"].includes(b.metadata?.status)))
        .map(row => ({ id: `${row.kind}:${row.id}`, record_id: row.id, kind: row.kind, title: row.metadata?.subject || (row.kind === "dispute" ? "Match dispute" : "Match support"), status: row.metadata?.status || "open", assigned_admin_name: row.metadata?.assigned_admin_name || "" })),
      ...(detail ? { details: Object.fromEntries(Object.entries(match).filter(([key]) => !["metadata", "messages", "chat_logs", "chat_messages", "internal_notes"].includes(key))) } : {}),
    };
  });
}

export async function getAdminMatches(db, actor, payload = {}) {
  if (!hasRole(actor, "moderator")) fail("Moderator access required", 403);
  const mode = payload.mode || "all", state = payload.state || "all", search = String(payload.search || "").trim().toLowerCase().slice(0, 200);
  if (!modes.includes(mode) || !states.includes(state)) fail("Choose a valid match mode and status.");
  // Optional competition modes may not be migrated on older deployments. A
  // missing mode must not break the overview for every other match type.
  const { installed, unavailable_modes, has_sources, sql: roomUnion } = await getAdminMatchSources(db);
  if (!has_sources) {
    if (payload.match) fail("This match type is not available in this installation yet.", 503);
    return { success: true, rows: [], next_cursor: null, unavailable_modes };
  }
  if (payload.match) {
    if (typeof payload.match !== "string" || !/^(free8s|money8s|xp|ranked|wager|wagers|challenge|tournament):[^:]{1,200}$/.test(payload.match)) fail("Choose a valid match.");
    const [matchMode, id] = payload.match.split(":");
    if (!installed.has(tablesByMode[matchMode === "wager" ? "wagers" : matchMode])) fail("This match type is not available in this installation yet.", 503);
    const matchModeWhere = matchMode === "wager" ? Prisma.sql`mode IN ('free8s', 'money8s', 'wagers')` : Prisma.sql`mode = ${matchMode}`;
    const rows = await db.$queryRaw`WITH rooms AS (${roomUnion}) SELECT * FROM rooms WHERE ${matchModeWhere} AND id = ${id} LIMIT 1`;
    if (!rows.length) fail("This match no longer exists.", 404);
    return { success: true, match: (await enrich(db, rows, true, installed))[0], unavailable_modes };
  }
  let cursor = null;
  const scope = JSON.stringify([mode, state, search]);
  if (payload.cursor) {
    try {
      cursor = JSON.parse(Buffer.from(String(payload.cursor), "base64url").toString("utf8"));
      if (cursor.scope !== scope || typeof cursor.id !== "string" || !cursor.id || cursor.id.length > 200 || !Object.hasOwn(tablesByMode, cursor.mode) || !Number.isFinite(Date.parse(cursor.date))) throw new Error();
    } catch { fail("Invalid match page. Refresh the list."); }
  }
  const modeWhere = mode === "all" ? Prisma.sql`TRUE` : mode === "eights" ? Prisma.sql`mode IN ('free8s', 'money8s')` : Prisma.sql`mode = ${mode}`;
  const statusWhere = state === "all" ? Prisma.sql`TRUE` : state === "active" ? Prisma.sql`status NOT IN (${Prisma.join(terminal)})`
    : state === "disputed" ? Prisma.sql`status IN ('disputed', 'score_conflict')`
      : state === "completed" ? Prisma.sql`status IN ('completed', 'finished', 'resolved')` : Prisma.sql`status IN ('cancelled', 'canceled', 'expired', 'closed', 'rejected')`;
  const cursorWhere = cursor ? Prisma.sql`(created_date, id, mode) < (${new Date(cursor.date)}, ${cursor.id}, ${cursor.mode})` : Prisma.sql`TRUE`;
  const searchWhere = !search ? Prisma.sql`TRUE` : Prisma.sql`(POSITION(${search} IN LOWER(CONCAT_WS(' ', id, metadata->>'host_name', metadata->>'challenger_name',
    metadata->>'team_a_name', metadata->>'team_b_name', metadata->'alpha_team'->>'name', metadata->'bravo_team'->>'name', metadata->'players', metadata->>'game_name', metadata->>'tournament_id'))) > 0
    OR EXISTS (SELECT 1 FROM "User" u WHERE POSITION(${search} IN LOWER(CONCAT_WS(' ', u.display_name, u.full_name, u.username))) > 0
      AND (${refs(Prisma.sql`rooms.metadata`, Prisma.sql`u.id`)} OR ${installed.has("WagerParticipant") ? Prisma.sql`(rooms.mode IN ('free8s', 'money8s', 'wagers') AND EXISTS (SELECT 1 FROM "WagerParticipant" wp
        WHERE wp.metadata->>'wager_id' = rooms.id AND wp.metadata->>'user_id' = u.id))` : Prisma.sql`FALSE`} OR ${installed.has("TournamentParticipant") ? Prisma.sql`(rooms.mode = 'tournament' AND EXISTS (SELECT 1 FROM "TournamentParticipant" p
        WHERE p.metadata->>'tournament_id' = rooms.metadata->>'tournament_id'
          AND (p.id IN (rooms.metadata->>'team_a_participant_id', rooms.metadata->>'team_b_participant_id', rooms.metadata->>'team_a_id', rooms.metadata->>'team_b_id')
            OR p.metadata->>'team_id' IN (rooms.metadata->>'team_a_id', rooms.metadata->>'team_b_id') OR p.metadata->>'user_id' IN (rooms.metadata->>'team_a_id', rooms.metadata->>'team_b_id'))
          AND ${refs(Prisma.sql`p.metadata`, Prisma.sql`u.id`)}))` : Prisma.sql`FALSE`})))`;
  // Chat transcripts, all map pools and evidence snapshots are not needed to
  // draw the list. Keep them in the separate one-match detail request.
  const candidates = await db.$queryRaw`WITH rooms AS (${roomUnion}) SELECT id, created_date, updated_date, mode, status, ${listMetadata} AS metadata FROM rooms WHERE ${modeWhere} AND ${statusWhere} AND ${searchWhere} AND ${cursorWhere}
    ORDER BY created_date DESC, id DESC, mode DESC LIMIT 26`;
  const page = candidates.slice(0, 25), last = page.at(-1);
  return { success: true, rows: await enrich(db, page, false, installed), unavailable_modes, next_cursor: candidates.length > 25 && last
    ? Buffer.from(JSON.stringify({ id: last.id, mode: last.mode, date: new Date(last.created_date).toISOString(), scope })).toString("base64url") : null };
}
