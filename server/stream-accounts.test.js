import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import entityRoutes from "./routes/entities.js";
import { streamAccountConfig, createStreamAuthorization, readStreamAuthorization, exchangeStreamIdentity, saveStreamIdentity, disconnectStreamIdentity } from "./stream-accounts.js";
import { createStreamAccountsRouter } from "./routes/stream-accounts.js";
import { competitionStreamChannels } from "../src/lib/competitionStreaming.js";

const environment = () => ({ TOPFRAGG_PUBLIC_URL: "https://topfragg.gg", JWT_SECRET: "test-state-secret-with-sufficient-entropy", YOUTUBE_CLIENT_ID: "youtube-client", YOUTUBE_CLIENT_SECRET: "youtube-secret", KICK_CLIENT_ID: "kick-client", KICK_CLIENT_SECRET: "kick-secret" });
const channelId = "UCabcdefghijklmnopqrstuv";
const json = (body, ok = true) => ({ ok, json: async () => body });

function store() {
  let users = new Map(["player", "other"].map(id => [id, { id, metadata: { activision_id: "Player#123", untouched: "keep" } }]));
  const locks = [];
  const delegates = rows => ({
    findUnique: async ({ where }) => structuredClone(rows.get(where.id) || null),
    findFirst: async ({ where }) => structuredClone([...rows.values()].find(user => user.id !== where.id.not && user.metadata.stream_connections?.[where.metadata.path[1]]?.id === where.metadata.equals) || null),
    update: async ({ where, data }) => { const row = { ...rows.get(where.id), ...structuredClone(data) }; rows.set(where.id, row); return structuredClone(row); },
  });
  const db = {
    user: { findUnique: args => delegates(users).findUnique(args) },
    async $transaction(callback) {
      const draft = structuredClone(users);
      const result = await callback({ user: delegates(draft), $executeRaw: async (...args) => { locks.push(args); } });
      users = draft; return result;
    },
  };
  return { db, locks, user: id => users.get(id) };
}

async function server(t, options = {}) {
  const f = store(), calls = [];
  const fetcher = options.fetcher || (async (url, request) => {
    calls.push({ url: String(url), request });
    if (String(url).endsWith("/token")) return json({ access_token: "private-provider-token", refresh_token: "private-refresh-token" });
    if (String(url).includes("googleapis.com")) return json({ items: [{ id: channelId, snippet: { title: "Player channel", thumbnails: { default: { url: "https://example.com/avatar.png" } } } }] });
    if (String(url).includes("api.kick.com")) return json({ data: [{ broadcaster_user_id: 12345, slug: "playerchannel", stream: { key: "must-never-be-stored" } }] });
    throw new Error("Unexpected provider request");
  });
  const app = express();
  app.use(express.json());
  app.use("/api/stream-accounts", createStreamAccountsRouter({ db: f.db, fetcher, env: options.env || environment(), authenticate(req, res, next) {
    if (req.headers["x-test-user"] === "unauthenticated") return res.status(401).json({ error: "Authentication required" });
    req.user = { id: req.headers["x-test-user"] || "player" }; next();
  } }));
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message, code: error.code }));
  const http = await new Promise(resolve => { const instance = app.listen(0, "127.0.0.1", () => resolve(instance)); });
  t.after(() => { http.closeAllConnections(); return new Promise(resolve => http.close(resolve)); });
  const request = (path, options = {}) => fetch(`http://127.0.0.1:${http.address().port}/api/stream-accounts${path}`, { ...options, redirect: "manual" });
  const start = async (provider, headers = {}) => {
    const response = await request(`/${provider}/connect`, { method: "POST", headers });
    const body = await response.json();
    return { response, cookie: response.headers.get("set-cookie")?.split(";")[0], url: body.authorization_url ? new URL(body.authorization_url) : null, body };
  };
  const finish = (provider, started, query = "code=approved-code") => request(`/${provider}/callback?${query}&state=${encodeURIComponent(started.url.searchParams.get("state"))}`, { headers: { cookie: started.cookie } });
  return { ...f, request, start, finish, calls };
}

test("OAuth config requires credentials and a state secret, and rejects callback redirects off the website", () => {
  for (const provider of ["youtube", "kick"]) {
    const config = streamAccountConfig(provider, environment());
    assert.equal(config.redirectUri, `https://topfragg.gg/api/stream-accounts/${provider}/callback`);
    assert.throws(() => streamAccountConfig(provider, {}), { code: "STREAM_OAUTH_NOT_CONFIGURED" });
    assert.throws(() => streamAccountConfig(provider, { ...environment(), [`${provider.toUpperCase()}_OAUTH_REDIRECT_URI`]: "https://evil.example/callback" }), { code: "STREAM_OAUTH_NOT_CONFIGURED" });
  }
  assert.throws(() => streamAccountConfig("unknown", environment()), { status: 404 });
});

test("encrypted OAuth state binds the browser, provider and user, expires and never exposes the PKCE verifier", () => {
  const config = streamAccountConfig("kick", environment());
  const authorization = createStreamAuthorization(config, "player", 1000);
  const url = new URL(authorization.authorizationUrl), state = url.searchParams.get("state");
  const value = readStreamAuthorization(config, authorization.cookie, state, 1001);
  assert.equal(value.userId, "player");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.ok(!authorization.authorizationUrl.includes(value.verifier));
  assert.ok(!authorization.authorizationUrl.includes(config.clientSecret));
  assert.equal(readStreamAuthorization(config, authorization.cookie, "wrong-state", 1001), null);
  assert.equal(readStreamAuthorization(config, `${authorization.cookie}bad`, state, 1001), null);
  assert.equal(readStreamAuthorization(config, authorization.cookie, state, 601001), null);
  assert.equal(readStreamAuthorization(streamAccountConfig("youtube", environment()), authorization.cookie, state, 1001), null);
  assert.equal(readStreamAuthorization({ ...config, stateSecret: "different-secret" }, authorization.cookie, state, 1001), null);
});

test("Connect YouTube and Kick require login and return real provider URLs, secure cookies and minimum scopes", async t => {
  const f = await server(t);
  for (const [provider, host, scope] of [["youtube", "accounts.google.com", "https://www.googleapis.com/auth/youtube.readonly"], ["kick", "id.kick.com", "channel:read"]]) {
    assert.equal((await f.request(`/${provider}/connect`, { method: "POST", headers: { "x-test-user": "unauthenticated" } })).status, 401);
    const started = await f.start(provider);
    assert.equal(started.response.status, 200);
    assert.equal(started.url.hostname, host);
    assert.equal(started.url.searchParams.get("scope"), scope);
    assert.equal(started.url.searchParams.get("code_challenge_method"), "S256");
    const cookie = started.response.headers.get("set-cookie");
    assert.match(cookie, /HttpOnly/); assert.match(cookie, /Secure/); assert.match(cookie, /SameSite=Lax/);
    assert.ok(cookie.includes(`Path=/api/stream-accounts/${provider}/callback`));
    assert.ok(!JSON.stringify(started.body).includes("client_secret"));
  }
  assert.equal(f.calls.length, 0, "starting authorization never sends credentials until the callback");
});

test("successful YouTube and Kick callbacks verify owned channels and keep provider tokens out of storage", async t => {
  const f = await server(t);
  for (const provider of ["youtube", "kick"]) {
    const started = await f.start(provider);
    const response = await f.finish(provider, started);
    assert.equal(response.status, 302);
    const location = new URL(response.headers.get("location"));
    assert.equal(location.origin, "https://topfragg.gg"); assert.equal(location.searchParams.get("stream_status"), "connected");
    assert.equal(location.hash, "#streaming");
    const identity = f.user("player").metadata.stream_connections[provider];
    assert.equal(identity.id, provider === "youtube" ? channelId : "12345");
    assert.equal(f.user("player").metadata.untouched, "keep");
    assert.ok(response.headers.get("set-cookie").includes("Expires=Thu, 01 Jan 1970"));
    const tokenRequest = f.calls.find(call => call.url === streamAccountConfig(provider, environment()).token);
    assert.equal(tokenRequest.request.body.get("grant_type"), "authorization_code");
    assert.ok(tokenRequest.request.body.get("code_verifier"));
  }
  const stored = JSON.stringify(f.user("player"));
  assert.ok(!stored.includes("private-provider-token")); assert.ok(!stored.includes("private-refresh-token")); assert.ok(!stored.includes("must-never-be-stored"));
  assert.equal(competitionStreamChannels(f.user("player")).length, 2);
  assert.ok(f.calls.some(call => call.url.includes("mine=true")), "YouTube identity uses the authenticated channel, not a submitted ID");
  assert.ok(f.calls.some(call => call.url === "https://api.kick.com/public/v1/channels"), "Kick identity uses the authenticated channel without a user-supplied filter");
});

test("missing cookies, bad states, cancellation and wrong-provider cookies cannot link an account", async t => {
  const f = await server(t), started = await f.start("youtube");
  for (const [url, cookie, expected] of [
    [`/youtube/callback?code=code&state=${started.url.searchParams.get("state")}`, "", "invalid"],
    ["/youtube/callback?code=code&state=wrong", started.cookie, "invalid"],
    [`/kick/callback?code=code&state=${started.url.searchParams.get("state")}`, started.cookie, "invalid"],
    [`/youtube/callback?error=access_denied&state=${started.url.searchParams.get("state")}`, started.cookie, "cancelled"],
  ]) {
    const response = await f.request(url, { headers: { cookie } });
    assert.equal(new URL(response.headers.get("location")).searchParams.get("stream_status"), expected);
  }
  assert.equal(f.calls.length, 0);
  assert.equal(f.user("player").metadata.stream_connections, undefined);
});

test("channels cannot be linked to two TopFragg accounts; duplicate failure is atomic", async t => {
  const f = await server(t);
  await f.finish("kick", await f.start("kick"));
  const response = await f.finish("kick", await f.start("kick", { "x-test-user": "other" }));
  assert.equal(new URL(response.headers.get("location")).searchParams.get("stream_status"), "already-linked");
  assert.equal(f.user("other").metadata.stream_connections, undefined);
  assert.equal(f.user("player").metadata.stream_connections.kick.id, "12345");
  assert.ok(f.locks.some(values => values.includes("stream-account:kick:12345")));
});

test("disconnect is authenticated and removes only the selected identity and matching channel link", async t => {
  const f = await server(t);
  await f.finish("youtube", await f.start("youtube")); await f.finish("kick", await f.start("kick"));
  assert.equal((await f.request("/kick/connection", { method: "DELETE", headers: { "x-test-user": "unauthenticated" } })).status, 401);
  const response = await f.request("/kick/connection", { method: "DELETE" });
  assert.equal(response.status, 200);
  assert.equal(f.user("player").metadata.stream_connections.kick, undefined);
  assert.equal(f.user("player").metadata.kick, "");
  assert.equal(f.user("player").metadata.stream_connections.youtube.id, channelId);
  assert.equal(f.user("player").metadata.untouched, "keep");
});

test("missing configuration produces an honest status and no external OAuth calls", async t => {
  const f = await server(t, { env: { TOPFRAGG_PUBLIC_URL: "https://topfragg.gg" } });
  const status = await (await f.request("/status")).json();
  assert.equal(status.youtube.configured, false); assert.equal(status.kick.configured, false);
  const response = await f.request("/youtube/connect", { method: "POST" });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, "STREAM_OAUTH_NOT_CONFIGURED");
  assert.equal(f.calls.length, 0);
});

test("provider errors and absent channels do not save identities or reveal provider details", async t => {
  const f = await server(t, { fetcher: async url => String(url).endsWith("/token") ? json({ access_token: "sensitive-token" }) : json({ items: [], data: [] }) });
  for (const provider of ["youtube", "kick"]) {
    const response = await f.finish(provider, await f.start(provider));
    assert.equal(new URL(response.headers.get("location")).searchParams.get("stream_status"), "no-channel");
  }
  assert.equal(f.user("player").metadata.stream_connections, undefined);
  await assert.rejects(exchangeStreamIdentity(streamAccountConfig("youtube", environment()), "code", "verifier", async () => json({ error: "sensitive-token" }, false)), error => !error.message.includes("sensitive-token"));
});

test("account connection updates preserve other connections and blocked users cannot connect", async () => {
  const f = store();
  await saveStreamIdentity(f.db, "player", "youtube", { id: channelId, url: `https://www.youtube.com/channel/${channelId}`, display_name: "Player" });
  await saveStreamIdentity(f.db, "player", "kick", { id: "12345", url: "https://kick.com/player", display_name: "Player" });
  assert.equal(f.user("player").metadata.stream_connections.youtube.id, channelId);
  await disconnectStreamIdentity(f.db, "player", "kick");
  assert.equal(f.user("player").metadata.stream_connections.youtube.id, channelId);
  await assert.rejects(saveStreamIdentity(f.db, "unknown", "kick", { id: "new", url: "https://kick.com/new" }), { code: "ACCOUNT_UNAVAILABLE" });
});


test("generic account edits cannot forge verified stream identities, including nested metadata or admin requests", async () => {
  for (const method of ["post", "patch"]) for (const role of ["user", "ceo"]) for (const body of [
    { stream_connections: { kick: { id: "12345", url: "https://kick.com/stolen" } } },
    { metadata: { stream_connections: { youtube: { id: channelId } } } },
  ]) {
    const path = method === "post" ? "/:entity" : "/:entity/:id";
    const handler = entityRoutes.stack.find(layer => layer.route?.path === path && layer.route.methods[method]).route.stack.at(-1).handle;
    const result = await new Promise((resolve, reject) => {
      let status = 200;
      void handler({ params: { entity: "User", id: "player" }, user: { id: "player", role }, body }, { status(code) { status = code; return this; }, json(value) { resolve({ status, value }); } }, reject);
    });
    assert.equal(result.status, 403);
    assert.match(result.value.error, /streaming account connections/);
  }
});
