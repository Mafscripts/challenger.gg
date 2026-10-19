import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import functionRoutes from "./routes/functions.js";
import { prisma } from "./prisma.js";
import { visibleTournamentMatches } from "../src/lib/tournamentBracketView.js";

function storage(t) {
  const tables = Object.fromEntries(["tournament", "tournamentParticipant", "tournamentMatch"].map((name) => [name, new Map()]));
  const override = (target, name, implementation) => {
    const original = target[name]; target[name] = implementation;
    t.after(() => { target[name] = original; });
  };
  let sequence = 0;
  for (const [name, table] of Object.entries(tables)) {
    override(prisma[name], "findUnique", async ({ where }) => structuredClone(table.get(where.id) || null));
    override(prisma[name], "findMany", async () => structuredClone([...table.values()]));
    override(prisma[name], "create", async ({ data }) => {
      const row = { id: `${name}-${++sequence}`, created_date: new Date(), updated_date: new Date(), ...data };
      table.set(row.id, row); return structuredClone(row);
    });
    override(prisma[name], "update", async ({ where, data }) => {
      const row = { ...table.get(where.id), ...data, updated_date: new Date() };
      table.set(row.id, row); return structuredClone(row);
    });
  }
  return {
    reset(count, format) {
      Object.values(tables).forEach((table) => table.clear());
      tables.tournament.set("event", { id: "event", metadata: { name: "Test", max_teams: Math.max(20, count + 3), registered_teams: 0, status: "open", game_mode: "snd", bracket_type: format } });
      for (let index = 0; index < count; index++) {
        const id = `participant-${index}`;
        tables.tournamentParticipant.set(id, { id, metadata: { tournament_id: "event", team_id: `team-${index}`, team_name: `Team ${index + 1}`, seed: index + 1 } });
      }
    },
    tournament: () => tables.tournament.get("event").metadata,
  };
}

async function generate() {
  // Exercise the real function route and entity adapters with an isolated store.
  const route = functionRoutes.stack.find((layer) => layer.route?.path === "/:name").route.stack.at(-1).handle;
  return new Promise((resolve, reject) => {
    void route({ params: { name: "generateTournamentBracket" }, user: { id: "admin", role: "admin", username: "Admin" }, body: { tournament_id: "event", preserve_seeds: true, start_immediately: true } }, { json: resolve }, reject);
  });
}

test("tournament brackets use the real field for every team count, independently of unused registration slots", async (t) => {
  const db = storage(t);
  for (const format of ["single_elimination", "double_elimination"]) {
    for (const count of [...Array.from({ length: 32 }, (_, index) => index + 2), 64, 65, 127, 128]) {
      db.reset(count, format);
      const result = await generate();
      assert.equal(result.success, true, `${format}: ${count} teams`);
      const size = 2 ** Math.ceil(Math.log2(count));
      const first = result.matches.filter((match) => match.bracket === "winner" && match.round === 1);
      assert.equal(first.length, size / 2);
      assert.equal(first.filter((match) => match.bye).length, size - count);
      assert.equal(new Set(first.flatMap((match) => [match.team_a_id, match.team_b_id]).filter(Boolean)).size, count);
      assert.ok(first.every((match) => match.team_a_id || match.team_b_id), "no empty first-round matches");
      assert.ok(first.filter((match) => match.bye).every((match) => match.completed && match.winner_id), "byes advance automatically");
      const winners = result.matches.filter((match) => match.bracket === "winner");
      assert.equal(Math.max(...winners.map((match) => match.round)), Math.log2(size));
      assert.equal(db.tournament().registered_teams, count);
      assert.equal(db.tournament().status, "in_progress", "a bye must not finish the tournament");
      const visible = visibleTournamentMatches(result.matches);
      assert.ok(!visible.some((match) => match.empty_bracket_slot));
      assert.equal(visible.filter((match) => match.bracket === "winner").length, winners.length, "all real future rounds remain visible");
      if (result.matches.some((match) => match.empty_bracket_slot)) {
        assert.ok(visible.length < result.matches.length, "empty lower-bracket routes are omitted");
      }
    }
  }
});

test("empty legacy branches disappear while genuine future matches and byes remain", () => {
  const rows = [
    { id: "played", bracket: "winner", round: 1, match_number: 1, team_a_id: "a", team_b_id: "b", status: "ready", next_match_id: "semi", slot_in_next: "team_a" },
    { id: "bye", bracket: "winner", round: 1, match_number: 2, team_a_id: "c", winner_id: "c", completed: true, next_match_id: "semi", slot_in_next: "team_b" },
    { id: "empty", bracket: "winner", round: 1, match_number: 3, status: "pending" },
    { id: "empty2", bracket: "winner", round: 1, match_number: 4, completed: true, empty_bracket_slot: true },
    { id: "semi", bracket: "winner", round: 2, match_number: 1, status: "pending" },
    { id: "emptySemi", bracket: "winner", round: 2, match_number: 2, status: "pending" },
    { id: "final", bracket: "winner", round: 3, match_number: 1, status: "pending" },
    { id: "lowerEmpty", bracket: "loser", round: 1, match_number: 1, status: "pending", team_a_source_match_id: "bye", team_a_source_outcome: "loser", team_b_source_match_id: "empty", team_b_source_outcome: "loser" },
  ];
  const original = structuredClone(rows), visible = visibleTournamentMatches(rows);
  assert.deepEqual(visible.map((match) => match.id), ["played", "bye", "semi", "final"]);
  assert.equal(visible.find((match) => match.id === "semi").bye, false, "pending is not the same as absent");
  assert.equal(visible.find((match) => match.id === "final").bye, true);
  assert.equal(visible.find((match) => match.id === "final").team_a_bye, false);
  assert.equal(visible.find((match) => match.id === "final").team_b_bye, true);
  assert.deepEqual(rows, original, "view filtering must never alter stored results or routes");
});

test("matchroom bracket renders meaningful byes without empty routes or fake loss scores", async (t) => {
  const originalError = console.error;
  t.mock.method(console, "error", (...args) => { if (!String(args[0]).includes("useLayoutEffect does nothing on the server")) originalError(...args); });
  const root = fileURLToPath(new URL("../", import.meta.url)).replaceAll("\\", "/").replace(/\/$/, "");
  const result = await build({ stdin: { resolveDir: root, loader: "jsx", contents: `
    import React from 'react'; import {renderToStaticMarkup} from 'react-dom/server'; import {MemoryRouter} from 'react-router-dom';
    import Bracket from './src/components/tournaments/TournamentBracket.jsx';
    export const render = (matches) => renderToStaticMarkup(<MemoryRouter><Bracket matches={matches}/></MemoryRouter>);
  ` }, bundle: true, write: false, platform: "node", format: "cjs", mainFields: ["module", "main"],
    external: ["react", "react-dom", "react-dom/server", "react-router-dom"], alias: { "@": `${root}/src` } });
  const module = { exports: {} };
  new Function("require", "module", "exports", result.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
  const html = module.exports.render([
    { id: "bye", round: 1, match_number: 1, team_a_id: "a", team_a_name: "Alpha", winner_id: "a", completed: true, status: "completed" },
    { id: "unused", round: 1, match_number: 2, empty_bracket_slot: true, completed: true },
  ]);
  assert.ok(html.includes("Bye · auto advance"));
  assert.ok(html.includes("Alpha"));
  assert.ok(!html.includes("/tournament-match/unused"));
  assert.ok(!html.includes(">Loss<"));
});
