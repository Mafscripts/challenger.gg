import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { WebSocket } from "ws";
import { randomEightsTeams, editEightsTeamsAsAdmin } from "./eights-admin-teams.js";
import { prisma } from "./prisma.js";
import { signUser } from "./auth.js";
import routes from "./routes/functions.js";
import { attachEightsLiveServer, issueEightsLiveToken } from "./eights-live.js";
import { voiceRosterSignature } from "./free-eights-discord.js";

const admin = { id: "admin", role: "admin", email_verified: true };
const plainRoster = () => Array.from({ length: 8 }, (_, i) => ({ id: `p${i}`, user_id: `u${i}`, user_name: `Player ${i}`, team: i < 4 ? "host" : "challenger", is_captain: i === 0 || i === 4 }));
function fixture(type = "8s") {
  let state = {
    match: { id: "match", metadata: { match_type: type, team_size: "4v4", status: "open", teams_generated_at: "2026-01-01T00:00:00.000Z", roster_lock_deadline: new Date(Date.now() + 60000).toISOString(), host_id: "u0", challenger_id: "u4", series_maps: ["Map A", "Map B", "Map C"], series_modes: ["hp", "snd", "hp"], best_of: 3 } },
    players: plainRoster().map((player) => ({ id: player.id, metadata: { ...player, wager_id: "match", payment_status: "paid", entry_fee_paid: 15 } })), audits: [],
  };
  let skillReads = 0;
  const db = {
    $executeRaw: async () => 1,
    wager: { findUnique: async () => structuredClone(state.match), update: async ({ data }) => { state.match = { ...state.match, ...structuredClone(data) }; return structuredClone(state.match); } },
    wagerParticipant: {
      findMany: async () => structuredClone(state.players),
      update: async ({ where, data }) => { const player = state.players.find((row) => row.id === where.id); Object.assign(player, structuredClone(data)); return structuredClone(player); },
    },
    user: { findMany: async ({ where }) => { skillReads++; return where.id.in.map((id) => ({ id, metadata: { screenshot_rank: Number(id.slice(1)) % 2 ? "top250" : "diamond" } })); } },
    eightsStats: { findMany: async () => plainRoster().map((player) => ({ metadata: { user_id: player.user_id, wins: 100, losses: 2, rating: 9999 }, free_eights_elo: 700 })) },
    adminAction: { create: async ({ data }) => { state.audits.push(structuredClone(data)); return data; } },
  };
  let tail = Promise.resolve();
  db.$transaction = (action) => {
    const operation = tail.then(async () => { const before = structuredClone(state); try { return await action(db); } catch (error) { state = before; throw error; } });
    tail = operation.catch(() => {}); return operation;
  };
  return { db, state: () => state, skillReads: () => skillReads,
    input: (extra = {}) => ({ mode: "swap", first_user_id: "u0", second_user_id: "u4", expected_teams_generated_at: state.match.metadata.teams_generated_at, ...extra }) };
}

test("admin random shuffle reaches all 68 changed assignments, ignores skills and never returns the old split or its mirror", () => {
  const players = plainRoster(), results = new Set(), appearances = new Map();
  for (let i = 0; i < 68; i++) {
    const result = randomEightsTeams(players, () => (i + 0.5) / 68);
    assert.equal(result.alpha.length, 4); assert.equal(result.bravo.length, 4);
    assert.equal(new Set([...result.alpha, ...result.bravo].map((p) => p.user_id)).size, 8);
    assert.ok(result.alpha.some((p) => p.team === "host") && result.alpha.some((p) => p.team === "challenger"));
    results.add(result.alpha.map((p) => p.user_id).sort().join(","));
    for (const player of result.alpha) appearances.set(player.user_id, (appearances.get(player.user_id) || 0) + 1);
    const changedSkills = players.map((p) => ({ ...p, free_eights_elo: 9999, screenshot_rank: "top250", eights_wins: 99999 }));
    assert.deepEqual(randomEightsTeams(changedSkills, () => (i + 0.5) / 68).alpha.map((p) => p.user_id), result.alpha.map((p) => p.user_id));
  }
  assert.equal(results.size, 68); assert.deepEqual([...appearances.values()], Array(8).fill(34));
  assert.throws(() => randomEightsTeams(players.slice(0, 7)), /4v4/);
  assert.throws(() => randomEightsTeams([...players.slice(0, 7), players[0]]), /4v4/);
});

test("admin swaps update captains, Discord roster revision and audit together, preserving match and payment details", async () => {
  const f = fixture(), before = structuredClone(f.state());
  const signature = voiceRosterSignature(before.match.metadata, before.players.map((p) => p.metadata));
  const result = await editEightsTeamsAsAdmin(f.db, admin, "match", f.input());
  assert.equal(result.wager.host_id, "u4"); assert.equal(result.wager.challenger_id, "u0");
  assert.deepEqual(result.wager.series_maps, before.match.metadata.series_maps);
  assert.deepEqual(result.wager.series_modes, before.match.metadata.series_modes);
  assert.equal(result.wager.status, "open"); assert.equal(result.wager.free_eights_team_balance.strategy, "admin-swap-v1");
  for (const side of ["host", "challenger"]) {
    const players = f.state().players.filter((p) => p.metadata.team === side);
    assert.equal(players.length, 4); assert.equal(players.filter((p) => p.metadata.is_captain).length, 1);
    players.forEach((p) => { assert.equal(p.metadata.payment_status, "paid"); assert.equal(p.metadata.entry_fee_paid, 15); assert.equal(p.metadata.free_eights_elo, 700); });
  }
  assert.notEqual(voiceRosterSignature(f.state().match.metadata, f.state().players.map((p) => p.metadata)), signature);
  assert.equal(f.state().audits.length, 1);
  const remaining = Date.parse(result.wager.roster_lock_deadline) - Date.now(); assert.ok(remaining > 55000 && remaining <= 60000);
});

test("invalid, stale and unauthorized swaps make no changes; simultaneous stale requests cannot both apply", async () => {
  const f = fixture(), before = structuredClone(f.state());
  for (const user of [{ id: "u0", role: "user" }, { id: "mod", role: "moderator" }]) await assert.rejects(editEightsTeamsAsAdmin(f.db, user, "match", f.input()), { status: 403 });
  for (const input of [f.input({ second_user_id: "u1" }), f.input({ second_user_id: "u0" }), f.input({ second_user_id: "outsider" }), f.input({ mode: "forged" })]) await assert.rejects(editEightsTeamsAsAdmin(f.db, admin, "match", input));
  await assert.rejects(editEightsTeamsAsAdmin(f.db, admin, "match", f.input({ expected_teams_generated_at: "stale" })), { status: 409 });
  assert.deepEqual(f.state(), before);
  const input = f.input();
  const results = await Promise.allSettled([editEightsTeamsAsAdmin(f.db, admin, "match", input), editEightsTeamsAsAdmin(f.db, admin, "match", input)]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1); assert.equal(f.state().audits.length, 1);
});

test("roster failures and audit failures roll back every participant and captain change", async () => {
  for (const failure of ["participant", "audit"]) {
    const f = fixture(), before = structuredClone(f.state());
    if (failure === "audit") f.db.adminAction.create = async () => { throw new Error("audit unavailable"); };
    else { const update = f.db.wagerParticipant.update; let count = 0; f.db.wagerParticipant.update = async (args) => { if (++count === 3) throw new Error("participant unavailable"); return update(args); }; }
    await assert.rejects(editEightsTeamsAsAdmin(f.db, admin, "match", f.input()), /unavailable/); assert.deepEqual(f.state(), before);
  }
});

test("live, closed, incomplete and voice-pending lobbies cannot be edited", async () => {
  for (const metadata of [{ status: "in_progress" }, { status: "completed" }, { status: "cancelled" }, { roster_locked: true }, { free_eights_waiting_for_voice: true }, { teams_generated_at: "" }, { roster_lock_deadline: new Date(0).toISOString() }]) {
    const f = fixture(); Object.assign(f.state().match.metadata, metadata); const before = structuredClone(f.state());
    await assert.rejects(editEightsTeamsAsAdmin(f.db, admin, "match", f.input()), { status: 409 }); assert.deepEqual(f.state(), before);
  }
  const f = fixture(); f.state().players.pop(); await assert.rejects(editEightsTeamsAsAdmin(f.db, admin, "match", f.input()), /4v4/);
});

test("Money 8s admin shuffle retains payment records and a five-minute timer without Free 8s skill reads", async () => {
  const f = fixture("money8s"); const result = await editEightsTeamsAsAdmin(f.db, admin, "match", f.input({ mode: "random" }), () => 0);
  assert.equal(f.skillReads(), 0); assert.equal(result.wager.free_eights_team_balance, undefined);
  assert.ok(Date.parse(result.wager.roster_lock_deadline) - Date.now() > 295000);
  assert.ok(f.state().players.every((p) => p.metadata.entry_fee_paid === 15 && p.metadata.payment_status === "paid"));
});

test("authenticated admin endpoints publish live updates, reject players and retain overrides on room sync", async (t) => {
  const f = fixture(), notices = [];
  const override = (delegate, method, implementation) => { const original = delegate[method]; delegate[method] = implementation; t.after(() => { delegate[method] = original; }); };
  override(prisma.user, "findUnique", async ({ where }) => ({ ...admin, id: where.id, role: where.id === "admin" ? "admin" : "user" }));
  override(prisma.ban, "findMany", async () => []);
  override(prisma, "$transaction", f.db.$transaction);
  override(prisma.wager, "findUnique", f.db.wager.findUnique);
  override(prisma.wager, "update", async () => { throw new Error("Sync must retain the administrator's teams"); });
  override(prisma.wagerParticipant, "findMany", f.db.wagerParticipant.findMany);
  override(prisma.chatMessage, "create", async ({ data }) => { notices.push(data.metadata); return { id: "notice", ...data }; });
  const app = express(); app.use(express.json()); app.use("/functions", routes); app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message }));
  const server = app.listen(0, "127.0.0.1"); attachEightsLiveServer(server);
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const url = `http://127.0.0.1:${server.address().port}`;
  const request = async (name, body = {}, user = admin) => {
    const response = await fetch(`${url}/functions/${name}`, { method: "POST", headers: { Authorization: `Bearer ${signUser(user)}`, "Content-Type": "application/json" }, body: JSON.stringify({ wager_id: "match", ...body }) });
    return { status: response.status, body: await response.json() };
  };
  const token = await issueEightsLiveToken(admin.id, "match", true);
  const socket = new WebSocket(`${url.replace("http", "ws")}${token.path}?token=${token.token}`);
  t.after(() => socket.terminate());
  const liveMessage = () => new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error("Live update timed out")), 3000); socket.once("message", (data) => { clearTimeout(timer); resolve(JSON.parse(String(data))); }); });
  assert.equal((await liveMessage()).type, "eights-lobby-ready");
  const update = liveMessage(); const swapped = await request("adminSwapEightsPlayers", f.input());
  assert.equal(swapped.status, 200); assert.equal(swapped.body.swapped, true); assert.equal((await update).reason, "admin-players-swapped");
  const before = structuredClone(f.state()); const synced = await request("syncEightsLobby"); assert.equal(synced.body.success, true, JSON.stringify(synced)); assert.deepEqual(f.state(), before);
  const denied = await request("adminSwapEightsPlayers", f.input(), { id: "u0", role: "user", email_verified: true }); assert.equal(denied.body.success, false); assert.deepEqual(f.state(), before);
  const stale = await request("adminSwapEightsPlayers", f.input({ expected_teams_generated_at: "old" })); assert.equal(stale.status, 409); assert.deepEqual(f.state(), before);
  const randomUpdate = liveMessage(); const shuffled = await request("adminReshuffleEightsTeams", f.input());
  assert.equal(shuffled.status, 200); assert.equal(shuffled.body.wager.free_eights_team_balance.strategy, "admin-random-v1"); assert.equal((await randomUpdate).reason, "admin-teams-randomized");
  assert.equal(notices.length, 2);
});
