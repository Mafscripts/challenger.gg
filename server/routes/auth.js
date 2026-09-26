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
import { isEmailConfigured, sendPasswordResetEmail, sendVerificationEmail } from "../email.js";
import { evaluateAccess, requestIpAddress } from "../ban-enforcement.js";

const router = Router();
const VERIFICATION_TTL_MS = 10 * 60 * 1000;
const VERIFICATION_RESEND_COOLDOWN_MS = 60 * 1000;
const VERIFICATION_RESEND_WINDOW_MS = 60 * 60 * 1000;
const VERIFICATION_MAX_RESENDS_PER_WINDOW = 5;
const VERIFICATION_MAX_ATTEMPTS = 5;
const REGISTRATION_WINDOW_MS = 60 * 60 * 1000;
const REGISTRATION_MAX_PER_IP = 10;
const registrationAttempts = new Map();

const verificationSecret = () => process.env.EMAIL_VERIFICATION_SECRET || process.env.JWT_SECRET || "dev-email-verification-secret";
const verificationHash = (userId, code) => crypto
  .createHmac("sha256", verificationSecret())
  .update(`${userId}:${code}`)
  .digest("hex");
const verificationCode = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");

const safeHashEquals = (left, right) => {
  const leftBuffer = Buffer.from(String(left || ""), "hex");
  const rightBuffer = Buffer.from(String(right || ""), "hex");
  return leftBuffer.length > 0
    && leftBuffer.length === rightBuffer.length
    && crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

const consumeRegistrationAttempt = (ip) => {
  const now = Date.now();
  if (registrationAttempts.size > 10_000) {
    for (const [key, value] of registrationAttempts) {
      if (value.windowStartedAt + REGISTRATION_WINDOW_MS <= now) registrationAttempts.delete(key);
    }
  }
  const current = registrationAttempts.get(ip);
  const next = !current || current.windowStartedAt + REGISTRATION_WINDOW_MS <= now
    ? { windowStartedAt: now, count: 1 }
    : { ...current, count: current.count + 1 };
  registrationAttempts.set(ip, next);
  if (next.count > REGISTRATION_MAX_PER_IP) {
    const error = new Error("Too many registration attempts. Please try again later.");
    error.status = 429;
    throw error;
  }
};

const issueVerificationChallenge = async (user, { enforceCooldown = false } = {}) => {
  const now = Date.now();
  const metadata = safeUserMetadata(user.metadata);
  const lastSentAt = Date.parse(metadata.email_verification_sent_at || "");
  if (enforceCooldown && Number.isFinite(lastSentAt) && lastSentAt + VERIFICATION_RESEND_COOLDOWN_MS > now) {
    const error = new Error("Please wait before requesting another verification code");
    error.status = 429;
    error.retryAfter = Math.ceil((lastSentAt + VERIFICATION_RESEND_COOLDOWN_MS - now) / 1000);
    throw error;
  }

  const previousWindowStartedAt = Date.parse(metadata.email_verification_resend_window_started_at || "");
  const inSameWindow = Number.isFinite(previousWindowStartedAt)
    && previousWindowStartedAt + VERIFICATION_RESEND_WINDOW_MS > now;
  const resendCount = inSameWindow ? Number(metadata.email_verification_resend_count || 0) + 1 : 1;
  if (enforceCooldown && resendCount > VERIFICATION_MAX_RESENDS_PER_WINDOW) {
    const error = new Error("Too many verification codes requested. Please try again later.");
    error.status = 429;
    throw error;
  }

  const code = verificationCode();
  const sentAt = new Date(now).toISOString();
  const expiresAt = new Date(now + VERIFICATION_TTL_MS).toISOString();
  const nextMetadata = {
    ...metadata,
    email_verification_code_hash: verificationHash(user.id, code),
    email_verification_expires_at: expiresAt,
    email_verification_attempts: 0,
    email_verification_sent_at: sentAt,
    email_verification_resend_count: resendCount,
    email_verification_resend_window_started_at: inSameWindow
      ? metadata.email_verification_resend_window_started_at
      : sentAt,
  };
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { metadata: nextMetadata },
  });

  let delivery;
  try {
    delivery = await sendVerificationEmail({ to: updated.email, code });
  } catch (cause) {
    const error = new Error("Verification email delivery is temporarily unavailable");
    error.status = 503;
    error.cause = cause;
    throw error;
  }
  const developmentCode = !delivery.sent && process.env.NODE_ENV !== "production" ? code : undefined;
  if (!delivery.sent && process.env.NODE_ENV === "production") {
    const error = new Error("Verification email delivery is temporarily unavailable");
    error.status = 503;
    throw error;
  }
  return { user: updated, delivery, developmentCode, expiresAt };
};

const clearVerificationMetadata = (metadata) => {
  const clean = safeUserMetadata(metadata);
  [
    "email_verification_code",
    "email_verification_code_hash",
    "email_verification_expires_at",
    "email_verification_attempts",
    "email_verification_sent_at",
    "email_verification_resend_count",
    "email_verification_resend_window_started_at",
  ].forEach((field) => delete clean[field]);
  return clean;
};

const recordIp = async (user, req, field) => {
  const ip = requestIpAddress(req) || "unknown";
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
    const access = await evaluateAccess({ req });
    if (access.blocked) {
      return res.status(access.status).json({ error: access.message, code: access.code });
    }
    consumeRegistrationAttempt(access.ip || "unknown");
    if (!isEmailConfigured() && process.env.NODE_ENV === "production") {
      return res.status(503).json({ error: "Email verification is not configured" });
    }
    let user = await createUserWithPassword(req.body || {});
    user = await recordIp(user, req, "registration_ip");
    const challenge = await issueVerificationChallenge(user);
    res.json({
      email: challenge.user.email,
      email_verification_required: true,
      expires_in: Math.floor(VERIFICATION_TTL_MS / 1000),
      email_sent: challenge.delivery.sent,
      ...(challenge.developmentCode ? { development_verification_code: challenge.developmentCode } : {}),
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

    if (user.email_verified !== true) {
      return res.status(403).json({
        error: "Verify your email before logging in",
        code: "EMAIL_VERIFICATION_REQUIRED",
        email: user.email,
      });
    }

    const access = await evaluateAccess({ req, user });
    if (access.blocked) {
      return res.status(access.status).json({ error: access.message, code: access.code });
    }

    const loginUser = await recordIp(access.user, req, "last_login_ip");
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
    const email = String(req.body?.email || "").trim().toLowerCase();
    const code = String(req.body?.code || req.body?.otp || "").trim();
    const user = email ? await prisma.user.findUnique({ where: { email } }) : null;
    if (!user || !/^\d{6}$/.test(code)) {
      return res.status(400).json({ error: "Invalid or expired verification code" });
    }
    const access = await evaluateAccess({ req, user });
    if (access.blocked) {
      return res.status(access.status).json({ error: access.message, code: access.code });
    }
    if (user.email_verified === true) {
      return res.status(400).json({ error: "Email is already verified. Please log in." });
    }

    const metadata = safeUserMetadata(user.metadata);
    const expiresAt = Date.parse(metadata.email_verification_expires_at || "");
    const attempts = Number(metadata.email_verification_attempts || 0);
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      return res.status(400).json({ error: "Verification code expired. Request a new code." });
    }
    if (attempts >= VERIFICATION_MAX_ATTEMPTS) {
      return res.status(429).json({ error: "Too many incorrect attempts. Request a new code." });
    }

    const matches = safeHashEquals(metadata.email_verification_code_hash, verificationHash(user.id, code));
    if (!matches) {
      await prisma.user.update({
        where: { id: user.id },
        data: { metadata: { ...metadata, email_verification_attempts: attempts + 1 } },
      });
      const remainingAttempts = Math.max(0, VERIFICATION_MAX_ATTEMPTS - attempts - 1);
      return res.status(400).json({
        error: remainingAttempts
          ? `Incorrect code. ${remainingAttempts} attempt${remainingAttempts === 1 ? "" : "s"} remaining.`
          : "Too many incorrect attempts. Request a new code.",
      });
    }

    const verified = await prisma.user.update({
      where: { id: user.id },
      data: { email_verified: true, metadata: clearVerificationMetadata(metadata) },
    });
    const withIp = await recordIp(verified, req, "last_login_ip");
    const bootstrap = await ensureUserRecords(withIp);
    res.json({ access_token: signUser(withIp), user: bootstrap.user });
  } catch (error) {
    next(error);
  }
});

router.post("/resend-otp", async (req, res, next) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || user.email_verified === true) {
      return res.json({ success: true, email_sent: true });
    }
    const challenge = await issueVerificationChallenge(user, { enforceCooldown: true });
    res.json({
      success: true,
      email_sent: challenge.delivery.sent,
      expires_in: Math.floor(VERIFICATION_TTL_MS / 1000),
      ...(challenge.developmentCode ? { development_verification_code: challenge.developmentCode } : {}),
    });
  } catch (error) {
    if (error.retryAfter) res.set("Retry-After", String(error.retryAfter));
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
