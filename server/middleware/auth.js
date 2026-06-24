import { prisma } from "../prisma.js";
import { publicUser, verifyToken } from "../auth.js";
import { hasRole } from "../roles.js";
import { listEntities } from "../entity.js";

export const requireAuth = async (req, res, next) => {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Authentication required" });

    const payload = verifyToken(token);
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) return res.status(401).json({ error: "Authentication required" });

    const activeBans = await listEntities("Ban", { status: "active" }, "-created_date", 500).catch(() => []);
    const blockingBan = activeBans.find((ban) => {
      const expires = ban.expires_date ? new Date(ban.expires_date) : null;
      if (expires && expires <= new Date()) return false;
      const scope = ban.scope || [];
      return scope.includes("email") && ban.email && ban.email === user.email;
    });
    if (blockingBan) return res.status(401).json({ error: "Authentication required" });

    const suspendedUntil = user.metadata?.suspended_until ? new Date(user.metadata.suspended_until) : null;
    const banExpires = user.metadata?.ban_expires ? new Date(user.metadata.ban_expires) : null;
    if (suspendedUntil && suspendedUntil > new Date()) {
      return res.status(403).json({ error: "Account is temporarily suspended" });
    }
    if (user.is_banned) {
      if (banExpires && banExpires <= new Date()) {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            is_banned: false,
            ban_reason: null,
            metadata: { ...(user.metadata || {}), ban_expires: null },
          },
        });
      } else {
        return res.status(401).json({ error: "Authentication required" });
      }
    }

    req.user = publicUser(user);
    req.userRow = user;
    next();
  } catch {
    res.status(401).json({ error: "Authentication required" });
  }
};

export const requireModerator = (req, res, next) => {
  if (!hasRole(req.user, "moderator")) return res.status(403).json({ error: "Moderator access required" });
  next();
};

export const requireAdmin = (req, res, next) => {
  if (!hasRole(req.user, "admin")) return res.status(403).json({ error: "Admin access required" });
  next();
};

export const requireSuperAdmin = (req, res, next) => {
  if (!hasRole(req.user, "super_admin")) return res.status(403).json({ error: "Super Admin access required" });
  next();
};

export const requireCEO = (req, res, next) => {
  if (!hasRole(req.user, "ceo")) return res.status(403).json({ error: "CEO access required" });
  next();
};
