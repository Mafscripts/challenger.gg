import test from "node:test";
import assert from "node:assert/strict";
import { createPartyBracket, recordPartyScore } from "../src/lib/partyBracket.js";
import { DEFAULT_EIGHTS_GAMES } from "../src/lib/freeEightsGames.js";
import { ensurePartyMatchMaps, partyMapsMissing } from "./party-maps.js";

test("every playable match gets a persistent series from the existing BO7 pools, with artwork and alternating hosts", () => {
  for (const game_mode of ["snd", "hardpoint", "cdl"]) for (const best_of of [1, 3, 5]) {
    const bracket = createPartyBracket(["a", "b", "c"], { game_mode, best_of, format: "double_elimination" });
    assert.equal(partyMapsMissing(bracket), true);
    assert.equal(ensurePartyMatchMaps(bracket, () => 0), true);
    for (const match of bracket.matches.filter((match) => match.status !== "bye")) {
      assert.equal(match.series_maps.length, best_of);
      assert.ok(match.maps_generated_at);
      for (const [index, map] of match.series_maps.entries()) {
        assert.ok(DEFAULT_EIGHTS_GAMES[0].modes.find((mode) => mode.id === map.mode).maps.some((entry) => entry.name === map.name));
        assert.ok(map.image);
        assert.equal(map.host_side, index % 2);
        assert.equal(map.number, index + 1);
      }
      for (const mode of new Set(match.series_maps.map((map) => map.mode))) {
        const names = match.series_maps.filter((map) => map.mode === mode).map((map) => map.name);
        assert.equal(names.length, new Set(names).size);
      }
      assert.deepEqual(match.series_maps.map((map) => map.mode), game_mode === "cdl" ? best_of === 5 ? ["hp", "snd", "overload", "hp", "snd"] : ["hp", "snd", "hp"].slice(0, best_of) : Array(best_of).fill(game_mode === "hardpoint" ? "hp" : "snd"));
    }
    const saved = JSON.stringify(bracket);
    assert.equal(partyMapsMissing(bracket), false);
    assert.equal(ensurePartyMatchMaps(bracket, () => assert.fail("Existing maps must not be drawn again")), false);
    assert.equal(JSON.stringify(bracket), saved);
  }
});

test("a Grand Final reset gets a fresh map series and never copies the first final's maps", () => {
  const bracket = createPartyBracket(["a", "b"], { format: "double_elimination" });
  ensurePartyMatchMaps(bracket, () => 0);
  recordPartyScore(bracket, bracket.matches[0].id, [2, 0]);
  const final = bracket.matches.at(-1), oldMaps = structuredClone(final.series_maps);
  recordPartyScore(bracket, final.id, [0, 2]);
  const reset = bracket.matches.at(-1);
  assert.equal(reset.round, 2);
  assert.deepEqual(reset.series_maps, []);
  ensurePartyMatchMaps(bracket, (limit) => limit - 1);
  assert.notDeepEqual(reset.series_maps, oldMaps);
  assert.deepEqual(final.series_maps, oldMaps);
});

test("all matches in a bracket round share the same maps and order, with one saved schedule per round", () => {
  for (const format of ["single_elimination", "double_elimination"]) for (const count of [3, 4, 8, 16]) {
    const bracket = createPartyBracket(Array.from({ length: count }, (_, i) => `team-${i}`), { format });
    let seed = 1;
    const choose = (limit) => { seed = (seed * 16807) % 2147483647; return seed % limit; };
    ensurePartyMatchMaps(bracket, choose);
    const groups = new Map();
    for (const match of bracket.matches.filter((match) => match.status !== "bye")) {
      const key = `${match.lane}:${match.round}`;
      const maps = match.series_maps.map(({ name, mode }) => [name, mode]);
      if (!groups.has(key)) groups.set(key, maps);
      assert.deepEqual(maps, groups.get(key));
      assert.deepEqual(bracket.round_maps[key].maps.map(({ name, mode }) => [name, mode]), maps);
    }
    assert.equal(Object.keys(bracket.round_maps).length, groups.size);
    if (count >= 4) assert.notDeepEqual(bracket.round_maps["upper:1"].maps, bracket.round_maps["upper:2"].maps);
    const saved = JSON.stringify(bracket);
    ensurePartyMatchMaps(bracket, () => assert.fail("Reload must not pick new maps"));
    assert.equal(JSON.stringify(bracket), saved);
    const sameRound = bracket.matches.filter((match) => match.lane === "upper" && match.round === 1 && match.status !== "bye");
    if (sameRound.length > 1) assert.notEqual(sameRound[0].series_maps, sameRound[1].series_maps, "matches must not share mutable arrays");
  }
});

test("legacy per-match maps are aligned to the round's existing series without changing completed results", () => {
  const bracket = createPartyBracket(Array.from({ length: 8 }, (_, i) => `team-${i}`));
  ensurePartyMatchMaps(bracket, () => 0);
  delete bracket.round_maps;
  const [first, second, third, fourth] = bracket.matches.filter((match) => match.round === 1);
  first.series_maps = first.series_maps.map((map) => ({ ...map, name: "Raid" }));
  second.series_maps = second.series_maps.map((map) => ({ ...map, name: "Den" }));
  third.series_maps = third.series_maps.map((map) => ({ ...map, name: "Sake" }));
  second.reports = { a: { scores: [2, 0] } };
  third.status = "completed"; third.score = [2, 1];
  const historical = structuredClone(third);
  assert.equal(partyMapsMissing(bracket), true);
  ensurePartyMatchMaps(bracket, () => assert.fail("Existing round maps should be reused"));
  assert.ok(first.series_maps.every((map) => map.name === "Den"));
  assert.ok(fourth.series_maps.every((map) => map.name === "Den"));
  assert.deepEqual(third, historical);
  assert.equal(partyMapsMissing(bracket), false);
  // A newly opened match reuses the persisted round schedule rather than drawing again.
  fourth.series_maps = [];
  assert.equal(partyMapsMissing(bracket), true);
  ensurePartyMatchMaps(bracket, (limit) => { assert.equal(limit, 2, "Only the match's first host may be chosen; the round maps are already saved"); return 0; });
  assert.ok(fourth.series_maps.every((map) => map.name === "Den"));
});
