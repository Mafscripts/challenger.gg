import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { createPartyBracket } from "../src/lib/partyBracket.js";
import { ensurePartyMatchMaps } from "./party-maps.js";

test("community matchroom renders the real match shell, map artwork, branded rosters and score/report controls", async (t) => {
  const originalError = console.error;
  t.mock.method(console, "error", (...args) => { if (!String(args[0]).includes("useLayoutEffect does nothing on the server")) originalError(...args); });
  const root = fileURLToPath(new URL("../", import.meta.url)).replaceAll("\\", "/").replace(/\/$/, "");
  const result = await build({ stdin: { resolveDir: root, loader: "jsx", contents: `
    import React from 'react'; import {renderToStaticMarkup} from 'react-dom/server'; import {MemoryRouter} from 'react-router-dom';
    import PartyMatchRoom from './src/components/competition/PartyMatchRoom.jsx';
    export function render(props) {return renderToStaticMarkup(<MemoryRouter><PartyMatchRoom {...props}/></MemoryRouter>);}
  ` }, bundle: true, write: false, platform: "node", format: "cjs", mainFields: ["module", "main"],
    external: ["react", "react-dom", "react-dom/server", "react-router-dom"], alias: { "@": `${root}/src` }, loader: { ".css": "empty" },
    plugins: [{ name: "ui-boundaries", setup(bundle) {
      bundle.onResolve({ filter: /^@\/(lib\/AuthContext|api\/base44Client)$/ }, ({ path }) => ({ path, namespace: "party-ui" }));
      bundle.onLoad({ filter: /.*/, namespace: "party-ui" }, ({ path }) => ({ contents: path.endsWith("AuthContext") ? "export const useAuth=()=>({user:{id:'host'}});" : "export const base44={};" }));
    } }],
  });
  const compiled = { exports: {} };
  new Function("require", "module", "exports", result.outputFiles[0].text)(createRequire(import.meta.url), compiled, compiled.exports);
  const room = { id: "room", title: "Friday Co-ed", mode: "coed", team_size: 2, status: "ready", teams: [{ id: "a", name: "Team Phoenix" }, { id: "b", name: "Team Hydra" }],
    players: [{ id: "one", user_id: "host", name: "Liv", gender: "female", side: "a", profile: { username: "Liv", activision_id: "Liv#123" } }, { id: "two", name: "Guest", gender: "male", side: "b" }],
    bracket: createPartyBracket(["a", "b"]),
  };
  ensurePartyMatchMaps(room.bracket, () => 0);
  const props = { room, matchId: room.bracket.matches[0].id, user: { id: "host" }, manager: true, act: () => {}, voice: { fresh: true, waiting_room_url: "https://discord.com/channels/123/456", players: [{ user_id: "host", status: "in_team_voice" }], team_urls: { a: "https://discord.com/channels/123/789" } } };
  const html = compiled.exports.render(props);
  assert.match(html, /match-room-theme/); assert.match(html, /match-room-body/); assert.match(html, /match-team-card/);
  assert.match(html, /Map Series/); assert.match(html, /System generated/); assert.match(html, /src="\/assets\/maps\/hacienda.jpg"/);
  assert.match(html, /Hosts map 1/); assert.match(html, /Liv#123/); assert.match(html, /Guest player/);
  assert.match(html, /match-chat-panel/); assert.match(html, /Submit score/); assert.match(html, /Confirm match result/);
  assert.match(html, /Admin tools/); assert.match(html, /Give win/); assert.match(html, /Give loss/); assert.match(html, /Forfeit/); assert.match(html, /Reset all teams/);
  assert.ok(html.indexOf('match-chat-panel') < html.indexOf('Admin tools'));
  assert.ok(html.indexOf('Admin tools') < html.indexOf('id="party-match-message"'), "host/admin controls belong inside chat, above the message input like Free 8s");
  assert.equal((html.match(/Admin tools/g) || []).length, 1);
  assert.doesNotMatch(html, /Host &amp; admin controls/);
  assert.match(html, /href="https:\/\/discord.com\/channels\/123\/789"/); assert.match(html, /href="\/profile\/Liv"/);
  assert.ok(html.indexOf('match-team-card') < html.indexOf("Map Series"), "teams must stay in the main column");
  assert.ok(html.indexOf('match-chat-panel') < html.indexOf("Map Series"), "maps must appear underneath match chat like Free 8s");
  assert.match(html, /<section class="dark-focus dark-media[^\"]*h-auto w-full/, "compact map cards must not fill the column height and push teams below the screen");
  assert.doesNotMatch(html, /8s ELO|Earnings|TP RANK|party-match-layout/);
  assert.doesNotMatch(html, /Team Alpha|Team Bravo/);
  const numbered = compiled.exports.render({ ...props, room: { ...room, teams: room.teams.map((team, index) => ({ ...team, name: `Team ${index + 1}` })) } });
  assert.equal((numbered.match(/<h3[^>]*>Team 1<\/h3>/g) || []).length, 1);
  assert.equal((numbered.match(/<h3[^>]*>Team 2<\/h3>/g) || []).length, 1);
  const spectator = compiled.exports.render({ ...props, manager: false, user: { id: "viewer" } });
  assert.doesNotMatch(spectator, /Confirm match result|Submit score/);
  assert.doesNotMatch(spectator, /Admin tools|Give win|Give loss|Reset all teams/);
  assert.match(spectator, /Link your player slot/);
  const guests = compiled.exports.render({ ...props, room: { ...room, players: room.players.map(({ user_id, profile, ...player }) => player) } });
  assert.equal((guests.match(/class="match-player-card party-community-player"/g) || []).length, 2, "players without accounts must still appear in both team rosters");
  assert.match(guests, /Guest player/);
});

test("the actual score dialog stays fixed in the viewport and submits the correct role-specific score action", async (t) => {
  const originalError = console.error;
  t.mock.method(console, "error", (...args) => { if (!String(args[0]).includes("useLayoutEffect does nothing on the server")) originalError(...args); });
  const root = fileURLToPath(new URL("../", import.meta.url)).replaceAll("\\", "/").replace(/\/$/, "");
  const require = createRequire(import.meta.url);
  const radixPath = require.resolve("@radix-ui/react-dialog").replaceAll("\\", "/");
  const result = await build({ stdin: { resolveDir: root, loader: "jsx", contents: `
    import React from 'react'; import {renderToStaticMarkup} from 'react-dom/server';
    import PartyScoreDialog from './src/components/competition/PartyScoreDialog.jsx';
    export const render=props=>renderToStaticMarkup(<PartyScoreDialog {...props}/>);
    export function submit(props) {const root=PartyScoreDialog(props); const content=root.props.children; const form=React.Children.toArray(content.props.children).find(child=>child.type==='form'); return form.props.onSubmit({preventDefault(){}});}
  ` }, bundle: true, write: false, platform: "node", format: "cjs", mainFields: ["module", "main"],
    external: ["react", "react-dom", "react-dom/server"], alias: { "@": `${root}/src` },
    plugins: [{ name: "server-portal", setup(bundle) {
      bundle.onResolve({ filter: /^@radix-ui\/react-dialog$/ }, () => ({ path: "dialog", namespace: "score-portal" }));
      // Keep Radix's actual root/content, making only the browser portal render on the server.
      bundle.onLoad({ filter: /.*/, namespace: "score-portal" }, () => ({ resolveDir: root, contents: `export * from ${JSON.stringify(radixPath)}; export const Portal=({children})=>children;` }));
    } }],
  });
  const compiled = { exports: {} };
  new Function("require", "module", "exports", result.outputFiles[0].text)(require, compiled, compiled.exports);
  const calls = [], closes = [];
  const props = { open: true, room: { bracket: { best_of: 3 }, teams: [{ id: "a", name: "Alpha" }, { id: "b", name: "Bravo" }] }, match: { id: "match", teams: ["a", "b"], status: "ready" }, manager: true, scores: ["2", "1"], setScores() {}, setOverrideConfirmed() {}, onOpenChange: (value) => closes.push(value), act: async (...args) => { calls.push(args); return true; } };
  const html = compiled.exports.render(props);
  const dialogTag = html.match(/<[^>]*role="dialog"[^>]*>/)?.[0];
  assert.ok(dialogTag);
  const classes = dialogTag.match(/class="([^"]+)"/)[1].split(/\s+/);
  assert.ok(classes.includes("fixed"));
  assert.ok(!classes.includes("dark-focus"), "the card's relative positioning must not override the dialog's fixed position");
  assert.match(html, /Alpha/); assert.match(html, /Bravo/); assert.match(html, /Confirm final score/);
  await compiled.exports.submit(props);
  assert.deepEqual(calls.pop(), ["match_score", { match_id: "match", scores: [2, 1], override: false }]);
  assert.equal(closes.pop(), false);
  await compiled.exports.submit({ ...props, manager: false });
  assert.equal(calls.pop()[0], "report_score");
  await compiled.exports.submit({ ...props, scores: ["0", "0"] });
  await compiled.exports.submit({ ...props, match: { ...props.match, status: "completed" }, overrideConfirmed: false });
  assert.equal(calls.length, 0);
  await compiled.exports.submit({ ...props, match: { ...props.match, status: "completed" }, overrideConfirmed: true });
  assert.equal(calls.pop()[1].override, true);
});
