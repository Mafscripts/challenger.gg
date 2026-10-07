import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { calculateFreeEightsElo, getFreeEightsRank, normalizeFreeEightsElo } from "../src/lib/freeEightsRanks.js";
import { completeFreeEightsWithElo } from "./free-eights-elo.js";
import entityRoutes from "./routes/entities.js";
import { prisma } from "./prisma.js";
import { signUser } from "./auth.js";

test("Free 8s rank boundaries and invalid values", () => {
  for (const [elo, name] of [[0, "Newb"], [199, "Newb"], [200, "Advanced"], [399, "Advanced"], [400, "Amateur"], [599, "Amateur"], [600, "Challenger"], [799, "Challenger"], [800, "Topfragger"], [5000, "Topfragger"]]) {
    assert.equal(getFreeEightsRank(elo).name, name);
  }
  for (const value of [-20, undefined, NaN, Infinity, "bad"]) assert.equal(normalizeFreeEightsElo(value), 0);
});

test("team ELO accounts for opposition, preserves zero and records rank transitions", () => {
  const roster = (prefix, elo) => Array.from({ length: 4 }, (_, i) => ({ user_id: `${prefix}${i}`, elo }));
  const equal = calculateFreeEightsElo(roster("a", 190), roster("b", 190));
  assert.equal(equal.a0.delta, 20);
  assert.equal(equal.b0.delta, -20);
  assert.equal(equal.a0.new_rank, "Advanced");
  assert.equal(calculateFreeEightsElo(roster("a", 0), roster("b", 0)).b0.new_elo, 0);
  const upset = calculateFreeEightsElo(roster("a", 200), roster("b", 600));
  const expected = calculateFreeEightsElo(roster("a", 600), roster("b", 200));
  assert.ok(upset.a0.delta > 20);
  assert.ok(expected.a0.delta < 20);
  assert.equal(upset.b0.delta, -upset.a0.delta);
  assert.throws(() => calculateFreeEightsElo(roster("a", 0), roster("a", 0)), /distinct/);
});

// In-memory transaction adapter checks orchestration, rollback and the lock
// request. PostgreSQL provides the real transaction/advisory-lock semantics.
function fixture({ type = "8s", status = "in_progress", playerCount = 8, missingStats = false } = {}) {
  let state = {
    matches: { m1: { id: "m1", metadata: { match_type: type, status, host_id: "p0", challenger_id: "p4" } } },
    players: Array.from({ length: playerCount }, (_, i) => ({ metadata: { wager_id: "m1", user_id: `p${i}`, user_name: `Player ${i}`, team: i < 4 ? "host" : "challenger" } })),
    stats: missingStats ? [] : Array.from({ length: 8 }, (_, i) => ({ id: `s${i}`, free_eights_elo: 400, metadata: { user_id: `p${i}`, rating: 1500, wins: 12, monthly_wins: 3 } })),
  };
  let tail = Promise.resolve();
  let locks = 0;
  let failUpdate = false;
  const db = { $transaction: (operation) => {
    const run = tail.then(async () => {
      const draft = structuredClone(state);
      const result = await operation({
        $executeRaw: async (sql) => { assert.match(sql[0], /pg_advisory_xact_lock/); locks++; },
        wager: {
          findUnique: async ({ where }) => draft.matches[where.id],
          update: async ({ where, data }) => (draft.matches[where.id] = { ...draft.matches[where.id], ...data }),
        },
        wagerParticipant: { findMany: async ({ where }) => draft.players.filter((row) => row.metadata.wager_id === where.metadata.equals) },
        eightsStats: {
          findFirst: async ({ where }) => draft.stats.find((row) => row.metadata.user_id === where.metadata.equals),
          create: async ({ data }) => { const row = { id: `s${draft.stats.length}`, free_eights_elo: 0, ...data }; draft.stats.push(row); return row; },
          update: async ({ where, data }) => {
            if (failUpdate) throw new Error("database failure");
            const row = draft.stats.find((item) => item.id === where.id);
            Object.assign(row, data); return row;
          },
        },
      });
      state = draft;
      return result;
    });
    tail = run.catch(() => {});
    return run;
  } };
  return { db, state: () => state, locks: () => locks, fail: () => { failUpdate = true; } };
}

const completion = { status: "completed", winner_id: "p0", winner_name: "Alpha" };

test("completion applies ELO once, persists audit changes and keeps legacy stats", async (t) => {
  t.mock.method(console, "info", () => {});
  const f = fixture();
  const results = await Promise.all([completeFreeEightsWithElo(f.db, "m1", completion), completeFreeEightsWithElo(f.db, "m1", completion)]);
  assert.deepEqual(results.map((result) => result.applied), [true, false]);
  assert.equal(f.locks(), 2);
  assert.equal(f.state().stats[0].free_eights_elo, 420);
  assert.equal(f.state().stats[4].free_eights_elo, 380);
  assert.deepEqual(f.state().stats[0].metadata, { user_id: "p0", rating: 1500, wins: 12, monthly_wins: 3 });
  assert.equal(Object.keys(results[0].match.free_eights_elo_changes).length, 8);
  assert.ok(results[0].match.free_eights_elo_applied_at);
});

test("overlapping completed matches use the latest ELO snapshot", async (t) => {
  t.mock.method(console, "info", () => {});
  const f = fixture();
  f.state().matches.m2 = { id: "m2", metadata: { ...f.state().matches.m1.metadata } };
  f.state().players.push(...f.state().players.map((row) => ({ metadata: { ...row.metadata, wager_id: "m2" } })));
  await Promise.all([completeFreeEightsWithElo(f.db, "m1", completion), completeFreeEightsWithElo(f.db, "m2", completion)]);
  const changes = f.state().matches.m2.metadata.free_eights_elo_changes;
  assert.equal(changes.p0.previous_elo, 420);
  assert.equal(changes.p4.previous_elo, 380);
});

test("new players start at zero; cancelled, paid and incomplete matches award nothing", async (t) => {
  t.mock.method(console, "info", () => {});
  const fresh = fixture({ missingStats: true });
  await completeFreeEightsWithElo(fresh.db, "m1", completion);
  assert.equal(fresh.state().stats[0].free_eights_elo, 20);
  assert.equal(fresh.state().stats[4].free_eights_elo, 0);
  for (const options of [{ type: "money8s" }, { type: "ranked" }, { status: "cancelled" }, { playerCount: 7 }]) {
    const f = fixture(options);
    const before = structuredClone(f.state());
    await assert.rejects(completeFreeEightsWithElo(f.db, "m1", completion));
    assert.deepEqual(f.state(), before);
  }
});

test("failed ELO update rolls back match completion", async () => {
  const f = fixture(); f.fail();
  const before = structuredClone(f.state());
  await assert.rejects(completeFreeEightsWithElo(f.db, "m1", completion), /database failure/);
  assert.deepEqual(f.state(), before);
});

test("players cannot create, edit or delete EightsStats through the public entity API", async (t) => {
  const user = { id: "player", role: "user", email_verified: true };
  const override = (target, method, implementation) => {
    const original = target[method];
    target[method] = implementation;
    t.after(() => { target[method] = original; });
  };
  override(prisma.user, "findUnique", async () => user);
  override(prisma.ban, "findMany", async () => []);
  const app = express(); app.use(express.json()); app.use("/entities", entityRoutes);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  for (const [method, path] of [["POST", "/EightsStats"], ["PATCH", "/EightsStats/forged"], ["DELETE", "/EightsStats/forged"]]) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/entities${path}`, {
      method, headers: { Authorization: `Bearer ${signUser(user)}`, "Content-Type": "application/json" }, body: JSON.stringify({ user_id: user.id, free_eights_elo: 9999 }),
    });
    assert.equal(response.status, 403);
  }
});
