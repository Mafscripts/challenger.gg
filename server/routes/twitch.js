import crypto from "node:crypto";
import { Router } from "express";
import { prisma } from "../prisma.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
const TWITCH_IDENTITY_API = "https://id.twitch.tv/oauth2";
const TWITCH_HELIX_API = "https://api.twitch.tv/helix";
const STATE_TTL_MS = 10 * 60 * 1000;

const oauthConfig = (req) => {
  const clientId = String(process.env.TWITCH_CLIENT_ID || "").trim();
  const clientSecret = String(process.env.TWITCH_CLIENT_SECRET || "").trim();
  const publicUrl = String(process.env.TOPFRAGG_PUBLIC_URL || process.env.APP_URL || process.env.CORS_ORIGIN || `${req.protocol}://${req.get("host")}`).trim();
  let origin;
  try { origin = new URL(publicUrl).origin; } catch { origin = `${req.protocol}://${req.get("host")}`; }
  const redirectUri = String(process.env.TWITCH_OAUTH_REDIRECT_URI || `${origin}/api/twitch/callback`).trim();
  const stateSecret = String(process.env.TWITCH_OAUTH_STATE_SECRET || process.env.JWT_SECRET || "").trim();
  if (!clientId || !clientSecret || !stateSecret) {
    const error = new Error("Twitch OAuth is not configured");
    error.status = 503;
    error.code = "TWITCH_OAUTH_NOT_CONFIGURED";
    throw error;
  }
  return { clientId, clientSecret, origin, redirectUri, stateSecret };
};

const signature = (payload, secret) => crypto.createHmac("sha256", secret).update(payload).digest("base64url");
const createState = (userId, secret) => {
  const payload = Buffer.from(JSON.stringify({ userId, nonce: crypto.randomBytes(16).toString("hex"), expiresAt: Date.now() + STATE_TTL_MS })).toString("base64url");
  return `${payload}.${signature(payload, secret)}`;
};
const readState = (state, secret) => {
  const [payload, receivedSignature] = String(state || "").split(".");
  if (!payload || !receivedSignature) return null;
  const expectedSignature = signature(payload, secret);
  const received = Buffer.from(receivedSignature);
  const expected = Buffer.from(expectedSignature);
  if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) return null;
  try {
    const value = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return value.userId && Number(value.expiresAt) > Date.now() ? value : null;
  } catch { return null; }
};
const settingsRedirect = (res, origin, status) => {
  const url = new URL("/settings", origin);
  url.searchParams.set("twitch", status);
  res.redirect(302, url.toString());
};

const exchangeCode = async ({ code, clientId, clientSecret, redirectUri }) => {
  const response = await fetch(`${TWITCH_IDENTITY_API}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code, grant_type: "authorization_code", redirect_uri: redirectUri }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token) throw new Error("Twitch authorization could not be completed");
  return body.access_token;
};

const currentTwitchUser = async (accessToken, clientId) => {
  const response = await fetch(`${TWITCH_HELIX_API}/users`, { headers: { Authorization: `Bearer ${accessToken}`, "Client-Id": clientId } });
  const body = await response.json().catch(() => ({}));
  const user = body.data?.[0];
  if (!response.ok || !user?.id) throw new Error("Twitch identity could not be loaded");
  return user;
};

router.post("/connect", requireAuth, async (req, res, next) => {
  try {
    const config = oauthConfig(req);
    const authorizationUrl = new URL(`${TWITCH_IDENTITY_API}/authorize`);
    authorizationUrl.search = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      response_type: "code",
      scope: "user:read:email",
      force_verify: "true",
      state: createState(req.user.id, config.stateSecret),
    }).toString();
    res.json({ authorization_url: authorizationUrl.toString() });
  } catch (error) { next(error); }
});

router.get("/callback", async (req, res) => {
  let config;
  try {
    config = oauthConfig(req);
    if (req.query.error) return settingsRedirect(res, config.origin, "cancelled");
    const state = readState(req.query.state, config.stateSecret);
    if (!state || !req.query.code) return settingsRedirect(res, config.origin, "invalid");
    const accessToken = await exchangeCode({ code: String(req.query.code), ...config });
    const twitchUser = await currentTwitchUser(accessToken, config.clientId);
    const existing = await prisma.user.findUnique({ where: { twitch_user_id: twitchUser.id } });
    if (existing && existing.id !== state.userId) return settingsRedirect(res, config.origin, "already-linked");
    const topfraggUser = await prisma.user.findUnique({ where: { id: state.userId } });
    if (!topfraggUser) return settingsRedirect(res, config.origin, "invalid");
    await prisma.user.update({
      where: { id: topfraggUser.id },
      data: {
        twitch_user_id: twitchUser.id,
        twitch_login: twitchUser.login,
        twitch_display_name: twitchUser.display_name || twitchUser.login,
        twitch_avatar_url: twitchUser.profile_image_url || null,
        twitch_connected_at: new Date(),
      },
    });
    return settingsRedirect(res, config.origin, "connected");
  } catch (error) {
    console.error("Twitch OAuth callback failed:", error.message);
    return settingsRedirect(res, config?.origin || String(process.env.TOPFRAGG_PUBLIC_URL || "https://topfragg.gg"), "error");
  }
});

router.get("/status", requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    res.json({ connected: Boolean(user?.twitch_user_id), identity: user?.twitch_user_id ? {
      id: user.twitch_user_id, login: user.twitch_login, display_name: user.twitch_display_name,
      avatar_url: user.twitch_avatar_url, connected_at: user.twitch_connected_at?.toISOString() || null,
    } : null });
  } catch (error) { next(error); }
});

router.delete("/connection", requireAuth, async (req, res, next) => {
  try {
    await prisma.user.update({ where: { id: req.user.id }, data: {
      twitch_user_id: null, twitch_login: null, twitch_display_name: null, twitch_avatar_url: null, twitch_connected_at: null,
    } });
    res.json({ connected: false });
  } catch (error) { next(error); }
});

export default router;
