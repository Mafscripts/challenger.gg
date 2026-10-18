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
  assert.match(html, /href="https:\/\/discord.com\/channels\/123\/789"/); assert.match(html, /href="\/profile\/Liv"/);
  assert.ok(html.indexOf("Map Series") < html.indexOf('match-team-card'), "maps must be visible before the rosters");
  assert.match(html, /<section class="dark-focus dark-media[^\"]*h-auto w-full/, "compact map cards must not fill the column height and push teams below the screen");
  assert.doesNotMatch(html, /8s ELO|Earnings|TP RANK|party-match-layout/);
  const spectator = compiled.exports.render({ ...props, manager: false, user: { id: "viewer" } });
  assert.doesNotMatch(spectator, /Confirm match result|Submit score/);
  assert.match(spectator, /Link your player slot/);
  const guests = compiled.exports.render({ ...props, room: { ...room, players: room.players.map(({ user_id, profile, ...player }) => player) } });
  assert.equal((guests.match(/class="match-player-card party-community-player"/g) || []).length, 2, "players without accounts must still appear in both team rosters");
  assert.match(guests, /Guest player/);
});
