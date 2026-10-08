import test from "node:test";
import assert from "node:assert/strict";
import { freeEightsRankJoinError, hasFreeEightsRank, isFreeEightsRankRequired } from "../src/lib/freeEightsRankRequirement.js";

test("Free 8s requires one of the four stored game ranks", () => {
  for (const rank of ["diamond", "crimson", "iridescent", "top250"]) {
    assert.equal(freeEightsRankJoinError("8s", rank), null);
    assert.equal(hasFreeEightsRank({ screenshot_rank: rank }), true);
  }
  for (const rank of [undefined, null, "", "bronze", "challenger", "topfragger", "Diamond", {}, 250]) {
    assert.equal(freeEightsRankJoinError("8s", rank).code, "FREE_EIGHTS_RANK_REQUIRED");
    assert.equal(hasFreeEightsRank({ screenshot_rank: rank }), false);
  }
  assert.equal(hasFreeEightsRank(null), false);
  assert.equal(hasFreeEightsRank({ rank: "diamond", free_eights_elo: 800, rank_verification_status: "manual_review" }), false);
});

test("Money 8s, XP, ranked, wagers and tournaments do not require a screenshot rank", () => {
  for (const type of ["money8s", "xp", "ranked", "wagers", "tournament", undefined]) {
    assert.equal(freeEightsRankJoinError(type, null), null);
  }
});

test("rank requirement errors consistently direct players to Settings", () => {
  const error = freeEightsRankJoinError("8s", null);
  assert.equal(error.action_url, "/settings#settings-rank");
  assert.equal(isFreeEightsRankRequired(error), true);
  assert.equal(isFreeEightsRankRequired({ data: error }), true);
  assert.equal(isFreeEightsRankRequired(null), false);
  assert.equal(isFreeEightsRankRequired({ code: "FREE_EIGHTS_DISCORD_REQUIRED" }), false);
});
