import test from "node:test";
import assert from "node:assert/strict";
import { createPartyRoom, changePartyRoom, flattenPartyRoom } from "./party-rooms.js";
import { partyCandidates, partyCapacity, partyGenderQuota, partySide, partyValidation } from "../src/lib/partyWheel.js";

function fixture() {
  let row = { id: "party-room", owner_id: "host", revision: 0, status: "open", created_date: new Date(), updated_date: new Date(), metadata: {
    title: "Friday", mode: "switcheroo", team_size: 2, teams: [{ id: "a", name: "Alpha" }, { id: "b", name: "Bravo" }], players: [], round: 1, history: [], spin: null,
  } };
  const db = { partyRoom: {
    findUnique: async () => structuredClone(row), count: async () => 0,
    create: async ({ data }) => ({ ...structuredClone(row), ...data }),
    update: async ({ data }) => { row = { ...row, ...data, revision: row.revision + 1, updated_date: new Date() }; return structuredClone(row); },
  }, $executeRaw: async () => 1 };
  db.$transaction = async (run) => {
    const before = structuredClone(row);
    try { return await run(db); } catch (error) { row = before; throw error; }
  };
  const act = (action, input = {}, user = { id: "host" }) => changePartyRoom(db, row.id, user, { action, revision: row.revision, ...input }, { choose: () => 0, checkMembership: async () => null });
  return { db, act, row: () => row, room: () => flattenPartyRoom(row), finish: () => { if (row.metadata.spin) row.metadata.spin.started_at = new Date(Date.now() - 8000).toISOString(); } };
}

test("rooms start with two teams; names, extra teams and the format are validated", async () => {
  const f = fixture();
  const room = await createPartyRoom(f.db, { id: "host", username: "host" }, { mode: "coed", team_size: 2 });
  assert.equal(room.teams.length, 2);
  await assert.rejects(createPartyRoom(f.db, { id: "host" }, { mode: "cash", team_size: 2 }));
  await f.act("add_team", { name: "Charlie" });
  assert.equal(f.room().teams.length, 3);
  assert.equal(partyCapacity(f.room()), 6);
  await f.act("format", { team_size: 3 });
  assert.equal(partyCapacity(f.room()), 9);
  await f.act("add", { names: ["Liv", "Ouji"] });
  await assert.rejects(f.act("add", { names: ["LIV"] }));
  await assert.rejects(f.act("add", { names: ["x".repeat(33)] }));
  assert.equal(f.room().players.length, 2);
});

test("only host/admin may edit or spin and stale revisions cannot overwrite a live room", async () => {
  const f = fixture();
  await assert.rejects(f.act("add_team", {}, { id: "viewer" }), { status: 403 });
  await assert.rejects(f.act("spin", {}, { id: "viewer" }), { status: 403 });
  await assert.rejects(f.act("add_team", { revision: 100 }), { status: 409 });
  await f.act("add_team", {}, { id: "admin", role: "admin" });
  assert.equal(f.room().teams.length, 3);
});

test("each spin chooses a real remaining player, rotates teams, persists the result and locks the draw until it ends", async () => {
  const f = fixture();
  await f.act("add", { names: ["A", "B", "C", "D"] });
  const first = await f.act("spin");
  assert.equal(first.spin.entries.length, 4);
  assert.equal(first.players.find((p) => p.id === first.spin.selected_id).side, "a");
  await assert.rejects(f.act("spin"), { status: 409 });
  await assert.rejects(f.act("remove", { player_id: first.players[0].id }), { status: 409 });
  f.finish();
  const next = await f.act("spin");
  assert.equal(next.spin.side, "b");
  assert.equal(next.spin.entries.length, 3);
  assert.notEqual(next.spin.selected_id, first.spin.selected_id);
  for (let i = 0; i < 2; i++) { f.finish(); await f.act("spin"); }
  f.finish();
  assert.equal(f.room().status, "ready");
  assert.deepEqual(f.room().teams.map((team) => f.room().players.filter((p) => p.side === team.id).length), [2, 2]);
  await f.act("reset");
  assert.equal(f.room().history.length, 1);
  assert.equal(f.room().round, 2);
  assert.ok(f.room().players.every((p) => !p.side));
});

test("co-ed always produces balanced genders for 2–16 teams in every supported format", () => {
  for (const size of [2, 3, 4]) for (const count of [2, 3, 4, 8, 16]) {
    const room = { mode: "coed", team_size: size, teams: Array.from({ length: count }, (_, i) => ({ id: `team-${i}` })), players: [] };
    const male = room.teams.reduce((sum, team) => sum + partyGenderQuota(room, team.id).male, 0);
    room.players = Array.from({ length: partyCapacity(room) }, (_, i) => ({ id: `p-${i}`, gender: i < male ? "male" : "female", side: null }));
    assert.equal(partyValidation(room), null);
    while (room.players.some((p) => !p.side)) {
      const eligible = partyCandidates(room);
      assert.ok(eligible.length > 0);
      const chosen = eligible[eligible.length - 1];
      chosen.side = partySide(room);
    }
    for (const team of room.teams) {
      const players = room.players.filter((p) => p.side === team.id), quota = partyGenderQuota(room, team.id);
      assert.equal(players.length, size);
      assert.equal(players.filter((p) => p.gender === "male").length, quota.male);
    }
    room.players[0].gender = "unknown";
    assert.ok(partyValidation(room));
  }
});

test("Switcheroo prefers new partners when an alternative is available", () => {
  const room = { mode: "switcheroo", team_size: 2, teams: [{ id: "a" }, { id: "b" }], previous_teams: { p1: "a", p2: "a", p3: "b", p4: "b" },
    players: [{ id: "p1", side: "a" }, { id: "p2", side: null }, { id: "p3", side: "b" }, { id: "p4", side: null }] };
  assert.deepEqual(partyCandidates(room).map((p) => p.id), ["p4"]);
});

test("players link only their own account, cannot overwrite claimed slots and can unlink after the draw", async () => {
  const f = fixture(); await f.act("add", { names: ["A", "B", "C", "D"] });
  const player = f.room().players[0], user = { id: "one", discord_user_id: "200000000000000001", discord_connected_at: new Date() };
  await assert.rejects(f.act("claim", { player_id: player.id }, { id: "unlinked" }), { status: 403 });
  await f.act("claim", { player_id: player.id }, user);
  assert.equal(f.room().players[0].user_id, "one");
  await assert.rejects(f.act("claim", { player_id: player.id }, { ...user, id: "two" }), { status: 409 });
  await assert.rejects(f.act("claim", { player_id: f.room().players[1].id }, user), { status: 409 });
  await f.act("leave", {}, user);
  assert.equal(f.room().players[0].user_id, null);
});

test("team limits, occupied formats, closed rooms and partial roster spins are rejected", async () => {
  const f = fixture();
  await assert.rejects(f.act("spin"));
  await assert.rejects(f.act("remove_team", { team_id: "a" }));
  for (let i = 2; i < 16; i++) await f.act("add_team");
  await assert.rejects(f.act("add_team"));
  await f.act("close");
  await assert.rejects(f.act("reset"), { status: 409 });
});
