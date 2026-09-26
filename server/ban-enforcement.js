import net from "node:net";
import { prisma } from "./prisma.js";

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

  return net.isIP(ip) ? ip.toLowerCase() : null;
};

export const requestIpAddress = (req) => normalizeIpAddress(req.ip || req.socket?.remoteAddress);

export const knownUserIpAddresses = (user) => {
  const metadata = user?.metadata && typeof user.metadata === "object" ? user.metadata : {};
  const history = Array.isArray(metadata.ip_history) ? metadata.ip_history : [];
  return [...new Set([
    metadata.last_login_ip,
    metadata.registration_ip,
    user?.last_login_ip,
    user?.registration_ip,
    ...history.map((entry) => entry?.ip),
  ].map(normalizeIpAddress).filter(Boolean))];
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
  return normalizedIp ? findActiveScopedBan("ip", "ip", normalizedIp) : null;
};

export const findActiveEmailBan = async (email) => {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  return normalizedEmail ? findActiveScopedBan("email", "email", normalizedEmail) : null;
};

export const evaluateAccess = async ({ req, user }) => {
  const ip = requestIpAddress(req);
  const [ipBan, emailBan] = await Promise.all([
    findActiveIpBan(ip),
    user?.email ? findActiveEmailBan(user.email) : Promise.resolve(null),
  ]);

  if (ipBan) {
    return { blocked: true, status: 403, code: "IP_BANNED", message: "Access denied", ip, user };
  }
  if (emailBan) {
    return { blocked: true, status: 401, code: "ACCOUNT_BANNED", message: "Authentication required", ip, user };
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
    return { blocked: true, status: 401, code: "ACCOUNT_BANNED", message: "Authentication required", ip, user };
  }

  return { blocked: false, ip, user };
};
