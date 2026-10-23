export const LIVE_SUPPORT_ROLES = ["moderator", "admin", "super_admin", "ceo", "developer"];
export const isLiveSupportStaff = user => Boolean(user?.is_admin || [user?.role, user?.admin_role].some(role => LIVE_SUPPORT_ROLES.includes(String(role || "").toLowerCase())));
export const liveSupportClosed = ticket => ["closed", "resolved", "rejected"].includes(ticket?.status);
export const isDevSupportMessage = message => message?.sender_staff === true && String(message.sender_name || "").trim().toLowerCase() === "dev";
export const liveSupportUnread = (ticket, staff) => Number(ticket?.[staff ? "support_customer_sequence" : "support_staff_sequence"] || 0)
  > Number(ticket?.[staff ? "support_staff_read" : "support_user_read"] || 0);

// Also protect the legacy Ticket endpoints used by account support pages.
export function supportTicketForViewer(ticket, user) {
  if (ticket?.request_type !== "live_support" || isLiveSupportStaff(user)) return ticket;
  const result = { ...ticket };
  for (const key of ["support_record_notes", "support_record_history", "support_favorite", "support_archived", "support_archived_by", "support_archived_at", "internal_notes"]) delete result[key];
  if (Array.isArray(result.messages)) result.messages = result.messages.filter(message => !message.internal);
  return result;
}
