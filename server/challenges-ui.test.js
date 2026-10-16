import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

test("real challenge board and room render their own identity, free stakes, voice links, rosters, scores and admin controls", async (t) => {
  const originalError = console.error;
  t.mock.method(console, "error", (...args) => { if (!String(args[0]).includes("useLayoutEffect does nothing on the server")) originalError(...args); });
  const root = fileURLToPath(new URL("../", import.meta.url));
  const result = await build({
    stdin: { resolveDir: root, loader: "jsx", contents: `
      import React from "react"; import {renderToStaticMarkup} from "react-dom/server";
      import {MemoryRouter, Routes, Route} from "react-router-dom";
      import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
      import ChallengeTeam from "./src/pages/ChallengeTeam.jsx";
      import {setUser} from "@/lib/AuthContext";
      export function render(user, overview, match) {
        setUser(user); const client = new QueryClient({defaultOptions: {queries: {retry: false}}});
        client.setQueryData(["challenge-overview",user.id], overview);
        if(match) client.setQueryData(["challenge-room",match.id,user.id], {success: true,match});
        const html = renderToStaticMarkup(<MemoryRouter initialEntries={[match ? "/challenge-a-team/"+match.id : "/challenge-a-team"]}><QueryClientProvider client={client}><Routes><Route path="/challenge-a-team" element={<ChallengeTeam/>}/><Route path="/challenge-a-team/:id" element={<ChallengeTeam/>}/></Routes></QueryClientProvider></MemoryRouter>);
        client.clear(); return html;
      }
    ` }, bundle: true, write: false, platform: "node", format: "cjs", mainFields: ["module", "main"],
    external: ["react", "react-dom", "react-dom/server", "react-router-dom", "@tanstack/react-query"],
    alias: { "@": `${root.replaceAll("\\", "/").replace(/\/$/, "")}/src` }, loader: { ".css": "empty" },
    plugins: [{ name: "ui-boundaries", setup(bundle) {
      bundle.onResolve({ filter: /^@\/(lib\/AuthContext|api\/base44Client|components\/ui\/use-toast)$/ }, ({ path }) => ({ path, namespace: "challenge-ui" }));
      bundle.onLoad({ filter: /.*/, namespace: "challenge-ui" }, ({ path }) => ({ contents: path.endsWith("AuthContext") ? "let user;export const setUser=value=>{user=value};export const useAuth=()=>({user});"
        : path.endsWith("base44Client") ? "export const base44={functions:{invoke(){throw Error('Render must not make requests')}}};" : "export const toast=()=>{};" }));
    } }],
  });
  const compiled = { exports: {} };
  new Function("require", "module", "exports", result.outputFiles[0].text)(createRequire(import.meta.url), compiled, compiled.exports);
  const user = { id: "captain", username: "Captain", discord_user_id: "123" };
  const match = { id: "room", status: "open", host_id: user.id, size: 3, best_of: 3, game_name: "Black Ops 7", format_name: "Hardpoint BO3", alpha_team: { name: "Team Phoenix", id: "phoenix" }, players: [{ user_id: user.id, user_name: "Captain", username: "Captain", activision_id: "Captain#123", team_id: "phoenix", side: "alpha", captain: true }], messages: [], reports: {}, can_manage: true, can_admin: true, is_member: true };
  const overview = { success: true, voice_enabled: true, games: [], teams: [], matches: [match], standings: { teams: [], solos: [] }, my_standings: [] };
  const board = compiled.exports.render(user, overview);
  assert.match(board, /Your squad/); assert.match(board, /Team Phoenix/); assert.match(board, /3v3/);
  assert.match(board, /Post a challenge/); assert.match(board, /Create a roster/);
  assert.match(board, /disabled=""[^>]*>Cash stakes disabled/);
  assert.match(board, /Challenge matchfinder/);
  assert.doesNotMatch(board, /cat-hero|cat-match-card/);
  const room = compiled.exports.render(user, overview, { ...match, status: "in_progress", started_at: new Date().toISOString(), voice: { enabled: true, fresh: true, waiting_room_url: "https://discord.com/channels/123/456", alpha_url: "https://discord.com/channels/123/789", players: [{ user_id: user.id, status: "in_team_voice" }] }, series_maps: [{ id: "den", name: "Den", mode_name: "Hardpoint", image: "/assets/maps/den.webp" }] });
  assert.match(room, /href="https:\/\/discord.com\/channels\/123\/456"/);
  assert.match(room, /Your team voice/); assert.match(room, /Den/); assert.match(room, /Alpha series score/);
  assert.match(room, /Staff controls/); assert.match(room, /Team XP/); assert.match(room, /Individual solo XP/);
  assert.match(room, /match-room-theme/); assert.match(room, /match-room-body/);
  assert.match(room, /match-team-card/); assert.match(room, /match-player-card/);
  assert.match(room, /Activision Name/); assert.match(room, /Challenge XP/);
  assert.match(room, /Discord Voice/); assert.match(room, /Socials/);
  assert.match(room, /match-chat-panel/); assert.match(room, /Map Series/);
  assert.doesNotMatch(room, /8s ELO|cat-player|cat-roster|cat-hero/);
  const spectator = compiled.exports.render({ id: "outsider" }, overview, { ...match, can_manage: false, can_admin: false, is_member: false });
  assert.match(spectator, /Join this challenge to access room chat and Discord voice/);
  assert.doesNotMatch(spectator, /Write a chat message/);
  const completed = compiled.exports.render(user, overview, { ...match, status: "completed", winner: "alpha", score: { alpha: 2, bravo: 0 }, xp_changes: [{ id: "team-xp", kind: "team", subject_id: "phoenix", side: "alpha", name: "Team Phoenix", delta: 60, new_xp: 1560 }] });
  assert.match(completed, /Final score/); assert.match(completed, /Winner/);
  assert.match(completed, /XP awarded/); assert.match(completed, /60 this match/);
});
