import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import discordRoutes from "./routes/discord.js";
import { prisma } from "./prisma.js";
import { signUser } from "./auth.js";
import { voiceRosterSignature } from "./free-eights-discord.js";
import { freeEightsVoiceDisplaySignature, freeEightsVoiceView, recordFreeEightsVoiceResponse } from "../src/lib/freeEightsVoiceStatus.js";

const players = [{ user_id: "a", team: "host" }, { user_id: "b", team: "challenger" }];
const data = () => ({ enabled: true, configured: true, fresh: true, snapshot_age_ms: 1000,
  checked_at: "2000-01-01T00:00:00Z", players: players.map((player) => ({ ...player, status: "in_waiting_room" })) });
const receive = (previous, extras = {}) => recordFreeEightsVoiceResponse(previous, { matchId: "match1", userId: "a", now: 100_000, data: data(), ...extras });

test("one failed request retains the recent exact-roster status without an orange outage", () => {
  const good = receive(null);
  const failed = receive(good, { failed: true, now: 102_000 });
  const view = freeEightsVoiceView(failed, players, 102_000);
  assert.equal(view.available, true);
  assert.equal(view.refreshing, true);
  assert.equal(view.warning, false);
  assert.equal(view.readyCount, 2);
  assert.deepEqual(failed.data, good.data);
});

test("short roster/snapshot refresh is neutral checking, while sustained unavailability warns", () => {
  const good = receive(null);
  const pending = receive(good, { data: { ...data(), fresh: false, snapshot_age_ms: 21000 }, now: 105_000 });
  const brief = freeEightsVoiceView(pending, players, 108_000);
  assert.equal(brief.checking, true);
  assert.equal(brief.warning, false);
  assert.equal(brief.readyCount, 0, "no stale readiness is presented as confirmed");
  const long = freeEightsVoiceView(pending, players, 120_000);
  assert.equal(long.checking, false);
  assert.equal(long.warning, true);
});

test("old snapshots expire even when every subsequent request fails", () => {
  const good = receive(null);
  const failed = receive(good, { failed: true, now: 118_000 });
  assert.equal(freeEightsVoiceView(failed, players, 119_000).readyCount, 0);
  assert.equal(freeEightsVoiceView(failed, players, 119_000).checking, true);
  assert.equal(freeEightsVoiceView(failed, players, 134_000).warning, true);
});

test("server snapshot age avoids false outages caused by a different client clock", () => {
  const good = receive(null, { now: 9999999999999 });
  assert.equal(freeEightsVoiceView(good, players, 10000000000999).available, true);
  assert.equal(freeEightsVoiceView(good, players, 10000000019999).available, false);
});

test("new room/user scope cannot reuse a prior room's green readiness", () => {
  const good = receive(null);
  for (const change of [{ matchId: "match2" }, { userId: "different" }]) {
    const failed = receive(good, { ...change, failed: true, now: 102000 });
    assert.equal(failed.data, null);
    assert.equal(freeEightsVoiceView(failed, players, 102000).readyCount, 0);
  }
  assert.equal(freeEightsVoiceView(good, [{ ...players[0], team: "challenger" }, players[1]], 102000).readyCount, 0);
});

test("actual missing players and explicit bot/configuration problems are not hidden", () => {
  const missing = data(); missing.players[1].status = "not_in_waiting_room";
  assert.equal(freeEightsVoiceView(receive(null, { data: missing }), players, 100000).readyCount, 1);
  for (const overrides of [{ enabled: false }, { configured: false }, { error: "Team channels could not be prepared" }]) {
    const view = freeEightsVoiceView(receive(null, { data: { ...data(), ...overrides } }), players, 100000);
    assert.equal(view.warning, true);
    assert.equal(view.checking, false);
  }
});

test("successful refresh clears temporary transport errors", () => {
  const failed = receive(receive(null), { failed: true, now: 102000 });
  const recovered = receive(failed, { now: 104000 });
  assert.equal(freeEightsVoiceView(recovered, players, 104000).refreshing, false);
  assert.equal(freeEightsVoiceView(recovered, players, 104000).readyCount, 2);
});

test("pending and stale checks keep the last observed badges while readiness expires internally", () => {
  const good = receive(null);
  const pending = receive(good, { data: { ...data(), fresh: false, snapshot_age_ms: 30000,
    players: players.map((player) => ({ ...player, status: "unavailable" })) }, now: 130000 });
  const view = freeEightsVoiceView(pending, players, 150000);
  assert.deepEqual(view.playerStates.map((player) => player.status), ["in_waiting_room", "in_waiting_room"]);
  assert.equal(view.displayReadyCount, 2);
  assert.equal(view.hasConfirmedStatus, true);
  assert.equal(view.readyCount, 0);
  assert.equal(view.available, false);
  assert.equal(freeEightsVoiceDisplaySignature(pending, players), freeEightsVoiceDisplaySignature(good, players));
});

test("repeated timestamps, request failures and bot errors do not change the displayed status", () => {
  const good = receive(null);
  const signature = freeEightsVoiceDisplaySignature(good, players);
  const repeated = receive(good, { data: { ...data(), checked_at: "2026-10-09T10:00:00Z" }, now: 104000 });
  const failed = receive(repeated, { failed: true, now: 106000 });
  const botError = receive(failed, { data: { ...data(), error: "Team channels could not be prepared" }, now: 108000 });
  for (const result of [repeated, failed, botError]) assert.equal(freeEightsVoiceDisplaySignature(result, players), signature);
  assert.equal(freeEightsVoiceView(botError, players, 108000).warning, true, "technical health remains available internally");
});

test("a confirmed channel change replaces the badge without clearing other players", () => {
  const good = receive(null);
  const changedData = data(); changedData.players[0].status = "not_in_waiting_room";
  const changed = receive(good, { data: changedData, now: 104000 });
  const view = freeEightsVoiceView(changed, players, 104000);
  assert.deepEqual(view.playerStates.map((player) => player.status), ["not_in_waiting_room", "in_waiting_room"]);
  assert.equal(view.displayReadyCount, 1);
  assert.notEqual(freeEightsVoiceDisplaySignature(changed, players), freeEightsVoiceDisplaySignature(good, players));
});

test("unconfirmed first checks and technical player statuses show a neutral placeholder", () => {
  const initial = freeEightsVoiceView(null, players);
  assert.deepEqual(initial.playerStates.map((player) => player.status), ["unknown", "unknown"]);
  assert.equal(initial.hasConfirmedStatus, false);
  const good = receive(null);
  const checkingData = data(); checkingData.players[0].status = "checking";
  const checking = receive(good, { data: checkingData, now: 104000 });
  assert.equal(freeEightsVoiceView(checking, players, 104000).playerStates[0].status, "in_waiting_room");
  assert.equal(freeEightsVoiceView(receive(null, { data: checkingData }), players, 100000).playerStates[0].status, "unknown");
});

test("a roster change preserves unchanged players but does not reuse the wrong team's channel", () => {
  const good = receive(null);
  const changedPlayers = [{ ...players[0], team: "challenger" }, players[1], { user_id: "new", team: "host" }];
  assert.deepEqual(freeEightsVoiceView(good, changedPlayers, 102000).playerStates.map((player) => player.status), ["unknown", "in_waiting_room", "unknown"]);
  for (const change of [{ matchId: "match2" }, { userId: "different" }]) {
    const next = receive(good, { ...change, failed: true, now: 102000 });
    assert.equal(next.lastConfirmed, undefined);
    assert.equal(freeEightsVoiceView(next, players).hasConfirmedStatus, false);
  }
});

test("the last confirmed waiting room link survives a temporary missing snapshot", () => {
  const good = receive(null, { data: { ...data(), waiting_room_url: "https://discord.com/channels/guild/room" } });
  const pending = receive(good, { data: { ...data(), fresh: false, waiting_room_url: null }, now: 105000 });
  assert.equal(freeEightsVoiceView(pending, players, 105000).voice.waiting_room_url, good.data.waiting_room_url);
  assert.equal(freeEightsVoiceDisplaySignature(pending, players), freeEightsVoiceDisplaySignature(good, players));
});

test("voice API reads run together and still enforce authentication, lobby membership and match type", async (t) => {
  const saved = [];
  const override = (target, key, value) => { saved.push(() => { target[key] = value; }); target[key] = value; };
  t.after(() => saved.reverse().forEach((restore) => restore()));
  const env = { DISCORD_FREE_8S_VOICE_ENABLED: "true", DISCORD_GUILD_ID: "100000000000000001", DISCORD_FREE_8S_VOICE_CATEGORY_ID: "100000000000000003" };
  for (const [key, value] of Object.entries(env)) {
    const original = process.env[key];
    saved.push(() => { if (original === undefined) delete process.env[key]; else process.env[key] = original; });
    process.env[key] = value;
  }
  let account = { id: "a", username: "player_a", role: "user", email_verified: true, metadata: {} };
  let matchType = "8s", readFailure = false, started = [];
  const match = () => ({ id: "match1", match_type: matchType, status: "open", teams_generated_at: "revision" });
  const read = async (name, value) => {
    started.push(name);
    await Promise.resolve();
    assert.equal(started.length, 3, "all snapshot reads should start before any finishes");
    if (readFailure) throw new Error("Snapshot read failed");
    return value;
  };
  override(prisma.user, "findUnique", async () => account);
  override(prisma.ban, "findMany", async () => []);
  override(prisma.wager, "findUnique", async () => read("match", { id: "match1", metadata: match() }));
  override(prisma.wagerParticipant, "findMany", async () => read("roster", players.map((metadata) => ({ metadata }))));
  override(prisma.discordEventDispatch, "findUnique", async () => read("voice", { metadata: {
    match_id: "match1", guild_id: env.DISCORD_GUILD_ID, category_id: env.DISCORD_FREE_8S_VOICE_CATEGORY_ID,
    channels: { waiting: "100000000000000002" }, waiting_room_id: "100000000000000002",
    checked_at: new Date().toISOString(), roster_signature: voiceRosterSignature(match(), players),
    players: Object.fromEntries(players.map((player) => [player.user_id, { status: "in_waiting_room" }])),
  } }));
  const app = express(); app.use("/discord", discordRoutes);
  app.use((error, _req, res, _next) => res.status(500).json({ error: error.message }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const request = async (authenticated = true) => {
    started = [];
    const response = await fetch(`http://127.0.0.1:${server.address().port}/discord/free-eights/match1`, {
      headers: authenticated ? { Authorization: `Bearer ${signUser(account)}` } : {},
    });
    return { status: response.status, body: await response.json() };
  };
  const member = await request();
  assert.equal(member.status, 200);
  assert.equal(member.body.fresh, true);
  assert.equal(member.body.players.length, 2);
  assert.deepEqual(started, ["match", "roster", "voice"]);
  assert.equal((await request(false)).status, 401);
  assert.deepEqual(started, []);
  account = { ...account, id: "outsider" };
  const outsider = await request(); assert.equal(outsider.status, 403); assert.equal(outsider.body.players, undefined);
  account = { ...account, role: "moderator" }; assert.equal((await request()).status, 200);
  matchType = "money8s"; assert.equal((await request()).status, 404);
  matchType = "8s"; readFailure = true; assert.equal((await request()).status, 500);
});
