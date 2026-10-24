import { Prisma } from "@prisma/client";
import { hasRole } from "./roles.js";

const requireStaff = (user) => {
  if (!hasRole(user, "moderator")) throw Object.assign(new Error("Moderator access required"), { status: 403 });
};
// The first matching category wins. Support actions often also contain a match
// name; platform configuration is likewise separate from competition activity.
const categoryRules = [
  ["support", "ticket|dispute|support"],
  ["platform", "announcement|notice|variant_rules|rules_update|free_eights_games"],
  ["players", "account|role|ban|suspend|suspension|password|vpn|rank_review|rank_verif|user_badge|premium|name_trial|user_name|animated_name|warning"],
  ["competition", "match|eights|8s|challenge|tournament|ranked|progression"],
  ["economy", "wallet|credit|withdraw|marketplace|purchase|inventory|reward|referral|trade|item"],
];
const categorySql = Prisma.sql`CASE ${Prisma.join(categoryRules.map(([category, pattern]) => Prisma.sql`WHEN action_code ~* ${pattern} THEN ${category}::text`), " ")}
  WHEN source = 'system' THEN 'system' ELSE 'platform' END`;
export const auditCategories = ["support", "players", "competition", "economy", "platform", "system"];
export const auditCategoryFor = (action, source) => categoryRules.find(([, pattern]) => new RegExp(pattern, "i").test(String(action || "")))?.[0]
  || (source === "system" ? "system" : "platform");
const eventsSql = Prisma.sql`
  WITH events AS (
    SELECT id, 'admin' AS source, created_date, metadata FROM "AdminAction"
    UNION ALL
    SELECT id, 'system' AS source, created_date, metadata FROM "SystemLog"
  ), identities AS (
    SELECT events.*,
      COALESCE(NULLIF(metadata->>'action_type', ''), NULLIF(metadata->>'action', ''), NULLIF(metadata->>'event_type', ''),
        NULLIF(metadata->>'event', ''), CASE WHEN source = 'admin' THEN 'staff_action' ELSE 'system_event' END) AS action_code,
      COALESCE(NULLIF(metadata->>'admin_id', ''), NULLIF(metadata->>'actor_id', ''), NULLIF(metadata->>'performed_by', ''),
        metadata->'actor'->>'id', CASE WHEN jsonb_typeof(metadata->'actor') = 'string' THEN metadata->>'actor' END,
        NULLIF(metadata->>'user_id', '')) AS actor_id,
      COALESCE(NULLIF(metadata->>'target_user_id', ''), NULLIF(metadata->>'target_id', ''), NULLIF(metadata->>'entity_id', ''),
        NULLIF(metadata->>'related_entity_id', ''), NULLIF(metadata->>'match_id', ''), metadata->'details'->>'match_id',
        NULLIF(metadata->>'wager_id', '')) AS target_id,
      COALESCE(NULLIF(metadata->>'target_username', ''), NULLIF(metadata->>'target_user_name', ''), NULLIF(metadata->>'target_name', '')) AS recorded_target,
      COALESCE(NULLIF(metadata->>'description', ''), NULLIF(metadata->>'summary', ''), NULLIF(metadata->>'message', ''),
        NULLIF(metadata->>'reason', ''), metadata->'details'->>'reason',
        CASE WHEN jsonb_typeof(metadata->'details') = 'string' THEN metadata->>'details' END, '') AS description
    FROM events
  ), categorized AS (
    SELECT identities.*, ${categorySql} AS category FROM identities
  ), records AS (
    SELECT e.id, e.source, e.created_date, e.action_code, e.actor_id,
      CASE WHEN e.category = 'competition' THEN COALESCE(NULLIF(e.metadata->>'match_id', ''), NULLIF(e.metadata->'details'->>'match_id', ''),
        NULLIF(e.metadata->>'wager_id', ''), e.target_id) ELSE e.target_id END AS target_id, e.description,
      e.category,
      jsonb_build_object('audit_context', COALESCE(e.metadata->'audit_context', e.metadata->'case_context'),
        'subject', e.metadata->'subject', 'player_id', COALESCE(e.metadata->'reporter_id',
          CASE WHEN e.category IN ('players', 'economy') THEN e.metadata->'target_user_id' ELSE to_jsonb(t.id) END),
        'player_name', CASE WHEN e.metadata->>'reporter_id' IS NOT NULL THEN e.metadata->'reporter_name'
          WHEN t.id IS NOT NULL OR e.category IN ('players', 'economy') THEN COALESCE(e.metadata->'target_user_name', e.metadata->'target_username') END,
        'match_id', COALESCE(e.metadata->'match_id', e.metadata->'wager_id', e.metadata->'details'->'match_id'),
        'match_type', COALESCE(e.metadata->'match_type', e.metadata->'details'->'match_type'),
        'match_name', e.metadata->'match_name',
        'ticket_count', CASE WHEN jsonb_typeof(e.metadata->'details'->'ticket_ids') = 'array' THEN
          (SELECT COUNT(DISTINCT value)::int FROM jsonb_array_elements(e.metadata->'details'->'ticket_ids') AS refs(value)
            WHERE jsonb_typeof(value) = 'string' AND value <> '""'::jsonb) END,
        'dispute_count', CASE WHEN jsonb_typeof(e.metadata->'details'->'dispute_ids') = 'array' THEN
          (SELECT COUNT(DISTINCT value)::int FROM jsonb_array_elements(e.metadata->'details'->'dispute_ids') AS refs(value)
            WHERE jsonb_typeof(value) = 'string' AND value <> '""'::jsonb) END) AS context_metadata,
      COALESCE(NULLIF(a.display_name, ''), NULLIF(a.full_name, ''), NULLIF(e.metadata->>'admin_name', ''), NULLIF(e.metadata->>'actor_name', ''),
        NULLIF(e.metadata->>'user_name', ''), e.metadata->'actor'->>'name',
        a.username,
        CASE WHEN e.source = 'system' OR e.actor_id = 'system' THEN 'System' ELSE 'Unrecorded staff' END) AS actor_name,
      a.username AS actor_username,
      COALESCE(NULLIF(e.metadata->>'admin_role', ''), NULLIF(e.metadata->>'actor_role', '')) AS actor_role,
      COALESCE(NULLIF(t.display_name, ''), NULLIF(t.full_name, ''), e.recorded_target, t.username) AS target_name,
      t.username AS target_username,
      COALESCE(NULLIF(e.metadata->>'entity_type', ''), NULLIF(e.metadata->>'related_entity_type', ''),
        CASE WHEN e.category = 'competition' THEN CASE WHEN e.action_code ~* 'tournament' AND e.action_code !~* 'match' THEN 'Tournament' ELSE 'Match' END
          WHEN e.metadata->>'target_user_id' IS NOT NULL OR e.action_code = 'account_deleted' THEN 'Account'
          WHEN e.metadata->>'match_id' IS NOT NULL OR e.metadata->'details'->>'match_id' IS NOT NULL OR e.metadata->>'wager_id' IS NOT NULL THEN 'Match'
          ELSE 'Record' END) AS target_kind
    FROM categorized e LEFT JOIN "User" a ON a.id = e.actor_id LEFT JOIN "User" t ON t.id = e.target_id
  )`;

export async function getAdminAuditCounts(db, user) {
  requireStaff(user);
  const [admin, system] = await Promise.all([db.adminAction.count(), db.systemLog.count()]);
  return { success: true, admin, system, total: admin + system };
}

export async function getAdminAuditLogs(db, user, body = {}) {
  requireStaff(user);
  const source = ["admin", "system"].includes(body.source) ? body.source : "all";
  const search = String(body.search || "").trim().toLowerCase().slice(0, 200);
  const action = String(body.action || "").trim().slice(0, 100);
  const days = { day: 1, week: 7, month: 30 }[body.period];
  const sourceSql = source === "all" ? Prisma.sql`TRUE` : Prisma.sql`source = ${source}`;
  const periodSql = Number.isFinite(days) ? Prisma.sql`created_date >= ${new Date(Date.now() - days * 86400000).toISOString().slice(0, -1)}::timestamp` : Prisma.sql`TRUE`;
  const actionSql = action ? Prisma.sql`action_code = ${action}` : Prisma.sql`TRUE`;
  const category = auditCategories.includes(body.category) ? body.category : "all";
  const selectedCategorySql = category === "all" ? Prisma.sql`TRUE` : Prisma.sql`category = ${category}`;
  const searchSql = search ? Prisma.sql`POSITION(${search} IN LOWER(CONCAT_WS(' ',
    REPLACE(action_code, '_', ' '), action_code, actor_name, actor_username, actor_id,
    target_name, target_username, target_id, target_kind, description, context_metadata->>'subject',
    context_metadata->'audit_context'->>'subject', context_metadata->'audit_context'->>'player_name'))) > 0` : Prisma.sql`TRUE`;
  let cursorSql = Prisma.sql`TRUE`;
  if (body.cursor) {
    try {
      const cursor = JSON.parse(Buffer.from(String(body.cursor), "base64url").toString("utf8"));
      const date = new Date(cursor.date);
      if (!Number.isFinite(date.getTime()) || !["admin", "system"].includes(cursor.source)
        || typeof cursor.id !== "string" || !cursor.id || cursor.id.length > 200) throw new Error();
      cursorSql = Prisma.sql`(created_date, source, id) < (${date.toISOString().slice(0, -1)}::timestamp, ${cursor.source}, ${cursor.id})`;
    } catch { throw Object.assign(new Error("Invalid audit page. Refresh the log."), { status: 400 }); }
  }
  const [candidates, counts] = await Promise.all([
    db.$queryRaw`${eventsSql} SELECT id, source, created_date, action_code, actor_id, actor_name, actor_username, actor_role,
      target_id, target_name, target_username, target_kind, category, context_metadata, LEFT(description, 350) AS description
      FROM records WHERE ${sourceSql} AND ${periodSql} AND ${searchSql} AND ${actionSql} AND ${selectedCategorySql} AND ${cursorSql}
      ORDER BY created_date DESC, source DESC, id DESC LIMIT 26`,
    db.$queryRaw`${eventsSql} SELECT COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE ${selectedCategorySql})::int AS selected_total,
      COUNT(*) FILTER (WHERE category = 'support')::int AS support,
      COUNT(*) FILTER (WHERE category = 'players')::int AS players,
      COUNT(*) FILTER (WHERE category = 'competition')::int AS competition,
      COUNT(*) FILTER (WHERE category = 'economy')::int AS economy,
      COUNT(*) FILTER (WHERE category = 'platform')::int AS platform,
      COUNT(*) FILTER (WHERE category = 'system')::int AS system
      FROM records WHERE ${sourceSql} AND ${periodSql} AND ${searchSql} AND ${actionSql}`,
  ]);
  const page = candidates.slice(0, 25);
  const contexts = await auditContexts(db, page);
  const rows = page.map(({ context_metadata: _context, ...row }, index) => ({ ...row, context: contexts[index], record_id: row.id, id: `${row.source}:${row.id}` }));
  const last = candidates[24];
  return { success: true, rows, total: counts[0].selected_total ?? counts[0].total,
    categories: { all: counts[0].total, ...Object.fromEntries(auditCategories.map(key => [key, counts[0][key] || 0])) },
    next_cursor: candidates.length > 25 && last ? Buffer.from(JSON.stringify({
      date: last.created_date.toISOString(), source: last.source, id: last.id,
    })).toString("base64url") : null };
}

const text = (value, length = 240) => typeof value === "string" && value.trim() ? value.trim().slice(0, length) : null;
const id = value => text(value, 200);
const count = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
const arrayCount = value => Array.isArray(value) ? new Set(value.filter(item => typeof item === "string" && item)).size : null;
const actionCode = metadata => metadata.action_type || metadata.action || metadata.event_type || metadata.event || "";
const mode = value => ({ "8s": "free8s", eights: "free8s", free8s: "free8s", free_8s: "free8s", money8s: "money8s", money_8s: "money8s",
  "money-8s": "money8s", xp: "xp", xpmatch: "xp", ranked: "ranked", rankedmatch: "ranked", tournament: "tournament", tournamentmatch: "tournament",
  challenge: "challenge", challengematch: "challenge", challenge_money: "challenge", challenge_team: "challenge", wager: "wagers", wagers: "wagers" })[String(value || "").toLowerCase()] || null;
const matchTableModes = { Wager: "wagers", XPMatch: "xp", RankedMatch: "ranked", TournamentMatch: "tournament", ChallengeMatch: "challenge" };
const contextSeed = row => {
  const raw = row.context_metadata || {};
  const saved = raw.audit_context || raw.case_context || {};
  const deleted = row.action_code === "delete_ticket";
  const ticketCount = count(saved.ticket_count) ?? count(raw.ticket_count) ?? arrayCount(raw.ticket_ids);
  const disputeCount = count(saved.dispute_count) ?? count(raw.dispute_count) ?? arrayCount(raw.dispute_ids);
  return { subject: text(saved.subject) || text(raw.subject), player_id: id(saved.player_id) || id(raw.player_id)
      || (/^(account|user|player)$/i.test(row.target_kind || "") ? id(row.target_id) : null),
    player_name: text(saved.player_name) || text(raw.player_name) || (row.target_kind === "Account" ? text(row.target_name) : null),
    match_id: id(saved.match_id) || id(raw.match_id), match_type: mode(saved.match_type || raw.match_type)
      || (row.category === "competition" && /tournament.*match/.test(row.action_code || "") ? "tournament" : null), match_name: text(saved.match_name) || text(raw.match_name),
    ticket_count: ticketCount, dispute_count: disputeCount,
    deleted_ticket_count: count(saved.deleted_ticket_count) ?? (deleted ? ticketCount : null),
    deleted_dispute_count: count(saved.deleted_dispute_count) ?? (deleted ? disputeCount : null),
    record_available: deleted ? false : null,
    historical_context_available: Boolean(text(saved.subject) || id(saved.player_id) || text(saved.player_name) || text(saved.match_name)),
  };
};

// Enrichment is bounded to the displayed page. Only safe presentation fields
// are projected; support messages, evidence and financial payloads never load.
async function auditContexts(db, rows) {
  const contexts = rows.map(contextSeed);
  const supportIds = [...new Set(rows.filter(row => row.category === "support" && row.action_code !== "delete_ticket").map(row => id(row.target_id)).filter(Boolean))];
  if (supportIds.length) {
    const cases = await db.$queryRaw`SELECT id, 'ticket' AS kind,
      jsonb_build_object('subject', metadata->'subject', 'player_id', COALESCE(metadata->'user_id', metadata->'reporter_id', metadata->'created_by_id'),
        'player_name', COALESCE(metadata->'username', metadata->'user_name', metadata->'reporter_name', metadata->'created_by_name'),
        'match_id', COALESCE(metadata->'match_id', metadata->'wager_id', CASE WHEN metadata->>'related_entity_type' <> 'Ticket' THEN metadata->'related_entity_id' END),
        'match_type', COALESCE(metadata->'match_type', metadata->'related_entity_type'),
        'match_name', COALESCE(metadata->'match_name', CASE WHEN metadata->>'team_a_name' IS NOT NULL AND metadata->>'team_b_name' IS NOT NULL
          THEN to_jsonb(CONCAT(metadata->>'team_a_name', ' vs ', metadata->>'team_b_name')) END, metadata->'tournament_name')) AS presentation
      FROM "Ticket" WHERE id IN (${Prisma.join(supportIds)})
      UNION ALL SELECT id, 'dispute', jsonb_build_object('subject', COALESCE(metadata->'subject', metadata->'reason'),
        'player_id', COALESCE(metadata->'reporter_id', metadata->'reported_by', metadata->'user_id'), 'player_name', COALESCE(metadata->'reporter_name', metadata->'reported_by_name', metadata->'username', metadata->'user_name'),
        'match_id', COALESCE(metadata->'match_id', metadata->'wager_id'), 'match_type', COALESCE(metadata->'match_type', metadata->'related_entity_type'),
        'match_name', metadata->'match_name') FROM "Dispute" WHERE id IN (${Prisma.join(supportIds)}) LIMIT 50`;
    rows.forEach((row, index) => {
      if (row.category !== "support" || row.action_code === "delete_ticket") return;
      const record = cases.find(entry => entry.id === row.target_id);
      contexts[index].record_available = Boolean(record);
      if (record) {
        const live = record.presentation || {}, context = contexts[index];
        context.subject ||= text(live.subject); context.player_id ||= id(live.player_id); context.player_name ||= text(live.player_name);
        context.match_id ||= id(live.match_id); context.match_type ||= mode(live.match_type); context.match_name ||= text(live.match_name);
      }
    });
  }
  const playerIds = [...new Set(contexts.map(context => context.player_id).filter(Boolean))];
  if (playerIds.length && db.user?.findMany) {
    const players = await db.user.findMany({ where: { id: { in: playerIds } }, select: { id: true, display_name: true, full_name: true, username: true }, take: 25 });
    for (const context of contexts) {
      const player = players.find(player => player.id === context.player_id);
      context.player_name = text(player?.display_name) || text(player?.full_name) || text(player?.username) || context.player_name;
    }
  }
  const matchIds = [...new Set(contexts.map(context => context.match_id).filter(Boolean))];
  if (matchIds.length) {
    const installed = await db.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname = current_schema()
      AND tablename IN ('Wager', 'XPMatch', 'RankedMatch', 'TournamentMatch', 'ChallengeMatch')`;
    const tables = Object.keys(matchTableModes).filter(table => installed.some(row => row.tablename === table));
    if (tables.length) {
      const matches = await db.$queryRaw(Prisma.sql`SELECT * FROM (${Prisma.join(tables.map(table => Prisma.sql`SELECT id,
        ${table === "Wager" ? Prisma.sql`CASE WHEN metadata->>'match_type' = '8s' THEN 'free8s' WHEN metadata->>'match_type' = 'money8s' THEN 'money8s' ELSE 'wagers' END` : Prisma.sql`${matchTableModes[table]}::text`} AS mode,
        COALESCE(NULLIF(metadata->>'title', ''), NULLIF(metadata->>'name', ''), NULLIF(metadata->>'match_name', ''),
          CASE WHEN NULLIF(metadata->>'team_a_name', '') IS NOT NULL AND NULLIF(metadata->>'team_b_name', '') IS NOT NULL
            THEN CONCAT(metadata->>'team_a_name', ' vs ', metadata->>'team_b_name') END,
          NULLIF(metadata->>'game_name', ''), NULLIF(metadata->>'game', '')) AS name
        FROM ${Prisma.raw(`"${table}"`)} WHERE id IN (${Prisma.join(matchIds)})`), " UNION ALL ")}) rooms LIMIT 125`);
      for (const context of contexts) {
        const match = matches.find(match => match.id === context.match_id && (!context.match_type || match.mode === context.match_type));
        if (match) { context.match_type ||= mode(match.mode); context.match_name ||= text(match.name); }
      }
    }
  }
  return contexts;
}

const ipFields = new Set(["ip", "ip_address", "ip_addresses", "registration_ip", "last_login_ip", "last_seen_ip", "ip_history"]);
function safeDetails(value, showIps, depth = 0) {
  if (depth > 10) return "Further nested details omitted";
  if (typeof value === "string") return value.length > 12000 ? `${value.slice(0, 12000)} [text shortened]` : value;
  if (Array.isArray(value)) return [...value.slice(0, 100).map((item) => safeDetails(item, showIps, depth + 1)),
    ...(value.length > 100 ? [`${value.length - 100} further entries omitted`] : [])];
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
    /password|token|secret|authorization|cookie|api.?key|webhook/i.test(key) || (!showIps && ipFields.has(key))
      ? "[redacted]" : safeDetails(item, showIps, depth + 1)]));
}

export async function getAdminAuditEntry(db, user, body = {}) {
  requireStaff(user);
  if (!["admin", "system"].includes(body.source) || typeof body.id !== "string") {
    throw Object.assign(new Error("Choose an audit entry."), { status: 400 });
  }
  const record = await db[body.source === "admin" ? "adminAction" : "systemLog"].findUnique({ where: { id: body.id } });
  if (!record) throw Object.assign(new Error("Audit entry no longer exists."), { status: 404 });
  const metadata = record.metadata || {}, action = actionCode(metadata), category = auditCategoryFor(action, body.source);
  const targetKind = metadata.entity_type || metadata.related_entity_type || (metadata.target_user_id && category !== "competition" ? "Account" : "Record");
  const [context] = await auditContexts(db, [{ action_code: action, category,
    target_id: metadata.target_user_id || metadata.target_id || metadata.entity_id || metadata.related_entity_id || metadata.match_id || metadata.details?.match_id || metadata.wager_id,
    target_kind: targetKind,
    context_metadata: { audit_context: metadata.audit_context || metadata.case_context, subject: metadata.subject,
      player_id: metadata.reporter_id || (category !== "competition" ? metadata.target_user_id : null),
      player_name: metadata.reporter_id ? metadata.reporter_name : category !== "competition" ? metadata.target_user_name || metadata.target_username : null,
      match_id: metadata.match_id || metadata.wager_id || metadata.details?.match_id, match_type: metadata.match_type || metadata.details?.match_type,
      match_name: metadata.match_name, ticket_ids: metadata.details?.ticket_ids, dispute_ids: metadata.details?.dispute_ids },
  }]);
  return { success: true, details: safeDetails(record.metadata, hasRole(user, "admin")), context, category };
}
