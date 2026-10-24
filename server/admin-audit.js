import { Prisma } from "@prisma/client";
import { hasRole } from "./roles.js";

const requireStaff = (user) => {
  if (!hasRole(user, "moderator")) throw Object.assign(new Error("Moderator access required"), { status: 403 });
};
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
  ), records AS (
    SELECT e.id, e.source, e.created_date, e.action_code, e.actor_id, e.target_id, e.description,
      COALESCE(NULLIF(a.display_name, ''), NULLIF(a.full_name, ''), NULLIF(e.metadata->>'admin_name', ''), NULLIF(e.metadata->>'actor_name', ''),
        NULLIF(e.metadata->>'user_name', ''), e.metadata->'actor'->>'name',
        a.username,
        CASE WHEN e.source = 'system' OR e.actor_id = 'system' THEN 'System' ELSE 'Unrecorded staff' END) AS actor_name,
      a.username AS actor_username,
      COALESCE(NULLIF(e.metadata->>'admin_role', ''), NULLIF(e.metadata->>'actor_role', '')) AS actor_role,
      COALESCE(NULLIF(t.display_name, ''), NULLIF(t.full_name, ''), e.recorded_target, t.username) AS target_name,
      t.username AS target_username,
      COALESCE(NULLIF(e.metadata->>'entity_type', ''), NULLIF(e.metadata->>'related_entity_type', ''),
        CASE WHEN e.metadata->>'target_user_id' IS NOT NULL OR e.action_code = 'account_deleted' THEN 'Account'
          WHEN e.metadata->>'match_id' IS NOT NULL OR e.metadata->'details'->>'match_id' IS NOT NULL OR e.metadata->>'wager_id' IS NOT NULL THEN 'Match'
          ELSE 'Record' END) AS target_kind
    FROM identities e LEFT JOIN "User" a ON a.id = e.actor_id LEFT JOIN "User" t ON t.id = e.target_id
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
  const searchSql = search ? Prisma.sql`POSITION(${search} IN LOWER(CONCAT_WS(' ',
    REPLACE(action_code, '_', ' '), action_code, actor_name, actor_username, actor_id,
    target_name, target_username, target_id, target_kind, description))) > 0` : Prisma.sql`TRUE`;
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
      target_id, target_name, target_username, target_kind, LEFT(description, 350) AS description
      FROM records WHERE ${sourceSql} AND ${periodSql} AND ${searchSql} AND ${actionSql} AND ${cursorSql}
      ORDER BY created_date DESC, source DESC, id DESC LIMIT 26`,
    db.$queryRaw`${eventsSql} SELECT COUNT(*)::int AS total FROM records WHERE ${sourceSql} AND ${periodSql} AND ${searchSql} AND ${actionSql}`,
  ]);
  const rows = candidates.slice(0, 25).map((row) => ({ ...row, record_id: row.id, id: `${row.source}:${row.id}` }));
  const last = candidates[24];
  return { success: true, rows, total: counts[0].total,
    next_cursor: candidates.length > 25 && last ? Buffer.from(JSON.stringify({
      date: last.created_date.toISOString(), source: last.source, id: last.id,
    })).toString("base64url") : null };
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
  return { success: true, details: safeDetails(record.metadata, hasRole(user, "admin")) };
}
