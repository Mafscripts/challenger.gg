import test from "node:test";
import assert from "node:assert/strict";
import { getChallengeStandings } from "./challenges.js";

test("the challenge leaderboard reads one bounded ladder and exposes only public team presentation", async () => {
  let lookup;
  const db = {
    challengeStanding: { findMany: async (args) => {
      assert.deepEqual(args, { where: { kind: "team" }, orderBy: [{ xp: "desc" }, { wins: "desc" }, { subject_id: "asc" }], take: 500 });
      return [{ id: "standing", kind: "team", subject_id: "squad", name: "Old name", xp: 650, wins: 7, losses: 3 }];
    } },
    team: { findMany: async (args) => {
      lookup = args;
      return [{ id: "squad", metadata: { name: "Current squad", region: "EU", logo_url: "/squad.png", captain_id: "captain", private_setting: "never expose" } }];
    } },
  };
  const result = await getChallengeStandings(db);
  assert.deepEqual(lookup.where, { id: { in: ["squad"] } });
  assert.deepEqual(result, { success: true, rows: [{ id: "standing", kind: "team", subject_id: "squad", name: "Current squad", xp: 650, wins: 7, losses: 3,
    region: "EU", logo_url: "/squad.png", captain_id: "captain" }] });
});

test("solo challenge standings use current player names without returning account data", async () => {
  const db = {
    challengeStanding: { findMany: async ({ where }) => {
      assert.equal(where.kind, "solo");
      return [{ id: "standing", kind: "solo", subject_id: "player", name: "Old player", xp: 500, wins: 3, losses: 2 }];
    } },
    user: { findMany: async ({ select }) => {
      assert.deepEqual(select, { id: true, username: true, display_name: true, region: true });
      return [{ id: "player", username: "current", display_name: "Current player", region: "NA", email: "private@example.test", password_hash: "secret" }];
    } },
  };
  const result = await getChallengeStandings(db, "solo");
  assert.deepEqual(result.rows[0], { id: "standing", kind: "solo", subject_id: "player", name: "Current player", username: "current", region: "NA", xp: 500, wins: 3, losses: 2 });
});

test("empty challenge ladders do not load identities; invalid kinds fail before reading", async () => {
  let reads = 0;
  const db = { challengeStanding: { findMany: async () => { reads++; return []; } } };
  await assert.rejects(getChallengeStandings(db, "xp"), /team or solo/);
  assert.equal(reads, 0);
  assert.deepEqual(await getChallengeStandings(db, "team"), { success: true, rows: [] });
  assert.equal(reads, 1);
});
