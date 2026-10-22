import test from "node:test";
import assert from "node:assert/strict";
import { readEightsRoster, saveEightsTeams } from "./eights-roster.js";

function fixture(type = "8s") {
  let committed = {
    match: { id: "match", metadata: { match_type: type, status: "open", team_size: "2v2", teams_generated_at: "2026-10-21T00:00:00.000Z", host_id: "u0", challenger_id: "u2" } },
    rows: Array.from({ length: 4 }, (_, i) => ({ id: `p${i}`, metadata: {
      wager_id: "match", user_id: `u${i}`, team: i < 2 ? "host" : "challenger", entry_fee_paid: 5, escrow_transaction_id: `stake${i}`,
    } })),
  };
  const delegates = (state) => ({
    wager: { findUnique: async () => structuredClone(state.match), update: async ({ data }) => { Object.assign(state.match, structuredClone(data)); return structuredClone(state.match); } },
    wagerParticipant: { findMany: async () => structuredClone(state.rows), update: async ({ where, data }) => {
      Object.assign(state.rows.find((row) => row.id === where.id), structuredClone(data));
    } },
  });
  const db = {
    wager: { findUnique: async () => structuredClone(committed.match) },
    wagerParticipant: { findMany: async () => structuredClone(committed.rows) },
    $transaction: async (work) => {
      const staged = structuredClone(committed), tx = { ...delegates(staged), $executeRaw: async () => 1 };
      if (db.onTransaction) db.onTransaction(tx);
      const result = await work(tx);
      committed = staged;
      return result;
    },
  };
  const players = () => committed.rows.map((row) => ({ id: row.id, ...row.metadata, free_eights_elo: 100, screenshot_rank: "diamond" }));
  const save = () => {
    const rows = players();
    return saveEightsTeams(db, { id: "match", ...committed.match.metadata }, rows,
      [rows[2], rows[1]], [rows[0], rows[3]], { host_id: "u2", challenger_id: "u0" });
  };
  return { db, state: () => committed, save };
}

for (const type of ["8s", "money8s"]) {
  test(`${type}: team and captain changes commit together and preserve entry payments`, async () => {
    const f = fixture(type), before = structuredClone(f.state());
    f.db.onTransaction = (tx) => {
      const update = tx.wagerParticipant.update;
      tx.wagerParticipant.update = async (input) => {
        await update(input);
        assert.deepEqual(f.state(), before, "readers cannot see partially updated teams");
      };
    };
    const result = await f.save(), snapshot = await readEightsRoster(f.db, "match");
    assert.equal(result.host_id, "u2"); assert.equal(snapshot.wager.challenger_id, "u0");
    assert.equal(snapshot.participants.find((row) => row.user_id === "u2").team, "host");
    assert.equal(snapshot.participants.find((row) => row.user_id === "u0").team, "challenger");
    assert.ok(Date.parse(result.teams_generated_at) > Date.parse(before.match.metadata.teams_generated_at));
    snapshot.participants.forEach((row, i) => {
      assert.equal(row.entry_fee_paid, 5); assert.equal(row.escrow_transaction_id, `stake${i}`);
    });
  });
}

test("failed team writes roll back the whole selection", async () => {
  const f = fixture(), before = structuredClone(f.state());
  f.db.onTransaction = (tx) => {
    const update = tx.wagerParticipant.update; let count = 0;
    tx.wagerParticipant.update = async (input) => { if (++count === 3) throw new Error("write failed"); return update(input); };
  };
  await assert.rejects(f.save(), /write failed/);
  assert.deepEqual(f.state(), before);
});

test("a stale generation cannot overwrite a newer saved team selection", async () => {
  const f = fixture(), before = await readEightsRoster(f.db, "match");
  await f.save();
  const current = structuredClone(f.state());
  await assert.rejects(saveEightsTeams(f.db, before.wager, before.participants,
    before.participants.slice(0, 2), before.participants.slice(2), {}), { status: 409 });
  assert.deepEqual(f.state(), current);
});

test("a roster read crossing a committed reshuffle retries instead of returning mismatched teams", async () => {
  const f = fixture(), read = f.db.wagerParticipant.findMany; let changed = false;
  f.db.wagerParticipant.findMany = async () => {
    const rows = await read();
    if (!changed) { changed = true; await f.save(); }
    return rows;
  };
  const snapshot = await readEightsRoster(f.db, "match");
  assert.equal(snapshot.wager.host_id, "u2");
  assert.equal(snapshot.participants.find((row) => row.user_id === "u2").team, "host");
});
