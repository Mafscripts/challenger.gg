import crypto from "node:crypto";
import { Router } from "express";

// A launch ticket bridges WebView authentication to browser-owned OAuth cookies.
// Only its hash is retained; bearer credentials never appear in redirect URLs.
export function createMobileOAuthRouter({ authenticate, starters, origin, now = Date.now, ttl = 90_000, capacity = 1000 }) {
  const router = Router();
  const tickets = new Map();
  const hash = value => crypto.createHash("sha256").update(value).digest("hex");
  const prune = () => { for (const [key, entry] of tickets) if (entry.expires <= now()) tickets.delete(key); };
  const cleanup = setInterval(prune, Math.min(ttl, 30_000));
  cleanup.unref();
  router.use((_req, res, next) => {
    res.set({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });
    next();
  });
  router.post("/ticket", authenticate, (req, res, next) => {
    try {
      const provider = req.body?.provider;
      if (typeof provider !== "string" || !Object.hasOwn(starters, provider)) return res.status(400).json({ error: "Unknown account provider" });
      const publicOrigin = new URL(origin());
      if (publicOrigin.protocol !== "https:") return res.status(503).json({ error: "Mobile account connections require HTTPS" });
      prune();
      if (tickets.size >= capacity) return res.status(429).json({ error: "Please try connecting again shortly" });
      const ticket = crypto.randomBytes(32).toString("base64url");
      const authorization = req.headers.authorization;
      if (!authorization?.startsWith("Bearer ")) return res.status(401).json({ error: "Sign in to connect your account" });
      // Replace an older attempt by this user; never grow the store on retries.
      for (const [key, entry] of tickets) if (entry.userId === req.user.id) tickets.delete(key);
      tickets.set(hash(ticket), { provider, userId: req.user.id, authorization, expires: now() + ttl });
      const url = new URL("/api/mobile/oauth/start", publicOrigin.origin);
      url.searchParams.set("ticket", ticket);
      return res.json({ start_url: url.href });
    } catch (error) { next(error); }
  });
  router.get("/start", (req, res, next) => {
    prune();
    const ticket = typeof req.query.ticket === "string" ? req.query.ticket : "";
    const key = hash(ticket);
    const entry = tickets.get(key);
    tickets.delete(key); // Consume before any asynchronous authentication/provider work.
    if (!entry) return res.status(410).send("This connection link expired. Return to TopFragg and tap Connect again.");
    req.headers.authorization = entry.authorization;
    // Recheck account status and restrictions rather than trusting the launch ticket.
    authenticate(req, res, error => {
      if (error) return next(error);
      if (req.user?.id !== entry.userId) return res.sendStatus(403);
      return starters[entry.provider](req, res, next);
    });
  });
  return router;
}
