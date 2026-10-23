import test from "node:test";
import assert from "node:assert/strict";
import { tournamentVetoChoice, tournamentVetoPending, tournamentVetoState } from "../src/lib/tournamentMapVeto.js";
import routes from "./routes/functions.js";
import { prisma } from "./prisma.js";

const players = [
  { id: "pa", tournament_id: "event", team_id: "a", captain_id: "captain-a", members: [{ user_id: "player-a" }] },
  { id: "pb", tournament_id: "event", team_id: "b", captain_id: "captain-b", members: [{ user_id: "player-b" }] },
];
const base = () => ({ id: "match", tournament_id: "event", team_a_id: "a", team_b_id: "b", team_a_name: "Alpha", team_b_name: "Bravo", team_a_participant_id: "pa", team_b_participant_id: "pb", status: "ready", best_of: 3, round: 1, match_number: 1 });
const invoke = (name, userId, body = {}) => {
  const handler = routes.stack.find(layer => layer.route?.path === "/:name").route.stack.at(-1).handle;
  return new Promise((resolve, reject) => void handler({ params: { name }, user: { id: userId, role: "user" }, body: { tournament_match_id: "match", ...body } }, { json: resolve, status() { return this; } }, reject));
};

function store(t, tournamentOverrides = {}) {
  let metadata = base(), writes = 0, locks = 0, tail = Promise.resolve();
  const tournament = { id: "event", metadata: { game_id: "bo7", name: "Test", status: "in_progress", game_mode: "snd", map_pools: { snd: ["Raid", "Scar", "Den", "Hacienda"] } } };
  Object.assign(tournament.metadata, tournamentOverrides);
  const tx = {
    $executeRaw: async strings => { assert.match(strings.join(""), /FOR UPDATE/); locks++; },
    tournamentMatch: {
      findUnique: async () => ({ id: "match", metadata: structuredClone(metadata) }),
      update: async ({ data }) => { writes++; metadata = structuredClone(data.metadata); return { id: "match", metadata: structuredClone(metadata) }; },
    },
    tournament: { findUnique: async () => structuredClone(tournament) },
    tournamentParticipant: { findMany: async () => players.map(({ id, ...metadata }) => ({ id, metadata: structuredClone(metadata) })) },
  };
  const override = (target, name, implementation) => { const old = target[name]; target[name] = implementation; t.after(() => { target[name] = old; }); };
  override(prisma, "$transaction", operation => {
    const next = tail.then(() => operation(tx)); tail = next.catch(() => {}); return next;
  });
  override(prisma.tournamentMatch, "findUnique", tx.tournamentMatch.findUnique);
  override(prisma.tournament, "findUnique", tx.tournament.findUnique);
  override(prisma.tournamentParticipant, "findMany", tx.tournamentParticipant.findMany);
  return { read: () => structuredClone(metadata), writes: () => writes, locks: () => locks, set: value => { metadata = { ...metadata, ...value }; } };
}

test("both captains veto concurrently, each once, and setup sync preserves their exclusions", async t => {
  const db = store(t);
  const results = await Promise.all([
    invoke("vetoTournamentMap", "captain-a", { map_name: "Raid" }),
    invoke("vetoTournamentMap", "captain-b", { map_name: "Scar" }),
  ]);
  assert.ok(results.every(result => result.success));
  const match = db.read();
  assert.equal(match.map_veto.bans.team_a.map, "Raid");
  assert.equal(match.map_veto.bans.team_b.map, "Scar");
  assert.equal(tournamentVetoPending(match), false);
  assert.equal(match.maps.length, 3);
  assert.ok(match.maps.every(row => ["Den", "Hacienda"].includes(row.map)));
  const synced = await invoke("ensureTournamentMatchSetup", "captain-a");
  assert.equal(synced.success, true);
  assert.deepEqual(synced.match.map_veto.bans, match.map_veto.bans);
  assert.ok(synced.match.maps.every(row => !["Raid", "Scar"].includes(row.map)));
  assert.equal(db.locks(), 3);
  const before = db.writes();
  await assert.rejects(invoke("vetoTournamentMap", "captain-a", { map_name: "Den" }), /already used/);
  assert.equal(db.writes(), before);
});

test("one veto keeps the series pending and blocks participant score reports", async t => {
  const db = store(t);
  const result = await invoke("vetoTournamentMap", "captain-a", { map_name: "Raid" });
  assert.equal(tournamentVetoPending(result.match), true);
  assert.deepEqual(result.match.maps, []);
  const score = await invoke("completeTournamentMatch", "captain-a", { team_a_score: 2, team_b_score: 0 });
  assert.equal(score.success, false);
  assert.match(score.error, /Both captains/);
  assert.equal(db.writes(), 1);
});

test("non-captains, duplicate bans and invalid maps never modify the match", async t => {
  const db = store(t);
  for (const id of ["player-a", "outsider"]) await assert.rejects(invoke("vetoTournamentMap", id, { map_name: "Raid", team_id: "a" }), /registered team captain/);
  await assert.rejects(invoke("vetoTournamentMap", "captain-a", { map_name: "Fake map" }), /map pool/);
  assert.equal(db.writes(), 0);
  await invoke("vetoTournamentMap", "captain-a", { map_name: "Raid", team_id: "b" });
  assert.equal(db.read().map_veto.bans.team_a.map, "Raid", "the server determines the captain's side");
  await assert.rejects(invoke("vetoTournamentMap", "captain-b", { map_name: "raid" }), /already been vetoed/);
  assert.equal(db.writes(), 1);
});

test("closed rooms and pools that would become empty cannot be vetoed", () => {
  const match = base(); match.map_veto = tournamentVetoState(match, players);
  match.map_veto = tournamentVetoChoice(match, "captain-a", "Raid", [["Raid", "Scar"]], "now");
  assert.throws(() => tournamentVetoChoice(match, "captain-b", "Scar", [["Raid", "Scar"]], "now"), /without a playable map/);
  for (const status of ["completed", "cancelled", "disputed", "in_progress"]) assert.throws(() => tournamentVetoChoice({ ...match, status }, "captain-b", "Den", [["Raid", "Scar", "Den"]], "now"), /closed/);
});

test("legacy reported matches keep their existing series and new team assignments clear old vetoes", () => {
  const match = base();
  assert.equal(tournamentVetoState({ ...match, team_a_reported_score_alpha: 0 }, players), null);
  match.map_veto = tournamentVetoState(match, players);
  match.map_veto = tournamentVetoChoice(match, "captain-a", "Raid", [["Raid", "Scar", "Den"]], "now");
  assert.deepEqual(tournamentVetoState({ ...match, team_a_id: "new-team", team_a_participant_id: "new-participant" }, players).bans, {});
});

test("vetoed map cards stay visible, crossed out, disabled and attributed to the team", async () => {
  const { build } = await import("esbuild");
  const { createRequire } = await import("node:module");
  const { fileURLToPath } = await import("node:url");
  const root = fileURLToPath(new URL("../", import.meta.url)).replaceAll("\\", "/").replace(/\/$/, "");
  const bundle = await build({ stdin: { resolveDir: root, loader: "jsx", contents: `
    import React from 'react'; import {renderToStaticMarkup} from 'react-dom/server';
    import Veto from './src/components/tournaments/TournamentMapVeto.jsx';
    export const render = match => renderToStaticMarkup(<Veto match={match} user={{id:'captain-b'}} onUpdated={()=>{}}/>);
  ` }, bundle: true, write: false, platform: "node", format: "cjs", external: ["react", "react-dom/server"], alias: { "@": `${root}/src` },
  plugins: [{ name: "api-boundary", setup(builder) {
    builder.onResolve({ filter: /^@\/api\/base44Client$/ }, () => ({ path: "api", namespace: "veto-test" }));
    builder.onLoad({ filter: /.*/, namespace: "veto-test" }, () => ({ contents: "export const base44={functions:{invoke(){throw new Error('Rendering must not veto a map')}}};" }));
  } }] });
  const module = { exports: {} };
  new Function("require", "module", "exports", bundle.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
  const match = { ...base(), game_id: "bo7", map_pool: ["Raid", "Scar", "Den"] };
  match.map_veto = tournamentVetoState(match, players);
  match.map_veto = tournamentVetoChoice(match, "captain-a", "Raid", [match.map_pool], "now");
  const html = module.exports.render(match);
  assert.match(html, /Raid — vetoed by Alpha/);
  assert.match(html, /line-through decoration-red-400/);
  assert.match(html, /Vetoed · Alpha/);
  assert.match(html, /aria-label="Raid — vetoed by Alpha" disabled=""/);
  assert.ok(html.includes("Scar") && html.includes("Den"));
});


test("vetoes exclude maps across every mode of a mixed MW4 series", async t => {
  const db = store(t, { game_id: "mw4", game_mode: "mw4", map_pools: null });
  await invoke("vetoTournamentMap", "captain-a", { map_name: "Silkworm" });
  await invoke("vetoTournamentMap", "captain-b", { map_name: "Lithium" });
  const match = db.read();
  assert.equal(new Set(match.maps.map(row => row.game_mode)).size, 3);
  assert.ok(match.maps.every(row => !["Silkworm", "Lithium"].includes(row.map)));
});

test("streamer custom map pools also keep vetoed maps out of the series", async t => {
  const db = store(t, { is_streamer_tournament: true, map_pools: null, streamer_maps: ["Raid", "Scar", "Den", "Hacienda"] });
  await invoke("vetoTournamentMap", "captain-a", { map_name: "Raid" });
  await invoke("vetoTournamentMap", "captain-b", { map_name: "Scar" });
  assert.equal(db.read().maps.length, 3);
  assert.ok(db.read().maps.every(row => ["Den", "Hacienda"].includes(row.map)));
});
