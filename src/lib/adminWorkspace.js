const targetKeys = {
  player: "player", match: "match", caseId: "case", filter: "users_filter",
  search: "search", mode: "mode", state: "state", view: "view",
  category: "category", status: "status", action: "action", period: "period", source: "source",
};

export function adminTargetUrl({ tab = "dashboard", ...target } = {}) {
  const params = new URLSearchParams({ tab });
  for (const [key, parameter] of Object.entries(targetKeys)) {
    if (target[key] !== undefined && target[key] !== null && target[key] !== "") params.set(parameter, String(target[key]));
  }
  return `/admin?${params}`;
}

export function adminAlertDestination(alert = {}, ticket = {}) {
  const id = ticket.match_id || alert.match_id || alert.related_entity_id || ticket.related_entity_id;
  const routes = { xp: "xp-match", xpmatch: "xp-match", ranked: "ranked-match", rankedmatch: "ranked-match", "8s": "8s-match", eights: "8s-match", free8s: "8s-match", money8s: "8s-match", wager: "wagers-match", wagers: "wagers-match", tournament: "tournament-match", tournamentmatch: "tournament-match", challenge: "challenge-a-team", challengematch: "challenge-a-team", challenge_money: "challenge-a-team", challenge_team: "challenge-a-team" };
  for (const value of [ticket.action_url, alert.action_url]) {
    try {
      if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) continue;
      const url = new URL(value, "https://admin.local");
      const match = url.pathname.match(/^\/(8s-match|wagers-match|tournament-match|ranked-match|xp-match|match-room|challenge-a-team)\/([^/]+)$/);
      if (!match || (id && decodeURIComponent(match[2]) !== String(id))) continue;
      url.searchParams.delete("admin"); url.searchParams.set("support_view", "1");
      return { url: url.pathname + url.search, label: "Open match room" };
    } catch { /* Ignore malformed historic room links. */ }
  }
  const prefix = [ticket.match_details?.match_type, ticket.match_type, alert.match_type, ticket.related_entity_type, alert.related_entity_type]
    .map(type => routes[String(type || "").toLowerCase()]).find(Boolean);
  if (prefix && id) return { url: `/${prefix}/${encodeURIComponent(id)}?support_view=1`, label: "Open match room" };
  return { url: adminTargetUrl({ tab: "matches", search: id || "" }), label: id ? "Find linked match" : "Open match center" };
}

export function openAdminPlayer(userId) {
  if (typeof window === "undefined" || typeof userId !== "string" || !userId || userId.length > 200) return;
  window.dispatchEvent(new CustomEvent("topfragg:admin-player-open", { detail: { userId } }));
}

export function navigateAdminTarget(target) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("topfragg:admin-navigate", { detail: target }));
}

export function notifyAdminChanged(detail = {}) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("topfragg:admin-changed", { detail }));
}

export function isAdminWorkspaceQuery(key) {
  return (key[0] === "admin-console" && key[3] !== "tournamentLifecycle")
    || ["admin-player-dossier", "support-case-match", "support-case-chat", "support-inbox-counts", "admin-matches",
      "site-announcement", "admin-ban-appeals", "ban-appeal-conversation", "admin-competition-rewards"].includes(key[0]);
}
