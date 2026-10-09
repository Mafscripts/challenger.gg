import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import discordRoutes from "./routes/discord.js";
import { discordAvatarUrl } from "./discord.js";
import { prisma } from "./prisma.js";
import { signUser } from "./auth.js";

test("Discord avatars use the current account hash and handle removed or animated avatars", () => {
  const id = "200000000000000001";
  assert.equal(discordAvatarUrl({ id, avatar: "latest_hash" }), `https://cdn.discordapp.com/avatars/${id}/latest_hash.png?size=256`);
  assert.equal(discordAvatarUrl({ id, avatar: "a_animated_hash" }), `https://cdn.discordapp.com/avatars/${id}/a_animated_hash.gif?size=256`);
  assert.equal(discordAvatarUrl({ id, avatar: null }), null);
});

test("disconnecting the website identity preserves the automatic Discord community role", async (t) => {
  const user = { id: "account", role: "user", email_verified: true, metadata: {}, discord_user_id: "200000000000000001" };
  const override = (target, name, implementation) => {
    const previous = target[name]; target[name] = implementation;
    t.after(() => { target[name] = previous; });
  };
  override(prisma.user, "findUnique", async () => structuredClone(user));
  override(prisma.ban, "findMany", async () => []);
  override(prisma.wagerParticipant, "findMany", async () => []);
  override(prisma.user, "update", async ({ where, data }) => {
    assert.equal(where.id, user.id);
    assert.equal(data.discord_user_id, null);
    return { ...user, ...data };
  });
  const realFetch = globalThis.fetch;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.ok(!String(url).startsWith("https://discord.com/"), "Disconnect must not remove a Discord role");
    return realFetch(url, options);
  });
  const app = express(); app.use("/api/discord", discordRoutes);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const response = await realFetch(`http://127.0.0.1:${server.address().port}/api/discord/connection`, {
    method: "DELETE", headers: { Authorization: `Bearer ${signUser(user)}` },
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { connected: false });
});

test("authenticated role sync refreshes only the still-linked Discord profile and tolerates unavailable updates", async (t) => {
  const env = { DISCORD_TOKEN: "test-bot-token", DISCORD_GUILD_ID: "100000000000000001" };
  for (const [key, value] of Object.entries(env)) {
    const previous = process.env[key]; process.env[key] = value;
    t.after(() => { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; });
  }
  const id = "200000000000000001";
  let user = { id: "account", role: "user", email_verified: true, metadata: {}, discord_user_id: id,
    discord_username: "old-name", discord_display_name: "Old name", discord_avatar_url: "https://cdn.discordapp.com/avatars/old.png",
    discord_connected_at: new Date("2026-10-07T00:00:00Z") };
  let profile = { id, username: "new-name", global_name: "New name", avatar: "current_hash" };
  let profileStatus = 200, inGuild = true, unlinkDuringLookup = false;
  let membershipStatus = 200, rolesStatus = 200, assignmentStatus = 204, discordErrorCode = 50013;
  let roleWrites = 0, profileCalls = 0;
  const writes = [];
  const override = (target, name, implementation) => {
    const previous = target[name]; target[name] = implementation;
    t.after(() => { target[name] = previous; });
  };
  override(prisma.user, "findUnique", async () => structuredClone(user));
  override(prisma.ban, "findMany", async () => []);
  override(prisma.user, "updateMany", async ({ where, data }) => {
    writes.push({ where, data });
    if (user.id !== where.id || user.discord_user_id !== where.discord_user_id) return { count: 0 };
    user = { ...user, ...data }; return { count: 1 };
  });
  const realFetch = globalThis.fetch;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    if (!String(url).startsWith("https://discord.com/api/v10/")) return realFetch(url, options);
    assert.equal(options.headers.Authorization, "Bot test-bot-token");
    const path = new URL(url).pathname;
    if (path === `/api/v10/users/${id}`) {
      profileCalls++;
      if (unlinkDuringLookup) user = { ...user, discord_user_id: null, discord_avatar_url: null };
      return Response.json(profile, { status: profileStatus });
    }
    if (path.includes("/members/") && options.method === "GET") {
      if (membershipStatus !== 200) return Response.json({ code: discordErrorCode }, { status: membershipStatus });
      return inGuild ? Response.json({ user: { id } }) : Response.json({ code: 10007 }, { status: 404 });
    }
    if (path.endsWith("/roles") && options.method === "GET") return rolesStatus === 200
      ? Response.json([{ id: "300000000000000001", name: "Verified Player" }])
      : Response.json({ code: discordErrorCode }, { status: rolesStatus });
    if (options.method === "PUT") {
      roleWrites++;
      return assignmentStatus === 204 ? new Response(null, { status: 204 }) : Response.json({ code: discordErrorCode }, { status: assignmentStatus });
    }
    assert.fail(`Unexpected Discord request: ${path}`);
  });
  const warnings = [];
  t.mock.method(console, "warn", (...args) => warnings.push(args));
  const app = express(); app.use(express.json()); app.use("/api/discord", discordRoutes);
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const sync = (authenticated = true) => realFetch(`http://127.0.0.1:${server.address().port}/api/discord/sync`, {
    method: "POST", headers: { "Content-Type": "application/json", ...(authenticated ? { Authorization: `Bearer ${signUser(user)}` } : {}) },
    body: JSON.stringify({ discord_user_id: "200000000000009999", avatar_url: "https://forged.example/avatar" }),
  });
  assert.equal((await sync(false)).status, 401);
  assert.equal(profileCalls, 0);
  const connectedAt = user.discord_connected_at;
  const first = await sync();
  assert.equal(first.status, 200);
  assert.deepEqual(await first.json(), { connected: true, inGuild: true, roleAssigned: true, roleId: "300000000000000001", profileRefreshed: true });
  assert.equal(user.discord_avatar_url, `https://cdn.discordapp.com/avatars/${id}/current_hash.png?size=256`);
  assert.equal(user.discord_username, "new-name");
  assert.equal(user.discord_display_name, "New name");
  assert.equal(user.discord_user_id, id);
  assert.equal(user.discord_connected_at, connectedAt);
  assert.deepEqual(Object.keys(writes[0].data).sort(), ["discord_avatar_url", "discord_display_name", "discord_username"]);
  assert.deepEqual(writes[0].where, { id: "account", discord_user_id: id });

  profile = { id, username: "new-name", avatar: null };
  assert.equal((await (await sync()).json()).profileRefreshed, true);
  assert.equal(user.discord_avatar_url, null);
  assert.equal(user.discord_display_name, "new-name");

  const beforeFailure = structuredClone(user), writeCount = writes.length;
  profileStatus = 503;
  const unavailable = await sync();
  assert.equal(unavailable.status, 200);
  assert.equal((await unavailable.json()).profileRefreshed, false);
  assert.equal(writes.length, writeCount);
  assert.deepEqual(user, beforeFailure);
  assert.ok(warnings.length > 0);

  profileStatus = 200;
  profile = { id: "200000000000000002", username: "wrong-account", avatar: "wrong-hash" };
  assert.equal((await (await sync()).json()).profileRefreshed, false);
  assert.equal(writes.length, writeCount);
  assert.deepEqual(user, beforeFailure);

  profile = { id, username: "latest", avatar: "latest_hash" };
  inGuild = false;
  const notInServer = await (await sync()).json();
  assert.equal(notInServer.roleAssigned, false);
  assert.equal(notInServer.profileRefreshed, true);
  assert.equal(user.discord_username, "latest");
  assert.equal(roleWrites, 4);

  inGuild = true;
  await t.test("role permission errors still refresh the linked avatar and explain the Discord fix", async () => {
    assignmentStatus = 403;
    profile = { id, username: "permission-test", avatar: "refreshed_despite_403" };
    const response = await sync();
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.connected, true);
    assert.equal(result.roleAssigned, false);
    assert.equal(result.profileRefreshed, true);
    assert.equal(result.roleSyncError.code, "DISCORD_ROLE_PERMISSIONS_REQUIRED");
    assert.match(result.roleSyncError.message, /Manage Roles/);
    assert.match(result.roleSyncError.message, /above Verified Player/);
    assert.equal(user.discord_avatar_url, `https://cdn.discordapp.com/avatars/${id}/refreshed_despite_403.png?size=256`);
    assert.equal(user.discord_user_id, id);
    assert.equal(user.discord_connected_at, connectedAt);
  });

  await t.test("server access errors are distinguished from role hierarchy errors", async () => {
    for (const phase of ["membership", "roles", "assignment"]) {
      membershipStatus = phase === "membership" ? 403 : 200;
      rolesStatus = phase === "roles" ? 403 : 200;
      assignmentStatus = phase === "assignment" ? 403 : 204;
      discordErrorCode = 50001;
      const roleWritesBefore = roleWrites;
      const result = await (await sync()).json();
      assert.equal(result.profileRefreshed, true);
      assert.equal(result.roleAssigned, false);
      assert.equal(result.inGuild, undefined);
      assert.equal(result.roleSyncError.code, "DISCORD_SERVER_ACCESS_REQUIRED");
      assert.match(result.roleSyncError.message, /server membership/);
      assert.equal(roleWrites, roleWritesBefore + (phase === "assignment" ? 1 : 0));
    }
  });

  await t.test("simultaneous role and profile failures do not modify the linked account or claim success", async () => {
    profileStatus = 503;
    discordErrorCode = 50013;
    const before = structuredClone(user), count = writes.length;
    const result = await (await sync()).json();
    assert.equal(result.profileRefreshed, false);
    assert.equal(result.roleAssigned, false);
    assert.equal(result.roleSyncError.code, "DISCORD_ROLE_PERMISSIONS_REQUIRED");
    assert.deepEqual(user, before);
    assert.equal(writes.length, count);
    profileStatus = 200;
    assignmentStatus = 204;
  });

  unlinkDuringLookup = true;
  assert.equal((await (await sync()).json()).profileRefreshed, false);
  assert.equal(user.discord_user_id, null);
  assert.equal(user.discord_avatar_url, null);
  const profileCallsBefore = profileCalls;
  assert.equal((await sync()).status, 400);
  assert.equal(profileCalls, profileCallsBefore);
});
