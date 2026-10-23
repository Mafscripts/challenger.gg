import test from "node:test";
import assert from "node:assert/strict";
import { retainHeaderSnapshot } from "../src/lib/headerSnapshot.js";

test("unchanged notification polls retain the rendered snapshot", () => {
  const current = [{ id: "notification", is_read: false, title: "Match ready", metadata: { match_id: "match" } }];
  assert.equal(retainHeaderSnapshot(current, structuredClone(current)), current);
  assert.equal(retainHeaderSnapshot(current, current), current);
});
test("read state, message edits and nested sender changes replace the snapshot", () => {
  const current = [{ id: "message", is_read: false, body: "Ready?", sender: { name: "Player", avatar: "old.png" } }];
  for (const change of [row => { row.is_read = true; }, row => { row.body = "Let's play"; }, row => { row.sender.avatar = "new.png"; }]) {
    const next = structuredClone(current);
    change(next[0]);
    assert.equal(retainHeaderSnapshot(current, next), next);
  }
});
test("removed matches, new entries and changes to ordering remain visible", () => {
  const current = [{ id: "a", status: "ready" }, { id: "b", status: "playing" }];
  for (const next of [[], current.slice(1), [...current, { id: "c" }], [...current].reverse()]) assert.equal(retainHeaderSnapshot(current, next), next);
});
test("account wallet, role and profile changes are never hidden", () => {
  const current = { id: "player", role: "user", wallet: { available_balance: 10 }, player_profile: { avatar_url: "old.png" } };
  assert.equal(retainHeaderSnapshot(current, structuredClone(current)), current);
  for (const change of [row => { row.role = "admin"; }, row => { row.wallet.available_balance = 20; }, row => { row.player_profile.avatar_url = "new.png"; }]) {
    const next = structuredClone(current);
    change(next);
    assert.equal(retainHeaderSnapshot(current, next), next);
  }
  assert.equal(retainHeaderSnapshot(current, null), null);
});
