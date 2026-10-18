import net from "node:net";

const CACHE_MS = 10 * 60 * 1000;
const ERROR_CACHE_MS = 15000;
const MAX_CACHE = 10000;
const MAX_PENDING = 100;
const cache = new Map();
const pending = new Map();
let configScope = "";
const errorFor = (code, message, status = 503) => Object.assign(new Error(message), { code, status });
const unavailable = () => errorFor("VPN_CHECK_UNAVAILABLE", "The connection security check is temporarily unavailable. Please try again shortly.");
export const isNetworkAccessError = (error) => ["VPN_BLOCKED", "VPN_CHECK_UNAVAILABLE"].includes(error?.code);
const normalize = (ip) => net.isIP(ip) === 6 ? new URL(`http://[${ip}]/`).hostname.slice(1, -1).toLowerCase() : ip;

async function lookupAddress(ip, key) {
  const url = new URL(`https://proxycheck.io/v3/${encodeURIComponent(ip)}`);
  url.searchParams.set("key", key);
  url.searchParams.set("ver", "24-June-2026");
  url.searchParams.set("tag", "0");
  // Only the visitor IP is submitted. Never forward user IDs, emails, cookies or tokens.
  const response = await fetch(url, { signal: AbortSignal.timeout(4500), redirect: "error" });
  if (!response.ok) throw unavailable();
  const data = await response.json();
  if (!["ok", "warning"].includes(data?.status)) throw unavailable();
  const row = data[ip] || Object.entries(data).find(([address]) => net.isIP(address) && normalize(address) === ip)?.[1];
  const detection = row?.detections;
  if (!detection || ["vpn", "proxy", "tor"].some((field) => typeof detection[field] !== "boolean")) throw unavailable();
  // Hosting, wireless networks and a high risk score alone are not VPN evidence.
  return detection.vpn || detection.proxy || detection.tor;
}

export async function assertNetworkAccess(ip, { vpnAllowed = false } = {}) {
  // Only callers holding the freshly loaded database user may grant this bypass.
  // Protected routes enforce bans first; the diagnostic route grants no account access.
  if (vpnAllowed === true) return;
  if (String(process.env.VPN_BLOCK_ENABLED || "false").toLowerCase() !== "true") return;
  const key = String(process.env.PROXYCHECK_API_KEY || "").trim();
  if (!key) throw unavailable();
  if (!ip || !net.isIP(ip)) {
    if (process.env.NODE_ENV !== "production") return; // Local development has no public visitor IP.
    throw unavailable();
  }
  ip = normalize(ip);
  const allowlist = String(process.env.VPN_ALLOWED_IPS || "").split(",").map((value) => value.trim()).filter((value) => net.isIP(value)).map(normalize);
  // An exception only bypasses VPN detection; account/email/IP bans run first.
  if (allowlist.includes(ip)) return;
  if (configScope !== key) { cache.clear(); configScope = key; }
  const cacheKey = `${key}:${ip}`;
  let verdict = cache.get(cacheKey);
  if (!verdict || verdict.expires <= Date.now()) {
    if (!pending.has(cacheKey)) {
      if (pending.size >= MAX_PENDING) throw unavailable();
      const check = lookupAddress(ip, key).then((blocked) => ({ blocked, expires: Date.now() + CACHE_MS }))
        .catch(() => ({ unavailable: true, expires: Date.now() + ERROR_CACHE_MS }))
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
  if (verdict.unavailable) throw unavailable();
  if (verdict.blocked) throw errorFor("VPN_BLOCKED", "VPN, proxy and Tor connections are not allowed. Turn them off and reconnect using your regular internet connection.", 403);
}
