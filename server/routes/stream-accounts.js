import { Router } from "express";
import { prisma } from "../prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { streamAccountProviders, streamAccountConfig, createStreamAuthorization, readStreamAuthorization, exchangeStreamIdentity, saveStreamIdentity, disconnectStreamIdentity } from "../stream-accounts.js";

const cookieName = provider => `topfragg_stream_${provider}`;
const cookieOptions = (provider, secure) => ({ httpOnly: true, secure, sameSite: "lax", path: `/api/stream-accounts/${provider}/callback`, maxAge: 600000 });
const readCookie = (req, name) => {
  const item = String(req.headers.cookie || "").split(";").map(value => value.trim()).find(value => value.startsWith(`${name}=`));
  try { return item ? decodeURIComponent(item.slice(name.length + 1)) : ""; } catch { return ""; }
};

export function beginStreamConnection(req, res, next, { env = process.env, redirect = false, provider = req.params.provider } = {}) {
  try {
    const config = streamAccountConfig(provider, env);
    const authorization = createStreamAuthorization(config, req.user.id);
    res.cookie(cookieName(config.provider), authorization.cookie, cookieOptions(config.provider, config.origin.startsWith("https:")));
    return redirect ? res.redirect(302, authorization.authorizationUrl) : res.json({ authorization_url: authorization.authorizationUrl });
  } catch (error) { next(error); }
}

export function createStreamAccountsRouter({ db = prisma, authenticate = requireAuth, fetcher = (...args) => fetch(...args), env = process.env } = {}) {
  const router = Router();
  router.get("/status", authenticate, async (req, res, next) => {
    try {
      const current = await db.user.findUnique({ where: { id: req.user.id }, select: { metadata: true } });
      res.json(Object.fromEntries(streamAccountProviders.map(provider => {
        let configured = false;
        try { streamAccountConfig(provider, env); configured = true; } catch { /* The UI reports administrator setup is still needed. */ }
        return [provider, { configured, connected: Boolean(current?.metadata?.stream_connections?.[provider]?.id), identity: current?.metadata?.stream_connections?.[provider] || null }];
      })));
    } catch (error) { next(error); }
  });
  router.post("/:provider/connect", authenticate, (req, res, next) => beginStreamConnection(req, res, next, { env }));
  router.get("/:provider/callback", async (req, res) => {
    const provider = req.params.provider;
    if (!streamAccountProviders.includes(provider)) return res.status(404).json({ error: "Unknown streaming provider" });
    let origin;
    try { origin = new URL(env.TOPFRAGG_PUBLIC_URL || env.APP_URL || "https://topfragg.gg").origin; } catch { return res.status(503).json({ error: "Streaming connections are not configured" }); }
    const redirect = status => {
      const url = new URL("/settings", origin);
      url.searchParams.set("stream_provider", provider); url.searchParams.set("stream_status", status); url.hash = "streaming";
      return res.redirect(302, url.toString());
    };
    try {
      const config = streamAccountConfig(provider, env);
      const state = readStreamAuthorization(config, readCookie(req, cookieName(provider)), req.query.state);
      res.clearCookie(cookieName(provider), { ...cookieOptions(provider, origin.startsWith("https:")), maxAge: undefined });
      if (!state) return redirect("invalid");
      if (req.query.error) return redirect("cancelled");
      const identity = await exchangeStreamIdentity(config, req.query.code, state.verifier, fetcher);
      await saveStreamIdentity(db, state.userId, provider, identity);
      return redirect("connected");
    } catch (error) {
      // Provider responses and tokens never enter logs or redirect query strings.
      return redirect(error.code === "ALREADY_LINKED" ? "already-linked" : error.code === "NO_CHANNEL" ? "no-channel" : error.code === "STREAM_OAUTH_NOT_CONFIGURED" ? "not-configured" : "error");
    }
  });
  router.delete("/:provider/connection", authenticate, async (req, res, next) => {
    try {
      if (!streamAccountProviders.includes(req.params.provider)) return res.status(404).json({ error: "Unknown streaming provider" });
      await disconnectStreamIdentity(db, req.user.id, req.params.provider);
      res.json({ connected: false });
    } catch (error) { next(error); }
  });
  return router;
}

export default createStreamAccountsRouter();
