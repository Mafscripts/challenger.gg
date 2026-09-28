import test from "node:test";
import assert from "node:assert/strict";
import { rankedVoiceMembershipFor } from "./ranked-voice.js";

const match = (status) => ({
  id: "ranked-1",
  status,
  team_alpha_player_ids: ["alpha-1", "alpha-2"],
  team_bravo_player_ids: ["bravo-1", "bravo-2"],
});

test("ranked voice waits until the ready check completes", () => {
  const membership = rankedVoiceMembershipFor(match("ready_check"), "alpha-1");
  assert.equal(membership.stage, "waiting");
  assert.equal(membership.channelId, null);
});

test("all ready players share global voice before live", () => {
  const alpha = rankedVoiceMembershipFor(match("ready"), "alpha-1");
  const bravo = rankedVoiceMembershipFor(match("ready"), "bravo-1");
  assert.equal(alpha.stage, "global");
  assert.equal(alpha.channelId, bravo.channelId);
});

test("live ranked voice is isolated by server-owned team rosters", () => {
  const alphaOne = rankedVoiceMembershipFor(match("in_progress"), "alpha-1");
  const alphaTwo = rankedVoiceMembershipFor(match("in_progress"), "alpha-2");
  const bravo = rankedVoiceMembershipFor(match("in_progress"), "bravo-1");
  assert.equal(alphaOne.stage, "team");
  assert.equal(alphaOne.channelId, alphaTwo.channelId);
  assert.notEqual(alphaOne.channelId, bravo.channelId);
  assert.equal(rankedVoiceMembershipFor(match("in_progress"), "outsider"), null);
});

test("completed matches return both teams to global voice", () => {
  const alpha = rankedVoiceMembershipFor(match("completed"), "alpha-1");
  const bravo = rankedVoiceMembershipFor(match("completed"), "bravo-1");
  assert.equal(alpha.stage, "global");
  assert.equal(alpha.channelId, bravo.channelId);
});
