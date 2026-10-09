import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { getFreeEightsOverview, getFreeEightsPlayerStats } from "./free-eights-reads.js";
import { loadFreeEightsOverview, loadFreeEightsProgression } from "../src/lib/freeEightsData.js";
import functionRoutes from "./routes/functions.js";
import { prisma } from "./prisma.js";
import { signUser } from "./auth.js";

const fixtureDate = Date.now() - 10000;
const match = (id, type = "8s", status = "open", date = 1) => ({ id, created_date: new Date(fixtureDate + date), metadata: { match_type: type, status } });
const participant = (id, user_id, wager_id) => ({ id, metadata: { user_id, wager_id } });
const stat = (user_id, metadata, date = 1, elo = 0) => ({ created_date: new Date(date), metadata: { user_id, ...metadata }, free_eights_elo: elo });

function fixture(data = {}) {
  const calls = [];
  const matchesWhere = (row, where) => !where || Object.entries(where).every(([key, value]) => {
    if (key === "AND") return value.every((entry) => matchesWhere(row, entry));
    if (key === "OR") return value.some((entry) => matchesWhere(row, entry));
    if (key === "NOT") return value.every((entry) => !matchesWhere(row, entry));
    if (key === "metadata") return row.metadata?.[value.path[0]] === value.equals;
    if (value?.gt !== undefined) return row[key] > value.gt;
    return Array.isArray(value?.in) ? value.in.includes(row[key]) : value?.not ? row[key] !== value.not : row[key] === value;
  });
  const db = {};
  for (const name of ["wager", "wagerParticipant", "xPStats", "eightsStats", "user"]) {
    db[name] = {
      findMany: async (query) => {
        calls.push({ name, query });
        let rows = (data[name] || []).filter((row) => matchesWhere(row, query.where));
        if (query.orderBy) rows = [...rows].sort((a, b) => b.created_date - a.created_date);
        if (query.take !== undefined) rows = rows.slice(0, query.take);
        return rows;
      },
      findUnique: async ({ where }) => (data[name] || []).find((row) => row.id === where.id),
    };
  }
  return { db, calls };
}

test("overview isolates Free 8s, counts each lobby and uses the authenticated player's active match", async () => {
  const f = fixture({ wager: [match("free"), match("other"), match("paid", "money8s"), match("done", "8s", "completed"), match("live", "8s", "in_progress", 9)],
    wagerParticipant: [participant("p1", "me", "free"), participant("p2", "friend", "free"), participant("p3", "me", "live"), participant("p4", "attacker", "other"), participant("p5", "me", "paid")] });
  const result = await getFreeEightsOverview(f.db, "me");
  assert.deepEqual(result.lobbies.map((row) => row.id), ["free", "other"]);
  assert.deepEqual(result.counts, { free: 2, other: 1 });
  assert.equal(result.active_lobby.id, "live");
  assert.equal(f.calls.length, 4);
});

test("30 open lobbies and 1,000 old memberships still use four queries; active membership is not truncated", async () => {
  const history = Array.from({ length: 1000 }, (_, i) => match(`old${i}`, "8s", "completed", i + 20));
  const open = Array.from({ length: 30 }, (_, i) => match(`open${i}`, "8s", "open", i + 2000));
  const f = fixture({ wager: [...history, ...open, match("old-active", "8s", "disputed")], wagerParticipant: [
    ...history.map((row, i) => participant(`p${i}`, "me", row.id)), participant("active", "me", "old-active"),
    ...open.flatMap((row, index) => Array.from({ length: index % 9 }, (_, i) => participant(`open${index}p${i}`, `friend${i}`, row.id))),
  ] });
  const result = await getFreeEightsOverview(f.db, "me");
  assert.equal(result.active_lobby.id, "old-active");
  assert.equal(result.lobbies.length, 30);
  assert.equal(result.counts.open8, 8);
  assert.equal(f.calls.length, 4);
});

test("empty Free 8s overview skips empty batch queries", async () => {
  const f = fixture();
  assert.deepEqual(await getFreeEightsOverview(f.db, "me"), { success: true, lobbies: [], active_lobby: null, counts: {} });
  assert.equal(f.calls.length, 3);
});

test("expired posts leave the overview and counts while participants retain their active room", async () => {
  const expired = match("expired");
  expired.created_date = new Date(Date.now() - 30 * 60 * 1000 - 1000);
  const hidden = match("hidden");
  hidden.metadata.posted_to_matchfinder = false;
  const f = fixture({ wager: [expired, hidden, match("recent")], wagerParticipant: [
    participant("p1", "me", "expired"), participant("p2", "friend", "recent"),
  ] });
  const result = await getFreeEightsOverview(f.db, "me");
  assert.deepEqual(result.lobbies.map((row) => row.id), ["recent"]);
  assert.deepEqual(result.counts, { recent: 1 });
  assert.equal(result.active_lobby.id, "expired");
  assert.equal(result.active_lobby.status, "open");
});

test("overview and enrollment use the same unresolved status rule and captain fallback", async () => {
  const hosted = match("hosted", "8s", "score_reported"); hosted.metadata.host_id = "me";
  const f = fixture({ wager: [hosted, match("completed", "8s", "completed"), match("paid", "money8s", "in_progress")],
    wagerParticipant: [participant("p1", "me", "completed"), participant("p2", "me", "paid")] });
  assert.equal((await getFreeEightsOverview(f.db, "me")).active_lobby.id, "hosted");
  hosted.metadata.status = "completed";
  assert.equal((await getFreeEightsOverview(f.db, "me")).active_lobby, null);
});

test("batch stats preserve zero ELO, latest records, roster isolation and public field whitelist", async () => {
  const f = fixture({ wager: [match("free")], wagerParticipant: [participant("p1", "a", "free"), participant("p2", "b", "free"), participant("p3", "outsider", "other")],
    user: [{ id: "a", metadata: { screenshot_rank: "diamond", rank_review_secret: "hidden" } }, { id: "outsider", metadata: { screenshot_rank: "top250" } }],
    xPStats: [stat("a", { level: 3 }), stat("a", { level: 7 }, 2), stat("outsider", { level: 99 })],
    eightsStats: [stat("a", { rating: 1500, wins: 5, internal_secret: "hidden" }, 2, 0), stat("a", { wins: 2 }, 1, 900), stat("outsider", { wins: 99 }, 1, 999)] });
  const result = await getFreeEightsPlayerStats(f.db, "free");
  assert.deepEqual(Object.keys(result.stats), ["a", "b"]);
  assert.deepEqual(result.stats.a, { xp_level: 7, free_eights_elo: 0, screenshot_rank: "diamond", eights_rating: 1500, eights_wins: 5, eights_losses: 0, monthly_wins: 0 });
  assert.equal(result.stats.b.free_eights_elo, 0);
  assert.equal(result.stats.b.xp_level, 1);
  assert.equal(result.stats.b.screenshot_rank, null);
  assert.equal(f.calls.length, 4);
});

test("batch stats reject invalid, missing and Money 8s matches", async () => {
  const f = fixture({ wager: [match("paid", "money8s")] });
  for (const id of [undefined, {}, "", "missing", "paid"]) await assert.rejects(() => getFreeEightsPlayerStats(f.db, id));
  assert.equal(f.calls.length, 0);
});

test("database failure stays an error instead of permanently displaying zero ELO", async () => {
  const f = fixture({ wager: [match("free")], wagerParticipant: [participant("p1", "a", "free")] });
  f.db.eightsStats.findMany = async () => { throw new Error("database unavailable"); };
  await assert.rejects(() => getFreeEightsPlayerStats(f.db, "free"), /database unavailable/);
});

test("browser progression batches eight players once and retries a failed load without losing identity", async () => {
  const players = Array.from({ length: 8 }, (_, i) => ({ user_id: `p${i}`, full_name: `Player ${i}`, team: i < 4 ? "host" : "challenger" }));
  let calls = 0;
  const api = { functions: { invoke: async (name, payload) => {
    calls++;
    assert.equal(name, "getFreeEightsPlayerStats");
    assert.deepEqual(payload, { wager_id: "free" });
    if (calls === 1) throw new Error("network unavailable");
    return { data: { success: true, stats: Object.fromEntries(players.map((row, i) => [row.user_id, { free_eights_elo: i * 200 }])) } };
  } } };
  await assert.rejects(() => loadFreeEightsProgression(api, "free", players), /network unavailable/);
  const result = await loadFreeEightsProgression(api, "free", players);
  assert.equal(calls, 2);
  assert.equal(result[0].free_eights_elo, 0);
  assert.equal(result[7].free_eights_elo, 1400);
  assert.equal(result[7].full_name, "Player 7");
  assert.equal(result[7].team, "challenger");
  assert.deepEqual(await loadFreeEightsProgression(api, "free", []), []);
  assert.equal(calls, 2);
});

test("browser overview uses one request and does not disguise failed responses as empty queues", async () => {
  let calls = 0;
  const api = { functions: { invoke: async (name, payload) => {
    calls++;
    assert.equal(name, "getFreeEightsOverview");
    assert.deepEqual(payload, {});
    return { data: calls === 1 ? { success: false, error: "offline" } : { success: true, lobbies: [], counts: {}, active_lobby: null } };
  } } };
  await assert.rejects(() => loadFreeEightsOverview(api), /offline/);
  assert.equal((await loadFreeEightsOverview(api)).success, true);
  assert.equal(calls, 2);
});

test("read endpoints require authentication and ignore forged user/roster IDs", async (t) => {
  const f = fixture({ wager: [match("mine"), match("foreign"), match("paid", "money8s")], wagerParticipant: [participant("p1", "me", "mine"), participant("p2", "attacker", "foreign")], eightsStats: [stat("me", {}, 1, 400), stat("attacker", {}, 1, 999)] });
  const user = { id: "me", email_verified: true, role: "user", metadata: {} };
  const override = (target, method, implementation) => {
    const previous = target[method];
    target[method] = implementation;
    t.after(() => { target[method] = previous; });
  };
  override(prisma.user, "findUnique", async () => user);
  override(prisma.ban, "findMany", async () => []);
  for (const name of Object.keys(f.db)) for (const method of name === "user" ? ["findMany"] : ["findMany", "findUnique"]) override(prisma[name], method, f.db[name][method]);
  const app = express();
  app.use(express.json());
  app.use("/api/functions", functionRoutes);
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const request = (name, body = {}, auth = true) => fetch(`http://127.0.0.1:${server.address().port}/api/functions/${name}`, { method: "POST", headers: { "Content-Type": "application/json", ...(auth ? { Authorization: `Bearer ${signUser(user)}` } : {}) }, body: JSON.stringify(body) });
  for (const name of ["getFreeEightsOverview", "getFreeEightsPlayerStats"]) assert.equal((await request(name, {}, false)).status, 401);
  const overview = await (await request("getFreeEightsOverview", { user_id: "attacker" })).json();
  assert.equal(overview.active_lobby.id, "mine");
  assert.equal(overview.current_user.id, "me");
  const stats = await (await request("getFreeEightsPlayerStats", { wager_id: "mine", user_ids: ["attacker"] })).json();
  assert.deepEqual(Object.keys(stats.stats), ["me"]);
  assert.equal(stats.stats.me.free_eights_elo, 400);
  assert.equal((await request("getFreeEightsPlayerStats", { wager_id: "paid" })).status, 404);
});
