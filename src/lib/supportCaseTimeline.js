const staffRoles = ["staff", "admin", "moderator", "developer", "ceo", "super_admin"];
const actionLabels = {
  approve_team_a: "Win awarded to Team Alpha", approve_team_b: "Win awarded to Team Bravo",
  cancel_match: "Match cancellation recorded", force_replay: "Replay ordered", resolve_dispute: "Report resolved",
  reject_dispute: "Report rejected", review_proof: "Evidence reviewed", ban_player: "Player ban recorded",
  season_cleanup: "Closed for season cleanup", save: "Conversation saved", archive: "Conversation archived", unarchive: "Conversation restored",
};

export function supportReporterId(row) {
  return row?.ticket?.user_id || row?.ticket?.reported_by || row?.disputes?.[0]?.reported_by || row?.disputes?.[0]?.reporter_id || null;
}

// This timeline uses stored support events only. A recorded decision is not a
// substitute for the current match/wallet state shown in their own sections.
export function supportCaseTimeline(row) {
  const events = [];
  const add = (event) => {
    if (!Number.isFinite(new Date(event.at || "").getTime())) return;
    events.push(event);
  };
  const records = [row?.ticket, ...(row?.disputes || [])].filter(Boolean);
  const primary = row?.ticket || records[0];
  if (primary) add({ key: `opened:${row.id}`, type: "request", title: "Support requested", actor: primary.user_name || primary.username || primary.reported_by_name || "Player", at: primary.created_date, text: primary.description });
  for (const record of records) {
    for (const [index, entry] of (record.support_assignment_history || []).entries()) add({ key: `assigned:${record.id}:${index}`, type: "assignment", title: entry.take_over ? "Case taken over" : "Case assigned", actor: entry.staff_name || "Staff", at: entry.created_date });
    if (!record.support_assignment_history?.length && record.assigned_admin_id && record.joined_date) add({ key: `assigned:${record.id}`, type: "assignment", title: "Case assigned", actor: record.assigned_admin_name || "Staff", at: record.joined_date });
    for (const [index, entry] of (record.messages || []).entries()) {
      if (entry.is_system || entry.sender_id === "system" || entry.type === "system") continue;
      const staff = entry.sender_staff || staffRoles.includes(entry.sender_role);
      add({ key: `message:${entry.id || `${record.id}:${index}`}`, type: entry.internal ? "note" : staff ? "staff" : "player", title: entry.internal ? "Private staff note" : staff ? "Staff replied" : "Player replied", actor: entry.sender_name || (staff ? "Staff" : "Player"), at: entry.created_date, text: entry.content });
    }
    for (const [index, entry] of [...(record.internal_notes || []), ...(record.support_record_notes || [])].entries()) add({ key: `note:${entry.id || `${record.id}:${index}`}`, type: "note", title: "Private staff note", actor: entry.sender_name || entry.author_name || "Staff", at: entry.created_date, text: entry.content });
    for (const [index, entry] of (record.support_record_history || []).entries()) add({ key: `history:${entry.id || `${record.id}:${index}`}`, type: "record", title: actionLabels[entry.action] || String(entry.action || "Case updated").replaceAll("_", " "), actor: entry.actor_name || "Staff", at: entry.created_date, text: entry.description });
    for (const [index, entry] of (record.review_actions || []).entries()) add({ key: `review:${entry.id || `${record.id}:${index}`}`, type: "decision", title: actionLabels[entry.action] || String(entry.action || "Staff review").replaceAll("_", " "), actor: entry.admin_name || "Staff", at: entry.created_date || entry.at, text: entry.notes });
    if (record.resolved_date) add({ key: `resolved:${record.id}`, type: "decision", title: record.support_cleanup ? "Case closed for cleanup" : "Resolution recorded", actor: record.resolved_by_name || "Staff", at: record.resolved_date, text: record.resolution || record.decision });
  }
  return [...new Map(events.map(event => [event.key, event])).values()].sort((a, b) => new Date(a.at) - new Date(b.at));
}
