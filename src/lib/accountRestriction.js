export const RESTRICTION_EVENT = "topfragg:account-restricted";
const KEY = "topfragg:restriction";
const TOKEN_KEY = "topfragg:appeal-token";
const codes = new Set(["ACCOUNT_BANNED", "ACCOUNT_SUSPENDED", "IP_BANNED"]);
let currentRestriction = null;
let currentAppealToken = null;
export const isRestriction = (data) => codes.has(data?.code) && Boolean(data?.restriction);
export function readRestriction() {
  try { return currentRestriction || JSON.parse(window.sessionStorage.getItem(KEY) || "null"); } catch { return currentRestriction; }
}
export function rememberRestriction(data) {
  if (!isRestriction(data) || typeof window === "undefined") return;
  currentRestriction = data.restriction;
  if (data.appeal_access_token) currentAppealToken = data.appeal_access_token;
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(data.restriction));
    if (data.appeal_access_token) window.sessionStorage.setItem(TOKEN_KEY, data.appeal_access_token);
  } catch { /* The current screen can still use the in-memory event. */ }
  window.dispatchEvent(new CustomEvent(RESTRICTION_EVENT, { detail: data.restriction }));
}
export function clearRestriction() {
  currentRestriction = null;
  currentAppealToken = null;
  try { window.sessionStorage.removeItem(KEY); window.sessionStorage.removeItem(TOKEN_KEY); } catch { /* Storage may be unavailable. */ }
}
export function appealHeaders() {
  try {
    const token = currentAppealToken || window.sessionStorage.getItem(TOKEN_KEY);
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch { return currentAppealToken ? { Authorization: `Bearer ${currentAppealToken}` } : {}; }
}
