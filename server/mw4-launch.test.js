import test from "node:test";
import assert from "node:assert/strict";
import { access, readdir } from "node:fs/promises";
import { MW4_GAME, MW4_MAP_NAMES, MW4_MODES, playableMatchModes, TOPFRAGG_VARIANT, storedGameId } from "../src/lib/mw4.js";
import { DEFAULT_EIGHTS_GAME, DEFAULT_EIGHTS_GAMES, generateEightsSeries, withMw4Preview } from "../src/lib/freeEightsGames.js";
import { eightsLobbySettings } from "./free-eights-games.js";
import { tournamentMapPools } from "../src/lib/tournamentGames.js";
import { matchPools, randomRankedMap, randomWagerMaps, randomEightsSeriesMaps } from "./routes/functions.js";
import { getXPStandings, readXPLedger } from "./xp-matches.js";
import { getXPFormatStandings, getXPTeamsSummary } from "./xp-format-standings.js";
import { buildTournamentStandings } from "./tournament-standings.js";

const expected = ["Silkworm", "Reactor U92", "Rooftops", "Mumbai", "Lithium", "Munition", "Cachette", "Nautical", "Lotus", "Sentry", "Coal", "Transit 213"];

test("all four playable games generate their own selected modes and map pools", () => {
  const games = withMw4Preview(DEFAULT_EIGHTS_GAMES).filter(game => game.enabled);
  assert.deepEqual(games.map(game => game.id), ["mw4", "bo7", "bo6", "mw3"]);
  for (const game of games) {
    for (const mode of game.modes) {
      const selected = randomRankedMap(mode.id, [], game.id);
      assert.deepEqual(selected.pool, mode.maps.map(map => map.name));
      assert.ok(mode.maps.some(map => map.name === selected.name));
      const wager = randomWagerMaps(mode.id, 3, game.id);
      assert.ok(wager.every(map => mode.maps.some(candidate => candidate.name === map.name)));
    }
    for (const format of game.formats) {
      const settings = eightsLobbySettings(games, { game_id: game.id, series_format: format.id });
      for (const match_type of ["8s", "money8s"]) {
        const series = randomEightsSeriesMaps({ ...settings, match_type });
        assert.equal(settings.game_id, game.id);
        assert.deepEqual(series.map(map => map.mode), format.modes);
        assert.ok(series.every(map => game.modes.find(mode => mode.id === map.mode).maps.some(candidate => candidate.name === map.name)));
      }
    }
  }
});

test("MW4 is the new default with only the twelve selected maps and local images", async () => {
  assert.equal(DEFAULT_EIGHTS_GAME, "mw4");
  assert.equal(storedGameId({}), "bo7");
  assert.deepEqual(MW4_MAP_NAMES, expected);
  assert.deepEqual(MW4_MODES.map((mode) => mode.id), ["hp", "hijacked", "snd"]);
  for (const mode of MW4_GAME.modes) {
    assert.deepEqual(mode.maps.map((map) => map.name), expected);
    for (const map of mode.maps) await access(`public${map.image}`);
  }
  assert.equal((await readdir("public/assets/maps/mw4")).length, 12);
});

test("all map generators use the selected MW4 pools and retain legacy BO7 pools", () => {
  for (const { id } of MW4_MODES) {
    assert.deepEqual(matchPools("mw4")[id], expected);
    const selected = randomRankedMap(id, [], "mw4");
    assert.deepEqual(selected.pool, expected);
    const wager = randomWagerMaps(id, 5, "mw4");
    assert.equal(new Set(wager.map((map) => map.name)).size, 5);
    assert.ok(wager.every((map) => expected.includes(map.name)));
    for (const count of id === "hijacked" ? [] : [1, 3]) {
      const settings = eightsLobbySettings(DEFAULT_EIGHTS_GAMES, { game_id: "mw4", series_format: `${id}_bo${count}` });
      for (const match_type of ["8s", "money8s"]) {
        const series = randomEightsSeriesMaps({ ...settings, match_type });
        assert.equal(series.length, count);
        assert.equal(new Set(series.map((map) => map.name)).size, count);
        assert.ok(series.every((map) => map.mode === id && expected.includes(map.name)));
      }
    }
  }
  const tournament = tournamentMapPools({ game_id: "mw4", map_pools: { hp: ["Library"] } });
  for (const { id } of MW4_MODES) assert.deepEqual(tournament[id], expected);
  assert.ok(!randomRankedMap("hp", [], "bo7").pool.some((name) => expected.includes(name)));
  assert.equal(generateEightsSeries({ series_format: "cdl_bo3" })[0].mode, "hp");
});

const completed = (id, game_id, amount) => ({ id, created_date: new Date(), metadata: {
  ...(game_id ? { game_id } : {}), match_type: "xp", status: "completed", team_size: "1v1",
  host_id: "a", challenger_id: "b", winner_id: "a", host_party_team_id: "team-a", challenger_party_team_id: "team-b",
  team_alpha_player_ids: ["a"], team_bravo_player_ids: ["b"], xp_rating_outcome: { change: amount },
  xp_changes: { a: { delta: amount, won: true }, b: { delta: -amount, won: false } },
} });

test("MW4 personal and team XP ladders exclude BO7 history, including implicit legacy games", async () => {
  const matches = [completed("old", null, 1000), completed("new", "mw4", 20)];
  const teams = ["team-a", "team-b"].map((id) => ({ id, metadata: { team_type: "xp", roster_size: 1, is_active: true } }));
  const db = {
    xPMatch: { findMany: async () => matches }, xPStats: { findMany: async () => [] }, team: { findMany: async () => teams },
  };
  const ledger = await readXPLedger(db, "mw4");
  assert.deepEqual(ledger.completed.map((row) => row.id), ["new"]);
  const player = (await getXPStandings(db, null, "mw4")).find((row) => row.user_id === "a");
  assert.equal(player.total_xp, 20);
  assert.equal(player.matches_played, 1);
  const format = await getXPFormatStandings(db, { category: "solo", game_id: "mw4" });
  assert.equal(format.teams.find((row) => row.team_id === "team-a").total_xp, 20);
  assert.equal((await getXPTeamsSummary(db, ["team-a"]))["team-a"].total_xp, 20);
  assert.equal((await getXPStandings(db, null, "bo7")).find((row) => row.user_id === "a").total_xp, 1000);
});

test("tournament wins are isolated by game and duplicate award records count once", () => {
  const events = [{ id: "old", status: "completed" }, { id: "new", game_id: "mw4", status: "completed" }, { id: "open", game_id: "mw4", status: "open" }];
  const awards = ["old", "new", "new", "open"].map((tournament_id) => ({ tournament_id, user_ids: ["a", "a"] }));
  assert.deepEqual(buildTournamentStandings(events, awards, "mw4"), [{ user_id: "a", tournament_wins: 1 }]);
});


test("MW4 exposes only Hardpoint, S&D and Topfragg Variant as match choices", () => {
  assert.deepEqual(playableMatchModes(MW4_GAME).map(mode => mode.id), ["hp", "snd", "topfragg"]);
  const game = withMw4Preview(DEFAULT_EIGHTS_GAMES)[0];
  assert.ok(!game.formats.some(format => format.modes.every(mode => mode === "hijacked")));
  assert.equal(game.formats.find(format => format.id === "cdl_bo3").name, "Topfragg Variant");
  assert.deepEqual(game.formats.find(format => format.id === "cdl_bo3").modes, TOPFRAGG_VARIANT.modes);
  assert.throws(() => eightsLobbySettings([game], { game_id: "mw4", series_format: "hijacked_bo3" }));
});

test("Topfragg Variant generates Hardpoint, S&D and Hijacked in every mixed series", () => {
  const ranked = randomRankedMap("topfragg", [], "mw4");
  assert.deepEqual(ranked.series_modes, ["hp", "snd", "hijacked"]);
  assert.equal(ranked.series_maps.length, 3);
  const wager = randomWagerMaps("topfragg", 1, "mw4");
  assert.deepEqual(wager.map(map => map.mode), ["hp", "snd", "hijacked"]);
  assert.ok(wager.every(map => expected.includes(map.name)));
  const settings = eightsLobbySettings(DEFAULT_EIGHTS_GAMES, { game_id: "mw4", series_format: "cdl_bo3" });
  assert.equal(settings.game_mode_display, "Topfragg Variant");
  assert.deepEqual(generateEightsSeries(settings).map(map => map.mode), ["hp", "snd", "hijacked"]);
});
