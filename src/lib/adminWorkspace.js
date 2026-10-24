const targetKeys = {
  player: "player", match: "match", caseId: "case", filter: "users_filter",
  search: "search", mode: "mode", state: "state", view: "view",
  category: "category", status: "status", action: "action", period: "period",
};

export function adminTargetUrl({ tab = "dashboard", ...target } = {}) {
  const params = new URLSearchParams({ tab });
  for (const [key, parameter] of Object.entries(targetKeys)) {
    if (target[key] !== undefined && target[key] !== null && target[key] !== "") params.set(parameter, String(target[key]));
  }
  return `/admin?${params}`;
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
    || ["admin-player-dossier", "support-case-match", "support-case-chat", "support-inbox-counts", "admin-matches"].includes(key[0]);
}
