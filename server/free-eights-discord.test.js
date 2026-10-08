import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import express from "express";
import discordRoutes, { createState, readState, safeDiscordReturnTo } from "./routes/discord.js";
import functionRoutes from "./routes/functions.js";
import entityRoutes from "./routes/entities.js";
import { prisma } from "./prisma.js";
import { signUser } from "./auth.js";

test("OAuth state protects account identity, expiry and permitted return paths", () => {
  const state = createState("player1", "test-secret", "/ranked/8s");
  assert.equal(readState(state, "test-secret").userId, "player1");
  assert.equal(readState(state, "test-secret").returnTo, "/ranked/8s");
  assert.equal(readState(state, "wrong-secret"), null);
  assert.equal(readState(`${state}tampered`, "test-secret"), null);
  const payload = Buffer.from(JSON.stringify({ userId: "player1", expiresAt: Date.now() - 1 })).toString("base64url");
  const signature = crypto.createHmac("sha256", "test-secret").update(payload).digest("base64url");
  assert.equal(readState(`${payload}.${signature}`, "test-secret"), null);
  for (const path of ["https://evil.example", "//evil.example", "/ranked/8s?mode=money", "/8s-match/../settings", "/wagers-match/1"]) {
    assert.equal(safeDiscordReturnTo(path), "/settings");
  }
  assert.equal(safeDiscordReturnTo("/matchfinder?category=eights"), "/matchfinder?category=eights");
});

test("authenticated Free 8s API and existing OAuth integration", async (t) => {
  const environment = {
    DISCORD_CLIENT_ID: "100000000000000001", DISCORD_CLIENT_SECRET: "fake-oauth-secret",
    DISCORD_OAUTH_STATE_SECRET: "test-state-secret", DISCORD_OAUTH_REDIRECT_URI: "http://localhost/api/discord/callback",
    TOPFRAGG_PUBLIC_URL: "http://localhost", DISCORD_TOKEN: "fake-bot-token", DISCORD_GUILD_ID: "100000000000000002",
    DISCORD_FREE_8S_VOICE_ENABLED: "true", DISCORD_FREE_8S_VOICE_CATEGORY_ID: "100000000000000003",
    DISCORD_FREE_8S_WAITING_ROOM_ID: "100000000000000004",
  };
  const previousEnv = Object.fromEntries(Object.keys(environment).map((key) => [key, process.env[key]]));
  Object.assign(process.env, environment);
  t.after(() => { for (const [key, value] of Object.entries(previousEnv)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
  let account = { id: "player1", email_verified: true, role: "user", metadata: { activision_id: "Test#12345" } };
  let owner = null;
  let active = false;
  let matchType = "8s";
  let participant = true;
  let voiceState = null;
  let updates = 0;
  const override = (target, method, implementation) => {
    const previous = target[method];
    target[method] = implementation;
    t.after(() => { target[method] = previous; });
  };
  override(prisma.user, "findUnique", async ({ where }) => where.discord_user_id ? owner : account);
  override(prisma.user, "update", async ({ data }) => { updates++; account = { ...account, ...data }; return account; });
  override(prisma.ban, "findMany", async () => []);
  override(prisma.wager, "findUnique", async () => ({ id: "match1", metadata: { match_type: matchType, status: "open" } }));
  override(prisma.wager, "findMany", async () => active ? [{ id: "match1", metadata: { match_type: "8s", status: "open" } }] : []);
  override(prisma.wagerParticipant, "findMany", async () => participant ? [{ metadata: { user_id: account.id, wager_id: "match1", team: "host" } }] : []);
  override(prisma.discordEventDispatch, "findUnique", async () => voiceState ? { metadata: voiceState } : null);
  const realFetch = globalThis.fetch;
  let discordRequests = 0;
  let memberStatus = 200;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    if (!String(url).startsWith("https://discord.com/api/")) return realFetch(url, options);
    discordRequests++;
    const path = new URL(url).pathname;
    if (path.includes("/members/") && !path.includes("/roles/") && (!options?.method || options.method === "GET")) {
      return memberStatus === 200 ? Response.json({ user: { id: "200000000000000001" } }) : Response.json({ code: memberStatus === 404 ? 10007 : 0 }, { status: memberStatus });
    }
    if (path.endsWith("/oauth2/token")) return Response.json({ access_token: "fake-access-token" });
    if (path.endsWith("/users/@me")) return Response.json({ id: "200000000000000001", username: "test-discord" });
    if (path.endsWith("/roles") && !path.includes("/members/")) return Response.json([{ id: "300000000000000001", name: "Verified Player" }]);
    if (options?.method === "PUT") return new Response(null, { status: 204 });
    return Response.json({ id: "200000000000000001" });
  });
  const app = express();
  app.use(express.json());
  app.use("/api/discord", discordRoutes);
  app.use("/api/functions", functionRoutes);
  app.use("/api/entities", entityRoutes);
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (path, options = {}, auth = true) => realFetch(`${base}${path}`, { ...options, redirect: "manual",
    headers: { "Content-Type": "application/json", ...(auth ? { Authorization: `Bearer ${signUser(account)}` } : {}), ...options.headers } });
  const connect = async (returnTo = "/ranked/8s") => {
    const response = await request("/api/discord/connect", { method: "POST", body: JSON.stringify({ return_to: returnTo, user_id: "attacker", discord_user_id: "forged" }) });
    const body = await response.json();
    assert.equal(new URL(body.authorization_url).searchParams.get("scope"), "identify");
    return { response, state: new URL(body.authorization_url).searchParams.get("state"), cookie: response.headers.get("set-cookie").split(";")[0] };
  };

  await t.test("unauthenticated linking, readiness and queue actions are rejected", async () => {
    for (const [path, method] of [["/api/discord/connect", "POST"], ["/api/discord/membership", "GET"], ["/api/discord/free-eights/match1", "GET"], ["/api/functions/acceptWager", "POST"]]) {
      assert.equal((await request(path, { method }, false)).status, 401);
    }
  });
  await t.test("create and join cannot bypass mandatory linking with forged frontend ID", async () => {
    for (const action of ["createWager", "acceptWager"]) {
      const response = await request(`/api/functions/${action}`, { method: "POST", body: JSON.stringify({ match_type: "8s", wager_id: "match1", team_size: "4v4", discord_user_id: "200000000000000001" }) });
      assert.equal((await response.json()).code, "FREE_EIGHTS_DISCORD_REQUIRED");
    }
    assert.equal(updates, 0);
  });
  await t.test("connect binds authenticated user and secure browser cookie", async () => {
    const result = await connect();
    assert.equal(readState(result.state, environment.DISCORD_OAUTH_STATE_SECRET).userId, account.id);
    assert.match(result.response.headers.get("set-cookie"), /HttpOnly/);
    assert.match(result.response.headers.get("set-cookie"), /SameSite=Lax/);
    const before = discordRequests;
    const response = await request(`/api/discord/callback?code=test&state=${encodeURIComponent(result.state)}`, {}, false);
    assert.equal(new URL(response.headers.get("location")).searchParams.get("discord"), "invalid");
    assert.equal(discordRequests, before);
    assert.equal(updates, 0);
  });
  await t.test("existing Discord owner blocks duplicate link", async () => {
    const result = await connect();
    owner = { id: "other-account" };
    const response = await request(`/api/discord/callback?code=test&state=${encodeURIComponent(result.state)}`, { headers: { Cookie: result.cookie } }, false);
    assert.equal(new URL(response.headers.get("location")).searchParams.get("discord"), "already-linked");
    assert.equal(updates, 0);
    owner = null;
  });
  await t.test("OAuth identity links and returns to Free 8s", async () => {
    const result = await connect("/matchfinder?category=eights");
    const response = await request(`/api/discord/callback?code=test&state=${encodeURIComponent(result.state)}`, { headers: { Cookie: result.cookie } }, false);
    const destination = new URL(response.headers.get("location"));
    assert.equal(destination.pathname, "/matchfinder");
    assert.equal(destination.searchParams.get("category"), "eights");
    assert.equal(destination.searchParams.get("discord"), "connected");
    assert.equal(account.discord_user_id, "200000000000000001");
    assert.equal(updates, 1);
  });
  await t.test("readiness is restricted to Free 8s players", async () => {
    assert.equal((await request("/api/discord/free-eights/match1")).status, 200);
    participant = false;
    assert.equal((await request("/api/discord/free-eights/match1")).status, 403);
    participant = true;
    matchType = "money8s";
    assert.equal((await request("/api/discord/free-eights/match1")).status, 404);
    matchType = "8s";
  });
  await t.test("the real voice endpoint binds the private room to its authoritative match ID", async () => {
    voiceState = { match_id: "match1", guild_id: environment.DISCORD_GUILD_ID,
      category_id: environment.DISCORD_FREE_8S_VOICE_CATEGORY_ID,
      waiting_room_id: "300000000000000001", channels: { waiting: "300000000000000001" } };
    const response = await request("/api/discord/free-eights/match1");
    assert.equal(response.status, 200);
    assert.equal((await response.json()).waiting_room_url, "https://discord.com/channels/100000000000000002/300000000000000001");
    voiceState.match_id = "another-match";
    assert.equal((await (await request("/api/discord/free-eights/match1")).json()).waiting_room_url, null);
    assert.equal((await (await request("/api/discord/free-eights")).json()).waiting_room_url, null);
    voiceState = null;
  });
  await t.test("active Free 8s prevents unlink and account replacement", async () => {
    active = true;
    assert.equal((await request("/api/discord/connection", { method: "DELETE" })).status, 409);
    account.discord_user_id = "200000000000000002";
    const result = await connect();
    const response = await request(`/api/discord/callback?code=test&state=${encodeURIComponent(result.state)}`, { headers: { Cookie: result.cookie } }, false);
    assert.equal(new URL(response.headers.get("location")).searchParams.get("discord"), "active-free-8s");
    assert.equal(updates, 1);
  });
  await t.test("clients cannot read or mutate internal Discord worker state", async () => {
    for (const [path, method] of [["/api/entities/DiscordEventDispatch", "GET"], ["/api/entities/DiscordEventDispatch", "POST"], ["/api/entities/DiscordEventDispatch/id", "PATCH"], ["/api/entities/DiscordEventDispatch/id", "DELETE"]]) {
      assert.equal((await request(path, { method, ...(method === "PATCH" || method === "POST" ? { body: "{}" } : {}) })).status, 403);
    }
  });
  await t.test("linked nonmembers are immediately sent to the fixed server invitation after OAuth", async () => {
    active = false;
    memberStatus = 404;
    const result = await connect("/ranked/8s");
    const response = await request(`/api/discord/callback?code=test&state=${encodeURIComponent(result.state)}`, { headers: { Cookie: result.cookie } }, false);
    assert.equal(response.status, 302);
    assert.equal(response.headers.get("location"), "https://discord.gg/JwSgTHcHXe");
    assert.equal(account.discord_user_id, "200000000000000001");
    const membership = await (await request("/api/discord/membership")).json();
    assert.equal(membership.code, "FREE_EIGHTS_DISCORD_SERVER_REQUIRED");
  });
  await t.test("membership checks are fresh, recover after joining, and never treat upstream failure as confirmed membership", async () => {
    memberStatus = 200;
    assert.equal((await (await request("/api/discord/membership")).json()).in_guild, true);
    memberStatus = 500;
    assert.equal((await (await request("/api/discord/membership")).json()).code, "FREE_EIGHTS_DISCORD_MEMBERSHIP_UNAVAILABLE");
    memberStatus = 404;
    assert.equal((await (await request("/api/discord/membership")).json()).code, "FREE_EIGHTS_DISCORD_SERVER_REQUIRED");
    memberStatus = 200;
    assert.equal((await (await request("/api/discord/membership")).json()).in_guild, true);
  });
});
