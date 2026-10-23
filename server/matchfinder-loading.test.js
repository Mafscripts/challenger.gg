import test from "node:test";
import assert from "node:assert/strict";
import { loadMatchfinderSources } from "../src/lib/matchfinderData.js";
import { loadPlayTeams } from "../src/lib/playTeams.js";

test("a slow tournament request does not delay the XP matchfinder list", async () => {
  const pending = new Map();
  const entities = Object.fromEntries(["XPMatch", "RankedMatch", "Wager", "Tournament"].map(name => [name, {
    filterFresh: (filter) => new Promise((resolve, reject) => pending.set(name, { resolve, reject, filter })),
  }]));
  const results = new Map();
  const loading = loadMatchfinderSources({ entities }, (source, rows) => results.set(source, rows));
  assert.equal(pending.size, 4, "all requests begin concurrently");
  pending.get("XPMatch").resolve([{ id: "xp-open" }]);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(results.get("xp"), [{ id: "xp-open" }]);
  assert.equal(results.has("tournaments"), false);
  assert.equal(pending.get("XPMatch").filter.matchfinder_visible, true);
  pending.get("RankedMatch").resolve([{ id: "ranked-open" }]);
  pending.get("Wager").reject(new Error("Unavailable"));
  pending.get("Tournament").resolve([{ id: "tournament" }]);
  await loading;
  assert.deepEqual(results.get("wagers"), [], "one failed competition does not discard other lists");
  assert.equal(results.get("elo")[0].id, "ranked-open");
  assert.equal(results.get("tournaments")[0].id, "tournament");
});

test("team selection reads every roster through one batched request", async () => {
  let reads = 0;
  const teams = Array.from({ length: 30 }, (_, index) => ({ id: `team-${index}`, captain_id: "me" }));
  const rows = await loadPlayTeams({ profile: { teamPage: async () => {
    reads++;
    return { teams, membersByTeam: { "team-0": [{ user_id: "me", is_active: true }] } };
  } } });
  assert.equal(reads, 1);
  assert.equal(rows.length, 30);
  assert.equal(rows[0].members[0].user_id, "me");
  assert.deepEqual(rows[29].members, []);
  assert.equal(Object.hasOwn(teams[0], "members"), false, "the response cache is not mutated");
});
