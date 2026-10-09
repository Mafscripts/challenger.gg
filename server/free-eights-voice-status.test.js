import test from "node:test";
import assert from "node:assert/strict";
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
