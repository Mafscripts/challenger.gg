import sharp from "sharp";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { build } from "esbuild";
import authRoutes from "./routes/auth.js";
import { prisma } from "./prisma.js";
import { playerCardThemes, validPlayerCard, playerCardAppearance } from "../src/lib/playerCards.js";

test("only known card identifiers can be saved on the authenticated account; existing metadata and balances survive", async t => {
  let account = { id: "player", role: "user", email: "player@example.test", credits: 25, wallet_balance: 19, metadata: { activision_id: "Player#123", untouched: true } };
  const updates = [];
  const originals = [prisma.user.findUnique, prisma.user.update, prisma.$queryRaw];
  t.after(() => { [prisma.user.findUnique, prisma.user.update, prisma.$queryRaw] = originals; });
  prisma.user.findUnique = async ({ where }) => { assert.equal(where.id, "player"); return structuredClone(account); };
  prisma.user.update = async ({ where, data }) => { assert.equal(where.id, "player"); account = { ...account, ...data }; updates.push(data); return structuredClone(account); };
  prisma.$queryRaw = async () => [];
  const handler = authRoutes.stack.find(layer => layer.route?.path === "/me" && layer.route.methods.patch).route.stack.at(-1).handle;
  const request = async body => {
    let status = 200, result;
    await handler({ body, user: { id: "player" } }, { status(value) { status = value; return this; }, json(value) { result = value; } }, error => { throw error; });
    return { status, result };
  };
  for (const theme of playerCardThemes) {
    assert.equal((await request({ player_card_theme: theme.id })).status, 200);
    assert.equal(account.metadata.player_card_theme, theme.id);
  }
  assert.equal(account.credits, 25); assert.equal(account.wallet_balance, 19); assert.equal(account.metadata.untouched, true);
  for (const value of ["javascript:alert(1)", "/external.png", "https://example.com/image.png", null, {}, ["frostbite"]]) assert.equal((await request({ player_card_theme: value })).status, 400);
  assert.equal((await request({ user_id: "other", player_card_theme: "frostbite" })).status, 403);
  assert.equal((await request({ player_card_theme: "" })).status, 200);
  assert.equal(account.metadata.player_card_theme, ""); assert.equal(updates.length, 11);
  for (const motion of ["auto", "on", "off"]) {
    assert.equal((await request({ player_card_motion: motion })).status, 200);
    assert.equal(account.metadata.player_card_motion, motion);
  }
  for (const motion of ["fast", null, {}, true]) assert.equal((await request({ player_card_motion: motion })).status, 400);
});
test("ten original optimized images and safe card presentation support the classic fallback", async () => {
  assert.equal(playerCardThemes.length, 10); assert.equal(new Set(playerCardThemes.map(theme => theme.id)).size, 10);
  let total = 0;
  for (const theme of playerCardThemes) {
    const url = new URL(`../public/images/player-cards/${theme.id}.webp`, import.meta.url);
    const bytes = await readFile(url); assert.equal(bytes.toString("ascii", 8, 12), "WEBP"); total += (await stat(url)).size;
    assert.equal(playerCardAppearance({ player_card_theme: theme.id })["data-player-card"], theme.id);
    assert.ok(validPlayerCard(theme.id));
    for (const [dir, width, height] of [["desktop-fit", 2160, 160], ["desktop-fit-wide", 3200, 160], ["desktop-fit-compact", 1080, 200]]) {
      const banner = await readFile(new URL(`../public/images/player-cards/${dir}/${theme.id}.webp`, import.meta.url));
      const meta = await sharp(banner).metadata(); assert.equal(meta.width, width); assert.equal(meta.height, height);
    }
    assert.ok(playerCardAppearance(theme.id).style["--pc-desktop-art"].includes(`/desktop-fit/${theme.id}.webp`));
    assert.ok(!playerCardAppearance(theme.id).style["--pc-art"].includes("/desktop/"));
  }
  assert.ok(total < 1500000);
  assert.deepEqual(playerCardAppearance({ player_card_theme: "https://evil.example" }), {});
  assert.deepEqual(playerCardAppearance({}), {});
});
test("the real match roster retains readable identity, rank, record and actions for every theme", async t => {
  const root = process.cwd().replaceAll("\\", "/");
  const bundle = await build({ stdin: { resolveDir: root, loader: "jsx", contents: `
    import React from 'react'; import {renderToStaticMarkup} from 'react-dom/server'; import {MemoryRouter} from 'react-router-dom';
    import MatchTeamTable from './src/components/match/MatchTeamTable.jsx';
    import PlayerCardSection from './src/components/settings/PlayerCardSection.jsx';
    const user={id:'player',user_id:'player',display_name:'TestPlayer',name:'TestPlayer',activision_id:'Example#123',wins:12,losses:4,elo:1600};
    export const render=theme=>renderToStaticMarkup(<MemoryRouter><MatchTeamTable ranked label="Alpha" name="Alpha" players={[{...user,player_card_theme:theme}]} playerActions={()=> <button>Player action</button>} /></MemoryRouter>);
    export const studio=()=>renderToStaticMarkup(<PlayerCardSection user={{...user,player_card_theme:'tokyo-afterglow'}}/>);
  ` }, bundle: true, write: false, platform: "node", format: "cjs", mainFields: ["module", "main"], external: ["react", "react-dom/server", "react-router-dom"], alias: { "@": `${root}/src` }, loader: { ".css": "empty" }, plugins: [{ name: "card-fixture", setup(plugin) {
    plugin.onResolve({ filter: /^@\/(api\/base44Client|lib\/AuthContext)$/ }, args => ({ path: args.path, namespace: "card-fixture" }));
    plugin.onLoad({ filter: /.*/, namespace: "card-fixture" }, args => ({ contents: args.path.includes("AuthContext") ? "export const useAuth=()=>({user:null});" : "export const base44={};", loader: "js" }));
  } }] });
  const mod = { exports: {} }; new Function("require", "module", "exports", bundle.outputFiles[0].text)(createRequire(import.meta.url), mod, mod.exports);
  const originalError = console.error;
  t.mock.method(console, "error", (...args) => { if (!String(args[0]).includes("useLayoutEffect does nothing on the server")) originalError(...args); });
  for (const theme of playerCardThemes) {
    const html = mod.exports.render(theme.id);
    assert.ok(html.includes(`data-player-card="${theme.id}"`));
    assert.ok(html.includes(`data-atmosphere="${theme.motion}"`));
    for (const text of ["TestPlayer", "Example#123", "12W", "4L", "Player action"]) assert.ok(html.includes(text), text);
  }
  assert.doesNotMatch(mod.exports.render(""), /data-player-card=/);
  const studio = mod.exports.studio();
  for (const theme of playerCardThemes) assert.ok(studio.includes(theme.name));
  assert.match(studio, /LIVE MATCH PREVIEW/); assert.match(studio, /Classic/);
});
