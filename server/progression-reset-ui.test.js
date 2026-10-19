import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { PROGRESSION_CATEGORIES, SEASON_LADDERS } from "../src/lib/progressionResets.js";
import routes from "./routes/functions.js";
import { prisma } from "./prisma.js";

test("the real admin page offers separate categories and limits Super Admins to ladder seasons", async (t) => {
  const originalError = console.error;
  t.mock.method(console, "error", (...args) => { if (!String(args[0]).includes("useLayoutEffect does nothing on the server")) originalError(...args); });
  const root = fileURLToPath(new URL("../", import.meta.url)).replaceAll("\\", "/").replace(/\/$/, "");
  const result = await build({ stdin: { resolveDir: root, loader: "jsx", contents: `
    import React from 'react'; import {renderToStaticMarkup} from 'react-dom/server';
    import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
    import Resets from './src/components/admin/ProgressionResets.jsx';
    export const render = (role) => {const client=new QueryClient(); const html=renderToStaticMarkup(<QueryClientProvider client={client}><Resets user={{id:'admin',role}}/></QueryClientProvider>); client.clear(); return html;};
  ` }, bundle: true, write: false, platform: "node", format: "cjs", mainFields: ["module", "main"],
    external: ["react", "react-dom", "react-dom/server", "@tanstack/react-query"], alias: { "@": `${root}/src` },
    plugins: [{ name: "api-boundary", setup(bundle) {
      bundle.onResolve({ filter: /^@\/api\/base44Client$/ }, () => ({ path: "api", namespace: "reset-ui" }));
      bundle.onLoad({ filter: /.*/, namespace: "reset-ui" }, () => ({ contents: "export const base44={functions:{invoke(){throw new Error('Rendering must not reset anything')}}};" }));
    } }] });
  const module = { exports: {} };
  new Function("require", "module", "exports", result.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
  const ceo = module.exports.render("ceo");
  const plain = ceo.replace(/<[^>]+>/g, "").replaceAll("&amp;", "&");
  for (const category of PROGRESSION_CATEGORIES) assert.ok(plain.includes(category.label), category.label);
  assert.equal((ceo.match(/type="checkbox"/g) || []).length, PROGRESSION_CATEGORIES.length);
  assert.ok(!ceo.includes("checked="), "nothing is selected automatically");
  const senior = module.exports.render("super_admin");
  assert.equal((senior.match(/type="checkbox"/g) || []).length, SEASON_LADDERS.length);
  const resetButton = senior.match(/<button\b[^>]*>[\s\S]*?<\/button>/g).find((html) => html.includes("Category reset"));
  assert.ok(resetButton.includes("disabled="));
  assert.ok(module.exports.render("admin").includes("Super Admin or CEO access required"));
});

test("Money 8s history cannot restore reset earnings or records on its leaderboard", async (t) => {
  const override = (target, key, implementation) => { const old = target[key]; target[key] = implementation; t.after(() => { target[key] = old; }); };
  let markers = { earnings_reset_at: "2026-10-19T12:00:00Z" };
  override(prisma.user, "findMany", async () => [{ id: "u", metadata: markers }]);
  override(prisma.wager, "findMany", async () => [{ id: "old", metadata: { status: "completed", match_type: "money8s", host_id: "u", challenger_id: "v", winner_id: "u", match_completed_date: "2026-10-18T10:00:00Z", wallet_changes: { u: { match_delta: 30 } } } }]);
  override(prisma.wagerParticipant, "findMany", async () => []);
  const handler = routes.stack.find((layer) => layer.route?.path === "/:name").route.stack.at(-1).handle;
  const read = () => new Promise((resolve, reject) => { void handler({ params: { name: "getMoneyEightsStandings" }, user: { id: "u", role: "user" }, body: {} }, { json: resolve }, reject); });
  let result = await read(), player = result.rows.find((entry) => entry.user_id === "u");
  assert.equal(player.winnings, 0);
  assert.equal(player.matches, 1);
  markers = { records_reset_at: "2026-10-19T12:00:00Z" };
  result = await read(); player = result.rows.find((entry) => entry.user_id === "u");
  assert.equal(player.winnings, 30);
  assert.equal(player.matches, 0);
  markers.earnings_reset_at = markers.records_reset_at;
  result = await read();
  assert.ok(!result.rows.some((entry) => entry.user_id === "u"));
});
