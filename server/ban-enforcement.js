import net from "node:net";
import { prisma } from "./prisma.js";
import { isCloudflareIp } from "../src/lib/cloudflareIps.js";

export const normalizeIpAddress = (value) => {
  let ip = String(value || "").trim();
  if (!ip) return null;

  if (ip.startsWith("[") && ip.includes("]")) {
    ip = ip.slice(1, ip.indexOf("]"));
  }
  const zoneIndex = ip.indexOf("%");
  if (zoneIndex !== -1) ip = ip.slice(0, zoneIndex);
  if (ip.toLowerCase().startsWith("::ffff:")) {
    const mappedIpv4 = ip.slice(7);
    if (net.isIP(mappedIpv4) === 4) ip = mappedIpv4;
  }

  if (net.isIP(ip) === 6) return new URL(`http://[${ip}]/`).hostname.slice(1, -1).toLowerCase();
  return net.isIP(ip) ? ip.toLowerCase() : null;
};

const isTrackableIp = (value) => {
  const ip = normalizeIpAddress(value);
  if (!ip) return false;
  if (isCloudflareIp(ip)) return false;
  if (ip === "0.0.0.0" || ip === "::") return false;
  if (ip === "::1" || ip.startsWith("127.")) return false;
  if (ip.startsWith("169.254.") || ip.startsWith("fe80:")) return false;
  if (ip.startsWith("10.") || ip.startsWith("192.168.") || /^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return false;
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(ip) || /^f[cd]/.test(ip)) return false;
  if (net.isIP(ip) === 4 && Number(ip.split(".")[0]) >= 224) return false;
  return true;
};

export const requestIpAddress = (req) => {
  const peer = normalizeIpAddress(req.socket?.remoteAddress);
  const trust = req.app?.get("trust proxy fn");
  const trusted = (ip, hop) => isCloudflareIp(ip) || (typeof trust === "function" && trust(ip, hop));
  const forwarded = String(req.headers?.["x-forwarded-for"] || "").split(",").map((ip) => ip.trim()).filter(Boolean).reverse();
  if (forwarded.length > 64) return null;
  let current = peer;
  let cloudflareSeen = isCloudflareIp(current);
  let hop = 0;
  // Walk from the TCP peer towards the visitor, stopping at the first untrusted
  // hop. A client cannot gain trust by inserting a Cloudflare address on the left.
  for (const value of forwarded) {
    if (!current || !trusted(current, hop)) break;
    if (isCloudflareIp(current)) cloudflareSeen = true;
    const next = normalizeIpAddress(value);
    if (!next) return null;
    current = next;
    hop += 1;
    if (cloudflareSeen && !isCloudflareIp(current)) break;
  }
  cloudflareSeen ||= isCloudflareIp(current);
  if (cloudflareSeen) {
    // Cloudflare supplies this header. Accept it only after establishing an
    // actual Cloudflare hop through the trusted right-hand side of the chain.
    const visitor = normalizeIpAddress(req.headers?.["cf-connecting-ip"]);
    if (isTrackableIp(visitor)) return visitor;
    if (visitor && /^(24\d|25[0-5])\./.test(visitor)) {
      const ipv6 = normalizeIpAddress(req.headers?.["cf-connecting-ipv6"]);
      if (net.isIP(ipv6 || "") === 6 && isTrackableIp(ipv6)) return ipv6;
    }
    return isTrackableIp(current) ? current : null;
  }
  if (isTrackableIp(current)) return current;
  // Support deployments where Express has already restored the visitor address.
  const ip = normalizeIpAddress(req.ip);
  if (isTrackableIp(ip)) return ip;
  if (peer && typeof trust === "function" && trust(peer, 0) && !forwarded.length) {
    const realIp = normalizeIpAddress(req.headers?.["x-real-ip"]);
    if (isTrackableIp(realIp)) return realIp;
  }
  return null;
};

export const knownUserIpAddresses = (user) => {
  const metadata = user?.metadata && typeof user.metadata === "object" ? user.metadata : {};
  const history = Array.isArray(metadata.ip_history)
    ? metadata.ip_history
    : (Array.isArray(user?.ip_history) ? user.ip_history : []);
  return [...new Set([
    metadata.last_login_ip,
    metadata.last_seen_ip,
    metadata.registration_ip,
    user?.last_login_ip,
    user?.last_seen_ip,
    user?.registration_ip,
    ...history.map((entry) => entry?.ip),
  ].map(normalizeIpAddress).filter(isTrackableIp))];
};

const metadataFor = (row) => (
  row?.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
    ? row.metadata
    : {}
);

const isActiveBan = (row, scope, now = Date.now()) => {
  const ban = metadataFor(row);
  if (ban.status !== "active") return false;
  if (!Array.isArray(ban.scope) || !ban.scope.includes(scope)) return false;
  const expiresAt = Date.parse(ban.expires_date || "");
  return !Number.isFinite(expiresAt) || expiresAt > now;
};

const findActiveScopedBan = async (scope, field, value) => {
  if (!value) return null;
  const rows = await prisma.ban.findMany({
    where: { metadata: { path: [field], equals: value } },
    orderBy: { created_date: "desc" },
    take: 50,
  });
  return rows.find((row) => isActiveBan(row, scope)) || null;
};

export const findActiveIpBan = async (ip) => {
  const normalizedIp = normalizeIpAddress(ip);
  return isTrackableIp(normalizedIp) ? findActiveScopedBan("ip", "ip", normalizedIp) : null;
};

export const findActiveEmailBan = async (email) => {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  return normalizedEmail ? findActiveScopedBan("email", "email", normalizedEmail) : null;
};

export const restrictionDetails = (access) => {
  const user = access.user;
  const history = Array.isArray(user?.metadata?.moderation_history) ? user.metadata.moderation_history : [];
  const latest = [...history].reverse().find((row) => access.code === "ACCOUNT_SUSPENDED"
    ? row.action === "suspension" : ["ban", "temporary_ban", "email_ban", "ip_ban"].includes(row.action));
  return {
    code: access.code,
    account_id: user?.id,
    reason: access.ban?.metadata?.reason || (access.code === "ACCOUNT_SUSPENDED" ? latest?.reason : user?.ban_reason) || latest?.reason || "Please contact the admin team for more information.",
    expires_at: access.ban?.metadata?.expires_date || (access.code === "ACCOUNT_SUSPENDED" ? user?.metadata?.suspended_until : user?.metadata?.ban_expires) || null,
    issued_at: access.ban?.created_date || latest?.date || null,
    account_name: user?.display_name || user?.username || "Your account",
  };
};

export const evaluateAccess = async ({ req, user }) => {
  const ip = requestIpAddress(req);
  const [ipBan, emailBan] = await Promise.all([
    findActiveIpBan(ip),
    user?.email ? findActiveEmailBan(user.email) : Promise.resolve(null),
  ]);

  if (ipBan) {
    return { blocked: true, status: 403, code: "IP_BANNED", message: "Your access has been restricted", ip, user, ban: ipBan };
  }
  if (emailBan) {
    return { blocked: true, status: 403, code: "ACCOUNT_BANNED", message: "Your account is banned", ip, user, ban: emailBan };
  }
  if (!user) return { blocked: false, ip, user };

  const now = Date.now();
  const suspendedUntil = Date.parse(user.metadata?.suspended_until || "");
  if (Number.isFinite(suspendedUntil) && suspendedUntil > now) {
    return { blocked: true, status: 403, code: "ACCOUNT_SUSPENDED", message: "Account is temporarily suspended", ip, user };
  }

  if (user.is_banned) {
    const banExpires = Date.parse(user.metadata?.ban_expires || "");
    if (Number.isFinite(banExpires) && banExpires <= now) {
      const updatedUser = await prisma.user.update({
        where: { id: user.id },
        data: {
          is_banned: false,
          ban_reason: null,
          metadata: { ...(user.metadata || {}), ban_expires: null },
        },
      });
      return { blocked: false, ip, user: updatedUser };
    }
    return { blocked: true, status: 403, code: "ACCOUNT_BANNED", message: "Your account is banned", ip, user };
  }

  return { blocked: false, ip, user };
};
