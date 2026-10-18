import test from "node:test";
import assert from "node:assert/strict";
import { createPartyBracket, recordPartyScore, resetPartyMatch } from "../src/lib/partyBracket.js";

test("single and double elimination resolve every 2–16-team field, including byes and final resets", () => {
  for (const format of ["single_elimination", "double_elimination"]) for (let count = 2; count <= 16; count++) for (const reset of [false, true]) {
    const teams = Array.from({ length: count }, (_, i) => `t${i}`);
    const bracket = createPartyBracket(teams, { format, id: `test-${count}` });
    const losses = Object.fromEntries(teams.map((id) => [id, 0]));
    let played = 0;
    while (bracket.status !== "completed") {
      const ready = bracket.matches.filter((match) => match.status === "ready");
      assert.ok(ready.length > 0, `${format} ${count} must not stall`);
      assert.equal(new Set(ready.flatMap((match) => match.teams)).size, ready.length * 2, "a team cannot play in two ready matches");
      const match = ready[0];
      assert.notEqual(match.teams[0], match.teams[1]);
      const lowerFinalWins = reset && match.lane === "final" && match.round === 1;
      const winner = lowerFinalWins ? 1 : 0, loser = 1 - winner;
      losses[match.teams[loser]]++;
      assert.ok(losses[match.teams[winner]] < (format === "single_elimination" ? 1 : 2));
      recordPartyScore(bracket, match.id, winner === 0 ? [2, 0] : [0, 2]);
      assert.ok(++played < 35);
    }
    assert.ok(teams.includes(bracket.champion_id));
    assert.equal(played, format === "single_elimination" ? count - 1 : count * 2 - (reset ? 1 : 2));
    assert.equal(losses[bracket.champion_id], format === "double_elimination" && reset ? 1 : 0);
    for (const id of teams.filter((id) => id !== bracket.champion_id)) assert.equal(losses[id], format === "single_elimination" ? 1 : 2);
    assert.equal(bracket.matches.some((match) => match.lane === "lower"), format === "double_elimination" && count > 2);
    assert.equal(new Set(bracket.matches.map((match) => match.id)).size, bracket.matches.length);
  }
});

test("series results require a legal completed score and cannot be overwritten", () => {
  for (const best_of of [1, 3, 5]) {
    const bracket = createPartyBracket(["a", "b"], { best_of });
    const id = bracket.matches[0].id, target = Math.ceil(best_of / 2);
    for (const score of [[0, 0], [target, target], [target - 1, 0], [-1, target], [target, 0.5], [target + 1, 0], [], [target, "0"]]) {
      assert.throws(() => recordPartyScore(bracket, id, score));
    }
    recordPartyScore(bracket, id, [target, 0]);
    assert.equal(bracket.champion_id, "a");
    assert.throws(() => recordPartyScore(bracket, id, [0, target]), { status: 409 });
  }
  assert.throws(() => createPartyBracket(["a", "a"]));
  assert.throws(() => createPartyBracket(["a", "b"], { format: "round_robin" }));
  assert.throws(() => createPartyBracket(["a", "b"], { best_of: 2 }));
});

test("correcting an earlier winner resets only dependent matches and removes stale final resets", () => {
  for (const format of ["single_elimination", "double_elimination"]) for (const count of [4, 8, 16]) {
    const bracket = createPartyBracket(Array.from({ length: count }, (_, i) => `t${i}`), { format });
    const finish = () => {
      let guard = 0;
      while (bracket.status !== "completed") {
        const ready = bracket.matches.filter((match) => match.status === "ready");
        assert.ok(ready.length);
        assert.equal(new Set(ready.flatMap((match) => match.teams)).size, ready.length * 2);
        const match = ready[0];
        recordPartyScore(bracket, match.id, match.lane === "final" && match.round === 1 ? [0, 2] : [2, 0]);
        assert.ok(++guard < 40);
      }
    };
    finish();
    const first = bracket.matches[0], sibling = bracket.matches[1], siblingBefore = structuredClone(sibling), teams = [...first.teams];
    const affected = resetPartyMatch(bracket, first.id);
    assert.equal(bracket.status, "in_progress");
    assert.equal(bracket.champion_id, null);
    assert.equal(first.status, "ready");
    assert.deepEqual(first.teams, teams);
    assert.deepEqual(first.result_history[0].score, [2, 0]);
    assert.deepEqual(sibling, siblingBefore);
    assert.ok(!affected.includes(sibling.id));
    assert.ok(!bracket.matches.some((match) => match.lane === "final" && match.round === 2));
    if (format === "double_elimination") assert.equal(bracket.removed_match_results.length, 1);
    recordPartyScore(bracket, first.id, [0, 2]);
    assert.equal(first.winner_id, teams[1]);
    finish();
    assert.ok(bracket.champion_id);
  }
});
