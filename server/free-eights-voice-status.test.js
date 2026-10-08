import test from "node:test";
import assert from "node:assert/strict";
import { freeEightsVoiceView, recordFreeEightsVoiceResponse } from "../src/lib/freeEightsVoiceStatus.js";

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
