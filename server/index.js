import "dotenv/config";
import streamAccountRoutes, { beginStreamConnection } from "./routes/stream-accounts.js";
import express from "express";
import cors from "cors";
import authRoutes, { registerHandler } from "./routes/auth.js";
import entityRoutes from "./routes/entities.js";
import functionRoutes, { expireMatchfinderPosts } from "./routes/functions.js";
import publicRoutes from "./routes/public.js";
import playerOverlayRoutes from "./routes/player-overlay.js";
import discordRoutes, { beginDiscordConnection } from "./routes/discord.js";
import twitchRoutes, { beginTwitchConnection } from "./routes/twitch.js";
import { requireAuth } from "./middleware/auth.js";
import { createMobileOAuthRouter } from "./mobile-oauth.js";
import { corsOptions } from "./cors-options.js";
import profileRoutes from "./routes/profile.js";
import partyRoomRoutes from "./routes/party-rooms.js";
import rankVerificationRoutes from "./routes/rank-verification.js";
import banAppealRoutes from "./routes/ban-appeals.js";
import { isNetworkAccessError } from "./network-access.js";
import { disconnectPrisma, prisma } from "./prisma.js";
import { purgeExpiredNotifications, startNotificationRetentionWorker } from "./notification-retention.js";
import { attachRankedVoiceServer } from "./ranked-voice.js";
import { attachEightsLiveServer } from "./eights-live.js";
import { startMatchfinderExpiryWorker } from "./matchfinder-expiry.js";

const app = express();
const port = Number(process.env.PORT || 4000);

// Nginx on this host connects over loopback. Never trust arbitrary remote peers.
const configuredTrustProxy = String(process.env.TRUST_PROXY || "loopback").trim() || "loopback";
if (configuredTrustProxy) {
  const numericTrustProxy = Number(configuredTrustProxy);
  app.set(
    "trust proxy",
    configuredTrustProxy === "true" ? true : configuredTrustProxy === "false" ? false
      : (Number.isInteger(numericTrustProxy) ? numericTrustProxy : configuredTrustProxy.split(",").map((entry) => entry.trim())),
  );
}

app.use(cors(corsOptions()));
app.use(express.json({ limit: "4mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/register", registerHandler);
app.use("/api/public", publicRoutes);
app.use("/api/public/player-overlay", playerOverlayRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/ban-appeals", banAppealRoutes);
app.use("/api/discord", discordRoutes);
app.use("/api/twitch", twitchRoutes);
app.use("/api/stream-accounts", streamAccountRoutes);
app.use("/api/mobile/oauth", createMobileOAuthRouter({
  authenticate: requireAuth,
  origin: () => process.env.TOPFRAGG_PUBLIC_URL || process.env.APP_URL || "https://www.topfragg.gg",
  starters: {
    discord: (req, res, next) => beginDiscordConnection(req, res, next, { redirect: true }),
    twitch: (req, res, next) => beginTwitchConnection(req, res, next, { redirect: true }),
    youtube: (req, res, next) => beginStreamConnection(req, res, next, { redirect: true, provider: "youtube" }),
    kick: (req, res, next) => beginStreamConnection(req, res, next, { redirect: true, provider: "kick" }),
  },
}));
app.use("/api/profile", profileRoutes);
app.use("/api/party-rooms", partyRoomRoutes);
app.use("/api/rank-verification", rankVerificationRoutes);
app.use("/api/entities", entityRoutes);
app.use("/api/functions", functionRoutes);

app.use((error, _req, res, _next) => {
  const uniqueTarget = Array.isArray(error.meta?.target) ? error.meta.target.join(", ") : "";
  const isUniqueConstraintError = error.code === "P2002";
  const status = isUniqueConstraintError ? 409 : (error.status || 500);
  const message = isUniqueConstraintError
    ? `${uniqueTarget || "Value"} is already registered`
    : (error.message || "Internal server error");
  if (status >= 500) {
    console.error(error.stack || error);
  }
  res.status(status).json({
    error: message,
    ...(isNetworkAccessError(error) ? { code: error.code, reason: error.networkReason } : {}),
    ...(error.retryAfter ? { retry_after: error.retryAfter } : {}),
    ...(status >= 500 && process.env.NODE_ENV !== "production" && error.stack ? { stack: error.stack } : {}),
  });
});

const server = app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
attachRankedVoiceServer(server);
attachEightsLiveServer(server);
const stopMatchfinderExpiry = startMatchfinderExpiryWorker(expireMatchfinderPosts);
const stopNotificationRetention = startNotificationRetentionWorker(() => purgeExpiredNotifications(prisma));

const shutdown = async () => {
  server.close(async () => {
    await Promise.all([stopMatchfinderExpiry(), stopNotificationRetention()]);
    await disconnectPrisma();
    process.exit(0);
  });
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
