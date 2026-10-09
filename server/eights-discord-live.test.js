import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import express from "express";
import jwt from "jsonwebtoken";
import { once } from "node:events";
import WebSocket from "ws";
import { attachEightsLiveServer, issueEightsLiveToken, publishEightsLobbyUpdate } from "./eights-live.js";
import { issueEightsDiscordToken } from "./eights-discord-events.js";
import { createFreeEightsVoiceUpdater, startFreeEightsLiveUpdates } from "../discord/free-eights-live.js";
import { prisma } from "./prisma.js";
import routes from "./routes/functions.js";
import { signUser } from "./auth.js";

const guildId = "100000000000000001";
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const waitFor = async (condition) => {
  const until = Date.now() + 3000;
  while (!condition()) { assert.ok(Date.now() < until, "condition timed out"); await new Promise(r => setTimeout(r, 5)); }
};

test("authenticated bot receives immediate completion/cancellation events across matches, reconnects and keeps player subscriptions scoped", async (t) => {
  const env = process.env.DISCORD_GUILD_ID;
  process.env.DISCORD_GUILD_ID = guildId;
  t.after(() => { if (env === undefined) delete process.env.DISCORD_GUILD_ID; else process.env.DISCORD_GUILD_ID = env; });
  const original = prisma.wager.findUnique;
  prisma.wager.findUnique = async ({ where }) => ({ id: where.id, metadata: { match_type: "8s", status: "open" } });
  t.after(() => { prisma.wager.findUnique = original; });
  const server = http.createServer();
  const wss = attachEightsLiveServer(server);
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  t.after(() => { for (const socket of wss.clients) socket.terminate(); wss.close(); server.close(); });
  const url = `http://127.0.0.1:${server.address().port}`;
  const playerToken = await issueEightsLiveToken("staff", "match1", true);
  const player = new WebSocket(`${url.replace("http", "ws")}${playerToken.path}?token=${playerToken.token}`);
  t.after(() => player.terminate());
  assert.equal(JSON.parse(String((await once(player, "message"))[0])).type, "eights-lobby-ready");
  const playerUpdates = [];
  player.on("message", raw => playerUpdates.push(JSON.parse(String(raw))));
  const updates = [], errors = [];
  let readyCount = 0;
  const stop = startFreeEightsLiveUpdates({ guildId, publicUrl: url, reconnectMs: 10,
    onUpdate: id => updates.push(id), onReady: () => { readyCount++; }, onError: (...args) => errors.push(args) });
  t.after(stop);
  await waitFor(() => readyCount === 1);
  publishEightsLobbyUpdate("match2", "completed");
  await waitFor(() => updates.length === 1);
  assert.deepEqual(updates, ["match2"]);
  assert.deepEqual(playerUpdates, []);
  publishEightsLobbyUpdate("match1", "cancelled");
  await waitFor(() => updates.length === 2 && playerUpdates.length === 1);
  assert.equal(playerUpdates[0].reason, "cancelled");
  for (const socket of wss.clients) socket.terminate();
  await waitFor(() => readyCount === 2);
  publishEightsLobbyUpdate("match3", "cancelled");
  await waitFor(() => updates.length === 3);
  assert.deepEqual(updates, ["match2", "match1", "match3"]);
  assert.deepEqual(errors, []);
  for (const token of ["invalid", issueEightsDiscordToken("100000000000000002"),
    jwt.sign({ scope: "eights-discord", guild_id: guildId }, "wrong-secret", { audience: "eights-live", issuer: "topfragg" }),
    jwt.sign({ scope: "eights-discord", guild_id: guildId }, process.env.JWT_SECRET || "dev-secret-change-me", { audience: "eights-live", issuer: "topfragg", expiresIn: -1 })]) {
    const socket = new WebSocket(`${url.replace("http", "ws")}/api/eights-live`, { headers: { Authorization: `Bearer ${token}` } });
    let delivered = false; socket.on("message", () => { delivered = true; });
    const [code] = await once(socket, "close");
    assert.equal(code, 1008); assert.equal(delivered, false);
  }
});

test("direct voice updates bypass a blocked match, coalesce duplicates, and retry a held lock", async (t) => {
  const blocked = deferred(), started = deferred(), calls = [];
  let lockedAttempts = 0;
  const updater = createFreeEightsVoiceUpdater(async id => {
    calls.push(id);
    if (id === "busy" && calls.filter(id => id === "busy").length === 1) { started.resolve(); await blocked.promise; }
    if (id === "locked" && lockedAttempts++ === 0) return { deferredMatchIds: [id] };
    return { deferredMatchIds: [] };
  }, { retryMs: 10 });
  t.after(updater.stop);
  updater.request("busy"); await started.promise;
  updater.request("busy"); updater.request("busy");
  updater.request("completed"); updater.request("locked");
  await waitFor(() => lockedAttempts === 2);
  assert.equal(calls.filter(id => id === "completed").length, 1);
  assert.equal(calls.filter(id => id === "busy").length, 1);
  blocked.resolve();
  await waitFor(() => calls.filter(id => id === "busy").length === 2);
  updater.stop(); updater.request("after-stop");
  assert.ok(!calls.includes("after-stop"));
});

test("completion and cancellation endpoints signal the bot as soon as terminal status commits, before secondary records finish", async (t) => {
  t.mock.method(console, "info", () => {});
  const env = process.env.DISCORD_GUILD_ID;
  process.env.DISCORD_GUILD_ID = guildId;
  t.after(() => { if (env === undefined) delete process.env.DISCORD_GUILD_ID; else process.env.DISCORD_GUILD_ID = env; });
  const table = Object.fromEntries(["user", "wager", "wagerParticipant", "wagerMatch", "eightsStats", "xPStats", "playerProfile", "dispute", "notification", "ban"].map(name => [name, []]));
  const admin = { id: "admin", role: "admin", email_verified: true, metadata: {} };
  table.user.push(admin, ...Array.from({ length: 8 }, (_, i) => ({ id: `u${i}`, username: `player${i}`, wager_wins: 0, wager_losses: 0, metadata: {} })));
  let sequence = 0, recordGate = null, noticeGate = null;
  const matches = (row, where) => !where || Object.entries(where).every(([key, value]) => {
    if (key === "AND") return value.every(part => matches(row, part));
    if (key === "OR") return value.some(part => matches(row, part));
    if (key === "metadata") return row.metadata?.[value.path[0]] === value.equals;
    if (value?.in) return value.in.includes(row[key]);
    return row[key] === value;
  });
  const override = (target, method, fn) => { const original = target[method]; target[method] = fn; t.after(() => { target[method] = original; }); };
  for (const [name, rows] of Object.entries(table)) {
    override(prisma[name], "findUnique", async ({ where }) => structuredClone(rows.find(row => matches(row, where)) || null));
    override(prisma[name], "findMany", async ({ where, take } = {}) => structuredClone(rows.filter(row => matches(row, where)).slice(0, take)));
    override(prisma[name], "create", async ({ data }) => {
      if (name === "wagerMatch" && recordGate) await recordGate.promise;
      if (name === "notification" && noticeGate) await noticeGate.promise;
      const row = { id: `row${++sequence}`, created_date: new Date(), ...(name === "eightsStats" ? { free_eights_elo: 0 } : {}), ...structuredClone(data) };
      rows.push(row); return structuredClone(row);
    });
    override(prisma[name], "update", async ({ where, data }) => {
      const row = rows.find(row => matches(row, where)); assert.ok(row, `${name} row exists`);
      for (const [key, value] of Object.entries(data)) row[key] = value?.increment !== undefined ? Number(row[key] || 0) + value.increment : structuredClone(value);
      return structuredClone(row);
    });
  }
  override(prisma, "$transaction", fn => fn({ $executeRaw: async () => 1, wager: prisma.wager, wagerParticipant: prisma.wagerParticipant, eightsStats: prisma.eightsStats }));
  const app = express(); app.use(express.json()); app.use("/api/functions", routes);
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message }));
  const server = app.listen(0, "127.0.0.1"), wss = attachEightsLiveServer(server);
  await once(server, "listening");
  t.after(() => { recordGate?.resolve(); noticeGate?.resolve(); for (const socket of wss.clients) socket.terminate(); wss.close(); server.closeAllConnections(); server.close(); });
  const url = `http://127.0.0.1:${server.address().port}`;
  const bot = new WebSocket(`${url.replace("http", "ws")}/api/eights-live`, { headers: { Authorization: `Bearer ${issueEightsDiscordToken(guildId)}` } });
  t.after(() => bot.terminate());
  await once(bot, "message");
  const events = []; bot.on("message", raw => events.push(JSON.parse(String(raw))));
  for (const game_id of ["bo7", "bo6", "mw3"]) for (const action of ["completeWager", "refundWager"]) {
    const id = `${game_id}-${action}`;
    table.wager.push({ id, created_date: new Date(), metadata: { match_type: "8s", game_id, status: "in_progress", host_id: "u0", challenger_id: "u4", host_name: "Alpha", challenger_name: "Bravo", entry_fee: 0 } });
    table.wagerParticipant.push(...Array.from({ length: 8 }, (_, i) => ({ id: `${id}-p${i}`, metadata: { wager_id: id, user_id: `u${i}`, team: i < 4 ? "host" : "challenger" } })));
    recordGate = action === "completeWager" ? deferred() : null;
    noticeGate = action === "refundWager" ? deferred() : null;
    const request = fetch(`${url}/api/functions/${action}`, { method: "POST", headers: { Authorization: `Bearer ${signUser(admin)}`, "Content-Type": "application/json" },
      body: JSON.stringify({ wager_id: id, winner_id: "u0", team_alpha_score: 2, team_bravo_score: 0 }) });
    await waitFor(() => events.some(event => event.wager_id === id));
    const terminal = action === "completeWager" ? "completed" : "cancelled";
    assert.equal(events.find(event => event.wager_id === id).reason, terminal);
    assert.equal(table.wager.find(row => row.id === id).metadata.status, terminal);
    recordGate?.resolve(); noticeGate?.resolve();
    const response = await request, body = await response.json();
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(body.success, true, JSON.stringify(body));
  }
});
