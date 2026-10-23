import { hasRole } from "./roles.js";
import { serializeRow } from "./entity.js";

export async function claimSupportTicket(db, user, { ticket_id, dispute_id, take_over = false } = {}) {
  if (!hasRole(user, "moderator")) throw Object.assign(new Error("Staff access required."), { status: 403 });
  const id = dispute_id || ticket_id;
  if (typeof id !== "string" || !id || id.length > 200) throw Object.assign(new Error("Choose a support case."), { status: 400 });
  return db.$transaction(async tx => {
    if (dispute_id) await tx.$executeRaw`SELECT id FROM "Dispute" WHERE id = ${id} FOR UPDATE`;
    else await tx.$executeRaw`SELECT id FROM "Ticket" WHERE id = ${id} FOR UPDATE`;
    const delegate = dispute_id ? tx.dispute : tx.ticket;
    const raw = await delegate.findUnique({ where: { id } });
    if (!raw) throw Object.assign(new Error("Support case not found."), { status: 404 });
    const ticket = serializeRow(raw);
    if (["closed", "resolved", "rejected"].includes(ticket.status)) throw Object.assign(new Error("This support case is closed."), { status: 409 });
    if (ticket.assigned_admin_id && ticket.assigned_admin_id !== user.id) {
      if (take_over !== true) throw Object.assign(new Error(`${ticket.assigned_admin_name || "Another staff member"} is already helping. An admin must explicitly take over first.`), { status: 409 });
      if (!hasRole(user, "admin")) throw Object.assign(new Error("Only an admin can take over an assigned case."), { status: 403 });
    }
    const joined = new Set([...(ticket.joined_staff_ids || []), ticket.assigned_admin_id].filter(Boolean));
    const firstJoinForStaff = !joined.has(user.id); joined.add(user.id);
    const name = user.display_name || user.full_name || user.username || "Staff";
    if (ticket.assigned_admin_id === user.id && !firstJoinForStaff) return { ticket, firstJoinForStaff: false, assignmentChanged: false };
    const date = new Date().toISOString();
    const saved = await delegate.update({ where: { id: ticket.id }, data: { metadata: { ...raw.metadata,
      status: dispute_id ? "under_review" : ticket.request_type === "live_support" || ticket.match_type === "xp" ? "in_progress" : "admin_joined",
      assigned_admin_id: user.id, assigned_admin_name: name, assigned_admin_role: user.role === "ceo" ? "admin" : user.role,
      joined_staff_ids: [...joined], joined_date: date,
      support_assignment_history: [...(ticket.support_assignment_history || []), { staff_id: user.id, staff_name: name,
        previous_staff_id: ticket.assigned_admin_id || null, take_over: Boolean(ticket.assigned_admin_id && ticket.assigned_admin_id !== user.id), created_date: date }],
    } } });
    return { ticket: serializeRow(saved), firstJoinForStaff, assignmentChanged: true };
  });
}
