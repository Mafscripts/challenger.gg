import { Prisma } from "@prisma/client";
import { hasRole } from "./roles.js";
import { serializeRow } from "./entity.js";

const closedStatuses = ["resolved", "closed", "rejected"];
const closed = (row) => closedStatuses.includes(row?.metadata?.status);
const requireStaff = (user, role = "moderator") => {
  if (hasRole(user, role)) return;
  throw Object.assign(new Error(`${role} access required`), { status: 403 });
};
const idsSql = (ids) => ids.length ? Prisma.join(ids) : Prisma.sql`NULL`;

// A match complaint belongs to its conversation. Older complaints without a
// conversation remain visible as standalone tickets rather than disappearing.
const queueSql = Prisma.sql`
  WITH queue AS (
    SELECT t.id, 'ticket' AS kind, t.created_date,
      (COALESCE(t.metadata->>'status', 'open') IN ('resolved', 'closed', 'rejected')
        AND NOT EXISTS (SELECT 1 FROM "Dispute" d
          WHERE (d.metadata->>'ticket_id' = t.id OR t.metadata->>'dispute_id' = d.id)
            AND COALESCE(d.metadata->>'status', 'pending') NOT IN ('resolved', 'closed', 'rejected'))) AS closed,
      (NULLIF(t.metadata->>'match_id', '') IS NOT NULL
        OR NULLIF(t.metadata->>'dispute_id', '') IS NOT NULL
        OR EXISTS (SELECT 1 FROM "Dispute" d WHERE d.metadata->>'ticket_id' = t.id)) AS match_ticket
    FROM "Ticket" t
    UNION ALL
    SELECT d.id, 'dispute' AS kind, d.created_date,
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
      COUNT(*) FILTER (WHERE NOT closed AND match_ticket)::int AS match_open FROM queue`;
  return { success: true, ...counts };
}

function readCursor(value) {
  if (!value) return null;
  try {
    const cursor = JSON.parse(Buffer.from(String(value), "base64url").toString("utf8"));
    const date = new Date(cursor.date);
    if (!Number.isFinite(date.getTime()) || !["ticket", "dispute"].includes(cursor.kind)
      || typeof cursor.id !== "string" || !cursor.id || cursor.id.length > 200) throw new Error();
    return { ...cursor, date };
  } catch {
    throw Object.assign(new Error("Invalid ticket page. Refresh the list."), { status: 400 });
  }
}

export async function getAdminTickets(db, user, payload = {}) {
  requireStaff(user);
  const cursor = readCursor(payload.cursor);
  const filter = ["all", "open", "closed"].includes(payload.filter) ? payload.filter : "all";
  const statusSql = filter === "all" ? Prisma.sql`TRUE` : Prisma.sql`closed = ${filter === "closed"}`;
  const cursorSql = cursor
    ? Prisma.sql`(created_date, kind, id) < (${cursor.date}, ${cursor.kind}, ${cursor.id})`
    : Prisma.sql`TRUE`;
  const candidates = await db.$queryRaw`${queueSql}
    SELECT * FROM queue WHERE ${statusSql} AND ${cursorSql}
    ORDER BY created_date DESC, kind DESC, id DESC LIMIT 11`;
  const page = candidates.slice(0, 10);
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
    return [{ id: `${row.kind}:${row.id}`, kind: row.kind, record_id: row.id,
      closed: row.closed, ticket: serialized, disputes: linked.map(serializeRow) }];
  });
  const last = page.at(-1);
  return { success: true, rows, next_cursor: candidates.length > 10 && last
    ? Buffer.from(JSON.stringify({ date: last.created_date.toISOString(), kind: last.kind, id: last.id })).toString("base64url") : null };
}

export async function deleteAdminTicket(db, user, payload = {}) {
  requireStaff(user, "admin");
  const id = String(payload.id || "");
  const kind = payload.kind;
  if (!id || !["ticket", "dispute"].includes(kind)) {
    throw Object.assign(new Error("Choose a ticket to delete."), { status: 400 });
  }
  return db.$transaction(async (tx) => {
    const seed = await tx[kind].findUnique({ where: { id } });
    if (!seed) throw Object.assign(new Error("Ticket no longer exists. Refresh the list."), { status: 404 });
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
    if ([...tickets.values(), ...disputes.values()].some((row) => !closed(row))) {
      throw Object.assign(new Error("Resolve or close this ticket and its linked match cases before deleting it."), { status: 409 });
    }
    if ([...tickets.values()].some(row => row.metadata?.request_type === "live_support" && (row.metadata.support_archived === true || row.metadata.support_favorite === true))) {
      throw Object.assign(new Error("This support conversation is saved. Remove it from favorites and restore it from the archive before deleting."), { status: 409 });
    }
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
    for (const table of ["Wager", "XPMatch", "RankedMatch", "TournamentMatch"]) {
      await tx.$executeRaw(Prisma.sql`UPDATE ${Prisma.raw(`"${table}"`)} SET metadata = metadata - ARRAY(
          SELECT key FROM (VALUES
            ('admin_request_ticket_id', metadata->>'admin_request_ticket_id' IN (${idsSql(ticketIds)})),
            ('support_ticket_id', metadata->>'support_ticket_id' IN (${idsSql(ticketIds)})),
            ('dispute_id', metadata->>'dispute_id' IN (${idsSql(disputeIds)}))
          ) AS pointers(key, matches) WHERE matches
        )
        WHERE metadata->>'admin_request_ticket_id' IN (${idsSql(ticketIds)})
          OR metadata->>'support_ticket_id' IN (${idsSql(ticketIds)}) OR metadata->>'dispute_id' IN (${idsSql(disputeIds)})`);
    }
    await tx.dispute.deleteMany({ where: { id: { in: disputeIds } } });
    await tx.ticket.deleteMany({ where: { id: { in: ticketIds } } });
    await tx.adminAction.create({ data: { metadata: {
      admin_id: user.id, admin_name: user.display_name || user.username || user.email,
      action: "delete_ticket", entity_type: "Ticket", entity_id: id,
      summary: `Deleted closed ticket ${id}`, details: { ticket_ids: ticketIds, dispute_ids: disputeIds },
    } } });
    return { success: true, deleted_ticket_ids: ticketIds, deleted_dispute_ids: disputeIds };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
