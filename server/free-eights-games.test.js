import test from "node:test";
import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import express from "express";
import sharp from "sharp";
import { DEFAULT_EIGHTS_GAMES, eightsGameId, generateEightsSeries } from "../src/lib/freeEightsGames.js";
import { validateEightsGames, eightsLobbySettings, uploadEightsMapImage, EIGHTS_CONFIG_ID } from "./free-eights-games.js";
import { loadFreeEightsSkills } from "./free-eights-teams.js";
import { getFreeEightsOverview } from "./free-eights-reads.js";
import functions from "./routes/functions.js";
import entities from "./routes/entities.js";
import publicRoutes from "./routes/public.js";
import { prisma } from "./prisma.js";
import { signUser } from "./auth.js";

test("defaults preserve BO7 and contain the exact supplied BO6/MW3 pools with artwork", async () => {
  assert.deepEqual(validateEightsGames(DEFAULT_EIGHTS_GAMES), DEFAULT_EIGHTS_GAMES);
  const [bo7, bo6, mw3] = DEFAULT_EIGHTS_GAMES;
  assert.equal(eightsGameId({}), "bo7");
  assert.equal(bo7.color, "orange"); assert.equal(bo6.color, "orange"); assert.equal(mw3.color, "green");
  assert.deepEqual(bo6.modes[1].maps.map((map) => map.name), ["Dealership", "Hacienda", "Protocol", "Red Card", "Rewind"]);
  assert.deepEqual(mw3.modes[0].maps.map((map) => map.name), ["Invasion", "Karachi", "Sub Base", "Rio", "6 Star", "Vista"]);
  assert.deepEqual(mw3.modes[1].maps.map((map) => map.name), ["Highrise", "Invasion", "Karachi", "Terminal", "Rio", "6 Star"]);
  for (const game of [bo6, mw3]) for (const mode of game.modes) for (const map of mode.maps) await access(`public${map.image}`);
});
test("server settings override forged best-of, team size, map pools and names for all games", () => {
  for (const game of DEFAULT_EIGHTS_GAMES) for (const format of game.formats) {
    const settings = eightsLobbySettings(DEFAULT_EIGHTS_GAMES, { game_id: game.id, series_format: format.id, best_of: 99, team_size: "1v1", game_config: { modes: [] }, series_mode_ids: ["fake"] });
    assert.equal(settings.team_size, "4v4"); assert.equal(settings.max_players, 8);
    assert.equal(settings.best_of, format.modes.length); assert.deepEqual(settings.series_mode_ids, format.modes);
    assert.deepEqual(settings.game_config, game);
    const selected = generateEightsSeries(settings, () => 0);
    assert.equal(selected.length, settings.best_of);
    selected.forEach((map, index) => assert(game.modes.find((mode) => mode.id === format.modes[index]).maps.some((row) => row.name === map.name && row.image === map.image)));
    if (format.id === "hp_bo3") assert.equal(new Set(selected.map((map) => map.name)).size, 3);
  }
  assert.throws(() => eightsLobbySettings(DEFAULT_EIGHTS_GAMES, { game_id: "nope" }), /unavailable/);
  assert.throws(() => eightsLobbySettings(DEFAULT_EIGHTS_GAMES, { series_format: "bad" }), /format/);
  assert.deepEqual(generateEightsSeries({ series_format: "cdl_bo3" }, () => 0).map((map) => map.mode), ["hp", "snd", "hp"]);
});
test("custom game modes support mixed BO3 and BO1; stored room snapshot survives admin pool changes", () => {
  const games = structuredClone(DEFAULT_EIGHTS_GAMES);
  games.push({ id: "custom", name: "New game", number: "", color: "green", enabled: true, modes: [{ id: "capture", name: "Capture The Flag", maps: [{ name: "Arena", image: "https://example.com/arena.webp" }] }], formats: [{ id: "ctf_1", name: "CTF BO1", modes: ["capture"] }, { id: "ctf_3", name: "CTF BO3", modes: ["capture", "capture", "capture"] }] });
  validateEightsGames(games);
  const match = eightsLobbySettings(games, { game_id: "custom", series_format: "ctf_3" });
  games[3].modes[0].maps[0].name = "Replacement";
  assert.deepEqual(generateEightsSeries(match).map((map) => map.name), ["Arena", "Arena", "Arena"]);
  assert.equal(generateEightsSeries(eightsLobbySettings(games, { game_id: "custom", series_format: "ctf_1" })).length, 1);
});
test("invalid IDs, duplicate pools, unavailable modes and unsafe image URLs are rejected", () => {
  const change = (edit) => { const games = structuredClone(DEFAULT_EIGHTS_GAMES); edit(games); return games; };
  for (const edit of [g => g.push(g[0]), g => g[0].id = "../bad", g => g[0].modes[0].maps = [], g => g[0].modes[0].maps.push(g[0].modes[0].maps[0]), g => g[0].formats[0].modes = ["unknown"], g => g[0].formats[0].modes = ["hp", "snd"], g => g.forEach(row => row.enabled = false), g => g.shift(), g => g[0].modes[0].maps[0].image = "javascript:alert(1)", g => g[0].modes[0].maps[0].image = "/assets/maps/../secret"]) assert.throws(() => validateEightsGames(change(edit)));
});
test("game-scoped team strength uses BO6 ELO and defaults missing MW3 records to zero", async () => {
  const db = { user: { findMany: async () => [{ id: "u", metadata: { screenshot_rank: "diamond" } }] }, eightsStats: { findMany: async () => [{ metadata: { user_id: "u" }, free_eights_elo: 850 }, { metadata: { user_id: "u", game_id: "bo6" }, free_eights_elo: 40 }] } };
  assert.equal((await loadFreeEightsSkills(db, ["u"], "bo7")).u.free_eights_elo, 850);
  assert.equal((await loadFreeEightsSkills(db, ["u"], "bo6")).u.free_eights_elo, 40);
  assert.equal((await loadFreeEightsSkills(db, ["u"], "mw3")).u.free_eights_elo, 0);
});
test("matchfinder filters by game but active membership blocks playing two games at once", async () => {
  const rows = [undefined, "bo6", "mw3"].map((game_id, i) => ({ id: `m${i}`, created_date: new Date(), metadata: { game_id, match_type: "8s", status: "open", host_id: "u" } }));
  const db = { wager: { findMany: async ({where}) => where.AND.some(row => row.metadata?.path[0] === "status") ? rows : rows.slice(0, 1) }, wagerParticipant: { findMany: async () => [] } };
  const result = await getFreeEightsOverview(db, "u", "bo6");
  assert.deepEqual(result.lobbies.map(row => row.id), ["m1"]);
  assert.equal(result.active_lobby.id, "m0");
  assert.equal((await getFreeEightsOverview(db, "u", null)).lobbies.length, 3);
});
test("admin configuration is versioned, audited and protected; normalized image upload is public and immutable", async (t) => {
  const override = (target, key, value) => { const original = target[key]; target[key] = value; t.after(() => { target[key] = original; }); };
  const rows = new Map(), audits = [];
  const users = Object.fromEntries(["user", "moderator", "admin"].map(role => [role, { id: role, role, email_verified: true, metadata: {} }]));
  override(prisma.user, "findUnique", async ({where}) => users[where.id]);
  override(prisma.ban, "findMany", async () => []);
  override(prisma.mapPool, "findUnique", async ({where}) => rows.get(where.id) || null);
  override(prisma.mapPool, "upsert", async ({where,create,update}) => { const row = { ...(rows.get(where.id) || create), ...(rows.has(where.id) ? update : {}), updated_date: new Date() }; rows.set(where.id, row); return row; });
  override(prisma.adminAction, "create", async ({data}) => { audits.push(data.metadata); return data; });
  override(prisma, "$executeRaw", async () => 1);
  override(prisma, "$transaction", async action => action(prisma));
  const app = express(); app.use(express.json({limit:"4mb"})); app.use('/functions', functions); app.use('/entities', entities); app.use('/public', publicRoutes); app.use((err,req,res,next)=>res.status(err.status || 500).json({error:err.message}));
  const server = app.listen(0); t.after(()=>server.close()); const base=`http://127.0.0.1:${server.address().port}`;
  const post = (role, action, body) => fetch(`${base}/functions/${action}`, { method:'POST', headers: {'Content-Type':'application/json',Authorization:`Bearer ${signUser(users[role])}`}, body:JSON.stringify(body) });
  for (const role of ['user','moderator']) assert.equal((await post(role,'updateFreeEightsGames',{games:DEFAULT_EIGHTS_GAMES,version:'default'})).status,403);
  const saved=await post('admin','updateFreeEightsGames',{games:DEFAULT_EIGHTS_GAMES,version:'default'}); assert.equal(saved.status,200); const result=await saved.json(); assert.equal(audits.length,1); assert(rows.has(EIGHTS_CONFIG_ID));
  assert.equal((await post('admin','updateFreeEightsGames',{games:DEFAULT_EIGHTS_GAMES,version:'default'})).status,409);
  const image=await sharp({create:{width:100,height:60,channels:3,background:'#337799'}}).png().toBuffer();
  assert.equal((await post('user','uploadFreeEightsMapImage',{image:`data:image/png;base64,${image.toString('base64')}`})).status,403);
  const upload=await post('admin','uploadFreeEightsMapImage',{image:`data:image/png;base64,${image.toString('base64')}`}); assert.equal(upload.status,200); const artwork=await upload.json();
  const publicImage=await fetch(`${base}${artwork.image.replace('/api','')}`); assert.equal(publicImage.headers.get('content-type'),'image/webp'); assert.match(publicImage.headers.get('cache-control'),/immutable/);
  assert.equal((await sharp(Buffer.from(await publicImage.arrayBuffer())).metadata()).format,'webp');
  assert.equal((await fetch(`${base}/entities/MapPool`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${signUser(users.admin)}`},body:JSON.stringify({id:EIGHTS_CONFIG_ID, games:[]})})).status,403);
  assert.equal((await fetch(`${base}/public/free-eights-games`).then(r=>r.json())).version,result.version);
  assert.equal((await post('user','createWager',{match_type:'8s',game_id:'unknown'})).status,200); // Activision gate remains first.
  await assert.rejects(uploadEightsMapImage(prisma, 'data:image/svg+xml;base64,PHN2Zz4='), /PNG/);
});
