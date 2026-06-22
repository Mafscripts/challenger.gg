import { prisma } from "../prisma.js";
import { publicUser, verifyToken } from "../auth.js";
import { hasRole } from "../roles.js";

export const requireAuth = async (req, res, next) => {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Authentication required" });

    const payload = verifyToken(token);
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.is_banned) return res.status(401).json({ error: "Authentication required" });

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
