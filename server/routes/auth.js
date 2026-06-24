import { Router } from "express";
import { prisma } from "../prisma.js";
import {
  createUserWithPassword,
  ensureUserRecords,
  publicUser,
  signUser,
  updateUserIdentity,
  verifyPassword,
} from "../auth.js";
import { requireAuth } from "../middleware/auth.js";
import { dataForEntity } from "../entity.js";

const router = Router();

const requestIp = (req) => {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || req.ip || req.socket?.remoteAddress || "unknown";
};

const recordIp = async (user, req, field) => {
  const ip = requestIp(req);
  const metadata = user.metadata || {};
  const ipHistory = Array.isArray(metadata.ip_history) ? metadata.ip_history : [];
  const nextHistory = [
    ...ipHistory,
    { ip, event: field, date: new Date().toISOString() },
  ].slice(-50);
  return prisma.user.update({
    where: { id: user.id },
    data: dataForEntity("User", {
      [field]: ip,
      ip_history: nextHistory,
    }, metadata),
  });
};

export const registerHandler = async (req, res, next) => {
  try {
    let user = await createUserWithPassword(req.body || {});
    user = await recordIp(user, req, "registration_ip");
    const bootstrap = await ensureUserRecords(user);
    res.json({
      access_token: signUser(bootstrap.user),
      user: bootstrap.user,
      email_verification_required: false,
    });
  } catch (error) {
    next(error);
  }
};

router.post("/register", registerHandler);

router.post("/login", async (req, res, next) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user?.password_hash || !await verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const withIp = await recordIp(user, req, "last_login_ip");
    const loginUser = withIp.email_verified === true
      ? withIp
      : await prisma.user.update({
        where: { id: withIp.id },
        data: dataForEntity("User", {
          email_verified: true,
          email_verification_code: null,
          email_verification_sent_at: null,
        }, withIp.metadata),
      });
    const bootstrap = await ensureUserRecords(loginUser);
    res.json({
      access_token: signUser(loginUser),
      user: bootstrap.user,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/me", requireAuth, async (req, res) => {
  res.json(req.user);
});

router.patch("/me", requireAuth, async (req, res, next) => {
  try {
    const current = await prisma.user.findUnique({ where: { id: req.user.id } });
    const { username, display_name, ...rest } = req.body || {};
    let user = current;
    if (Object.keys(rest).length > 0) {
      user = await prisma.user.update({
        where: { id: req.user.id },
        data: dataForEntity("User", rest, current?.metadata),
      });
    }
    const identityPayload = {};
    if (Object.prototype.hasOwnProperty.call(req.body || {}, "username")) identityPayload.username = username;
    if (Object.prototype.hasOwnProperty.call(req.body || {}, "display_name")) identityPayload.display_name = display_name;
    if (Object.keys(identityPayload).length > 0) {
      user = await updateUserIdentity(req.user.id, identityPayload);
    }
    res.json(publicUser(user));
  } catch (error) {
    next(error);
  }
});

router.post("/bootstrap", requireAuth, async (req, res, next) => {
  try {
    const result = await ensureUserRecords(req.userRow, req.body || {});
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post("/verify-otp", async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { email: String(req.body?.email || "").toLowerCase() } });
    if (!user) return res.status(404).json({ error: "User not found" });
    const verified = user.email_verified === true ? user : await prisma.user.update({
      where: { id: user.id },
      data: dataForEntity("User", { email_verified: true, email_verification_code: null }, user.metadata),
    });
    const withIp = await recordIp(verified, req, "last_login_ip");
    const bootstrap = await ensureUserRecords(withIp);
    res.json({ access_token: signUser(withIp), user: bootstrap.user, verification_disabled: true });
  } catch (error) {
    next(error);
  }
});

router.post("/resend-otp", async (req, res, next) => {
  try {
    const email = String(req.body?.email || "").toLowerCase();
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(404).json({ error: "User not found" });
    if (user.email_verified !== true) await prisma.user.update({
      where: { id: user.id },
      data: dataForEntity("User", { email_verified: true, email_verification_code: null }, user.metadata),
    });
    res.json({
      success: true,
      email_sent: false,
      verification_disabled: true,
    });
  } catch (error) {
    next(error);
  }
});

router.post("/reset-password", (_req, res) => {
  res.status(501).json({ error: "Password reset email delivery is not configured yet." });
});

export default router;
