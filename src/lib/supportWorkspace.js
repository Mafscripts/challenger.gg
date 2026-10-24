const filters = ["open", "closed", "all"];
const categories = ["all", "live", "calls", "disputes", "tickets", "money8s", "wagers", "tournament"];
const views = ["all", "new", "waiting", "mine", "awaiting", "saved"];
export const validSupportCaseId = value => typeof value === "string" && /^(ticket|dispute):[^:\s]{1,200}$/.test(value);
export const supportWorkspaceKey = (userId, role) => `topfragg:support-workspace:v1:${encodeURIComponent(userId || "")}:${encodeURIComponent(role || "")}`;
const cleanDraft = value => Object.fromEntries(["reply", "roomReply", "note", "reason", "tab", "decision", "target", "duration", "caseId"]
  .filter(key => typeof value?.[key] === "string").map(key => [key, value[key].slice(0, 12000)]));
export function normalizeSupportWorkspace(value = {}) {
  return {
    filter: filters.includes(value.filter) ? value.filter : "open",
    category: categories.includes(value.category) ? value.category : "all",
    view: views.includes(value.view) ? value.view : "all",
    search: typeof value.search === "string" ? value.search.slice(0, 150) : "",
    selectedId: validSupportCaseId(value.selectedId) ? value.selectedId : null,
    drafts: Object.fromEntries(Object.entries(value.drafts || {}).filter(([id]) => validSupportCaseId(id)).slice(-100).map(([id, draft]) => [id, cleanDraft(draft)])),
    scroll: Object.fromEntries(["inbox", "reader"].map(key => [key, Math.min(1000000, Math.max(0, Number(value.scroll?.[key]) || 0))])),
  };
}
export function readSupportWorkspace(key, storage) {
  try { return normalizeSupportWorkspace(JSON.parse((storage || globalThis.sessionStorage)?.getItem(key) || "{}")); } catch { return normalizeSupportWorkspace(); }
}
export function writeSupportWorkspace(key, value, storage) {
  try { (storage || globalThis.sessionStorage)?.setItem(key, JSON.stringify(normalizeSupportWorkspace(value))); } catch { /* Private browsing / a full session store must not block support. */ }
}
export function supportWorkspaceFromUrl(search, fallback) {
  const params = new URLSearchParams(search);
  if (!["case", "support_case", "view", "category", "status", "search"].some(key => params.has(key))) return fallback;
  const legacyCase = params.get("support_case");
  const selectedId = params.get("case") || (legacyCase ? `${params.get("kind") || "ticket"}:${legacyCase}` : null);
  return normalizeSupportWorkspace({ ...fallback, selectedId, filter: params.get("status"), category: params.get("category"), view: params.get("view"), search: params.get("search") || "" });
}
export function supportWorkspaceSearch(search, state) {
  const params = new URLSearchParams(search);
  for (const key of ["support_case", "kind"]) params.delete(key);
  for (const [key, value] of [["case", state.selectedId], ["view", state.view], ["category", state.category], ["status", state.filter], ["search", state.search]]) {
    if (value) params.set(key, value); else params.delete(key);
  }
  return params.toString();
}
