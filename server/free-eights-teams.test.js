import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { balanceFreeEightsTeams, getFreeEightsSkill } from "../src/lib/freeEightsSkill.js";
import { generateBalancedFreeEightsTeams, loadFreeEightsSkills } from "./free-eights-teams.js";
import functionRoutes from "./routes/functions.js";
import { prisma } from "./prisma.js";
import { signUser } from "./auth.js";

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

test("real generation and admin reshuffle persist balanced Free 8s rosters; Money 8s does not query or use these skills", async (t) => {
  const input = mixedRoster(), f = skillDb(input);
  const admin = { id: "admin", email_verified: true, role: "admin", metadata: {} };
  const matches = new Map(["8s", "money8s"].map((type) => [type, { id: type, metadata: { match_type: type, status: "open", required_players_per_team: 4, team_size: "4v4", roster_lock_deadline: new Date(Date.now() + 60000).toISOString() } }]));
  const rosters = new Map([...matches.keys()].map((id) => [id, input.map((row) => ({ id: `${id}-${row.id}`, metadata: { wager_id: id, user_id: row.user_id, user_name: row.user_id, team: "host" } }))]));
  const override = (delegate, method, value) => {
    const previous = delegate[method]; delegate[method] = value;
    t.after(() => { delegate[method] = previous; });
  };
  override(prisma.user, "findUnique", async () => admin);
  override(prisma.ban, "findMany", async () => []);
  override(prisma.user, "findMany", f.db.user.findMany);
  override(prisma.eightsStats, "findMany", f.db.eightsStats.findMany);
  override(prisma.wager, "findUnique", async ({ where }) => matches.get(where.id));
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
  override(prisma.chatMessage, "create", async ({ data }) => ({ id: "system", ...data }));
  const app = express(); app.use(express.json()); app.use("/functions", functionRoutes);
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const request = async (name, id) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/functions/${name}`, { method: "POST", headers: { Authorization: `Bearer ${signUser(admin)}`, "Content-Type": "application/json" }, body: JSON.stringify({ wager_id: id, participants: input.map((row) => ({ ...row, free_eights_elo: 9999 })) }) });
    const body = await response.json(); assert.equal(response.status, 200, JSON.stringify(body)); assert.equal(body.success, true, JSON.stringify(body)); return body;
  };
  for (const name of ["syncEightsLobby", "adminReshuffleEightsTeams"]) {
    await request(name, "8s");
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
  await request("syncEightsLobby", "8s");
  assert.equal(f.calls.length, reads, "later polls reuse already generated teams");
  for (const name of ["syncEightsLobby", "adminReshuffleEightsTeams"]) await request(name, "money8s");
  assert.equal(f.calls.length, reads, "Money 8s keeps its original random split");
  assert.equal(matches.get("money8s").metadata.free_eights_team_balance, undefined);
  assert.equal(rosters.get("money8s").some((row) => Object.hasOwn(row.metadata, "free_eights_elo")), false);
  assert.deepEqual(f.users.map((row) => row.metadata.screenshot_rank), input.map((row) => row.screenshot_rank));
});
