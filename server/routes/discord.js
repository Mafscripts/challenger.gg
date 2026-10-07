import crypto from "node:crypto";
import { Router } from "express";
import { prisma } from "../prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { hasRole } from "../roles.js";
import { freeEightsDiscordConfig, freeEightsVoiceClosed, freeEightsVoiceKey, publicFreeEightsVoiceStatus } from "../free-eights-discord.js";
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

export const safeDiscordReturnTo = (path) => {
  if (path === "/ranked/8s" || path === "/matchfinder?category=eights" || /^\/8s-match\/[a-zA-Z0-9_-]{1,100}$/.test(String(path || ""))) return path;
  return "/settings";
};

export const createState = (userId, secret, returnTo = "/settings") => {
  const payload = Buffer.from(JSON.stringify({
    userId,
    nonce: crypto.randomBytes(16).toString("hex"),
    expiresAt: Date.now() + STATE_TTL_MS,
    returnTo: safeDiscordReturnTo(returnTo),
  })).toString("base64url");
  return `${payload}.${stateSignature(payload, secret)}`;
};

export const readState = (state, secret) => {
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
    if (!parsed.userId || !Number.isFinite(Number(parsed.expiresAt)) || Number(parsed.expiresAt) <= Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
};

const settingsRedirect = (res, origin, status, returnTo = "/settings") => {
  const url = new URL(safeDiscordReturnTo(returnTo), origin);
  url.searchParams.set("discord", status);
  res.redirect(302, url.toString());
};

const activeFreeEightsMembership = async (userId) => {
  const rows = await prisma.wagerParticipant.findMany({ where: { metadata: { path: ["user_id"], equals: userId } } });
  const ids = rows.map((row) => row.metadata?.wager_id).filter(Boolean);
  if (!ids.length) return false;
  const matches = await prisma.wager.findMany({ where: { id: { in: ids }, metadata: { path: ["match_type"], equals: "8s" } } });
  return matches.some((row) => !freeEightsVoiceClosed.has(row.metadata?.status));
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
    const state = createState(req.user.id, config.stateSecret, req.body?.return_to);
    // Bind the signed account state to the browser that initiated linking.
    res.cookie("topfragg_discord_oauth", stateSignature(state, config.stateSecret), {
      httpOnly: true, secure: config.redirectUri.startsWith("https:"), sameSite: "lax",
      path: "/api/discord/callback", maxAge: STATE_TTL_MS,
    });
    const authorizationUrl = new URL("https://discord.com/oauth2/authorize");
    authorizationUrl.search = new URLSearchParams({
      client_id: config.clientId,
      response_type: "code",
      redirect_uri: config.redirectUri,
      scope: "identify",
      state,
      prompt: "consent",
    }).toString();
    res.json({ authorization_url: authorizationUrl.toString() });
  } catch (error) {
    next(error);
  }
});

router.get("/callback", async (req, res) => {
  let config;
  let returnTo = "/settings";
  try {
    config = oauthConfig(req);
    const state = readState(req.query.state, config.stateSecret);
    const cookie = String(req.headers.cookie || "").split(";").map((part) => part.trim()).find((part) => part.startsWith("topfragg_discord_oauth="))?.split("=")[1];
    const expectedCookie = stateSignature(String(req.query.state || ""), config.stateSecret);
    res.clearCookie("topfragg_discord_oauth", { path: "/api/discord/callback", httpOnly: true, sameSite: "lax", secure: config.redirectUri.startsWith("https:") });
    if (!state || !cookie || cookie.length !== expectedCookie.length
      || !crypto.timingSafeEqual(Buffer.from(cookie), Buffer.from(expectedCookie))) return settingsRedirect(res, config.origin, "invalid");
    returnTo = safeDiscordReturnTo(state.returnTo);
    if (req.query.error) return settingsRedirect(res, config.origin, "cancelled", returnTo);
    if (!req.query.code) return settingsRedirect(res, config.origin, "invalid", returnTo);

    const accessToken = await exchangeCode({
      code: String(req.query.code),
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      redirectUri: config.redirectUri,
    });
    const discordUser = await currentDiscordUser(accessToken);
    const existing = await prisma.user.findUnique({ where: { discord_user_id: discordUser.id } });
    if (existing && existing.id !== state.userId) {
      return settingsRedirect(res, config.origin, "already-linked", returnTo);
    }
    const topfraggUser = await prisma.user.findUnique({ where: { id: state.userId } });
    if (!topfraggUser) return settingsRedirect(res, config.origin, "invalid", returnTo);
    if (topfraggUser.discord_user_id && topfraggUser.discord_user_id !== discordUser.id && await activeFreeEightsMembership(topfraggUser.id)) {
      return settingsRedirect(res, config.origin, "active-free-8s", returnTo);
    }

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
    return settingsRedirect(res, config.origin, callbackStatus, returnTo);
  } catch (error) {
    console.error("Discord OAuth callback failed:", error.message);
    const origin = config?.origin || String(process.env.TOPFRAGG_PUBLIC_URL || "https://topfragg.gg");
    return settingsRedirect(res, origin, error.code === "P2002" ? "already-linked" : "error", returnTo);
  }
});

router.get("/free-eights/:wagerId", requireAuth, async (req, res, next) => {
  try {
    const row = await prisma.wager.findUnique({ where: { id: req.params.wagerId } });
    if (row?.metadata?.match_type !== "8s") return res.status(404).json({ error: "Free 8s lobby not found" });
    const rows = await prisma.wagerParticipant.findMany({ where: { metadata: { path: ["wager_id"], equals: row.id } } });
    const participants = rows.map((participant) => participant.metadata);
    if (!participants.some((participant) => participant.user_id === req.user.id) && !hasRole(req.user, "moderator")) {
      return res.status(403).json({ error: "Only lobby players or staff can view voice readiness" });
    }
    const dispatch = await prisma.discordEventDispatch.findUnique({ where: { event_key: freeEightsVoiceKey(row.id) } });
    res.json(publicFreeEightsVoiceStatus(freeEightsDiscordConfig(), row.metadata, participants, dispatch?.metadata));
  } catch (error) {
    next(error);
  }
});

router.get("/free-eights", requireAuth, (_req, res) => {
  res.json(publicFreeEightsVoiceStatus(freeEightsDiscordConfig(), {}, [], null));
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
    if (await activeFreeEightsMembership(req.user.id)) {
      return res.status(409).json({ error: "Finish or leave your active Free 8s lobby before disconnecting Discord" });
    }
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
