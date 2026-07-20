import { Router } from "express";
import crypto from "node:crypto";
import { prisma } from "../prisma.js";
import {
  createUserWithPassword,
  ensureUserRecords,
  publicUser,
  safeUserMetadata,
  signUser,
  updateUserIdentity,
  verifyPassword,
  hashPassword,
} from "../auth.js";
import { requireAuth } from "../middleware/auth.js";
import { dataForEntity } from "../entity.js";
import { isEmailConfigured, sendPasswordResetEmail } from "../email.js";

const router = Router();

const requestIp = (req) => {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || req.ip || req.socket?.remoteAddress || "unknown";
};

const recordIp = async (user, req, field) => {
  const ip = requestIp(req);
  const metadata = safeUserMetadata(user.metadata);
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
      password_change_required: Boolean(loginUser.metadata?.force_password_change),
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
    const { username, display_name, avatar_url: _avatarUrl, ...rest } = req.body || {};
    const selfServiceFields = new Set([
      "activision_id",
      "playstation_id",
      "xbox_id",
      "discord_webhook_url",
      "discord_alerts_enabled",
      "display_name_color",
    ]);
    const unsupportedFields = Object.keys(rest).filter((field) => !selfServiceFields.has(field));
    if (unsupportedFields.length > 0) {
      return res.status(403).json({ error: "One or more account fields require an admin action" });
    }
    let user = current;
    if (Object.keys(rest).length > 0) {
      user = await prisma.user.update({
        where: { id: req.user.id },
        data: dataForEntity("User", rest, safeUserMetadata(current?.metadata)),
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
      data: dataForEntity("User", { email_verified: true, email_verification_code: null }, safeUserMetadata(user.metadata)),
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
      data: dataForEntity("User", { email_verified: true, email_verification_code: null }, safeUserMetadata(user.metadata)),
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

const resetTokenHash = (token) => crypto.createHash("sha256").update(token).digest("hex");

const resetAppUrl = (req) => {
  const configured = process.env.APP_URL || process.env.FRONTEND_URL || process.env.CORS_ORIGIN;
  const candidate = configured || req.get("origin") || `${req.protocol}://${req.get("host")}`;
  try {
    const url = new URL(candidate);
    return ["http:", "https:"].includes(url.protocol) ? url.origin : null;
  } catch {
    return null;
  }
};

router.post("/reset-password-request", async (req, res, next) => {
  try {
    if (!isEmailConfigured()) {
      return res.status(503).json({ error: "Password reset email delivery is not configured" });
    }
    const email = String(req.body?.email || "").trim().toLowerCase();
    const user = email ? await prisma.user.findUnique({ where: { email } }) : null;

    if (user) {
      const token = crypto.randomBytes(32).toString("hex");
      const metadata = safeUserMetadata(user.metadata);
      await prisma.user.update({
        where: { id: user.id },
        data: dataForEntity("User", {
          password_reset_token_hash: resetTokenHash(token),
          password_reset_expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        }, metadata),
      });

      const appUrl = resetAppUrl(req);
      if (!appUrl) {
        const error = new Error("Password reset URL is not configured");
        error.status = 503;
        throw error;
      }
      const delivery = await sendPasswordResetEmail({
        to: user.email,
        resetUrl: `${appUrl}/reset-password?token=${encodeURIComponent(token)}`,
      });
      if (!delivery.sent) {
        const error = new Error("Password reset email delivery is not configured");
        error.status = 503;
        throw error;
      }
    }

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

router.post("/reset-password", async (req, res, next) => {
  try {
    const token = String(req.body?.resetToken || "");
    const newPassword = String(req.body?.newPassword || "");
    if (!token || newPassword.length < 6) {
      return res.status(400).json({ error: "A valid reset link and a password of at least 6 characters are required" });
    }

    const tokenHash = resetTokenHash(token);
    const users = await prisma.user.findMany({
      where: { metadata: { path: ["password_reset_token_hash"], equals: tokenHash } },
      take: 1,
    });
    const user = users[0];
    const metadata = safeUserMetadata(user?.metadata);
    const expiresAt = Date.parse(metadata.password_reset_expires_at || "");
    if (!user || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      return res.status(400).json({ error: "This password reset link is invalid or has expired" });
    }

    delete metadata.password_reset_token_hash;
    delete metadata.password_reset_expires_at;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        password_hash: await hashPassword(newPassword),
        metadata,
      },
    });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

router.post("/change-password", requireAuth, async (req, res, next) => {
  try {
    const currentPassword = String(req.body?.currentPassword || "");
    const newPassword = String(req.body?.newPassword || "");
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user?.password_hash || !await verifyPassword(currentPassword, user.password_hash)) {
      return res.status(400).json({ error: "Current password is incorrect" });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: "New password must be at least 8 characters" });
    }
    if (await verifyPassword(newPassword, user.password_hash)) {
      return res.status(400).json({ error: "New password must be different from the temporary password" });
    }

    const metadata = safeUserMetadata(user.metadata);
    delete metadata.force_password_change;
    delete metadata.temporary_password_set_by;
    delete metadata.temporary_password_set_by_name;
    delete metadata.temporary_password_set_date;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        password_hash: await hashPassword(newPassword),
        metadata,
      },
    });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

export default router;
