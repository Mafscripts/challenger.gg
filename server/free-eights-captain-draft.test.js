import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { voteFreeEightsCaptainDraft, startFreeEightsCaptainDraft, pickFreeEightsCaptainPlayer } from "./free-eights-captain-draft.js";
import { captainDraftPlayerIds, captainDraftTurn } from "../src/lib/freeEightsCaptainDraft.js";
import { voiceRosterSignature } from "./free-eights-discord.js";
import { prisma } from "./prisma.js";
import { signUser } from "./auth.js";
import routes from "./routes/functions.js";

const config = { enabled: true, guildId: "100000000000000001", categoryId: "100000000000000003" };
const options = { config, randomIndex: () => 0 };
const selectMaps = () => [{ id: "map", name: "Map A", mode: "hp", mode_name: "Hardpoint" }];

function fixture(size = 4) {
  let state = {
    match: { id: "match", created_date: new Date(), metadata: { match_type: "8s", team_size: `${size}v${size}`, status: "open", roster_locked: false, teams_generated_at: "", roster_lock_deadline: "", series_maps: [], best_of: 1 } },
    players: Array.from({ length: size * 2 }, (_, i) => ({ id: `p${i}`, metadata: { wager_id: "match", user_id: `u${i}`, user_name: `Player ${i}`, team: i % 2 ? "challenger" : "host", payment_status: "paid", entry_fee_paid: 0 } })),
    dispatch: null,
  };
  const db = {
    $executeRaw: async () => 1,
    wager: { findUnique: async () => structuredClone(state.match), update: async ({ data }) => { Object.assign(state.match, structuredClone(data)); return structuredClone(state.match); } },
    wagerParticipant: {
      findMany: async () => structuredClone(state.players),
      update: async ({ where, data }) => { Object.assign(state.players.find((row) => row.id === where.id), structuredClone(data)); },
    },
    discordEventDispatch: { findUnique: async () => structuredClone(state.dispatch) },
    user: { findMany: async ({ where }) => where.id.in.map((id) => ({ id, metadata: { screenshot_rank: "diamond" } })) },
    eightsStats: { findMany: async () => [] },
  };
  let tail = Promise.resolve();
  db.$transaction = (action) => {
    const result = tail.then(async () => { const before = structuredClone(state); try { return await action(db); } catch (error) { state = before; throw error; } });
    tail = result.catch(() => {}); return result;
  };
  const voice = () => { state.dispatch = { metadata: {
    match_id: "match", guild_id: config.guildId, category_id: config.categoryId,
    channels: { waiting: "100000000000000009" }, waiting_room_id: "100000000000000009", checked_at: new Date().toISOString(),
    roster_signature: voiceRosterSignature(state.match.metadata, state.players.map((row) => row.metadata)),
    players: Object.fromEntries(state.players.map((row) => [row.metadata.user_id, { status: "in_waiting_room" }])),
  } }; };
  const approve = async () => { for (let i = 0; i < size + 1; i++) await voteFreeEightsCaptainDraft(db, `u${i}`, "match", true); };
  const start = async () => { await approve(); voice(); return startFreeEightsCaptainDraft(db, "match", options); };
  const pick = (user, player, extra = {}) => {
    const draft = state.match.metadata.free_eights_captain_draft;
    return pickFreeEightsCaptainPlayer(db, user, "match", { draft_id: draft.id, expected_pick: draft.picks.length, player_id: player, ...extra }, { selectMaps });
  };
  return { db, state: () => state, approve, voice, start, pick };
}

for (const size of [2, 3, 4]) {
  test(`${size}v${size}: ${size + 1} distinct votes enable random captains and alternating single picks`, async () => {
    const f = fixture(size);
    for (let i = 0; i < size; i++) {
      const result = await voteFreeEightsCaptainDraft(f.db, `u${i}`, "match", true);
      assert.equal(result.approved, false);
    }
    await voteFreeEightsCaptainDraft(f.db, "u0", "match", true);
    assert.equal(f.state().match.metadata.free_eights_captain_vote_ids.length, size);
    await voteFreeEightsCaptainDraft(f.db, "u0", "match", false);
    assert.equal(f.state().match.metadata.free_eights_captain_vote_ids.length, size - 1);
    await voteFreeEightsCaptainDraft(f.db, "u0", "match", true);
    const result = await voteFreeEightsCaptainDraft(f.db, `u${size}`, "match", true);
    assert.equal(result.approved, true); assert.equal(result.required_votes, size + 1);
    assert.equal(result.wager.roster_lock_deadline, "");
    f.voice();
    const { wager, started } = await startFreeEightsCaptainDraft(f.db, "match", options);
    assert.equal(started, true);
    assert.deepEqual(wager.free_eights_captain_draft.captains, { host: "u0", challenger: "u1" });
    const before = structuredClone(f.state());
    await startFreeEightsCaptainDraft(f.db, "match", { ...options, randomIndex: (length) => length - 1 });
    assert.deepEqual(f.state(), before); // Poll/reconnect never rerolls captains.
    for (let i = 2; i < size * 2; i++) {
      const side = i % 2 ? "challenger" : "host";
      assert.equal(captainDraftTurn(f.state().match.metadata.free_eights_captain_draft), side);
      const picked = await f.pick(side === "host" ? "u0" : "u1", `u${i}`);
      assert.equal(picked.completed, i === size * 2 - 1);
      if (!picked.completed) { assert.equal(picked.wager.status, "open"); assert.equal(picked.wager.teams_generated_at, ""); }
    }
    const final = f.state().match.metadata;
    assert.equal(final.status, "in_progress"); assert.equal(final.roster_locked, true);
    assert.equal(final.free_eights_captain_draft.status, "completed");
    assert.deepEqual(final.series_maps, ["Map A"]);
    for (const side of ["host", "challenger"]) {
      const members = f.state().players.filter((row) => row.metadata.team === side);
      assert.equal(members.length, size); assert.equal(members.filter((row) => row.metadata.is_captain).length, 1);
      assert.deepEqual(members.map((row) => row.metadata.user_id), captainDraftPlayerIds(final.free_eights_captain_draft, side));
      assert.ok(members.every((row) => row.metadata.payment_status === "paid" && row.metadata.entry_fee_paid === 0));
    }
    await assert.rejects(f.pick("u0", "u2"), { status: 409 });
  });
}

test("outsiders, non-captains, wrong turns, already selected players and stale picks cannot change the draft", async () => {
  const f = fixture();
  await assert.rejects(voteFreeEightsCaptainDraft(f.db, "outsider", "match", true), { status: 403 });
  await assert.rejects(voteFreeEightsCaptainDraft(f.db, "u0", "match", "true"), { status: 400 });
  await f.start();
  const before = structuredClone(f.state());
  for (const [user, player, extra] of [["outsider", "u2"], ["u2", "u3"], ["u1", "u2"], ["u0", "u0"], ["u0", "not-in-roster"], ["u0", "u2", { expected_pick: -1 }], ["u0", "u2", { draft_id: "stale" }]]) {
    await assert.rejects(f.pick(user, player, extra));
    assert.deepEqual(f.state(), before);
  }
  const results = await Promise.allSettled([f.pick("u0", "u2"), f.pick("u0", "u3")]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(f.state().match.metadata.free_eights_captain_draft.picks.length, 1);
  await assert.rejects(f.pick("u1", "u2"), { status: 400 });
  await f.pick("u1", "u3");
});

test("approval waits for a full distinct roster and fresh exact-roster Discord waiting-room presence", async () => {
  const f = fixture(); await f.approve();
  const last = f.state().players.pop();
  assert.equal((await startFreeEightsCaptainDraft(f.db, "match", options)).waiting_for_roster, true);
  f.state().players.push(last);
  assert.equal((await startFreeEightsCaptainDraft(f.db, "match", options)).waiting_for_voice, true);
  for (const change of [() => { f.state().dispatch.metadata.checked_at = new Date(0).toISOString(); }, () => { f.state().dispatch.metadata.players.u0.status = "in_team_voice"; }, () => { f.state().dispatch.metadata.roster_signature = "stale"; }]) {
    f.voice(); change();
    assert.equal((await startFreeEightsCaptainDraft(f.db, "match", options)).waiting_for_voice, true);
    assert.equal(f.state().match.metadata.free_eights_captain_draft.status, "pending");
  }
  f.voice(); assert.equal((await startFreeEightsCaptainDraft(f.db, "match", options)).started, true);
  f.state().players[7].metadata.user_id = "replacement";
  await assert.rejects(f.pick("u0", "u2"), /roster changed/);
});

test("votes before a full lobby work; locked, expired, live and Money 8s rooms reject them", async () => {
  const f = fixture(); f.state().players.pop();
  await f.approve(); assert.equal(f.state().match.metadata.free_eights_captain_draft.status, "pending");
  for (const changes of [{ status: "completed" }, { status: "in_progress" }, { status: "cancelled" }, { roster_locked: true }, { roster_lock_deadline: new Date(0).toISOString() }, { match_type: "money8s" }]) {
    const g = fixture(); Object.assign(g.state().match.metadata, changes);
    await assert.rejects(voteFreeEightsCaptainDraft(g.db, "u0", "match", true));
  }
  const expired = fixture(); expired.state().match.created_date = new Date(0);
  await assert.rejects(voteFreeEightsCaptainDraft(expired.db, "u0", "match", true));
});

test("a final assignment failure rolls back the pick and every player; retry preserves existing maps", async () => {
  const f = fixture(2); await f.start(); await f.pick("u0", "u2");
  f.state().match.metadata.series_maps = ["Existing map"];
  const before = structuredClone(f.state());
  const update = f.db.wagerParticipant.update; let writes = 0;
  f.db.wagerParticipant.update = async (args) => { if (++writes === 3) throw new Error("database unavailable"); return update(args); };
  await assert.rejects(f.pick("u1", "u3"), /database unavailable/); assert.deepEqual(f.state(), before);
  f.db.wagerParticipant.update = update;
  const result = await f.pick("u1", "u3"); assert.deepEqual(result.wager.series_maps, ["Existing map"]);
});

test("authenticated actions and room polling retain the draft and prevent server reshuffles", async (t) => {
  const f = fixture(2);
  const override = (delegate, key, method) => { const original = delegate[key]; delegate[key] = method; t.after(() => { delegate[key] = original; }); };
  override(prisma, "$transaction", f.db.$transaction);
  override(prisma.user, "findUnique", async ({ where }) => ({ id: where.id, role: "user", email_verified: true }));
  override(prisma.ban, "findMany", async () => []);
  override(prisma.wager, "findUnique", f.db.wager.findUnique);
  override(prisma.wager, "update", f.db.wager.update);
  override(prisma.wagerParticipant, "findMany", f.db.wagerParticipant.findMany);
  override(prisma.wagerParticipant, "update", f.db.wagerParticipant.update);
  override(prisma.wagerParticipant, "delete", async ({ where }) => {
    const index = f.state().players.findIndex((row) => row.id === where.id);
    return f.state().players.splice(index, 1)[0];
  });
  const app = express(); app.use(express.json()); app.use("/functions", routes);
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message }));
  const server = app.listen(0, "127.0.0.1"); await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const request = async (action, id, body = {}) => {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/functions/${action}`, { method: "POST", headers: { Authorization: `Bearer ${signUser({ id })}`, "Content-Type": "application/json" }, body: JSON.stringify({ wager_id: "match", ...body }) });
    return { status: res.status, data: await res.json() };
  };
  assert.equal((await request("voteEightsCaptainDraft", "outsider", { agree: true })).status, 403);
  for (let i = 0; i < 3; i++) assert.equal((await request("voteEightsCaptainDraft", `u${i}`, { agree: true })).data.success, true);
  assert.equal((await request("syncEightsLobby", "u0")).data.waiting_for_voice, true);
  // Start through the service using the fixture's configured Discord snapshot.
  f.voice(); await startFreeEightsCaptainDraft(f.db, "match", options);
  const before = structuredClone(f.state());
  const synced = await request("syncEightsLobby", "u0"); assert.equal(synced.data.wager.free_eights_captain_draft.status, "active");
  assert.deepEqual(f.state(), before);
  assert.equal((await request("voteEightsReshuffle", "u0")).data.success, false);
  const draft = f.state().match.metadata.free_eights_captain_draft;
  assert.equal((await request("pickEightsCaptainPlayer", "u1", { draft_id: draft.id, expected_pick: 0, player_id: "u2" })).status, 403);
  const picked = await request("pickEightsCaptainPlayer", "u0", { draft_id: draft.id, expected_pick: 0, player_id: "u2" });
  assert.equal(picked.data.success, true); assert.equal(picked.data.wager.free_eights_captain_draft.picks.length, 1);
  const left = await request("leaveEightsLobby", "u3");
  assert.equal(left.data.success, true, JSON.stringify(left));
  assert.equal(left.data.wager.free_eights_captain_draft, null);
  assert.deepEqual(left.data.wager.free_eights_captain_vote_ids, []);
  assert.equal(left.data.wager.teams_generated_at, "");
});
