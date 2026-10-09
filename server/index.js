import "dotenv/config";
import express from "express";
import cors from "cors";
import authRoutes, { registerHandler } from "./routes/auth.js";
import entityRoutes from "./routes/entities.js";
import functionRoutes, { expireMatchfinderPosts } from "./routes/functions.js";
import publicRoutes from "./routes/public.js";
import discordRoutes from "./routes/discord.js";
import twitchRoutes from "./routes/twitch.js";
import profileRoutes from "./routes/profile.js";
import rankVerificationRoutes from "./routes/rank-verification.js";
import { disconnectPrisma } from "./prisma.js";
import { attachRankedVoiceServer } from "./ranked-voice.js";
import { attachEightsLiveServer } from "./eights-live.js";
import { startMatchfinderExpiryWorker } from "./matchfinder-expiry.js";

const app = express();
const port = Number(process.env.PORT || 4000);

const configuredTrustProxy = String(process.env.TRUST_PROXY || "").trim();
if (configuredTrustProxy) {
  const numericTrustProxy = Number(configuredTrustProxy);
  app.set(
    "trust proxy",
    configuredTrustProxy === "true" ? true : (Number.isInteger(numericTrustProxy) ? numericTrustProxy : configuredTrustProxy),
  );
}

app.use(cors({
  origin: process.env.CORS_ORIGIN || true,
  credentials: true,
}));
app.use(express.json({ limit: "4mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/register", registerHandler);
app.use("/api/public", publicRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/discord", discordRoutes);
app.use("/api/twitch", twitchRoutes);
app.use("/api/profile", profileRoutes);
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

const shutdown = async () => {
  server.close(async () => {
    await stopMatchfinderExpiry();
    await disconnectPrisma();
    process.exit(0);
  });
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
