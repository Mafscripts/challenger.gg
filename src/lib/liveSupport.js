export const LIVE_SUPPORT_ROLES = ["moderator", "admin", "super_admin", "ceo", "developer"];
export const isLiveSupportStaff = user => Boolean(user?.is_admin || [user?.role, user?.admin_role].some(role => LIVE_SUPPORT_ROLES.includes(String(role || "").toLowerCase())));
export const liveSupportClosed = ticket => ["closed", "resolved", "rejected"].includes(ticket?.status);
export const liveSupportUnread = (ticket, staff) => Number(ticket?.[staff ? "support_customer_sequence" : "support_staff_sequence"] || 0)
  > Number(ticket?.[staff ? "support_staff_read" : "support_user_read"] || 0);
