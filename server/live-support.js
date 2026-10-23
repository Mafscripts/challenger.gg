import { activePremium } from "../src/lib/premiumMembership.js";
import { isLiveSupportStaff, LIVE_SUPPORT_ROLES, liveSupportClosed } from "../src/lib/liveSupport.js";
import { serializeRow } from "./entity.js";
import { randomUUID } from "node:crypto";

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const field = (key, value) => ({ metadata: { path: [key], equals: value } });
const label = user => String(user.display_name || user.full_name || user.username || "Player").slice(0, 80);
const scoped = (row, user) => {
  if (!row || row.metadata?.request_type !== "live_support") fail("Support conversation not found.", 404);
  if (!isLiveSupportStaff(user) && row.metadata.user_id !== user.id) fail("You cannot view this conversation.", 403);
  return serializeRow(row);
};
const publicMessage = message => ({ id: message.id, content: message.content, sender_id: message.sender_id, sender_name: message.sender_name,
  sender_staff: message.sender_staff === true, created_date: message.created_date, support_sequence: message.support_sequence });
const publicTicket = ticket => ({ support_premium: ticket.support_premium === true, id: ticket.id, user_id: ticket.user_id, username: ticket.username, status: ticket.status,
  assigned_admin_id: ticket.assigned_admin_id, assigned_admin_name: ticket.assigned_admin_name,
  support_sequence: ticket.support_sequence, support_user_read: ticket.support_user_read, support_staff_read: ticket.support_staff_read,
  support_customer_sequence: ticket.support_customer_sequence, support_staff_sequence: ticket.support_staff_sequence,
  support_last_message: ticket.support_last_message, support_last_message_date: ticket.support_last_message_date,
  context_path: ticket.context_path, created_date: ticket.created_date, updated_date: ticket.updated_date });

export async function readLiveSupport(db, user, body = {}) {
  const staff = isLiveSupportStaff(user);
  // Only summaries cross the database boundary while the chat is closed.
  const rows = await db.$queryRaw`SELECT id, created_date, updated_date,
    jsonb_build_object('user_id', metadata->'user_id', 'username', metadata->'username', 'status', metadata->'status',
      'assigned_admin_id', metadata->'assigned_admin_id', 'assigned_admin_name', metadata->'assigned_admin_name',
      'support_premium', metadata->'support_premium', 'support_sequence', metadata->'support_sequence', 'support_customer_sequence', metadata->'support_customer_sequence',
      'support_staff_sequence', metadata->'support_staff_sequence', 'support_user_read', metadata->'support_user_read',
      'support_staff_read', metadata->'support_staff_read', 'support_last_message', metadata->'support_last_message',
      'support_last_message_date', metadata->'support_last_message_date', 'context_path', metadata->'context_path') AS metadata
    FROM "Ticket" WHERE metadata->>'request_type' = 'live_support'
      AND (${staff} OR metadata->>'user_id' = ${user.id})
      AND (NOT ${staff} OR COALESCE(metadata->>'status', 'open') NOT IN ('closed', 'resolved', 'rejected'))
    ORDER BY CASE WHEN ${staff} AND metadata->>'support_premium' = 'true' THEN 0 ELSE 1 END, updated_date DESC, id DESC LIMIT 25`;
  const threads = rows.map(serializeRow).map(publicTicket);
  let ticket = null, messages = [];
  if (body.ticket_id) {
    if (typeof body.ticket_id !== "string" || body.ticket_id.length > 200) fail("Choose a conversation.");
    const raw = await db.ticket.findUnique({ where: { id: body.ticket_id } });
    const selected = scoped(raw, user);
    ticket = publicTicket(selected);
    messages = Number.isSafeInteger(body.known_sequence) && body.known_sequence === Number(selected.support_sequence || 0)
      ? null : (selected.messages || []).filter(message => !message.internal).map(publicMessage);
  }
  return { success: true, staff, threads, ticket, messages };
}

async function notify(tx, ticket, actor, staff, content, closed = false) {
  const targets = staff ? [{ id: ticket.user_id }] : await tx.user.findMany({ where: {
    OR: [{ role: { in: LIVE_SUPPORT_ROLES } }, { admin_role: { in: LIVE_SUPPORT_ROLES } }, { is_admin: true }],
    is_banned: false, email_verified: true,
  }, select: { id: true } });
  for (const target of targets) {
    if (target.id === actor.id) continue;
    await tx.notification.create({ data: { metadata: {
      user_id: target.id, type: "live_support", title: closed ? "Support conversation closed" : staff ? "Support replied" : ticket.support_premium ? "Premium live support request" : "Live support request",
      message: `${label(actor)}: ${content.slice(0, 140)}`, is_read: false,
      related_entity_id: ticket.id, related_entity_type: "Ticket", action_url: `/?support=${encodeURIComponent(ticket.id)}`,
    } } });
  }
}

export async function sendLiveSupport(db, user, body = {}, { now = () => new Date() } = {}) {
  const content = String(body.message || "").trim();
  if (!content || content.length > 2000) fail("Write a message of 1–2,000 characters.");
  if (typeof body.request_id !== "string" || !/^[a-zA-Z0-9-]{16,100}$/.test(body.request_id)) fail("Invalid message request. Please try again.");
  const staff = isLiveSupportStaff(user), timestamp = now().toISOString();
  return db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`live-support:${user.id}`}))`;
    const replay = await tx.message.findFirst({ where: { AND: [field("message_type", "live_support"), field("sender_id", user.id), field("client_message_id", body.request_id)] } });
    if (replay) {
      const original = scoped(await tx.ticket.findUnique({ where: { id: replay.metadata.ticket_id } }), user);
      if (body.ticket_id && body.ticket_id !== original.id) fail("This message request belongs to another conversation.", 409);
      return { success: true, ticket: publicTicket(original), message: publicMessage(serializeRow(replay)), replayed: true };
    }
    let id = body.ticket_id;
    if (!id) {
      if (staff) fail("Select a player conversation first.");
      const active = await tx.ticket.findFirst({ where: { AND: [field("request_type", "live_support"), field("user_id", user.id)], NOT: ["closed", "resolved", "rejected"].map(status => field("status", status)) } });
      id = active?.id;
      if (!id) {
        const created = await tx.ticket.create({ data: { metadata: {
          user_id: user.id, username: label(user), subject: "Live support", description: content, category: "support", request_type: "live_support",
          status: "open", support_premium: activePremium(user), priority: activePremium(user) ? "high" : "medium", participant_user_ids: [user.id], messages: [], internal_notes: [],
          support_sequence: 0, support_user_read: 0, support_staff_read: 0,
          context_path: typeof body.context_path === "string" && /^\/(?!\/)/.test(body.context_path) ? body.context_path.slice(0, 300) : "/",
        } } });
        id = created.id;
      }
    }
    if (typeof id !== "string" || id.length > 200) fail("Choose a conversation.");
    await tx.$executeRaw`SELECT id FROM "Ticket" WHERE id = ${id} FOR UPDATE`;
    const raw = await tx.ticket.findUnique({ where: { id } });
    const ticket = scoped(raw, user);
    if (liveSupportClosed(ticket)) fail("This conversation is closed. Start a new chat.", 409);
    const previous = ticket.messages || [];
    if (previous.length >= 500) fail("This conversation is full. Close it and start a new chat.", 409);
    if (!staff && ticket.support_last_customer_at && Date.parse(timestamp) - Date.parse(ticket.support_last_customer_at) < 1000) fail("Please wait a moment before sending another message.", 429);
    const sequence = Number(ticket.support_sequence || 0) + 1;
    const message = serializeRow(await tx.message.create({ data: { metadata: {
      ticket_id: id, conversation_id: id, message_type: "live_support", sender_id: user.id, sender_name: label(user),
      sender_staff: staff, sender_role: staff ? "staff" : "user", content, internal: false, client_message_id: body.request_id,
      support_sequence: sequence, created_date: timestamp,
    } } }));
    const metadata = { ...raw.metadata, messages: [...previous, message], support_sequence: sequence,
      support_last_message: content, support_last_message_date: timestamp,
      last_message: content, last_message_by: user.id, last_message_by_name: label(user), last_message_date: timestamp,
      status: staff ? "waiting_for_user" : ticket.assigned_admin_id ? "in_progress" : "open",
      ...(staff ? { support_staff_sequence: sequence, support_staff_read: sequence,
        assigned_admin_id: ticket.assigned_admin_id || user.id, assigned_admin_name: ticket.assigned_admin_name || label(user) }
        : { support_premium: activePremium(user), priority: activePremium(user) && ticket.priority !== "critical" ? "high" : ticket.priority, support_customer_sequence: sequence, support_user_read: sequence, support_last_customer_at: timestamp }),
    };
    const saved = serializeRow(await tx.ticket.update({ where: { id }, data: { metadata } }));
    await notify(tx, saved, user, staff, content);
    return { success: true, ticket: publicTicket(saved), message: publicMessage(message) };
  });
}

export async function updateLiveSupport(db, user, body = {}, close = false) {
  if (typeof body.ticket_id !== "string" || !body.ticket_id || body.ticket_id.length > 200) fail("Choose a conversation.");
  return db.$transaction(async tx => {
    await tx.$executeRaw`SELECT id FROM "Ticket" WHERE id = ${body.ticket_id} FOR UPDATE`;
    const raw = await tx.ticket.findUnique({ where: { id: body.ticket_id } });
    const ticket = scoped(raw, user), staff = isLiveSupportStaff(user);
    const sequence = Math.max(0, Math.min(Number(ticket.support_sequence || 0), Number.isSafeInteger(body.sequence) ? body.sequence : 0));
    const key = staff ? "support_staff_read" : "support_user_read";
    const metadata = { ...raw.metadata, [key]: Math.max(Number(ticket[key] || 0), sequence),
      ...(close ? { status: "closed", resolved_by: user.id, resolved_date: new Date().toISOString(), resolution: "Live support conversation ended." } : {}) };
    if (!close && metadata[key] === Number(ticket[key] || 0)) return { success: true, ticket: publicTicket(ticket) };
    const saved = serializeRow(await tx.ticket.update({ where: { id: ticket.id }, data: { metadata } }));
    if (close && !liveSupportClosed(ticket)) await notify(tx, saved, user, staff, "Support conversation closed.", true);
    return { success: true, ticket: publicTicket(saved) };
  });
}

const requireSupportStaff = user => { if (!isLiveSupportStaff(user)) fail("Staff access required.", 403); };
const recordDetails = ticket => ({ ...publicTicket(ticket), support_favorite: ticket.support_favorite === true,
  support_archived: ticket.support_archived === true, support_archived_by: ticket.support_archived_by,
  support_archived_at: ticket.support_archived_at, resolved_date: ticket.resolved_date, resolved_by: ticket.resolved_by,
  notes: ticket.support_record_notes || [], history: ticket.support_record_history || [] });

export async function readLiveSupportRecords(db, user, body = {}) {
  requireSupportStaff(user);
  if (body.ticket_id) {
    if (typeof body.ticket_id !== "string" || body.ticket_id.length > 200) fail("Choose a conversation.");
    const ticket = scoped(await db.ticket.findUnique({ where: { id: body.ticket_id } }), user);
    return { success: true, ticket: recordDetails(ticket), messages: (ticket.messages || []).filter(message => !message.internal).map(publicMessage) };
  }
  const view = ["all", "open", "closed", "favorites", "archived"].includes(body.view) ? body.view : "all";
  const search = String(body.search || "").trim().slice(0, 120);
  const page = Number.isSafeInteger(body.page) && body.page >= 0 && body.page <= 100000 ? body.page : 0;
  const rows = await db.$queryRaw`SELECT id, created_date, updated_date,
    jsonb_build_object('username', metadata->'username', 'user_id', metadata->'user_id', 'status', metadata->'status',
      'assigned_admin_name', metadata->'assigned_admin_name', 'support_favorite', metadata->'support_favorite',
      'support_archived', metadata->'support_archived', 'support_last_message', metadata->'support_last_message',
      'support_last_message_date', metadata->'support_last_message_date') AS metadata
    FROM "Ticket" WHERE metadata->>'request_type' = 'live_support'
      AND (${view} = 'all'
        OR (${view} = 'archived' AND metadata->>'support_archived' = 'true')
        OR (${view} = 'favorites' AND metadata->>'support_favorite' = 'true')
        OR (${view} = 'closed' AND metadata->>'status' IN ('closed', 'resolved', 'rejected') AND COALESCE(metadata->>'support_archived', 'false') <> 'true')
        OR (${view} = 'open' AND COALESCE(metadata->>'status', 'open') NOT IN ('closed', 'resolved', 'rejected')))
      AND (${search} = '' OR strpos(lower(concat_ws(' ', id, metadata->>'username', metadata->>'user_id', metadata->>'support_last_message')), lower(${search})) > 0)
    ORDER BY created_date DESC, id DESC LIMIT 26 OFFSET ${page * 25}`;
  return { success: true, rows: rows.slice(0, 25).map(serializeRow).map(ticket => {
    const { notes, history, ...summary } = recordDetails(ticket); return summary;
  }), page, next_page: rows.length > 25 ? page + 1 : null };
}

export async function manageLiveSupportRecord(db, user, body = {}) {
  requireSupportStaff(user);
  if (typeof body.ticket_id !== "string" || !body.ticket_id || body.ticket_id.length > 200) fail("Choose a conversation.");
  if (!["favorite", "archive", "note"].includes(body.action)) fail("Choose a valid record action.");
  if (body.action !== "note" && typeof body.value !== "boolean") fail("Choose whether to enable or disable this option.");
  const content = typeof body.note === "string" ? body.note.trim() : "";
  if (body.action === "note" && (!content || content.length > 4000 || typeof body.request_id !== "string" || !/^[a-zA-Z0-9-]{16,100}$/.test(body.request_id))) fail("Write a note of 1–4,000 characters and retry.");
  return db.$transaction(async tx => {
    await tx.$executeRaw`SELECT id FROM "Ticket" WHERE id = ${body.ticket_id} FOR UPDATE`;
    const raw = await tx.ticket.findUnique({ where: { id: body.ticket_id } });
    const ticket = scoped(raw, user), metadata = { ...raw.metadata };
    if (body.action === "archive" && body.value && !liveSupportClosed(ticket)) fail("End the chat before archiving it.", 409);
    if (body.action === "note" && (metadata.support_record_notes || []).some(note => note.request_id === body.request_id && note.author_id === user.id)) return { success: true, ticket: recordDetails(ticket) };
    if (body.action === "note" && (metadata.support_record_notes || []).length >= 500) fail("This record has reached its limit of 500 notes.", 409);
    const date = new Date().toISOString();
    let description;
    if (body.action === "note") {
      metadata.support_record_notes = [...(metadata.support_record_notes || []), { id: randomUUID(), request_id: body.request_id,
        author_id: user.id, author_name: label(user), content, created_date: date }];
      description = "Added an internal note";
    } else {
      const key = body.action === "archive" ? "support_archived" : "support_favorite";
      if (Boolean(metadata[key]) === body.value) return { success: true, ticket: recordDetails(ticket) };
      metadata[key] = body.value;
      if (body.action === "archive") { metadata.support_archived_by = body.value ? label(user) : null; metadata.support_archived_at = body.value ? date : null; }
      description = body.action === "archive" ? body.value ? "Archived conversation" : "Restored from archive" : body.value ? "Saved to favorites" : "Removed from favorites";
    }
    metadata.support_record_history = [...(metadata.support_record_history || []), { id: randomUUID(), actor_id: user.id, actor_name: label(user), action: body.action, description, created_date: date }];
    const saved = serializeRow(await tx.ticket.update({ where: { id: ticket.id }, data: { metadata } }));
    return { success: true, ticket: recordDetails(saved) };
  });
}
