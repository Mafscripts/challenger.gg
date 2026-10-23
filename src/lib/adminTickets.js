import { disputeReasonLabel } from "./matchDisputes";

export const closedTicket = (record) => ["resolved", "closed", "rejected"].includes(record?.status);
export const shortTicketId = (value) => String(value || "").slice(-8).toUpperCase();
export const ticketDate = (value) => value && Number.isFinite(new Date(value).getTime())
  ? new Date(value).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
export const ticketReporter = (row) => row.ticket?.username || row.disputes[0]?.reported_by_name || "Player";
export const isMatchTicket = (row) => Boolean(row.ticket?.match_id || row.disputes.length);
export const ticketIssue = (row) => {
  const reason = row.ticket?.dispute_reason || row.disputes[0]?.reason;
  return reason ? disputeReasonLabel(reason) : row.ticket?.requested_admin ? "Staff assistance requested" : "Support request";
};
export const ticketTitle = (row) => {
  const ticket = row.ticket;
  if (!ticket) return ticketIssue(row);
  const title = String(ticket.subject || "Support request");
  const matchId = ticket.match_id || ticket.related_entity_id;
  const cleaned = (matchId ? title.replaceAll(String(matchId), "") : title).trim();
  if (ticket.requested_admin) return cleaned.replace(/\s*match admin request\s*/i, "").trim() || "Match assistance";
  return cleaned || "Match support";
};
export const ticketDescription = (row) => {
  const description = row.ticket?.description || row.disputes[0]?.description || "";
  if (row.ticket?.requested_admin && (!description || /^A player requested admin support from .+ match room /i.test(description))) {
    return `${ticketReporter(row)} requested staff assistance in this match.`;
  }
  return description || "No description provided.";
};
export const ticketState = (row) => {
  if (row.closed) return { label: "Closed", tone: "closed" };
  if (closedTicket(row.ticket)) return { label: "Needs staff", tone: "open" };
  const status = row.ticket?.status || row.disputes[0]?.status;
  if (status === "waiting_for_user") return { label: "Awaiting player", tone: "waiting" };
  if (status === "escalated") return { label: "Escalated", tone: "urgent" };
  if (["admin_joined", "in_progress", "under_review"].includes(status)) return { label: "In progress", tone: "review" };
  return { label: "Needs staff", tone: "open" };
};
export const ticketRoomPath = (row) => {
  const ticket = row.ticket;
  const dispute = row.disputes[0];
  const id = ticket?.match_id || dispute?.match_id || dispute?.wager_id;
  if (!id) return null;
  const type = ticket?.match_type || dispute?.match_type;
  const prefix = { "8s": "8s-match", eights: "8s-match", money8s: "8s-match", xp: "xp-match", ranked: "ranked-match", tournament: "tournament-match" }[type] || "wagers-match";
  return `/${prefix}/${encodeURIComponent(id)}`;
};
