import test from "node:test";
import assert from "node:assert/strict";
import { createPartyRoom, changePartyRoom, flattenPartyRoom, getPartyRoom, partyRoomSummary, partyRoomView } from "./party-rooms.js";
import { partyRoomStorageError } from "./party-room-storage.js";
import { partyCandidates, partyCapacity, partyDrawMembers, partyGenderQuota, partySide, partyValidation } from "../src/lib/partyWheel.js";
import { submitPartyRoomAction } from "../src/lib/partyRoomActions.js";

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

test("an outdated Prisma client returns a service error before starting queries", async () => {
  const oldClient = { $transaction: () => assert.fail("Must not start a transaction") };
  for (const run of [
    () => createPartyRoom(oldClient, { id: "host" }, { mode: "coed", team_size: 2 }),
    () => getPartyRoom(oldClient, "room"),
    () => changePartyRoom(oldClient, "room", { id: "host" }, { action: "spin" }),
    () => createPartyRoom({ partyRoom: {}, $transaction: (run) => run({}) }, { id: "host" }, { mode: "coed", team_size: 2 }),
  ]) await assert.rejects(run(), { status: 503, code: "PARTY_ROOMS_NOT_READY" });
});

test("missing PartyRoom migrations have a friendly error without masking unrelated failures", () => {
  for (const code of ["P2021", "P2022"]) {
    const error = { code, meta: { modelName: "PartyRoom", table: "public.PartyRoom" } };
    const result = partyRoomStorageError(error);
    assert.equal(result.status, 503);
    assert.equal(result.cause, error);
  }
  for (const error of [new Error("Unexpected failure"), { code: "P2021", meta: { table: "public.User" } }, { code: "P2002", meta: { modelName: "PartyRoom" } }]) {
    assert.equal(partyRoomStorageError(error), error);
  }
});

test("rooms start with two teams; names, extra teams and the format are validated", async () => {
  const f = fixture();
  const room = await createPartyRoom(f.db, { id: "host", username: "host" }, { mode: "coed", team_size: 2 });
  assert.equal(room.teams.length, 2);
  assert.deepEqual(room.teams.map((team) => team.name), ["Team 1", "Team 2"]);
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

test("legacy default team names become numbered and adding/renaming teams cannot duplicate a name", async () => {
  const f = fixture();
  f.row().metadata.teams = [{ id: "a", name: "Team Alpha" }, { id: "b", name: "Team Bravo" }];
  assert.deepEqual(f.room().teams.map((team) => team.name), ["Team 1", "Team 2"]);
  await f.act("set_team_count", { team_count: 4 });
  assert.deepEqual(f.room().teams.map((team) => team.name), ["Team 1", "Team 2", "Team 3", "Team 4"]);
  await assert.rejects(f.act("rename_team", { team_id: "a", name: " team 2 " }), { status: 409 });
  await assert.rejects(f.act("add_team", { name: "TEAM 1" }), { status: 409 });
  await f.act("rename_team", { team_id: "a", name: "Phoenix" });
  await f.act("remove_team", { team_id: "b" });
  await f.act("add_team");
  assert.deepEqual(f.room().teams.map((team) => team.name), ["Phoenix", "Team 3", "Team 4", "Team 5"]);
  await f.act("set_team_count", { team_count: 6 });
  assert.deepEqual(f.room().teams.map((team) => team.name), ["Phoenix", "Team 3", "Team 4", "Team 5", "Team 6", "Team 7"]);
  f.row().metadata.teams = [{ id: "a", name: "Team Alpha" }, { id: "b", name: "Team 1", custom_name: true }];
  assert.deepEqual(f.room().teams.map((team) => team.name), ["Team 2", "Team 1"], "legacy conversion must also avoid colliding with a custom name");
});

test("only host/admin may edit or spin and stale revisions cannot overwrite a live room", async () => {
  const f = fixture();
  await assert.rejects(f.act("add_team", {}, { id: "viewer" }), { status: 403 });
  await assert.rejects(f.act("spin", {}, { id: "viewer" }), { status: 403 });
  await assert.rejects(f.act("add_team", { revision: 100 }), { status: 409 });
  await f.act("add_team", {}, { id: "admin", role: "admin" });
  assert.equal(f.room().teams.length, 3);
});

test("one spin fills every team, persists the whole draw and locks actions until the shared reveal ends", async () => {
  const f = fixture();
  await f.act("add", { names: ["A", "B", "C", "D"] });
  const first = await f.act("spin");
  assert.equal(first.spin.entries.length, 4);
  assert.equal(first.spin.scope, "all_teams");
  assert.equal(first.spin.selected_ids.length, 4);
  assert.equal(new Set(first.spin.selected_ids).size, 4);
  assert.equal(first.status, "ready");
  assert.ok(first.players.every((p) => p.side));
  await assert.rejects(f.act("spin"), { status: 409 });
  await assert.rejects(f.act("remove", { player_id: first.players[0].id }), { status: 409 });
  await assert.rejects(f.act("start_bracket"), { status: 409 });
  await assert.rejects(f.act("reset", {}, { id: "viewer" }), { status: 403 });
  f.finish();
  await assert.rejects(f.act("spin"), { status: 409 });
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
  await f.act("remove_team", { team_id: "a" });
  await assert.rejects(f.act("remove_team", { team_id: "b" }));
  await f.act("set_team_count", { team_count: 128 });
  await assert.rejects(f.act("add_team"));
  await f.act("close");
  await assert.rejects(f.act("reset"), { status: 409 });
});

test("fixed duos are validated, spin together, stay paired next round and can be unlinked", async () => {
  const f = fixture();
  await assert.rejects(f.act("add_duo", { players: [{ name: "A" }] }));
  await assert.rejects(f.act("add_duo", { players: [{ name: "A" }, { name: "a" }] }));
  await assert.rejects(f.act("add_duo", { players: [{ name: "A" }, { name: "B" }] }, { id: "viewer" }), { status: 403 });
  await f.act("add_duo", { players: [{ name: "A" }, { name: "B" }] });
  await f.act("add_duo", { players: [{ name: "C" }, { name: "D" }] });
  const duoId = f.room().players[0].duo_id;
  const first = await f.act("spin");
  assert.equal(first.spin.selected_ids.length, 4);
  assert.equal(first.spin.entries[0].name, "A + B");
  assert.deepEqual(first.players.filter((p) => p.duo_id === duoId).map((p) => p.side), ["a", "a"]);
  f.finish();
  assert.equal(f.room().status, "ready");
  await f.act("reset");
  assert.equal(f.room().players[0].duo_id, duoId);
  await f.act("unpair", { player_id: f.room().players[0].id });
  assert.ok(f.room().players.slice(0, 2).every((p) => !p.duo_id));
  await f.act("remove", { player_id: f.room().players[2].id });
  assert.equal(f.room().players.at(-1).duo_id, null);
});

test("one request fills every supported format with duos for 1–128 teams and preserves a partially drawn legacy room", async () => {
  for (const mode of ["coed", "switcheroo"]) for (const size of [2, 3, 4]) for (const count of [1, 2, 3, 4, 16, 63, 128]) {
    const f = fixture(), metadata = f.row().metadata;
    metadata.mode = mode; metadata.team_size = size;
    metadata.teams = Array.from({ length: count }, (_, i) => ({ id: `t${i}`, name: `Team ${i}` }));
    metadata.players = metadata.teams.flatMap((team) => {
      const quota = partyGenderQuota(metadata, team.id);
      return Array.from({ length: size }, (_, i) => ({ id: `${team.id}-${i}`, name: `${team.id}-${i}`, side: null,
        duo_id: i < 2 ? `duo-${team.id}` : null, gender: mode === "coed" ? i < quota.male ? "male" : "female" : null }));
    });
    const result = await f.act("spin");
    assert.equal(result.status, "ready");
    assert.equal(result.spin.selected_ids.length, count * size);
    assert.equal(result.spin.team_count, count);
    for (const team of result.teams) {
      const members = result.players.filter((player) => player.side === team.id);
      assert.equal(members.length, size);
      if (mode === "coed") for (const gender of ["male", "female"]) assert.equal(members.filter((player) => player.gender === gender).length, partyGenderQuota(result, team.id)[gender]);
    }
    for (const player of result.players.filter((player) => player.duo_id)) assert.equal(result.players.find((mate) => mate.duo_id === player.duo_id && mate.id !== player.id).side, player.side);
  }
  const f = fixture();
  await f.act("add", { names: ["A", "B", "C", "D"] });
  const assigned = f.row().metadata.players[0]; assigned.side = "b";
  f.row().status = "drafting";
  const result = await f.act("spin");
  assert.equal(result.players.find((player) => player.id === assigned.id).side, "b");
  assert.equal(result.spin.selected_ids.length, 3);
  assert.ok(!result.spin.selected_ids.includes(assigned.id));
  assert.ok(result.players.every((player) => player.side));
});

test("team count changes atomically from 1 to 128, preserving names and rejecting invalid or occupied reductions", async () => {
  const f = fixture();
  const first = f.room().teams[0];
  for (const team_count of [0, 129, 2.5, "4", null, -1]) await assert.rejects(f.act("set_team_count", { team_count }), { status: 400 });
  await assert.rejects(f.act("set_team_count", { team_count: 128 }, { id: "viewer" }), { status: 403 });
  await f.act("set_team_count", { team_count: 128 });
  assert.equal(f.room().teams.length, 128); assert.equal(new Set(f.room().teams.map((team) => team.id)).size, 128);
  assert.deepEqual(f.room().teams[0], first);
  await f.act("rename_team", { team_id: first.id, name: "Phoenix" });
  await f.act("set_team_count", { team_count: 1 });
  assert.equal(f.room().teams[0].name, "Phoenix");
  await f.act("add", { names: ["One", "Two"] });
  await f.act("set_team_count", { team_count: 2 });
  await f.act("add", { names: ["Three", "Four"] });
  await assert.rejects(f.act("set_team_count", { team_count: 1 }), { status: 409 });
  assert.equal(f.room().players.length, 4); assert.equal(f.room().teams.length, 2);
  await f.act("spin"); f.finish();
  await assert.rejects(f.act("set_team_count", { team_count: 3 }), { status: 409 });
});

test("duos never strand a draw across all 2–16-team sizes, Co-ed quotas or Switcheroo preferences", () => {
  for (const mode of ["coed", "switcheroo"]) for (const size of [2, 3, 4]) for (let count = 2; count <= 16; count++) {
    const room = { mode, team_size: size, teams: Array.from({ length: count }, (_, i) => ({ id: `t${i}` })), players: [] };
    for (const team of room.teams) {
      const quota = partyGenderQuota(room, team.id);
      const genders = mode === "coed" ? Array.from({ length: quota.male }, () => "male").concat(Array.from({ length: quota.female }, () => "female")) : Array(size).fill(null);
      // Alternate genders so the known feasible roster includes mixed duos.
      if (size === 4 && mode === "coed") [genders[1], genders[2]] = [genders[2], genders[1]];
      for (let i = 0; i < size; i++) room.players.push({ id: `${team.id}-p${i}`, name: `${team.id}-p${i}`, gender: genders[i], duo_id: i < size - size % 2 ? `${team.id}-duo${Math.floor(i / 2)}` : null, side: null });
    }
    // For 3v3 Co-ed, same-gender duos plus opposite-gender singles also fit.
    assert.equal(partyValidation(room), null, `${mode} ${size}x${count}`);
    while (room.players.some((p) => !p.side)) {
      const candidates = partyCandidates(room), side = partySide(room);
      assert.ok(candidates.length > 0, `${mode} ${size}x${count} cannot stall`);
      const chosen = candidates[Math.floor(candidates.length / 2)];
      partyDrawMembers(room, chosen).forEach((member) => { member.side = side; });
    }
    for (const team of room.teams) {
      const members = room.players.filter((p) => p.side === team.id);
      assert.equal(members.length, size);
      if (mode === "coed") for (const gender of ["male", "female"]) assert.equal(members.filter((p) => p.gender === gender).length, partyGenderQuota(room, team.id)[gender]);
    }
    for (const p of room.players.filter((p) => p.duo_id)) assert.equal(room.players.find((mate) => mate.duo_id === p.duo_id && mate.id !== p.id).side, p.side);
  }
  const impossible = { mode: "switcheroo", team_size: 3, teams: [{ id: "a" }, { id: "b" }], players: Array.from({ length: 6 }, (_, i) => ({ id: `p${i}`, name: `P${i}`, duo_id: `d${Math.floor(i / 2)}` })) };
  assert.match(partyValidation(impossible), /duos cannot fit/);
  assert.deepEqual(partyCandidates(impossible), []);
});

async function readyRoom(f) {
  await f.act("add", { names: ["A", "B", "C", "D"] });
  await f.act("spin"); f.finish();
}

test("only host/admin starts or resolves a bracket; active rounds and old match links are protected", async () => {
  const f = fixture();
  await assert.rejects(f.act("start_bracket"), { status: 409 });
  await readyRoom(f);
  await assert.rejects(f.act("start_bracket", {}, { id: "viewer" }), { status: 403 });
  await f.act("start_bracket", { format: "single_elimination", best_of: 1, game_mode: "hardpoint" });
  const firstId = f.room().bracket.matches[0].id;
  await assert.rejects(f.act("start_bracket"), { status: 409 });
  await assert.rejects(f.act("reset", {}, { id: "viewer" }), { status: 403 });
  await assert.rejects(f.act("match_score", { match_id: firstId, scores: [1, 0] }, { id: "viewer" }), { status: 403 });
  await f.act("match_score", { match_id: firstId, scores: [1, 0] });
  assert.equal(f.room().bracket.status, "completed");
  await f.act("reset");
  assert.equal(f.room().history[0].bracket.champion_id, f.room().history[0].bracket.matches[0].teams[0]);
  await f.act("spin"); f.finish();
  await f.act("start_bracket");
  assert.notEqual(f.room().bracket.matches[0].id, firstId);
  await assert.rejects(f.act("match_score", { match_id: firstId, scores: [2, 0] }), { status: 404 });
});

test("match chat is limited to participants/host; agreeing reports advance and conflicts await host resolution", async () => {
  const f = fixture(); await readyRoom(f); await f.act("start_bracket");
  const match = f.room().bracket.matches[0];
  const a = { id: "player-a", username: "Player A" }, b = { id: "player-b" };
  for (const [user, side] of [[a, match.teams[0]], [b, match.teams[1]]]) f.row().metadata.players.find((p) => p.side === side).user_id = user.id;
  await assert.rejects(f.act("match_message", { match_id: match.id, message: "Hi" }, { id: "viewer" }), { status: 403 });
  await f.act("match_message", { match_id: match.id, message: "GL HF" }, a);
  assert.equal(f.room().bracket.matches[0].messages[0].name, "Player A");
  await assert.rejects(f.act("match_message", { match_id: match.id, message: "Again" }, a), { status: 429 });
  await f.act("report_score", { match_id: match.id, scores: [2, 0] }, a);
  assert.equal(f.room().bracket.matches[0].status, "ready");
  await f.act("report_score", { match_id: match.id, scores: [0, 2] }, b);
  assert.equal(f.room().bracket.matches[0].status, "ready");
  await f.act("report_score", { match_id: match.id, scores: [2, 0] }, b);
  assert.equal(f.room().bracket.status, "completed");
  assert.equal(f.room().bracket.matches[0].result_by, "team_agreement");
  await assert.rejects(f.act("report_score", { match_id: match.id, scores: [0, 2] }, b), { status: 409 });
  await f.act("reset");
  assert.equal(f.room().history[0].bracket.matches[0].messages, undefined);
});

test("room lists omit bracket history and polling includes only the opened match's chat", async () => {
  const f = fixture(); await readyRoom(f); await f.act("start_bracket", { format: "double_elimination" });
  const match = f.room().bracket.matches[0];
  await f.act("match_message", { match_id: match.id, message: "Hello" });
  const room = f.room();
  assert.equal(partyRoomSummary(room).bracket, undefined);
  assert.equal(partyRoomView(room).bracket.matches[0].messages.length, 0);
  assert.equal(partyRoomView(room, match.id).bracket.matches[0].messages[0].message, "Hello");
  assert.equal(room.bracket.matches[0].messages.length, 1, "serialization must not alter saved messages");
});

test("changing a linked slot cannot let one account confirm both sides of a result", async () => {
  const f = fixture(); await readyRoom(f); await f.act("start_bracket");
  const match = f.room().bracket.matches[0], user = { id: "one" };
  const first = f.row().metadata.players.find((p) => p.side === match.teams[0]);
  first.user_id = user.id;
  await f.act("report_score", { match_id: match.id, scores: [2, 0] }, user);
  f.row().metadata.players.find((p) => p.id === first.id).user_id = null;
  f.row().metadata.players.find((p) => p.side === match.teams[1]).user_id = user.id;
  await assert.rejects(f.act("report_score", { match_id: match.id, scores: [2, 0] }, user), { status: 403 });
  assert.equal(f.room().bracket.status, "in_progress");
});

test("existing rooms backfill and persist missing maps once; linked profiles expose only public details", async () => {
  const f = fixture(); await readyRoom(f); await f.act("start_bracket");
  const matchId = f.room().bracket.matches[0].id;
  f.row().metadata.bracket.matches.forEach((match) => { delete match.series_maps; });
  f.row().metadata.players[0].user_id = "linked";
  f.db.discordEventDispatch = { findUnique: async () => null };
  f.db.user = { findMany: async () => [{ id: "linked", username: "Liv", display_name: "Liv", role: "user", metadata: { avatar_url: "/avatar.png", activision_id: "Liv#123", private_note: "secret", api_key: "secret" } }] };
  let reads = 0;
  const transaction = f.db.$transaction;
  f.db.$transaction = (...args) => { reads++; return transaction(...args); };
  const first = await getPartyRoom(f.db, "party-room", { matchId });
  assert.equal(first.room.bracket.matches[0].series_maps.length, 3);
  assert.equal(first.room.players[0].profile.activision_id, "Liv#123");
  assert.equal(first.room.players[0].profile.private_note, undefined);
  assert.equal(first.room.players[0].profile.api_key, undefined);
  assert.equal(f.row().metadata.players[0].profile, undefined);
  const saved = structuredClone(f.row().metadata.bracket);
  await getPartyRoom(f.db, "party-room", { matchId });
  assert.deepEqual(f.row().metadata.bracket, saved);
  assert.equal(reads, 1);
});

test("hosts add real website accounts or guests to solos and duos; duplicates and unavailable accounts are rejected", async () => {
  const f = fixture();
  const accounts = [{ id: "host", username: "Liv", is_banned: false }, { id: "other", username: "Ouji", is_banned: false }, { id: "banned", username: "Blocked", is_banned: true }];
  let lookups = 0;
  f.db.user = { findMany: async ({ where }) => { lookups++; return accounts.filter((user) => where.id.in.includes(user.id) && !user.is_banned); } };
  await assert.rejects(f.act("add", { players: [{ name: "Spoofed", user_id: "host" }] }, { id: "viewer" }), { status: 403 });
  assert.equal(lookups, 0);
  await f.act("add", { players: [{ name: "Spoofed", user_id: "host" }, { name: "Guest" }] });
  assert.equal(f.room().players[0].name, "Liv");
  assert.equal(f.room().players[0].user_id, "host");
  assert.equal(f.room().players[1].user_id, null);
  await assert.rejects(f.act("add", { players: [{ name: "Alias", user_id: "host" }] }), { status: 409 });
  await assert.rejects(f.act("add", { players: [{ user_id: "banned" }] }), { status: 409 });
  await assert.rejects(f.act("add", { players: [{ user_id: "deleted" }] }), { status: 409 });
  assert.equal(f.room().players.length, 2);
  await assert.rejects(f.act("add_duo", { players: [{ user_id: "other" }, { user_id: "other" }] }));
  await f.act("add_duo", { players: [{ name: "Wrong", user_id: "other" }, { name: "Duo guest" }] });
  const pair = f.room().players.slice(2);
  assert.equal(pair[0].name, "Ouji");
  assert.equal(pair[0].user_id, "other");
  assert.equal(pair[1].user_id, null);
  assert.equal(pair[0].duo_id, pair[1].duo_id);
  await f.act("spin");
  assert.ok(f.room().players.every((player) => player.side));
});

test("the creator and every website admin tier can award wins/losses, forfeit and correct completed results", async () => {
  for (const user of [{ id: "host" }, { id: "admin", role: "admin" }, { id: "super", admin_role: "super_admin" }, { id: "ceo", role: "ceo" }, { id: "legacy", is_admin: true }]) {
    const f = fixture(); await readyRoom(f); await f.act("start_bracket");
    const match = f.room().bracket.matches[0], [a, b] = match.teams;
    await f.act("match_award", { match_id: match.id, team_id: a, outcome: "win", reason: "Verified" }, user);
    assert.equal(f.room().bracket.champion_id, a);
    await assert.rejects(f.act("match_forfeit", { match_id: match.id, team_id: a }, user), { status: 409 });
    await f.act("match_forfeit", { match_id: match.id, team_id: a, override: true, reason: "No-show" }, user);
    assert.equal(f.room().bracket.champion_id, b);
    assert.equal(f.room().bracket.matches[0].decision.type, "forfeit");
    assert.equal(f.room().bracket.matches[0].decision.actor_id, user.id);
    assert.equal(f.room().bracket.matches[0].decision.reason, "No-show");
    await f.act("match_award", { match_id: match.id, team_id: b, outcome: "loss", override: true }, user);
    assert.equal(f.room().bracket.champion_id, a);
    await f.act("match_score", { match_id: match.id, scores: [1, 2], override: true }, user);
    assert.equal(f.room().bracket.champion_id, b);
    await f.act("reset_match", { match_id: match.id }, user);
    assert.equal(f.room().bracket.champion_id, null);
    assert.equal(f.room().bracket.matches[0].status, "ready");
    assert.equal(f.room().bracket.matches[0].result_history.length, 4);
    assert.equal(f.room().management_log[0].action, "reset_match");
  }
});

test("players cannot use management controls; creator/admin resets keep players and archive the active bracket", async () => {
  const f = fixture(); await readyRoom(f); await f.act("start_bracket");
  const match = f.room().bracket.matches[0], player = { id: "member" };
  f.row().metadata.players[0].user_id = player.id;
  for (const action of ["match_award", "match_forfeit", "reset_match", "reset"]) await assert.rejects(f.act(action, { match_id: match.id, team_id: match.teams[0], outcome: "win" }, player), { status: 403 });
  const names = f.room().players.map((entry) => entry.name);
  await f.act("reset", { reason: "New teams" });
  assert.equal(f.room().status, "open");
  assert.equal(f.room().bracket, null);
  assert.deepEqual(f.room().players.map((entry) => entry.name), names);
  assert.equal(f.room().players[0].user_id, player.id);
  assert.ok(f.room().players.every((entry) => entry.side === null));
  assert.equal(f.room().history[0].bracket.status, "cancelled");
  assert.equal(f.room().history[0].bracket.cancellation_reason, "New teams");
  await f.act("spin");
  await f.act("reset", {}, { id: "admin", role: "admin" });
  assert.equal(f.room().spin, null, "admin can cancel a running spin");
});

test("a committed team reset recovers a lost gateway response without resetting twice", async () => {
  for (const status of [502, 503, 504, null]) {
    const f = fixture(); await readyRoom(f); await f.act("start_bracket");
    const before = f.room(), matchId = before.bracket.matches[0].id;
    let writes = 0, reads = 0;
    const result = await submitPartyRoomAction({
      change: async (id, input) => {
        writes++;
        assert.equal(id, before.id); assert.equal(input.view_match_id, matchId);
        await f.act(input.action, input);
        throw status ? Object.assign(new Error("Gateway response lost"), { status }) : new TypeError("Failed to fetch");
      },
      get: async (id, match, options) => {
        reads++;
        assert.equal(id, before.id); assert.equal(match, null); assert.equal(options.fresh, true);
        return { room: f.room() };
      },
    }, before, "reset", { reason: "New teams" }, matchId);
    assert.equal(writes, 1); assert.equal(reads, 1);
    assert.equal(result.room.status, "open"); assert.equal(result.room.round, before.round + 1);
    assert.equal(result.room.history.length, 1); assert.equal(result.room.bracket, null);
  }
});

test("reset recovery never hides rejected, uncommitted or unverified actions", async () => {
  const f = fixture(); await readyRoom(f); await f.act("start_bracket");
  const before = f.room(), gateway = Object.assign(new Error("Gateway unavailable"), { status: 502 });
  for (const current of [before, { ...before, revision: before.revision + 1 }, { ...before, revision: before.revision + 1, status: "open", round: before.round + 1, bracket: null, spin: null, players: [], management_log: [{ action: "reset_teams", round: before.round + 1 }] }]) {
    await assert.rejects(submitPartyRoomAction({ change: async () => { throw gateway; }, get: async () => ({ room: current }) }, before, "reset"), (error) => error === gateway);
  }
  await assert.rejects(submitPartyRoomAction({ change: async () => { throw gateway; }, get: async () => { throw new Error("Still offline"); } }, before, "reset"), (error) => error === gateway);
  for (const [action, error] of [["reset", Object.assign(new Error("Forbidden"), { status: 403 })], ["reset", Object.assign(new Error("Stale revision"), { status: 409 })], ["match_forfeit", gateway]]) {
    await assert.rejects(submitPartyRoomAction({ change: async () => { throw error; }, get: () => assert.fail("Do not reconcile a rejected or different action") }, before, action), (actual) => actual === error);
  }
});
