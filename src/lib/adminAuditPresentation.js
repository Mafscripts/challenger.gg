// Present only known, useful audit fields. The original record belongs in the
// separate troubleshooting disclosure, never in the everyday event summary.
const record = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const present = (value) => value !== null && value !== undefined && value !== "";
const hidden = /\[(?:redacted|hidden|removed)\]|<redacted>|bearer\s+\S+|(?:password|secret|api[_ -]?key|access[_ -]?token)\s*[:=]\s*\S+|\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]+/i;
const opaque = /\b(?:[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}|c[a-z\d]{23,}|[a-z\d_-]{40,})\b/gi;
const categories = new Set(["support", "players", "competition", "economy", "platform", "system"]);
const text = (value, limit = 500) => {
  if (typeof value !== "string" || hidden.test(value)) return "";
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(opaque, "the record").replace(/\s+/g, " ").trim().slice(0, limit);
};
const name = (value) => {
  const object = record(value);
  const candidate = text(Object.keys(object).length ? object.display_name || object.full_name || object.name || object.username : value, 100);
  return candidate === "the record" || /^(?:unrecorded staff|unknown|undefined|null)$/i.test(candidate) ? "" : candidate;
};
const first = (...values) => values.find(present);
const count = (...values) => {
  for (const value of values) {
    if (Array.isArray(value)) return new Set(value.filter(item => typeof item === "string" && item.trim() && !hidden.test(item))).size;
    if (present(value) && ["number", "string"].includes(typeof value) && Number.isSafeInteger(Number(value)) && Number(value) >= 0) return Number(value);
  }
  return null;
};
const number = (value) => present(value) && ["number", "string"].includes(typeof value) && Number.isFinite(Number(value)) ? Number(value) : null;
const quantity = (value, singular, plural = `${singular}s`) => `${value.toLocaleString("en-US")} ${value === 1 ? singular : plural}`;
const cleanContext = (value) => Object.fromEntries(Object.entries(record(value)).filter(([, item]) => present(item)));

export function auditReadableLabel(value) {
  const label = text(value, 120);
  return label.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ")
    .replace(/\b(xp|ip|elo|ceo|vpn|cdl)\b/gi, word => word.toUpperCase())
    .replace(/^./, letter => letter.toUpperCase());
}

export function auditHumanValue(value) {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return Number.isFinite(value) ? value.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "";
  return text(value);
}

export function auditCategory(row = {}) {
  if (categories.has(row.category)) return row.category;
  const code = String(row.action_code || row.action_type || row.action || "").toLowerCase();
  if (/ticket|dispute|support/.test(code)) return "support";
  if (/announcement|notice|variant_rules|rules_update|free_eights_games/.test(code)) return "platform";
  if (/account|role|ban|suspend|suspension|warning|password|vpn|rank_review|rank_verif|user_badge|premium|name_trial|animated_name|user_name/.test(code)) return "players";
  if (/match|eights|8s|challenge|tournament|ranked|progression/.test(code)) return "competition";
  if (/wallet|credit|withdraw|marketplace|purchase|inventory|reward|referral|trade|item/.test(code)) return "economy";
  return row.source === "system" ? "system" : "platform";
}

const titles = {
  delete_ticket: "Support case deleted", support_season_cleanup: "Support case closed for cleanup",
  wallet_adjust: "Balance adjusted", withdrawal_process: "Withdrawal updated", role_change: "Player role changed",
  account_deleted: "Player account deleted", warning: "Player warned", ban: "Player banned", temporary_ban: "Temporary ban applied",
  email_ban: "Email ban applied", ip_ban: "IP ban applied", suspension: "Player suspended", remove_ban: "Ban removed",
  ranked_elo_adjustment: "Ranked ELO adjusted", ranked_stats_adjustment: "Ranked record corrected",
  match_result_override: "Match result corrected", match_cancel: "Match cancelled", match_cancelled: "Match cancelled", free_eights_result_reverted: "Free 8s result reverted",
  challenge_result: "Challenge result recorded", challenge_revert: "Challenge result reverted", challenge_cancel: "Challenge cancelled",
  challenge_kick: "Player removed from challenge", free_eights_player_kicked: "Player removed from Free 8s", eights_team_edit: "8s teams updated",
  screenshot_rank_review: "Game rank reviewed", user_vpn_access_allowed: "VPN access approved", user_vpn_access_removed: "VPN exception removed",
  temporary_password_set: "Temporary password set", premium_granted: "Premium granted", user_badges_update: "Player badges updated",
  tournament_match_reset: "Tournament match reset", tournament_match_correction: "Tournament result corrected",
  tournament_reset_bracket: "Tournament bracket reset", update_free_eights_games: "8s games and maps updated",
  progression_season_reset: "New season started", progression_category_reset: "Progression reset",
  animated_name_free_trial_activated: "Name effects trial started", animated_name_free_trial_stopped: "Name effects trial stopped",
};

function presentationFor(row = {}, details = {}, context = {}) {
  const metadata = record(details), values = record(metadata.details);
  const ctx = { ...cleanContext(metadata.case_context), ...cleanContext(values.case_context), ...cleanContext(metadata.audit_context),
    ...cleanContext(row.context), ...cleanContext(context) };
  const code = String(row.action_code || metadata.action_type || metadata.action || metadata.event_type || metadata.event || "").toLowerCase();
  const value = (key) => first(values[key], metadata[key]);
  const category = auditCategory({ ...row, action_code: code });
  const player = name(ctx.player_name) || name(row.target_name) || name(metadata.target_user) || name(metadata.target_user_name) || name(metadata.target_username);
  const rawSubject = text(ctx.subject || value("subject"), 180);
  const subject = /^[a-z]+(?:_[a-z]+)+$/.test(rawSubject) ? auditReadableLabel(rawSubject) : rawSubject;
  const match = name(ctx.match_name || value("match_name"));
  const target = player || "the player";
  const result = { title: titles[code] || auditReadableLabel(code) || (row.source === "system" ? "System event" : "Staff action"),
    category, tone: "neutral", summary: "", outcome: "", reason: "", facts: [], changes: [] };
  const fact = (label, input) => { const output = auditHumanValue(input); if (output) result.facts.push({ label, value: output }); };
  const change = (label, before, after, formatter = auditHumanValue) => {
    if (!present(before) || !present(after)) return false;
    const from = formatter(before), to = formatter(after);
    if (!from || !to || from === to) return false;
    result.changes.push({ label, before: from, after: to });
    return true;
  };
  const date = (input) => {
    if (!present(input) || !["string", "number"].includes(typeof input) || (typeof input === "string" && hidden.test(input))) return "";
    const parsed = new Date(input);
    return Number.isFinite(parsed.getTime()) ? parsed.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "";
  };
  const amount = (input) => {
    const parsed = number(input);
    if (parsed === null) return "";
    if (value("type") === "credits" || value("balance_type") === "credits") return `${parsed.toLocaleString("en-US")} credits`;
    const currency = /^[a-z]{3}$/i.test(String(value("currency") || "")) ? String(value("currency")).toUpperCase() : "USD";
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(parsed);
  };
  const reason = text(value("reason") || value("resolution") || value("processing_notes"), 1000);
  if (reason) result.reason = reason;
  if (subject) fact("Support request", subject);
  const playerTarget = ctx.player_name || category === "players" || category === "economy" || category === "support"
    || /player_kicked|challenge_kick|ranked_.*adjustment/.test(code);
  if (player && playerTarget) fact("Player", player);
  if (match) fact("Match", match);

  if (code === "delete_ticket" || code === "support_season_cleanup") {
    const tickets = count(ctx.deleted_ticket_count, ctx.ticket_count, value("ticket_ids"));
    const disputes = count(ctx.deleted_dispute_count, ctx.dispute_count, value("dispute_ids"));
    const removed = code === "delete_ticket";
    const counts = [tickets > 0 && quantity(tickets, "support ticket"), disputes > 0 && quantity(disputes, "linked dispute")].filter(Boolean);
    result.tone = removed ? "danger" : "success";
    result.outcome = removed ? "Permanently deleted" : "Closed";
    result.summary = counts.length ? `${counts.join(" and ")} ${tickets + disputes === 1 ? "was" : "were"} ${removed ? "permanently deleted" : "closed for cleanup"}.`
      : `The support case was ${removed ? "permanently deleted" : "closed for cleanup"}${player ? ` for ${player}` : ""}.`;
    if (tickets !== null) fact("Support tickets", tickets);
    if (disputes > 0) fact("Linked disputes", disputes);
    if (!removed && !result.reason) result.reason = text(metadata.summary, 1000);
    return result;
  }
  if (code === "wallet_adjust") {
    const operation = value("operation"), balance = value("type") === "credits" ? "Credits" : "Wallet balance";
    const amountValue = amount(value("amount"));
    const destination = value("type") === "credits" ? target : `${target === "the player" ? "the player's" : `${target}'s`} wallet`;
    result.tone = "warning"; result.outcome = "Balance updated";
    result.summary = amountValue && ["add", "remove"].includes(operation)
      ? `${operation === "add" ? "Added" : "Removed"} ${amountValue} ${operation === "add" ? "to" : "from"} ${destination}.`
      : `${balance} ${operation === "set" && amountValue ? `set to ${amountValue}` : "updated"} for ${target}.`;
    change(balance, first(value("balance_before"), value("before_balance")), first(value("balance_after"), value("after_balance")), amount);
    if (amountValue) fact(operation === "set" ? "Balance set to" : operation === "remove" ? "Removed" : operation === "add" ? "Added" : "Adjustment amount", amountValue);
    return result;
  }
  if (code === "withdrawal_process") {
    const status = text(value("status"));
    result.tone = /rejected|cancelled/.test(status) ? "danger" : /completed|approved/.test(status) ? "success" : "warning";
    result.summary = `Withdrawal ${status ? auditReadableLabel(status).toLowerCase() : "updated"}${player ? ` for ${player}` : ""}.`;
    result.outcome = status ? auditReadableLabel(status) : "";
    change("Withdrawal status", value("previous_status"), status, auditReadableLabel);
    fact("Amount", amount(value("amount")));
    return result;
  }
  if (code === "role_change") {
    const role = first(value("role"), value("new_role"), value("after_role"));
    result.tone = "access"; result.outcome = role ? `Role: ${auditReadableLabel(role)}` : "Role changed";
    result.summary = `${target === "the player" ? "The player's" : `${target}'s`} role was ${role ? `changed to ${auditReadableLabel(role)}` : "updated"}.`;
    if (!change("Player role", first(value("previous_role"), value("old_role"), value("before_role")), role, auditReadableLabel)) fact("New role", auditReadableLabel(role));
    return result;
  }
  if (["warning", "ban", "temporary_ban", "email_ban", "ip_ban", "suspension", "remove_ban", "account_deleted"].includes(code)) {
    const action = { warning: "received a warning", ban: "was banned", temporary_ban: "received a temporary ban", email_ban: "received an email ban",
      ip_ban: "received an IP ban", suspension: "was suspended", remove_ban: "had their ban removed", account_deleted: "had their account permanently deleted" }[code];
    result.tone = code === "remove_ban" ? "success" : code === "warning" ? "warning" : "danger";
    result.summary = `${player || "The player"} ${action}.`;
    result.outcome = { warning: "Warning recorded", ban: "Banned", temporary_ban: "Temporarily banned", email_ban: "Email ban", ip_ban: "IP ban",
      suspension: "Suspended", remove_ban: "Ban removed", account_deleted: "Permanently deleted" }[code];
    fact("Restriction ends", date(first(value("expires_date"), value("expires_at"), value("suspended_until"))));
    if (!result.reason && code !== "account_deleted") result.reason = text(metadata.description || row.description, 1000);
    return result;
  }
  if (code === "ranked_elo_adjustment" || code === "ranked_stats_adjustment") {
    result.tone = "competition"; result.outcome = "Ranked record updated";
    result.summary = `${code === "ranked_elo_adjustment" ? "Ranked ELO" : "Ranked season statistics"} corrected for ${target}.`;
    if (code === "ranked_elo_adjustment") change("Ranked ELO", value("before_elo"), value("after_elo"));
    else {
      const before = record(value("before")), after = record(value("after"));
      for (const [key, label] of [["wins", "Wins"], ["losses", "Losses"], ["win_streak", "Win streak"], ["peak_elo", "Peak ELO"], ["best_win_streak", "Best win streak"], ["matches_played", "Matches played"]]) change(label, before[key], after[key]);
    }
    return result;
  }
  if (code === "user_vpn_access_allowed" || code === "user_vpn_access_removed") {
    const allowed = code === "user_vpn_access_allowed";
    result.tone = "access"; result.summary = `VPN exception ${allowed ? "approved" : "removed"} for ${target}.`;
    result.outcome = allowed ? "VPN exception enabled" : "Standard connection protection restored";
    change("VPN exception", value("previous_allowed"), value("allowed"), input => typeof input === "boolean" ? input ? "Enabled" : "Disabled" : "");
    return result;
  }
  if (code === "temporary_password_set") {
    result.tone = "access"; result.summary = `A temporary password was set for ${target}.`; result.outcome = "Password change required at next sign-in";
    return result;
  }
  if (code === "premium_granted") {
    result.tone = "success"; result.summary = `Premium access granted to ${target}.`; result.outcome = "Premium granted";
    const days = number(value("days")); if (days !== null) fact("Added access", quantity(days, "day"));
    fact("Premium ends", date(value("premium_expires")));
    return result;
  }
  if (code === "screenshot_rank_review") {
    const decision = text(value("decision"));
    result.tone = "access"; result.summary = `Game rank reviewed for ${target}.`;
    result.outcome = decision === "set_rank" ? "Rank updated" : decision ? auditReadableLabel(decision) : "";
    if (!change("Game rank", value("previous_rank"), value("rank"), auditReadableLabel)) fact("Recorded rank", auditReadableLabel(value("rank")));
    return result;
  }
  if (category === "competition") {
    const cancelled = /cancel/.test(code), reverted = /revert|reset/.test(code);
    result.tone = cancelled ? "danger" : reverted ? "warning" : "competition";
    result.summary = text(row.description || metadata.description);
    if (!result.summary || result.summary.includes("the record")) result.summary = `${result.title}${match ? `: ${match}` : ""}.`;
    result.outcome = cancelled ? "Cancelled" : /result_reverted/.test(code) ? "Result reverted" : /challenge_result/.test(code) ? "Result recorded" : "";
    const winner = name(first(value("winner_name"), value("winning_team_name")));
    fact("Winner", winner); fact("Result action", auditReadableLabel(value("action")));
    const score = value("score");
    if (["string", "number"].includes(typeof score)) fact("Final score", score);
    else if (Array.isArray(score) && score.length === 2 && score.every(item => number(item) !== null)) fact("Final score", score.join(" – "));
    else if (number(record(score).alpha) !== null && number(record(score).bravo) !== null) fact("Final score", `${score.alpha} – ${score.bravo}`);
    const remaining = number(value("remaining_players")); if (remaining !== null) fact("Players remaining", remaining);
    const resetCategories = value("categories");
    if (Array.isArray(resetCategories)) fact("Reset categories", resetCategories.map(auditReadableLabel).filter(Boolean).join(", "));
    return result;
  }
  if (/announcement|notice|rules/.test(code)) {
    result.title = /rules/.test(code) ? "Rules updated" : "Website notice updated";
    result.tone = value("enabled") === false ? "warning" : "success";
    result.summary = /rules/.test(code) ? "The rules were updated." : "The website notice was updated.";
    if (typeof value("enabled") === "boolean") result.outcome = value("enabled") ? "Published" : "Disabled";
    fact("Title", text(value("title"), 180)); fact("Rule set", auditReadableLabel(first(value("rules_label"), value("kind"))));
    return result;
  }
  result.summary = text(row.description || metadata.description || metadata.summary || metadata.message);
  if (!result.summary || result.summary.includes("the record")) result.summary = row.source === "system" ? "A platform event was recorded." : "A staff action was recorded.";
  if (/fail|error|reject/.test(code)) result.tone = "danger";
  else if (/activat|grant|approv|complet|success|publish/.test(code)) result.tone = "success";
  else if (/stop|disable|reset/.test(code)) result.tone = "warning";
  return result;
}

export function auditEventPresentation(row = {}, details = {}, context = {}) {
  const result = presentationFor(row, details, context);
  const metadata = record(details), values = record(metadata.details);
  const ctx = { ...cleanContext(metadata.case_context), ...cleanContext(values.case_context), ...cleanContext(metadata.audit_context),
    ...cleanContext(row.context), ...cleanContext(context) };
  const actor = name(row.actor_name || metadata.admin_name || metadata.actor_name);
  const player = name(ctx.player_name || row.target_name);
  const match = name(ctx.match_name);
  const friendlyNames = new Set([actor, player, match].filter(Boolean));
  const replacements = new Map();
  const addReference = (reference, replacement) => {
    const isPlainName = friendlyNames.has(reference) && /^[\p{L}][\p{L} .'-]{0,99}$/u.test(reference);
    if (typeof reference !== "string" || !reference || reference === "system" || isPlainName) return;
    replacements.set(reference, replacement && replacement !== reference ? replacement : "the record");
  };
  addReference(row.record_id, "the event");
  if (row.id !== `${row.source}:${row.record_id}`) addReference(row.id, "the event");
  addReference(row.actor_id, actor || "the staff member");
  const targetLabel = player || (/match|wager|challenge/i.test(row.target_kind || "") ? match || "the match"
    : /ticket|dispute/i.test(row.target_kind || "") ? "the support case" : "the record");
  addReference(row.target_id, targetLabel);
  for (const source of [metadata, values, ctx]) {
    for (const key of ["admin_id", "actor_id", "performed_by"]) addReference(source[key], actor || "the staff member");
    for (const key of ["player_id", "target_user_id", "reporter_id"]) addReference(source[key], player || "the player");
    for (const key of ["match_id", "wager_id"]) addReference(source[key], match || "the match");
    for (const key of ["target_id", "entity_id", "related_entity_id"]) addReference(source[key], targetLabel);
    for (const key of ["ticket_ids", "dispute_ids"]) if (Array.isArray(source[key])) source[key].forEach(reference => addReference(reference, "the support case"));
  }
  const orderedReferences = [...replacements].sort(([a], [b]) => b.length - a.length);
  const scrubReferences = (input) => {
    let output = input;
    // Replace the longest references first so a short legacy ID cannot consume
    // part of a longer one. Boundary checks preserve ordinary names and words.
    for (const [reference, replacement] of orderedReferences) {
      const escaped = reference.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      output = output.replace(new RegExp(`(^|[^A-Za-z0-9])${escaped}(?=$|[^A-Za-z0-9])`, "g"), (_, prefix) => `${prefix}${replacement}`);
    }
    return output;
  };
  for (const key of ["title", "summary", "outcome", "reason"]) result[key] = scrubReferences(result[key]);
  result.facts = result.facts.map(fact => ({ ...fact, value: scrubReferences(fact.value) }));
  result.changes = result.changes.map(change => ({ ...change, before: scrubReferences(change.before), after: scrubReferences(change.after) }));
  return result;
}
