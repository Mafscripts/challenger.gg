import crypto from "node:crypto";
import { Router } from "express";
import { prisma } from "../prisma.js";
import { requireAuth } from "../middleware/auth.js";
import {
  discordAvatarUrl,
  removeDiscordVerifiedRole,
  syncDiscordVerifiedRole,
} from "../discord.js";

const router = Router();
const DISCORD_API_BASE = "https://discord.com/api/v10";
const STATE_TTL_MS = 10 * 60 * 1000;

const oauthConfig = (req) => {
  const clientId = String(process.env.DISCORD_CLIENT_ID || "").trim();
  const clientSecret = String(process.env.DISCORD_CLIENT_SECRET || "").trim();
  const publicUrl = String(
    process.env.TOPFRAGG_PUBLIC_URL
    || process.env.APP_URL
    || process.env.CORS_ORIGIN
    || `${req.protocol}://${req.get("host")}`,
  ).trim();
  let origin;
  try {
    origin = new URL(publicUrl).origin;
  } catch {
    origin = `${req.protocol}://${req.get("host")}`;
  }
  const redirectUri = String(
    process.env.DISCORD_OAUTH_REDIRECT_URI || `${origin}/api/discord/callback`,
  ).trim();
  const stateSecret = String(
    process.env.DISCORD_OAUTH_STATE_SECRET || process.env.JWT_SECRET || "",
  ).trim();
  if (!clientId || !clientSecret || !stateSecret) {
    const error = new Error("Discord OAuth is not configured");
    error.status = 503;
    error.code = "DISCORD_OAUTH_NOT_CONFIGURED";
    throw error;
  }
  return { clientId, clientSecret, origin, redirectUri, stateSecret };
};

const stateSignature = (payload, secret) => crypto
  .createHmac("sha256", secret)
  .update(payload)
  .digest("base64url");

const createState = (userId, secret) => {
  const payload = Buffer.from(JSON.stringify({
    userId,
    nonce: crypto.randomBytes(16).toString("hex"),
    expiresAt: Date.now() + STATE_TTL_MS,
  })).toString("base64url");
  return `${payload}.${stateSignature(payload, secret)}`;
};

const readState = (state, secret) => {
  const [payload, signature] = String(state || "").split(".");
  if (!payload || !signature) return null;
  const expected = stateSignature(payload, secret);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!parsed.userId || Number(parsed.expiresAt) <= Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
};

const settingsRedirect = (res, origin, status) => {
  const url = new URL("/settings", origin);
  url.searchParams.set("discord", status);
  res.redirect(302, url.toString());
};

const exchangeCode = async ({ code, clientId, clientSecret, redirectUri }) => {
  const response = await fetch(`${DISCORD_API_BASE}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token) {
    const error = new Error("Discord authorization could not be completed");
    error.status = 502;
    error.code = "DISCORD_TOKEN_EXCHANGE_FAILED";
    throw error;
  }
  return body.access_token;
};

const currentDiscordUser = async (accessToken) => {
  const response = await fetch(`${DISCORD_API_BASE}/users/@me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.id) {
    const error = new Error("Discord identity could not be loaded");
    error.status = 502;
    error.code = "DISCORD_IDENTITY_FAILED";
    throw error;
  }
  return body;
};

router.post("/connect", requireAuth, async (req, res, next) => {
  try {
    const config = oauthConfig(req);
    const authorizationUrl = new URL("https://discord.com/oauth2/authorize");
    authorizationUrl.search = new URLSearchParams({
      client_id: config.clientId,
      response_type: "code",
      redirect_uri: config.redirectUri,
      scope: "identify",
      state: createState(req.user.id, config.stateSecret),
      prompt: "consent",
    }).toString();
    res.json({ authorization_url: authorizationUrl.toString() });
  } catch (error) {
    next(error);
  }
});

router.get("/callback", async (req, res) => {
  let config;
  try {
    config = oauthConfig(req);
    if (req.query.error) return settingsRedirect(res, config.origin, "cancelled");
    const state = readState(req.query.state, config.stateSecret);
    if (!state || !req.query.code) return settingsRedirect(res, config.origin, "invalid");

    const accessToken = await exchangeCode({
      code: String(req.query.code),
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      redirectUri: config.redirectUri,
    });
    const discordUser = await currentDiscordUser(accessToken);
    const existing = await prisma.user.findUnique({ where: { discord_user_id: discordUser.id } });
    if (existing && existing.id !== state.userId) {
      return settingsRedirect(res, config.origin, "already-linked");
    }
    const topfraggUser = await prisma.user.findUnique({ where: { id: state.userId } });
    if (!topfraggUser) return settingsRedirect(res, config.origin, "invalid");

    await prisma.user.update({
      where: { id: topfraggUser.id },
      data: {
        discord_user_id: discordUser.id,
        discord_username: discordUser.username,
        discord_display_name: discordUser.global_name || discordUser.username,
        discord_avatar_url: discordAvatarUrl(discordUser),
        discord_connected_at: new Date(),
      },
    });

    let callbackStatus = "connected-no-server";
    try {
      const roleStatus = await syncDiscordVerifiedRole(discordUser.id);
      if (roleStatus.roleAssigned) callbackStatus = "connected";
    } catch (error) {
      console.error("Discord role sync failed after OAuth:", error.message);
      callbackStatus = "connected-role-pending";
    }
    return settingsRedirect(res, config.origin, callbackStatus);
  } catch (error) {
    console.error("Discord OAuth callback failed:", error.message);
    const origin = config?.origin || String(process.env.TOPFRAGG_PUBLIC_URL || "https://topfragg.gg");
    return settingsRedirect(res, origin, "error");
  }
});

router.get("/status", requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    res.json({
      connected: Boolean(user?.discord_user_id),
      identity: user?.discord_user_id ? {
        id: user.discord_user_id,
        username: user.discord_username,
        display_name: user.discord_display_name,
        avatar_url: user.discord_avatar_url,
        connected_at: user.discord_connected_at?.toISOString() || null,
      } : null,
    });
  } catch (error) {
    next(error);
  }
});

router.post("/sync", requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user?.discord_user_id) return res.status(400).json({ error: "Connect Discord first" });
    const result = await syncDiscordVerifiedRole(user.discord_user_id);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.delete("/connection", requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (user?.discord_user_id) {
      await removeDiscordVerifiedRole(user.discord_user_id).catch((error) => {
        console.error("Discord role removal failed:", error.message);
      });
    }
    await prisma.user.update({
      where: { id: req.user.id },
      data: {
        discord_user_id: null,
        discord_username: null,
        discord_display_name: null,
        discord_avatar_url: null,
        discord_connected_at: null,
      },
    });
    res.json({ connected: false });
  } catch (error) {
    next(error);
  }
});

export default router;
