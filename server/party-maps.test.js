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
