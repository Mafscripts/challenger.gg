import { prisma } from "../prisma.js";
import { publicUser, verifyToken } from "../auth.js";
import { hasRole } from "../roles.js";
import { evaluateAccess } from "../ban-enforcement.js";

export const requireAuth = async (req, res, next) => {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Authentication required" });

    const payload = verifyToken(token);
    let user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) return res.status(401).json({ error: "Authentication required" });
    if (user.email_verified !== true) {
      return res.status(403).json({
        error: "Email verification required",
        code: "EMAIL_VERIFICATION_REQUIRED",
      });
    }

    const premiumExpires = user.premium_expires ? new Date(user.premium_expires) : null;
    if (user.is_premium && premiumExpires && premiumExpires <= new Date()) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { is_premium: false },
      });
    }

    const access = await evaluateAccess({ req, user });
    if (access.blocked) {
      return res.status(access.status).json({ error: access.message, code: access.code });
    }
    user = access.user;

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
