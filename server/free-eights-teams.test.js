import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { balanceFreeEightsTeams, getFreeEightsSkill } from "../src/lib/freeEightsSkill.js";
import { generateBalancedFreeEightsTeams, loadFreeEightsSkills } from "./free-eights-teams.js";
import functionRoutes from "./routes/functions.js";
import { prisma } from "./prisma.js";
import { signUser } from "./auth.js";
import { freeEightsDiscordConfig, freeEightsVoiceKey, freeEightsWaitingRoomReady, voiceRosterSignature } from "./free-eights-discord.js";

const player = (i, elo = 0, screenshot = null) => ({ id: `p${i}`, user_id: `u${i}`, free_eights_elo: elo, screenshot_rank: screenshot });
const mixedRoster = () => [player(0), player(1), player(2), player(3), player(4, 0, "diamond"), player(5, 0, "diamond"), player(6, 0, "crimson"), player(7, 0, "iridescent")];
const ranks = (rows) => rows.map((row) => getFreeEightsSkill(row.free_eights_elo, row.screenshot_rank).key);

test("Free 8s uses the screenshot below Challenger and its own ladder from 600; profile identity stays intact", () => {
  for (const screenshot_rank of ["diamond", "crimson", "iridescent", "top250"]) {
    const profile = { screenshot_rank };
    assert.equal(getFreeEightsSkill(0, profile.screenshot_rank).key, screenshot_rank);
    assert.equal(getFreeEightsSkill(599, profile.screenshot_rank).source, "screenshot");
    assert.equal(getFreeEightsSkill(600, profile.screenshot_rank).key, "challenger");
    assert.equal(getFreeEightsSkill(799, profile.screenshot_rank).key, "challenger");
    assert.equal(getFreeEightsSkill(800, profile.screenshot_rank).key, "topfragger");
    assert.equal(getFreeEightsSkill(1200, profile.screenshot_rank).strength, 1200);
    assert.deepEqual(profile, { screenshot_rank });
  }
  for (const [elo, rank] of [[0, "newb"], [199, "newb"], [200, "advanced"], [400, "amateur"], [600, "challenger"], [800, "topfragger"]]) {
    assert.equal(getFreeEightsSkill(elo, null).key, rank);
    assert.equal(getFreeEightsSkill(elo, "invalid").key, rank);
  }
  assert.equal(getFreeEightsSkill(-40).strength, 0);
  assert.equal(getFreeEightsSkill(NaN).key, "newb");
});

test("four Newbs, two Diamonds, Crimson and Iridescent split as two Newbs and one Diamond per team", () => {
  const input = mixedRoster(), before = structuredClone(input);
  for (const random of [0, 0.2, 0.5, 0.99]) {
    const result = balanceFreeEightsTeams(input, () => random);
    for (const team of [result.alpha, result.bravo]) {
      assert.equal(team.length, 4);
      assert.equal(ranks(team).filter((rank) => rank === "newb").length, 2);
      assert.equal(ranks(team).filter((rank) => rank === "diamond").length, 1);
      assert.equal(ranks(team).filter((rank) => ["crimson", "iridescent"].includes(rank)).length, 1);
    }
    assert.equal(result.balance.partitions_checked, 35);
    assert.equal(result.balance.strength_gap, 100);
    assert.equal(new Set([...result.alpha, ...result.bravo].map((row) => row.user_id)).size, 8);
  }
  assert.deepEqual(input, before);
});

test("balancing finds the optimal rank spread and strength gap across all 70 labeled team splits", () => {
  const rosters = [mixedRoster(), Array.from({ length: 8 }, (_, i) => player(i, [0, 199, 200, 399, 400, 599, 600, 1800][i])),
    [player(0, 0, "top250"), player(1, 599, "top250"), player(2, 600, "diamond"), player(3, 700, "crimson"), player(4, 800, "iridescent"), player(5, 1600, "top250"), player(6, 0), player(7, 199)]];
  for (const input of rosters) {
    const skills = input.map((row) => getFreeEightsSkill(row.free_eights_elo, row.screenshot_rank));
    const objectives = [];
    for (let mask = 0; mask < 256; mask++) {
      const team = input.map((_, i) => Boolean(mask & (1 << i)));
      if (team.filter(Boolean).length !== 4) continue;
      const imbalance = [...new Set(skills.map((row) => row.key))].reduce((sum, key) => {
        const counts = skills.reduce((total, row, i) => total + (row.key === key ? team[i] ? 1 : -1 : 0), 0);
        return sum + counts * counts;
      }, 0);
      const gap = Math.abs(skills.reduce((sum, row, i) => sum + row.strength * (team[i] ? 1 : -1), 0));
      objectives.push([imbalance, gap]);
    }
    assert.equal(objectives.length, 70);
    objectives.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const result = balanceFreeEightsTeams(input, () => 0.4);
    assert.deepEqual([result.balance.rank_imbalance, result.balance.strength_gap], objectives[0]);
  }
});

test("equal players can reshuffle; invalid or duplicate rosters cannot be generated", () => {
  const input = Array.from({ length: 8 }, (_, i) => player(i));
  assert.notDeepEqual(balanceFreeEightsTeams(input, () => 0).alpha, balanceFreeEightsTeams(input, () => 0.99).alpha);
  for (const invalid of [input.slice(0, 7), [...input, player(8)], [...input.slice(0, 7), input[0]], [...input.slice(0, 7), { id: "missing" }]]) {
    assert.throws(() => balanceFreeEightsTeams(invalid), /eight distinct players/);
  }
});

function skillDb(input) {
  const calls = [];
  const users = input.map((row) => ({ id: row.user_id, metadata: { screenshot_rank: row.screenshot_rank, private_review: "secret" } }));
  const stats = input.map((row) => ({ metadata: { user_id: row.user_id, rating: 99999 }, free_eights_elo: row.free_eights_elo }));
  return { calls, users, stats, db: {
    user: { findMany: async (query) => { calls.push({ name: "user", query }); return users; } },
    eightsStats: { findMany: async (query) => { calls.push({ name: "stats", query }); return stats; } },
  } };
}

test("generation batches trusted account ranks and latest Free 8s stats, ignoring forged participant skills", async () => {
  const input = mixedRoster(), f = skillDb(input);
  // The query orders newest first. An obsolete 9999 ELO row must not win.
  f.stats.push({ metadata: { user_id: "u0" }, free_eights_elo: 9999 });
  const forged = input.map((row) => ({ ...row, screenshot_rank: "top250", free_eights_elo: 9999 }));
  const result = await generateBalancedFreeEightsTeams(f.db, forged, () => 0);
  assert.equal(f.calls.length, 2);
  assert.deepEqual(f.calls[0].query.where.id.in, input.map((row) => row.user_id));
  assert.equal(f.calls[1].query.where.OR.length, 8);
  assert.deepEqual(f.calls[1].query.orderBy, { created_date: "desc" });
  assert.equal(result.balance.players.u0.rank, "Newb");
  assert.equal(result.balance.players.u0.free_eights_elo, 0);
  assert.equal(result.balance.players.u4.rank, "Diamond");
  assert.equal(result.balance.strength_gap, 100);
  assert.equal(JSON.stringify(result).includes("secret"), false);
  assert.deepEqual(f.users[7].metadata.screenshot_rank, "iridescent");
  f.calls.length = 0;
  assert.deepEqual(await loadFreeEightsSkills(f.db, []), {});
  assert.equal(f.calls.length, 0);
});

test("missing ranks/stats default to Newb, while database errors prevent a wrong zero-skill split", async () => {
  const f = skillDb([]);
  const result = await generateBalancedFreeEightsTeams(f.db, Array.from({ length: 8 }, (_, i) => player(i)), () => 0);
  assert.equal(result.balance.strength_gap, 0);
  assert.equal(result.balance.players.u0.rank, "Newb");
  f.db.eightsStats.findMany = async () => { throw new Error("database unavailable"); };
  await assert.rejects(() => generateBalancedFreeEightsTeams(f.db, mixedRoster()), /database unavailable/);
});

test("real generation and resets use 60 seconds for Free 8s, preserve Money 8s at 300 seconds and keep skill isolation", async (t) => {
  const input = mixedRoster(), f = skillDb(input);
  const admin = { id: "admin", email_verified: true, role: "admin", metadata: {} };
  const matches = new Map(["8s", "money8s"].map((type) => [type, { id: type, metadata: { match_type: type, status: "open", required_players_per_team: 4, team_size: "4v4", roster_lock_deadline: new Date(Date.now() + 60000).toISOString() } }]));
  const rosters = new Map([...matches.keys()].map((id) => [id, input.map((row) => ({ id: `${id}-${row.id}`, metadata: { wager_id: id, user_id: row.user_id, user_name: row.user_id, team: "host" } }))]));
  const voiceRecords = new Map();
  const env = { DISCORD_FREE_8S_VOICE_ENABLED: "true", DISCORD_GUILD_ID: "100000000000000001", DISCORD_FREE_8S_WAITING_ROOM_ID: "100000000000000002", DISCORD_FREE_8S_VOICE_CATEGORY_ID: "100000000000000003" };
  for (const [key, value] of Object.entries(env)) {
    const previous = process.env[key]; process.env[key] = value;
    t.after(() => { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; });
  }
  const override = (delegate, method, value) => {
    const previous = delegate[method]; delegate[method] = value;
    t.after(() => { delegate[method] = previous; });
  };
  override(prisma.user, "findUnique", async () => admin);
  override(prisma.ban, "findMany", async () => []);
  override(prisma.user, "findMany", f.db.user.findMany);
  override(prisma.eightsStats, "findMany", f.db.eightsStats.findMany);
  override(prisma.wager, "findUnique", async ({ where }) => matches.get(where.id));
  override(prisma.discordEventDispatch, "findUnique", async ({ where }) => voiceRecords.get(where.event_key) || null);
  override(prisma.wager, "update", async ({ where, data }) => {
    const updated = { ...matches.get(where.id), ...data }; matches.set(where.id, updated); return updated;
  });
  override(prisma.wagerParticipant, "findMany", async ({ where }) => {
    const id = where?.AND?.find((condition) => condition.metadata?.path?.[0] === "wager_id")?.metadata.equals;
    return id ? rosters.get(id) || [] : [...rosters.values()].flat();
  });
  override(prisma.wagerParticipant, "findUnique", async ({ where }) => [...rosters.values()].flat().find((row) => row.id === where.id));
  override(prisma.wagerParticipant, "update", async ({ where, data }) => {
    const row = [...rosters.values()].flat().find((entry) => entry.id === where.id); Object.assign(row, data); return row;
  });
  const systemMessages = [];
  override(prisma.chatMessage, "create", async ({ data }) => { systemMessages.push(data.metadata); return { id: "system", ...data }; });
  override(prisma.dispute, "findMany", async () => []);
  const app = express(); app.use(express.json()); app.use("/functions", functionRoutes);
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const request = async (name, id) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/functions/${name}`, { method: "POST", headers: { Authorization: `Bearer ${signUser(admin)}`, "Content-Type": "application/json" }, body: JSON.stringify({ wager_id: id, participants: input.map((row) => ({ ...row, free_eights_elo: 9999 })) }) });
    const body = await response.json(); assert.equal(response.status, 200, JSON.stringify(body)); assert.equal(body.success, true, JSON.stringify(body)); return body;
  };
  const assertWindow = (type, duration) => {
    const remaining = new Date(matches.get(type).metadata.roster_lock_deadline).getTime() - Date.now();
    assert.ok(remaining <= duration && remaining > duration - 5000, `${type} expected ${duration}ms, got ${remaining}ms`);
  };
  // Eight website players cannot generate maps or a countdown using frontend
  // supplied readiness. A missing/stale bot or seven voice users keeps them waiting.
  const waiting = await request("syncEightsLobby", "8s");
  assert.equal(waiting.waiting_for_voice, true);
  assert.deepEqual(waiting.wager.series_maps, []);
  assert.equal(waiting.wager.roster_lock_deadline, "");
  assert.equal(waiting.wager.teams_generated_at, "");
  assert.equal(f.calls.length, 0, "skills are not generated until all eight are in voice");
  const pendingReset = await request("adminResetEightsLobby", "8s");
  assert.equal(pendingReset.seconds_remaining, null);
  assert.equal(pendingReset.wager.roster_lock_deadline, "", "admin reset cannot bypass the voice gate");
  const config = freeEightsDiscordConfig();
  const state = { guild_id: config.guildId, waiting_room_id: config.waitingRoomId, category_id: config.categoryId,
    checked_at: new Date().toISOString(), roster_signature: voiceRosterSignature(matches.get("8s").metadata, rosters.get("8s").map((row) => row.metadata)),
    players: Object.fromEntries(input.map((player) => [player.user_id, { status: "in_waiting_room" }])) };
  state.players.u7.status = "not_in_waiting_room";
  voiceRecords.set(freeEightsVoiceKey("8s"), { metadata: state });
  await request("syncEightsLobby", "8s");
  assert.deepEqual(matches.get("8s").metadata.series_maps, []);
  state.players.u7.status = "in_waiting_room";
  state.checked_at = new Date(Date.now() - 21000).toISOString();
  await request("syncEightsLobby", "8s");
  assert.deepEqual(matches.get("8s").metadata.series_maps, []);
  state.checked_at = new Date().toISOString();
  for (const name of ["syncEightsLobby", "adminReshuffleEightsTeams"]) {
    await request(name, "8s");
    assertWindow("8s", 60000);
    assert.equal(matches.get("8s").metadata.series_maps.length, 3);
    assert.equal(matches.get("8s").metadata.free_eights_waiting_for_voice, false);
    for (const side of ["host", "challenger"]) {
      const team = rosters.get("8s").filter((row) => row.metadata.team === side).map((row) => row.metadata);
      assert.equal(team.length, 4);
      assert.equal(ranks(team).filter((rank) => rank === "newb").length, 2);
      assert.equal(ranks(team).filter((rank) => rank === "diamond").length, 1);
      assert.equal(team.filter((row) => row.is_captain).length, 1);
    }
    assert.equal(matches.get("8s").metadata.free_eights_team_balance.partitions_checked, 35);
  }
  const reads = f.calls.length;
  const previousDeadline = matches.get("8s").metadata.roster_lock_deadline;
  await request("syncEightsLobby", "8s");
  assert.equal(matches.get("8s").metadata.roster_lock_deadline, previousDeadline, "polls do not restart the countdown");
  assert.equal(f.calls.length, reads, "later polls reuse already generated teams");
  for (const name of ["syncEightsLobby", "adminReshuffleEightsTeams"]) {
    await request(name, "money8s");
    assertWindow("money8s", 300000);
  }
  assert.equal(f.calls.length, reads, "Money 8s keeps its original random split");
  assert.equal(matches.get("money8s").metadata.free_eights_team_balance, undefined);
  assert.equal(rosters.get("money8s").some((row) => Object.hasOwn(row.metadata, "free_eights_elo")), false);
  assert.deepEqual(f.users.map((row) => row.metadata.screenshot_rank), input.map((row) => row.screenshot_rank));
  for (const [type, seconds] of [["8s", 60], ["money8s", 300]]) {
    // Recovery of a missing timer uses the same duration as generation.
    matches.get(type).metadata.roster_lock_deadline = "";
    await request("syncEightsLobby", type);
    assertWindow(type, seconds * 1000);
    const reset = await request("adminResetEightsLobby", type);
    assert.equal(reset.seconds_remaining, seconds);
    assertWindow(type, seconds * 1000);
    assert.ok(systemMessages.at(-1).content.includes(`${seconds / 60}-minute reshuffle window`));
  }
  const afterFreeDeadline = new Date(matches.get("8s").metadata.roster_lock_deadline).getTime() + 1;
  const clock = t.mock.method(Date, "now", () => afterFreeDeadline);
  try {
    assert.equal((await request("syncEightsLobby", "8s")).wager.status, "in_progress");
    assert.equal((await request("syncEightsLobby", "money8s")).wager.status, "open");
  } finally { clock.mock.restore(); }
});

test("map readiness requires all eight in the exact waiting room with a fresh bot snapshot", () => {
  const config = { enabled: true, guildId: "100000000000000001", waitingRoomId: "100000000000000002", categoryId: "100000000000000003" };
  const match = { match_type: "8s" }, participants = mixedRoster();
  const now = Date.now();
  const state = { checked_at: new Date(now).toISOString(), guild_id: config.guildId, waiting_room_id: config.waitingRoomId, category_id: config.categoryId,
    roster_signature: voiceRosterSignature(match, participants), players: Object.fromEntries(participants.map((row) => [row.user_id, { status: "in_waiting_room" }])) };
  assert.equal(freeEightsWaitingRoomReady(config, match, participants, state, now), true);
  assert.equal(freeEightsWaitingRoomReady({ ...config, enabled: false }, match, participants, state, now), false);
  for (const override of [{ checked_at: new Date(now - 20000).toISOString() }, { checked_at: new Date(now + 1000).toISOString() },
    { guild_id: "other" }, { waiting_room_id: "other" }, { category_id: "other" }, { roster_signature: "another match" }]) {
    assert.equal(freeEightsWaitingRoomReady(config, match, participants, { ...state, ...override }, now), false);
  }
  for (const status of ["in_team_voice", "not_in_waiting_room", "move_failed", "not_linked", "checking", "unavailable"]) {
    const modified = structuredClone(state); modified.players.u7.status = status;
    assert.equal(freeEightsWaitingRoomReady(config, match, participants, modified, now), false);
  }
  const missing = structuredClone(state); delete missing.players.u7;
  assert.equal(freeEightsWaitingRoomReady(config, match, participants, missing, now), false);
  assert.equal(freeEightsWaitingRoomReady(config, match, participants.slice(1), state, now), false);
  assert.equal(freeEightsWaitingRoomReady(config, match, [...participants.slice(1), participants[1]], state, now), false);
  assert.equal(freeEightsWaitingRoomReady({ ...config, enabled: false }, { match_type: "money8s" }, [], null, now), true);
});
