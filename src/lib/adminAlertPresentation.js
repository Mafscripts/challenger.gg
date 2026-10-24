const record = value => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const opaqueId = /\b(?:c[a-z\d]{23,}|[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}|[a-z\d_-]{40,})\b/gi;
const unavailable = /^(?:n\/?a|none|unknown|undefined|null|unavailable|host unavailable|opponent pending|open slot)$/i;
const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const kindLabels = { calls: "Admin request", evidence: "Evidence", disputes: "Dispute", platform: "Platform" };
const reviewedStates = new Set(["reviewed", "acknowledged", "resolved", "closed"]);

// Alert descriptions predate linked cases and often contain raw database IDs.
// Keep the known human context; the original values belong in Technical details.
export function alertPresentation(input = {}) {
  const row = record(input), context = record(row.context), match = record(row.match), supportCase = record(row.case);
  const ids = [...new Set([
    row.id, row.group_key, row.match_id, row.related_entity_id, row.ticket_id, row.dispute_id,
    row.user_id, row.requested_by, row.requested_by_user_id, match.id, supportCase.id,
  ].filter(value => typeof value === "string" && value.length >= 8))];
  const clean = (value, limit = 400) => {
    if (typeof value !== "string") return "";
    let output = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(opaqueId, "");
    for (const id of ids) output = output.replace(new RegExp(`(^|[^a-z\\d_-])${escapeRegex(id)}(?=$|[^a-z\\d_-])`, "gi"), "$1");
    output = output.replace(/\s+/g, " ").replace(/^[\s:·—–-]+|[\s:·—–-]+$/g, "").trim();
    return unavailable.test(output) ? "" : output.slice(0, limit);
  };
  const name = value => {
    const person = record(value);
    return clean(Object.keys(person).length ? person.display_name || person.full_name || person.name || person.username : value, 100);
  };
  const firstName = (...values) => values.map(name).find(Boolean) || "";
  const reporterName = firstName(row.reporter, context.reporter, row.requested_by_name, row.username);
  const assignedName = firstName(row.assigned_staff, context.assigned_staff, row.assigned_admin_name);
  const reviewedName = firstName(row.reviewed_by, context.reviewed_by, row.acknowledged_by_name);
  const rawTitle = clean(row.title || row.subject, 180);
  const message = typeof row.message === "string" ? row.message : typeof row.description === "string" ? row.description : "";
  const lines = message.split(/\r?\n/).map(line => clean(line)).filter(Boolean);
  const meaningfulLines = lines.filter(line => !/^(?:match|ticket|case|dispute|status|players|participants|teams|match reference)(?:\s*:|$)/i.test(line));
  const semantic = `${rawTitle} ${meaningfulLines.join(" ")} ${clean(row.request_type)}`;
  let kind = "platform";
  if (row.category === "evidence" || /(?:proof|evidence).*(?:ready|submitted|uploaded|review)|(?:ready|submitted|uploaded).*(?:proof|evidence)/i.test(semantic)) kind = "evidence";
  else if (row.category === "disputes" || /\bdispute\b|score discrepancy/i.test(semantic)) kind = "disputes";
  else if (row.category === "calls" || /admin[_ ]request|(?:admin|staff).*(?:request|assistance)|(?:request|need).*(?:admin|staff)|match support/i.test(semantic)) kind = "calls";

  const status = reviewedStates.has(String(row.status || "").toLowerCase()) ? "reviewed" : "needs_review";
  const priority = String(row.priority || row.severity || "normal").toLowerCase();
  const urgent = ["critical", "urgent", "emergency"].includes(priority);
  const priorityLabel = urgent ? "Urgent" : priority === "high" ? "High priority" : priority === "low" ? "Low priority" : "Standard";
  const title = kind === "evidence" ? "Evidence ready to review" : kind === "disputes" ? "Match dispute" : kind === "calls" ? "Admin requested" : rawTitle || "Platform alert";

  const pair = input => {
    const parts = typeof input === "string" ? input.split(/\s+(?:vs\.?|versus)\s+/i) : [];
    return parts.length === 2 && parts.every(value => name(value)) ? parts.map(name).join(" vs ") : "";
  };
  const names = input => Array.isArray(input) ? [...new Set(input.map(name).filter(Boolean))] : [];
  const playerNames = names(row.players), teamNames = names(row.teams);
  const legacyPlayersLine = lines.find(line => /^(?:players|participants)\s*:/i.test(line));
  const legacyTeamsLine = lines.find(line => /^teams\s*:/i.test(line));
  const legacyPair = meaningfulLines.map(pair).find(Boolean) || "";
  const labelNames = values => values.length === 2 ? values.join(" vs ") : values.length > 4 ? `${values.slice(0, 4).join(", ")} +${values.length - 4} more` : values.join(", ");
  const playersLabel = labelNames(playerNames) || pair(legacyPlayersLine?.replace(/^[^:]+:\s*/, ""));
  const teamsLabel = labelNames(teamNames) || pair(legacyTeamsLine?.replace(/^[^:]+:\s*/, "")) || pair([name(row.team_a_name), name(row.team_b_name)].filter(Boolean).join(" vs "));
  const recordedTitle = clean(match.title || row.match_title || context.match_title, 180);
  const genericTitle = /^(?:match|wager|xp match|ranked match|tournament match|team challenge|free 8s|money 8s)$/i.test(recordedTitle);
  const matchTitle = (genericTitle ? "" : recordedTitle) || teamsLabel || playersLabel || legacyPair || recordedTitle;

  let summary = meaningfulLines.filter(line => !pair(line)).join(" ");
  // Generated room boilerplate repeats the title and embeds technical context.
  if (/^(?:a player requested admin support|admin requested for (?:tournament|ranked|wager)|dispute submitted from .+ match room)/i.test(summary)) summary = "";
  if (!summary || summary.toLowerCase() === title.toLowerCase()) {
    summary = kind === "evidence" ? "Evidence is ready for staff review."
      : kind === "disputes" ? "Review the reported issue and evidence in the support case."
        : kind === "calls" ? `${reporterName || "A player"} requested staff assistance.` : "Review this platform alert.";
  }
  return {
    title, summary: summary.slice(0, 400), kind, kindLabel: kindLabels[kind], status,
    statusLabel: status === "reviewed" ? "Reviewed" : "Needs review",
    tone: status === "reviewed" ? "success" : urgent ? "danger" : "warning",
    priorityLabel, reporterName, assignedName, reviewedName, matchTitle, playersLabel, teamsLabel,
  };
}
