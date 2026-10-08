import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createFreeEightsLobby, findActiveFreeEightsMatch, joinFreeEightsLobby } from "./free-eights-membership.js";
import functionRoutes from "./routes/functions.js";
import { prisma } from "./prisma.js";
import { signUser } from "./auth.js";

const match = (id, status = "open", type = "8s", host = "host") => ({ id, created_date: new Date(), metadata: {
  match_type: type, status, host_id: host, host_name: host, team_size: "4v4", required_players_per_team: 4,
  amount: 0, entry_fee: 0, best_of: 3, game_mode: "hp", game_mode_display: "Hardpoint",
} });
const member = (id, userId, matchId, team = "host") => ({ id, created_date: new Date(), metadata: {
  wager_id: matchId, user_id: userId, user_name: userId, team,
} });

function fixture(initialMatches = [], initialMembers = []) {
  const matches = new Map(initialMatches.map((row) => [row.id, structuredClone(row)]));
  const members = new Map(initialMembers.map((row) => [row.id, structuredClone(row)]));
  const locks = new Map(), acquired = [];
  let sequence = 0, failMember = false;
  const fits = (row, where) => !where || Object.entries(where).every(([key, value]) => {
    if (key === "AND") return value.every((condition) => fits(row, condition));
    if (key === "OR") return value.some((condition) => fits(row, condition));
    if (key === "NOT") return value.every((condition) => !fits(row, condition));
    if (key === "metadata") return row.metadata?.[value.path[0]] === value.equals;
    if (value?.in) return value.in.includes(row[key]);
    if (value?.not) return value.not !== row[key];
    return row[key] === value;
  });
  const delegate = (table, staged = null, prefix) => ({
    async findMany({ where, take } = {}) {
      const all = [...table.values(), ...(staged?.values() || [])].filter((row) => fits(row, where));
      return structuredClone(take === undefined ? all : all.slice(0, take));
    },
    async findUnique({ where }) { return structuredClone(staged?.get(where.id) || table.get(where.id) || null); },
    async create({ data }) {
      if (prefix === "participant" && failMember) throw new Error("Participant insert failed");
      const row = { id: `${prefix}-${++sequence}`, created_date: new Date(), ...data };
      (staged || table).set(row.id, structuredClone(row));
      return structuredClone(row);
    },
    async update({ where, data }) {
      const row = { ...table.get(where.id), ...data }; table.set(row.id, structuredClone(row)); return row;
    },
  });
  const db = {
    wager: delegate(matches, null, "match"), wagerParticipant: delegate(members, null, "participant"),
    async $transaction(fn) {
      const stagedMatches = new Map(), stagedMembers = new Map(), releases = [];
      const tx = { wager: delegate(matches, stagedMatches, "match"), wagerParticipant: delegate(members, stagedMembers, "participant"),
        async $executeRaw(_strings, key) {
          const previous = locks.get(key) || Promise.resolve();
          let release;
          const held = new Promise((resolve) => { release = resolve; });
          locks.set(key, held);
          await previous;
          acquired.push(key);
          releases.push(() => { release(); if (locks.get(key) === held) locks.delete(key); });
        },
      };
      try {
        const result = await fn(tx);
        for (const [id, row] of stagedMatches) matches.set(id, row);
        for (const [id, row] of stagedMembers) members.set(id, row);
        return result;
      } finally { releases.reverse().forEach((release) => release()); }
    },
  };
  return { db, matches, members, acquired, failParticipant: (value) => { failMember = value; } };
}

test("every unfinished Free 8s status blocks a different join and creation, including score approval pending completion", async () => {
  for (const status of ["open", "in_progress", "awaiting_team_alpha_report", "awaiting_team_bravo_report", "awaiting_completion", "score_conflict", "disputed", "accepted", "score_reported"]) {
    const f = fixture([match("old", status), match("next")], [member("old-member", "me", "old")]);
    for (const result of [await joinFreeEightsLobby(f.db, "me", "next", "Me"), await createFreeEightsLobby(f.db, "me", {}, "Me")]) {
      assert.equal(result.success, false, status);
      assert.equal(result.code, "FREE_EIGHTS_ACTIVE_MATCH");
      assert.equal(result.active_match_id, "old");
      assert.match(result.error, /confirm the result/);
    }
    assert.equal(f.matches.size, 2); assert.equal(f.members.size, 1);
  }
});

test("a captain without a legacy participant row is still blocked", async () => {
  const f = fixture([match("old", "in_progress", "8s", "me"), match("next")]);
  assert.equal((await joinFreeEightsLobby(f.db, "me", "next", "Me")).active_match_id, "old");
});

test("confirmed completed, cancelled, expired and closed matches release the player", async () => {
  for (const status of ["completed", "cancelled", "expired", "closed"]) {
    const f = fixture([match("old", status), match("next")], [member("old-member", "me", "old")]);
    assert.equal((await joinFreeEightsLobby(f.db, "me", "next", "Me")).success, true, status);
    const create = fixture([match("old", status)], [member("old-member", "me", "old")]);
    assert.equal((await createFreeEightsLobby(create.db, "me", {}, "Me")).success, true, status);
  }
});

test("paid/other queues do not take a Free 8s slot", async () => {
  for (const type of ["money8s", "wagers", "ranked", "xp"]) {
    const f = fixture([match("paid", "in_progress", type, "me"), match("next")], [member("paid-member", "me", "paid")]);
    assert.equal(await findActiveFreeEightsMatch(f.db, "me"), null);
    assert.equal((await joinFreeEightsLobby(f.db, "me", "next", "Me")).success, true);
  }
});

test("simultaneous joins/creation by one account enroll in exactly one match", async () => {
  const f = fixture([match("one"), match("two")]);
  const results = await Promise.all([joinFreeEightsLobby(f.db, "me", "one", "Me"),
    createFreeEightsLobby(f.db, "me", {}, "Me"), joinFreeEightsLobby(f.db, "me", "two", "Me")]);
  assert.equal(results.filter((result) => result.success).length, 1);
  assert.equal(results.filter((result) => result.code === "FREE_EIGHTS_ACTIVE_MATCH").length, 2);
  assert.equal([...f.members.values()].filter((row) => row.metadata.user_id === "me").length, 1);
  assert.ok(f.acquired.every((key) => key.startsWith("free8s-membership:") || key.startsWith("free8s-enrollment:")));
});

test("rejoining the same lobby is idempotent even when multiple requests arrive", async () => {
  const f = fixture([match("one")]);
  const results = await Promise.all([joinFreeEightsLobby(f.db, "me", "one", "Me"), joinFreeEightsLobby(f.db, "me", "one", "Me")]);
  assert.equal(results.filter((result) => result.rejoined).length, 1);
  assert.equal(f.members.size, 1);
});

test("concurrent different users cannot overfill an eight-player lobby", async () => {
  const f = fixture([match("one")], [member("host-member", "host", "one")]);
  const results = await Promise.all(Array.from({ length: 10 }, (_, i) => joinFreeEightsLobby(f.db, `u${i}`, "one", `U${i}`)));
  assert.equal(results.filter((result) => result.success).length, 7);
  assert.equal(f.members.size, 8);
  assert.equal([...f.members.values()].filter((row) => row.metadata.team === "host").length, 4);
});

test("failed enrollment rolls back creation instead of leaving a phantom active match", async () => {
  const f = fixture(); f.failParticipant(true);
  await assert.rejects(() => createFreeEightsLobby(f.db, "me", {}, "Me"), /insert failed/);
  assert.equal(f.matches.size, 0); assert.equal(f.members.size, 0);
  f.failParticipant(false);
  assert.equal((await createFreeEightsLobby(f.db, "me", {}, "Me")).success, true);
});

test("authenticated Free 8s endpoints require a stored screenshot rank, block unfinished matches and ignore forged identities/ranks", async (t) => {
  const f = fixture([match("old", "awaiting_completion"), match("next")],
    [member("old-member", "me", "old"), member("next-host", "host", "next")]);
  const account = { id: "me", username: "Me", email_verified: true, role: "user", metadata: { activision_id: "Me#123", screenshot_rank: "diamond" },
    discord_user_id: "200000000000000001", discord_connected_at: new Date() };
  const environment = { DISCORD_TOKEN: "fake-membership-bot-token", DISCORD_GUILD_ID: "1555246540027596972" };
  const previousEnv = Object.fromEntries(Object.keys(environment).map((key) => [key, process.env[key]]));
  Object.assign(process.env, environment);
  t.after(() => { for (const [key, value] of Object.entries(previousEnv)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
  let inGuild = true;
  const realFetch = globalThis.fetch;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    if (!String(url).startsWith("https://discord.com/api/")) return realFetch(url, options);
    assert.equal(String(url), `https://discord.com/api/v10/guilds/${environment.DISCORD_GUILD_ID}/members/${account.discord_user_id}`);
    assert.equal(options.headers.Authorization, `Bot ${environment.DISCORD_TOKEN}`);
    return inGuild ? Response.json({ user: { id: account.discord_user_id } }) : Response.json({ code: 10007 }, { status: 404 });
  });
  const override = (delegate, key, value) => { const old = delegate[key]; delegate[key] = value; t.after(() => { delegate[key] = old; }); };
  override(prisma, "$transaction", f.db.$transaction);
  for (const name of ["wager", "wagerParticipant"]) for (const method of Object.keys(f.db[name])) override(prisma[name], method, f.db[name][method]);
  override(prisma.user, "findUnique", async () => account);
  override(prisma.user, "findMany", async ({ where }) => (where?.id?.in || []).map((id) => ({ ...account, id })));
  override(prisma.ban, "findMany", async () => []);
  override(prisma.notification, "create", async ({ data }) => ({ id: "notification", ...data }));
  const app = express(); app.use(express.json()); app.use("/functions", functionRoutes);
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message }));
  const server = app.listen(0, "127.0.0.1"); await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const request = async (action, auth = true) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/functions/${action}`, { method: "POST",
      headers: { "Content-Type": "application/json", ...(auth ? { Authorization: `Bearer ${signUser(account)}` } : {}) },
      body: JSON.stringify({ match_type: "8s", wager_id: "next", team_size: "4v4", user_id: "attacker", host_id: "attacker", screenshot_rank: "top250", discord_user_id: "200000000000000099", in_guild: true, metadata: { screenshot_rank: "top250" } }) });
    return { status: response.status, body: await response.json() };
  };
  assert.equal((await request("acceptWager", false)).status, 401);
  for (const action of ["createWager", "acceptWager"]) {
    const { body } = await request(action);
    assert.equal(body.code, "FREE_EIGHTS_ACTIVE_MATCH", JSON.stringify(body));
    assert.equal(body.active_match_id, "old");
  }
  assert.equal(f.members.size, 2);
  f.matches.get("old").metadata.status = "completed";
  for (const rank of [undefined, null, "", "bronze", "challenger", "invalid"]) {
    account.metadata.screenshot_rank = rank;
    for (const action of ["createWager", "acceptWager"]) {
      const { body } = await request(action);
      assert.equal(body.code, "FREE_EIGHTS_RANK_REQUIRED", JSON.stringify(body));
      assert.equal(body.action_url, "/profile#rank-screenshot");
    }
    assert.equal(f.members.size, 2);
    assert.equal(f.matches.size, 2);
  }
  for (const rank of ["diamond", "crimson", "iridescent", "top250"]) {
    account.metadata.screenshot_rank = rank;
    const { body } = await request("createWager");
    assert.equal(body.success, true, JSON.stringify(body));
    assert.equal(body.wager.host_id, "me");
    f.matches.get(body.wager_id).metadata.status = "cancelled";
  }
  inGuild = false;
  for (const action of ["createWager", "acceptWager"]) {
    const { body } = await request(action);
    assert.equal(body.code, "FREE_EIGHTS_DISCORD_SERVER_REQUIRED", JSON.stringify(body));
    assert.equal(body.action_url, "https://discord.gg/JwSgTHcHXe");
  }
  assert.equal([...f.members.values()].some((row) => row.metadata.wager_id === "next" && row.metadata.user_id === "me"), false);
  inGuild = true;
  const accepted = await request("acceptWager");
  assert.equal(accepted.body.success, true, JSON.stringify(accepted.body));
  assert.equal([...f.members.values()].filter((row) => row.metadata.user_id === "me" && row.metadata.wager_id === "next").length, 1);
  assert.equal([...f.members.values()].some((row) => row.metadata.user_id === "attacker"), false);
  assert.equal((await request("createWager")).body.code, "FREE_EIGHTS_ACTIVE_MATCH");
  // An already enrolled player can still reopen their room after admin removes the rank.
  account.metadata.screenshot_rank = null;
  inGuild = false;
  const reopened = await request("acceptWager");
  assert.equal(reopened.body.success, true);
  assert.equal(reopened.body.rejoined, true);
});
