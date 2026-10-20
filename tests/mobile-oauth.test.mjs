import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createMobileOAuthRouter } from "../server/mobile-oauth.js";

async function fixture(t, { capacity = 1000 } = {}) {
  let time = Date.now(), allowed = true, launches = 0;
  const app = express();
  app.use(express.json());
  app.use("/api/mobile/oauth", createMobileOAuthRouter({
    now: () => time, ttl: 1000, capacity, origin: () => "https://topfragg.gg",
    authenticate(req, res, next) {
      if (!allowed || req.headers.authorization !== "Bearer private-session") return res.status(401).json({ error: "Sign in" });
      req.user = { id: req.headers["x-test-user"] || "player1" };
      next();
    },
    starters: { youtube(req, res) {
      launches++;
      res.cookie("oauth-browser-binding", "cookie-state", { httpOnly: true, secure: true, sameSite: "lax" });
      res.redirect(302, "https://accounts.google.com/o/oauth2/v2/auth?state=signed-state");
    } },
  }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const ticket = (provider = "youtube", auth = true, user = "player1") => fetch(`${origin}/api/mobile/oauth/ticket`, {
    method: "POST", headers: { "Content-Type": "application/json", ...(auth ? { Authorization: "Bearer private-session" } : {}), "x-test-user": user }, body: JSON.stringify({ provider }),
  });
  const redeem = url => fetch(`${origin}${new URL(url).pathname}${new URL(url).search}`, { redirect: "manual" });
  return { ticket, redeem, expire: () => { time += 1001; }, revoke: () => { allowed = false; }, get launches() { return launches; } };
}

test("ticket requires authentication and an allowlisted provider", async t => {
  const f = await fixture(t);
  assert.equal((await f.ticket("youtube", false)).status, 401);
  for (const provider of ["__proto__", "https://evil.example", "unknown"]) assert.equal((await f.ticket(provider)).status, 400);
});

test("ticket never exposes bearer credentials and creates browser-bound OAuth cookies", async t => {
  const f = await fixture(t);
  const response = await f.ticket();
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = await response.json();
  assert(!JSON.stringify(body).includes("private-session"));
  assert.match(body.start_url, /^https:\/\/topfragg.gg\/api\/mobile\/oauth\/start\?ticket=[\w-]{43}$/);
  const launch = await f.redeem(body.start_url);
  assert.equal(launch.status, 302);
  assert.match(launch.headers.get("set-cookie"), /HttpOnly/);
  assert.match(launch.headers.get("location"), /^https:\/\/accounts.google.com\//);
});

test("concurrent redemption and later replays only authorize once", async t => {
  const f = await fixture(t);
  const { start_url } = await (await f.ticket()).json();
  const attempts = await Promise.all([f.redeem(start_url), f.redeem(start_url)]);
  assert.deepEqual(attempts.map(response => response.status).sort(), [302, 410]);
  assert.equal(f.launches, 1);
  assert.equal((await f.redeem(start_url)).status, 410);
});

test("expired, replaced or revoked attempts cannot start OAuth", async t => {
  const f = await fixture(t);
  const first = await (await f.ticket()).json();
  const second = await (await f.ticket()).json();
  assert.equal((await f.redeem(first.start_url)).status, 410);
  f.expire();
  assert.equal((await f.redeem(second.start_url)).status, 410);
  const third = await (await f.ticket()).json();
  f.revoke();
  assert.equal((await f.redeem(third.start_url)).status, 401);
  assert.equal(f.launches, 0);
});

test("bounded ticket storage fails closed when full", async t => {
  const f = await fixture(t, { capacity: 1 });
  assert.equal((await f.ticket()).status, 200);
  assert.equal((await f.ticket("youtube", true, "player2")).status, 429);
  f.expire();
  assert.equal((await f.ticket("youtube", true, "player2")).status, 200);
});
