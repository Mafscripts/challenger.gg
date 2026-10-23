import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { hasRole } from "./roles.js";
import { serializeRow } from "./entity.js";

const closedStatuses = ["resolved", "closed", "rejected"];
const closed = (row) => closedStatuses.includes(row?.metadata?.status);
const requireStaff = (user, role = "moderator") => {
  if (hasRole(user, role)) return;
  throw Object.assign(new Error(`${role} access required`), { status: 403 });
};
export const canManageSupportCleanup = user => [user?.role, user?.admin_role].some(role => ["ceo", "developer"].includes(String(role || "").toLowerCase()));
const requireCleanup = user => { if (!canManageSupportCleanup(user)) throw Object.assign(new Error("Only CEO and Developer can permanently delete support cases."), { status: 403 }); };
const requireBulkClose = user => { if (!hasRole(user, "admin") && !canManageSupportCleanup(user)) throw Object.assign(new Error("Admin access required to close cases in bulk."), { status: 403 }); };
const idsSql = (ids) => ids.length ? Prisma.join(ids) : Prisma.sql`NULL`;

// A match complaint belongs to its conversation. Older complaints without a
// conversation remain visible as standalone tickets rather than disappearing.
const queueSql = Prisma.sql`
  WITH queue AS (
    SELECT t.id, 'ticket' AS kind, t.created_date,
      CASE WHEN t.metadata->>'request_type' = 'live_support' THEN 'live'
        WHEN t.metadata->>'requested_admin' = 'true' THEN 'calls'
        WHEN NULLIF(t.metadata->>'dispute_id', '') IS NOT NULL OR EXISTS (SELECT 1 FROM "Dispute" d WHERE d.metadata->>'ticket_id' = t.id) THEN 'disputes' ELSE 'tickets' END AS channel,
      COALESCE(t.metadata->>'match_type', t.metadata->>'category', '') AS mode,
      CASE WHEN t.metadata->>'requested_admin' = 'true' THEN 3 WHEN t.metadata->>'priority' = 'critical' AND t.metadata->>'premium_escalated' = 'true' THEN 3 WHEN t.metadata->>'support_premium' = 'true' THEN 2 WHEN t.metadata->>'request_type' = 'live_support' THEN 1 ELSE 0 END AS priority,
      (NULLIF(t.metadata->>'dispute_id', '') IS NOT NULL OR EXISTS (SELECT 1 FROM "Dispute" d WHERE d.metadata->>'ticket_id' = t.id)) AS has_dispute,
      COALESCE(t.metadata->>'assigned_admin_id', '') AS owner,
      COALESCE(t.metadata->>'support_favorite', 'false') = 'true' AS saved,
      concat_ws(' ', t.id, t.metadata->>'subject', t.metadata->>'description', t.metadata->>'user_name', t.metadata->>'username', t.metadata->>'display_name', t.metadata->>'last_message') AS search_text,
      (COALESCE(t.metadata->>'status', 'open') IN ('resolved', 'closed', 'rejected')
        AND NOT EXISTS (SELECT 1 FROM "Dispute" d
          WHERE (d.metadata->>'ticket_id' = t.id OR t.metadata->>'dispute_id' = d.id)
            AND COALESCE(d.metadata->>'status', 'pending') NOT IN ('resolved', 'closed', 'rejected'))) AS closed,
      (NULLIF(t.metadata->>'match_id', '') IS NOT NULL
        OR NULLIF(t.metadata->>'dispute_id', '') IS NOT NULL
        OR EXISTS (SELECT 1 FROM "Dispute" d WHERE d.metadata->>'ticket_id' = t.id)) AS match_ticket
    FROM "Ticket" t
    UNION ALL
    SELECT d.id, 'dispute' AS kind, d.created_date, 'disputes' AS channel,
      COALESCE(d.metadata->>'match_type', 'wagers') AS mode,
      1 AS priority,
      TRUE AS has_dispute,
      COALESCE(d.metadata->>'assigned_admin_id', '') AS owner,
      COALESCE(d.metadata->>'support_favorite', 'false') = 'true' AS saved,
      concat_ws(' ', d.id, d.metadata->>'reason', d.metadata->>'description', d.metadata->>'reporter_name') AS search_text,
      COALESCE(d.metadata->>'status', 'pending') IN ('resolved', 'closed', 'rejected') AS closed,
      TRUE AS match_ticket
    FROM "Dispute" d
    WHERE NOT EXISTS (SELECT 1 FROM "Ticket" t
      WHERE d.metadata->>'ticket_id' = t.id OR t.metadata->>'dispute_id' = d.id)
  )`;

export async function getAdminTicketCounts(db, user) {
  requireStaff(user);
  const [counts] = await db.$queryRaw`${queueSql}
    SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE NOT closed)::int AS open,
      COUNT(*) FILTER (WHERE closed)::int AS closed,
      COUNT(*) FILTER (WHERE NOT closed AND match_ticket)::int AS match_open,
      COUNT(*) FILTER (WHERE NOT closed AND owner = '')::int AS waiting,
      COUNT(*) FILTER (WHERE NOT closed AND owner = ${user.id})::int AS mine,
      COUNT(*) FILTER (WHERE saved)::int AS saved,
      json_build_object(
        'all', COUNT(*) FILTER (WHERE NOT closed),
        'live', COUNT(*) FILTER (WHERE NOT closed AND channel = 'live'),
        'calls', COUNT(*) FILTER (WHERE NOT closed AND channel = 'calls'),
        'disputes', COUNT(*) FILTER (WHERE NOT closed AND has_dispute),
        'tickets', COUNT(*) FILTER (WHERE NOT closed AND channel = 'tickets'),
        'money8s', COUNT(*) FILTER (WHERE NOT closed AND mode IN ('money8s','8s','eights')),
        'wagers', COUNT(*) FILTER (WHERE NOT closed AND mode IN ('wager','wagers')),
        'tournament', COUNT(*) FILTER (WHERE NOT closed AND mode = 'tournament')
      ) AS categories FROM queue`;
  return { success: true, ...counts };
}

function readCursor(value) {
  if (!value) return null;
  try {
    const cursor = JSON.parse(Buffer.from(String(value), "base64url").toString("utf8"));
    const date = new Date(cursor.date);
    if (!Number.isFinite(date.getTime()) || !["ticket", "dispute"].includes(cursor.kind)
      || typeof cursor.id !== "string" || !cursor.id || cursor.id.length > 200) throw new Error();
    const priority = cursor.priority ?? 0;
    if (!Number.isInteger(priority) || priority < 0 || priority > 3) throw new Error();
    return { ...cursor, date, priority };
  } catch {
    throw Object.assign(new Error("Invalid ticket page. Refresh the list."), { status: 400 });
  }
}

export async function getAdminTickets(db, user, payload = {}) {
  requireStaff(user);
  const cursor = readCursor(payload.cursor);
  const filter = ["all", "open", "closed"].includes(payload.filter) ? payload.filter : "all";
  const statusSql = filter === "all" ? Prisma.sql`TRUE` : Prisma.sql`closed = ${filter === "closed"}`;
  const category = ["live", "calls", "disputes", "tickets", "money8s", "wagers", "tournament"].includes(payload.category) ? payload.category : "all";
  const categorySql = ["live", "calls", "tickets"].includes(category) ? Prisma.sql`channel = ${category}`
    : category === "disputes" ? Prisma.sql`has_dispute`
    : category === "money8s" ? Prisma.sql`mode IN ('money8s', '8s', 'eights')`
    : category === "wagers" ? Prisma.sql`mode IN ('wager', 'wagers')`
    : category === "tournament" ? Prisma.sql`mode = 'tournament'` : Prisma.sql`TRUE`;
  let selectedSql = Prisma.sql`TRUE`;
  if (payload.record_id) {
    if (typeof payload.record_id !== "string" || payload.record_id.length > 200 || !["ticket", "dispute"].includes(payload.kind)) throw Object.assign(new Error("Choose a valid support case."), { status: 400 });
    selectedSql = Prisma.sql`id = ${payload.record_id} AND kind = ${payload.kind}`;
  }
  const viewSql = payload.view === "waiting" ? Prisma.sql`owner = ''`
    : payload.view === "mine" ? Prisma.sql`owner = ${user.id}`
    : payload.view === "saved" ? Prisma.sql`saved` : Prisma.sql`TRUE`;
  const search = typeof payload.search === "string" ? payload.search.trim().slice(0, 150) : "";
  const searchSql = search ? Prisma.sql`strpos(lower(search_text), lower(${search})) > 0` : Prisma.sql`TRUE`;
  // Prisma reads timestamp-without-time-zone as UTC. Passing a Date back as a
  // timestamptz shifts the boundary in non-UTC sessions and repeats whole pages.
  const cursorSql = cursor
    ? Prisma.sql`(priority, created_date, kind, id) < (${cursor.priority}, ${cursor.date.toISOString().slice(0, -1)}::timestamp, ${cursor.kind}, ${cursor.id})`
    : Prisma.sql`TRUE`;
  const candidates = await db.$queryRaw`${queueSql}
    SELECT * FROM queue WHERE ${statusSql} AND ${categorySql} AND ${selectedSql} AND ${viewSql} AND ${searchSql} AND ${cursorSql}
    ORDER BY priority DESC, created_date DESC, kind DESC, id DESC LIMIT ${payload.selection_only === true ? 101 : 11}`;
  const limit = payload.selection_only === true ? 100 : 10;
  const page = candidates.slice(0, limit);
  if (payload.selection_only === true) {
    requireBulkClose(user);
    const last = page.at(-1);
    return { success: true, rows: page.map(row => ({ id: `${row.kind}:${row.id}`, record_id: row.id, kind: row.kind, closed: row.closed })),
      next_cursor: candidates.length > limit && last ? Buffer.from(JSON.stringify({ date: last.created_date.toISOString(), kind: last.kind, id: last.id, priority: last.priority || 0 })).toString("base64url") : null };
  }
  const ticketIds = page.filter((row) => row.kind === "ticket").map((row) => row.id);
  const orphanIds = page.filter((row) => row.kind === "dispute").map((row) => row.id);
  const tickets = ticketIds.length ? await db.ticket.findMany({ where: { id: { in: ticketIds } } }) : [];
  const disputeIds = [...orphanIds, ...tickets.map((row) => row.metadata?.dispute_id).filter(Boolean)];
  const [disputes, messages] = await Promise.all([
    db.$queryRaw`SELECT * FROM "Dispute" WHERE id IN (${idsSql(disputeIds)})
      OR metadata->>'ticket_id' IN (${idsSql(ticketIds)}) ORDER BY created_date DESC, id DESC`,
    ticketIds.length ? db.$queryRaw`SELECT * FROM "Message"
      WHERE metadata->>'ticket_id' IN (${idsSql(ticketIds)})
        OR metadata->>'conversation_id' IN (${idsSql(ticketIds)}) ORDER BY created_date, id` : [],
  ]);
  const rows = page.flatMap((row) => {
    const ticket = tickets.find((ticket) => ticket.id === row.id && row.kind === "ticket");
    const linked = disputes.filter((dispute) => row.kind === "dispute" ? dispute.id === row.id
      : dispute.metadata?.ticket_id === row.id || ticket?.metadata?.dispute_id === dispute.id);
    if (!ticket && !linked.length) return []; // It may have been deleted during the read.
    const serialized = serializeRow(ticket);
    if (serialized) {
      const conversation = new Map();
      for (const message of [...(serialized.messages || []), ...messages
        .filter((message) => message.metadata?.ticket_id === ticket.id || message.metadata?.conversation_id === ticket.id)
        .map(serializeRow)]) {
        const key = message.id || `${message.created_date}:${message.sender_id}:${message.content}`;
        conversation.set(key, message);
      }
      serialized.messages = [...conversation.values()].filter((message) => !message.internal)
        .sort((a, b) => new Date(a.created_date || 0) - new Date(b.created_date || 0));
    }
    const record = serialized || serializeRow(linked[0]);
    const incomingToken = supportIncomingToken(record);
    const unread = Boolean(incomingToken && record?.support_inbox_reads?.[user.id] !== incomingToken);
    if (serialized) delete serialized.support_inbox_reads;
    return [{ incoming_token: incomingToken, unread, id: `${row.kind}:${row.id}`, kind: row.kind, record_id: row.id,
      closed: row.closed, channel: row.channel, mode: row.mode, ticket: serialized, disputes: linked.map(serializeRow) }];
  });
  const last = page.at(-1);
  return { success: true, rows, next_cursor: candidates.length > 10 && last
    ? Buffer.from(JSON.stringify({ date: last.created_date.toISOString(), kind: last.kind, id: last.id, priority: last.priority || 0 })).toString("base64url") : null };
}

export async function getSupportInboxSummary(db, user) {
  requireStaff(user);
  const counts = await getAdminTicketCounts(db, user);
  const alerts = await db.notification.findMany({ where: { AND: [
    { metadata: { path: ["user_id"], equals: user.id } },
    { metadata: { path: ["is_read"], equals: false } },
    { OR: ["support", "admin_request", "dispute", "live_support"].map(type => ({ metadata: { path: ["type"], equals: type } })) },
  ] }, select: { id: true }, orderBy: [{ created_date: "desc" }, { id: "desc" }], take: 25 });
  return { ...counts, alerts: alerts.map(row => row.id) };
}

export async function deleteAdminTicket(db, user, payload = {}) {
  requireCleanup(user);
  const id = typeof payload.id === "string" ? payload.id : "";
  const kind = payload.kind;
  if (!id || id.length > 200 || !["ticket", "dispute"].includes(kind)) {
    throw Object.assign(new Error("Choose a ticket to delete."), { status: 400 });
  }
  const run = () => db.$transaction(async (tx) => {
    const group = await supportCaseGroup(tx, kind, id);
    if (!group) return { success: true, already_deleted: true, deleted_ticket_ids: kind === "ticket" ? [id] : [], deleted_dispute_ids: kind === "dispute" ? [id] : [] };
    const { tickets, disputes } = group;
    const ticketIds = [...tickets.keys()];
    const disputeIds = [...disputes.keys()];
    const recordIds = [...ticketIds, ...disputeIds];
    await tx.$executeRaw`DELETE FROM "Message" WHERE metadata->>'ticket_id' IN (${idsSql(ticketIds)})
      OR metadata->>'conversation_id' IN (${idsSql(ticketIds)})`;
    const alertRows = await tx.$queryRaw`DELETE FROM "AdminAlert"
      WHERE metadata->>'ticket_id' IN (${idsSql(ticketIds)}) OR metadata->>'dispute_id' IN (${idsSql(disputeIds)})
        OR metadata->>'related_entity_id' IN (${idsSql(recordIds)}) RETURNING id`;
    await tx.$executeRaw`DELETE FROM "Notification"
      WHERE metadata->>'ticket_id' IN (${idsSql(ticketIds)}) OR metadata->>'dispute_id' IN (${idsSql(disputeIds)})
        OR metadata->>'related_entity_id' IN (${idsSql([...recordIds, ...alertRows.map((row) => row.id)])})
        OR metadata->>'admin_alert_id' IN (${idsSql(alertRows.map((row) => row.id))})`;
    // Remove dead pointers only. Scores, rewards, match state and player history stay intact.
    // Older deployments may not have every match module installed. Referencing
    // an absent optional table aborts the entire transaction, including the delete.
    const installed = await tx.$queryRaw`SELECT tablename FROM pg_tables
      WHERE schemaname = current_schema() AND tablename IN ('Wager', 'XPMatch', 'RankedMatch', 'TournamentMatch')`;
    const matchTables = new Set(installed.map(row => row.tablename));
    for (const table of ["Wager", "XPMatch", "RankedMatch", "TournamentMatch"].filter(table => matchTables.has(table))) {
      await tx.$executeRaw(Prisma.sql`UPDATE ${Prisma.raw(`"${table}"`)} SET metadata = metadata - ARRAY(
          SELECT key FROM (VALUES
            ('admin_request_ticket_id', metadata->>'admin_request_ticket_id' IN (${idsSql(ticketIds)})),
            ('support_ticket_id', metadata->>'support_ticket_id' IN (${idsSql(ticketIds)})),
            ('dispute_id', metadata->>'dispute_id' IN (${idsSql(disputeIds)}))
          ) AS pointers(key, matches) WHERE matches
        ) || CASE WHEN metadata->>'admin_request_ticket_id' IN (${idsSql(ticketIds)})
          OR (NULLIF(metadata->>'admin_request_ticket_id', '') IS NULL AND metadata->>'support_ticket_id' IN (${idsSql(ticketIds)}))
          THEN '{"requested_admin":false,"admin_request_status":"resolved"}'::jsonb ELSE '{}'::jsonb END
        WHERE metadata->>'admin_request_ticket_id'  IN (${idsSql(ticketIds)})
          OR metadata->>'support_ticket_id' IN (${idsSql(ticketIds)}) OR metadata->>'dispute_id' IN (${idsSql(disputeIds)})`);
    }
    await tx.dispute.deleteMany({ where: { id: { in: disputeIds } } });
    await tx.ticket.deleteMany({ where: { id: { in: ticketIds } } });
    await tx.adminAction.create({ data: { metadata: {
      admin_id: user.id, admin_name: user.display_name || user.username || user.email,
      action: "delete_ticket", entity_type: "Ticket", entity_id: id,
      summary: `Deleted support case ${id}`, details: { ticket_ids: ticketIds, dispute_ids: disputeIds },
    } } });
    return { success: true, deleted_ticket_ids: ticketIds, deleted_dispute_ids: disputeIds };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20000 });
  for (let attempt = 0; ; attempt++) {
    try { return await run(); }
    catch (error) { if (error.code !== "P2034" || attempt >= 2) throw error; }
  }
}

// Saving is staff organisation only: conversations and their existing notes remain intact.
export async function saveSupportCase(db, user, payload = {}) {
  requireStaff(user);
  if (!["ticket", "dispute"].includes(payload.kind) || typeof payload.id !== "string" || !payload.id || payload.id.length > 200 || typeof payload.saved !== "boolean") {
    throw Object.assign(new Error("Choose a valid support case."), { status: 400 });
  }
  const table = Prisma.raw(payload.kind === "ticket" ? '"Ticket"' : '"Dispute"');
  const changed = await db.$executeRaw`UPDATE ${table} SET metadata = jsonb_set(metadata, '{support_favorite}', ${JSON.stringify(payload.saved)}::jsonb) WHERE id = ${payload.id}`;
  if (!changed) throw Object.assign(new Error("Support case no longer exists."), { status: 404 });
  return { success: true };
}

export function supportIncomingToken(record) {
  const messages = (record?.messages || []).filter(message => !message.internal && !message.is_system && !message.sender_staff && !["staff", "admin", "moderator", "developer", "ceo", "super_admin", "system"].includes(message.sender_role) && message.sender_id !== "system" && message.type !== "system");
  const latest = messages.at(-1);
  if (!latest) return record?.description ? createHash("sha256").update(JSON.stringify([record.created_date, record.description])).digest("hex") : null;
  return createHash("sha256").update(JSON.stringify([messages.length, latest.id, latest.support_sequence, latest.created_date, latest.sender_id, latest.content])).digest("hex");
}

export async function markSupportCaseRead(db, user, payload = {}) {
  requireStaff(user);
  if (!["ticket", "dispute"].includes(payload.kind) || typeof payload.id !== "string" || !payload.id || payload.id.length > 200 || !/^[a-f0-9]{64}$/.test(payload.token || "")) {
    throw Object.assign(new Error("Choose a valid conversation."), { status: 400 });
  }
  const table = Prisma.raw(payload.kind === "ticket" ? '"Ticket"' : '"Dispute"');
  const updated = await db.$executeRaw`UPDATE ${table} SET metadata = jsonb_set(metadata, '{support_inbox_reads}', COALESCE(metadata->'support_inbox_reads', '{}'::jsonb) || jsonb_build_object(${user.id}::text, ${payload.token}::text)) WHERE id = ${payload.id}`;
  if (!updated) throw Object.assign(new Error("Conversation no longer exists."), { status: 404 });
  return { success: true };
}

async function supportCaseGroup(tx, kind, id) {
    const seed = await tx[kind].findUnique({ where: { id } });
    if (!seed) return null;
    const tickets = new Map(kind === "ticket" ? [[id, seed]] : []);
    const disputes = new Map(kind === "dispute" ? [[id, seed]] : []);
    // Follow both historical link directions, including shared legacy cases.
    let previousSize = -1;
    while (previousSize !== tickets.size + disputes.size) {
      previousSize = tickets.size + disputes.size;
      const ticketIds = [...tickets.keys()];
      const disputeIds = [...new Set([...disputes.keys(), ...[...tickets.values()].map((row) => row.metadata?.dispute_id).filter(Boolean)])];
      const linkedDisputes = await tx.$queryRaw`SELECT * FROM "Dispute"
        WHERE id IN (${idsSql(disputeIds)}) OR metadata->>'ticket_id' IN (${idsSql(ticketIds)})`;
      linkedDisputes.forEach((row) => disputes.set(row.id, row));
      const linkedTicketIds = [...new Set([...ticketIds, ...[...disputes.values()].map((row) => row.metadata?.ticket_id).filter(Boolean)])];
      const linkedTickets = await tx.$queryRaw`SELECT * FROM "Ticket"
        WHERE id IN (${idsSql(linkedTicketIds)}) OR metadata->>'dispute_id' IN (${idsSql([...disputes.keys()])})`;
      linkedTickets.forEach((row) => tickets.set(row.id, row));
    }
    return { tickets, disputes };
}

export async function closeSupportCaseForCleanup(db, user, payload = {}) {
  requireBulkClose(user);
  if (!["ticket", "dispute"].includes(payload.kind) || typeof payload.id !== "string" || !payload.id || payload.id.length > 200 || typeof payload.reason !== "string" || !payload.reason.trim() || payload.reason.length > 1000) {
    throw Object.assign(new Error("Choose a support case and give a cleanup reason."), { status: 400 });
  }
  const run = () => db.$transaction(async tx => {
    const group = await supportCaseGroup(tx, payload.kind, payload.id);
    if (!group) return { success: true, already_deleted: true, closed_ticket_ids: [], closed_dispute_ids: [] };
    const timestamp = new Date().toISOString(), name = user.display_name || user.username || "Staff";
    for (const [kind, records] of [["ticket", group.tickets], ["dispute", group.disputes]]) {
      for (const record of records.values()) {
        if (closed(record)) continue;
        await tx[kind].update({ where: { id: record.id }, data: { metadata: { ...record.metadata,
          status: "closed", resolution: payload.reason.trim(), resolved_by: user.id, resolved_by_name: name, resolved_date: timestamp,
          support_cleanup: true,
          support_record_history: [...(record.metadata?.support_record_history || []), { action: "season_cleanup", actor_id: user.id, actor_name: name, description: payload.reason.trim(), created_date: timestamp }],
        } } });
      }
    }
    const ticketIds = [...group.tickets.keys()], disputeIds = [...group.disputes.keys()];
    const installed = await tx.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname = current_schema() AND tablename IN ('Wager', 'XPMatch', 'RankedMatch', 'TournamentMatch')`;
    for (const table of installed.map(row => row.tablename).filter(table => ["Wager", "XPMatch", "RankedMatch", "TournamentMatch"].includes(table))) {
      await tx.$executeRaw(Prisma.sql`UPDATE ${Prisma.raw(`"${table}"`)} SET metadata = metadata || jsonb_build_object('admin_request_status', 'resolved', 'requested_admin', false, 'admin_request_resolved_date', ${timestamp}::text)
        WHERE metadata->>'admin_request_ticket_id' IN (${idsSql(ticketIds)}) OR metadata->>'support_ticket_id' IN (${idsSql(ticketIds)})`);
    }
    await tx.$executeRaw`UPDATE "AdminAlert" SET metadata = metadata || '{"status":"resolved"}'::jsonb WHERE metadata->>'ticket_id' IN (${idsSql(ticketIds)}) OR metadata->>'dispute_id' IN (${idsSql(disputeIds)})`;
    await tx.adminAction.create({ data: { metadata: { admin_id: user.id, admin_name: name, action: "support_season_cleanup", entity_type: "Ticket", entity_id: payload.id,
      summary: payload.reason.trim(), details: { ticket_ids: ticketIds, dispute_ids: disputeIds } } } });
    return { success: true, closed_ticket_ids: ticketIds, closed_dispute_ids: disputeIds };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20000 });
  for (let attempt = 0; ; attempt++) { try { return await run(); } catch (error) { if (error.code !== "P2034" || attempt >= 2) throw error; } }
}

export async function getSupportCaseChat(db, user, payload = {}) {
  requireStaff(user);
  if (!["ticket", "dispute"].includes(payload.kind) || typeof payload.id !== "string" || !payload.id || payload.id.length > 200) throw Object.assign(new Error("Choose a support case."), { status: 400 });
  const group = await supportCaseGroup(db, payload.kind, payload.id);
  if (!group) throw Object.assign(new Error("Support case no longer exists."), { status: 404 });
  const records = [...group.tickets.values(), ...group.disputes.values()];
  const matchIds = [...new Set(records.map(row => row.metadata?.match_id || row.metadata?.wager_id || (row.metadata?.related_entity_type !== "Ticket" ? row.metadata?.related_entity_id : null)).filter(Boolean))];
  if (!matchIds.length) return { success: true, messages: [], has_match: false };
  const rows = await db.$queryRaw`SELECT * FROM "ChatMessage" WHERE metadata->>'conversation_id' IN (${idsSql(matchIds)})
    AND COALESCE(metadata->>'internal', 'false') <> 'true'
    ORDER BY created_date DESC, id DESC LIMIT 100`;
  return { success: true, messages: rows.reverse().map(serializeRow), has_match: true, limit: 100 };
}
