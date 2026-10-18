import net from "node:net";

const CACHE_MS = 10 * 60 * 1000;
const ERROR_CACHE_MS = 15000;
const MAX_CACHE = 10000;
const MAX_PENDING = 100;
const cache = new Map();
const pending = new Map();
let configScope = "";
const lastWarnings = new Map();
const errorFor = (code, message, status = 503) => Object.assign(new Error(message), { code, status });
const unavailable = (reason = "provider_unavailable") => Object.assign(
  errorFor("VPN_CHECK_UNAVAILABLE", "The connection security check is temporarily unavailable. Please try again shortly."),
  { networkReason: reason },
);
export const isNetworkAccessError = (error) => ["VPN_BLOCKED", "VPN_CHECK_UNAVAILABLE"].includes(error?.code);
// Temporarily paused at the owner's request. Existing production settings with
// VPN_BLOCK_ENABLED=true must not keep calling an exhausted provider after deploy.
// Both flags must explicitly enable checks before Proxycheck is used again.
export const networkProtectionPaused = () => String(process.env.PROXYCHECK_PAUSED ?? "true").trim().toLowerCase() !== "false";
export const networkProtectionEnabled = () => !networkProtectionPaused()
  && String(process.env.VPN_BLOCK_ENABLED || "false").trim().toLowerCase() === "true";
const normalize = (ip) => net.isIP(ip) === 6 ? new URL(`http://[${ip}]/`).hostname.slice(1, -1).toLowerCase() : ip;

function reportUnavailable(reason) {
  const now = Date.now();
  if (now - (lastWarnings.get(reason) || 0) < 30000) return;
  lastWarnings.set(reason, now);
  // Never log the provider URL, response body, visitor IP or API key.
  console.warn("[Network protection] Check unavailable", { reason });
}

function providerFailureReason(response, data) {
  // Inspect provider text only to choose a fixed diagnostic code. Raw messages
  // can contain request details and must never reach logs or public responses.
  const message = typeof data?.message === "string" ? data.message.toLowerCase() : "";
  if (/\b100 queries exhausted\b/.test(message)) return "provider_unregistered_quota_exceeded";
  if (/exhausted|daily.*(?:limit|allowance)|quota/.test(message)) return "provider_quota_exceeded";
  if (response.status === 401 || /(?:api.?key|key).*(?:invalid|disabled|expired|missing|incorrect)|(?:invalid|missing|incorrect).*key/.test(message)) return "provider_key_rejected";
  if (response.status === 429 || /requests per second|rate.?limit/.test(message)) return "provider_rate_limited";
  if (response.status === 403 || data?.status === "denied") return "provider_access_denied";
  if (response.status >= 500) return "provider_unavailable";
  return "provider_invalid_response";
}

async function lookupAddress(ip, key) {
  const url = new URL(`https://proxycheck.io/v3/${encodeURIComponent(ip)}`);
  url.searchParams.set("key", key);
  url.searchParams.set("ver", "24-June-2026");
  url.searchParams.set("tag", "0");
  // Only the visitor IP is submitted. Never forward user IDs, emails, cookies or tokens.
  let response;
  try { response = await fetch(url, { signal: AbortSignal.timeout(4500), redirect: "error" }); }
  catch (error) { throw unavailable(["AbortError", "TimeoutError"].includes(error?.name) ? "provider_timeout" : "provider_connection_failed"); }
  let data;
  try { data = await response.json(); }
  catch { throw unavailable(response.status >= 500 ? "provider_unavailable" : "provider_invalid_response"); }
  if (!response.ok || !["ok", "warning"].includes(data?.status)) throw unavailable(providerFailureReason(response, data));
  const row = data[ip] || Object.entries(data).find(([address]) => net.isIP(address) && normalize(address) === ip)?.[1];
  const detection = row?.detections;
  if (!detection || ["vpn", "proxy", "tor"].some((field) => typeof detection[field] !== "boolean")) throw unavailable("provider_invalid_response");
  // Hosting, wireless networks and a high risk score alone are not VPN evidence.
  return detection.vpn || detection.proxy || detection.tor;
}

export async function assertNetworkAccess(ip, { vpnAllowed = false } = {}) {
  // Only callers holding the freshly loaded database user may grant this bypass.
  // Protected routes enforce bans first; the diagnostic route grants no account access.
  const protectionEnabled = networkProtectionEnabled();
  const allowedResult = (reason, checked = false) => ({ allowed: true, protection_enabled: protectionEnabled, checked, reason });
  if (!protectionEnabled) return allowedResult(networkProtectionPaused() ? "protection_paused" : "protection_disabled");
  if (!ip || !net.isIP(ip)) {
    // A missing NODE_ENV must never turn a missing visitor IP into unrestricted access.
    throw unavailable("visitor_ip_missing");
  }
  if (vpnAllowed === true) return allowedResult("account_exception");
  const key = String(process.env.PROXYCHECK_API_KEY || "").trim();
  if (!key) throw unavailable("provider_key_missing");
  ip = normalize(ip);
  const allowlist = String(process.env.VPN_ALLOWED_IPS || "").split(",").map((value) => value.trim()).filter((value) => net.isIP(value)).map(normalize);
  // An exception only bypasses VPN detection; account/email/IP bans run first.
  if (allowlist.includes(ip)) return allowedResult("ip_exception");
  if (configScope !== key) { cache.clear(); configScope = key; }
  const cacheKey = `${key}:${ip}`;
  let verdict = cache.get(cacheKey);
  let reason = "cached_check";
  if (!verdict || verdict.expires <= Date.now()) {
    reason = "provider_check";
    if (!pending.has(cacheKey)) {
      if (pending.size >= MAX_PENDING) throw unavailable();
      const check = lookupAddress(ip, key).then((blocked) => ({ blocked, expires: Date.now() + CACHE_MS }))
        .catch((error) => {
          const reason = isNetworkAccessError(error) ? error.networkReason : "provider_unavailable";
          reportUnavailable(reason);
          return { unavailable: true, reason, expires: Date.now() + ERROR_CACHE_MS };
        })
        .then((value) => {
          cache.delete(cacheKey);
          if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value);
          cache.set(cacheKey, value);
          return value;
        }).finally(() => pending.delete(cacheKey));
      pending.set(cacheKey, check);
    }
    verdict = await pending.get(cacheKey);
  }
  if (verdict.unavailable) throw unavailable(verdict.reason);
  if (verdict.blocked) throw Object.assign(
    errorFor("VPN_BLOCKED", "VPN, proxy and Tor connections are not allowed. Turn them off and reconnect using your regular internet connection.", 403),
    { networkReason: "vpn_proxy_or_tor_detected" },
  );
  return allowedResult(reason, true);
}
