import test from "node:test";
import assert from "node:assert/strict";
import { xpCategoryForSize } from "../src/lib/xpCategories.js";
import { completeXPMatchRoster } from "../src/lib/xpMatchRating.js";
import { getXPFormatStandings, buildXPTeamStandings, getXPTeamsSummary } from "./xp-format-standings.js";
import { manageXPTeam, readXPParty } from "./xp-teams.js";

function completed(id, size, change, won = true) {
  const alpha = ["p", ...Array.from({ length: size - 1 }, (_, i) => `a${i}`)];
  const bravo = ["q", ...Array.from({ length: size - 1 }, (_, i) => `b${i}`)];
  return { id, created_date: new Date(Date.UTC(2026, 0, size)), metadata: { status: "completed", match_type: "xp", team_size: `${size}v${size}`, host_id: "p", challenger_id: "q", winner_id: won ? "p" : "q",
    host_party_team_id: `${id}-a`, challenger_party_team_id: `${id}-b`, team_alpha_player_ids: alpha, team_bravo_player_ids: bravo,
    team_alpha_party_teams: [{ team_id: `${id}-a`, player_ids: alpha }], team_bravo_party_teams: [{ team_id: `${id}-b`, player_ids: bravo }],
    xp_rating_outcome: { change }, xp_changes: Object.fromEntries([...alpha, ...bravo].map((user) => [user, { delta: change * (alpha.includes(user) === won ? 1 : -1), won: alpha.includes(user) === won }])) } };
}

test("Solo, Duos and Teams support 1v1 through 5v5 without changing the global personal rank", async () => {
  const matches = [completed("solo", 1, 20), completed("duos", 2, 5, false), completed("teams", 5, 40)];
  const teams = matches.flatMap((row) => ["a", "b"].map((side) => ({ id: `${row.id}-${side}`, metadata: { team_type: "xp", is_active: true, roster_size: Number(row.metadata.team_size[0]), name: `${row.id}-${side}` } })));
  const db = { xPStats: { findMany: async () => [] }, xPMatch: { findMany: async () => matches }, team: { findMany: async () => teams } };
  for (const category of ["solo", "duos", "teams"]) {
    const result = await getXPFormatStandings(db, { category });
    const p = result.players.find((player) => player.user_id === "p");
    assert.equal(p.global_xp, 55);
    assert.equal(p.tp_rank.xp, 55);
    assert.equal(p.tp_rank.position, 1);
    assert.equal(p.matches_played, 1);
    assert.equal(p.total_xp, { solo: 20, duos: 0, teams: 40 }[category]);
  }
  assert.equal(xpCategoryForSize("1v1"), "solo");
  assert.equal(xpCategoryForSize("2v2"), "duos");
  assert.equal(xpCategoryForSize("1v2"), null);
  assert.deepEqual([3, 4, 5].map(xpCategoryForSize), ["teams", "teams", "teams"]);
  assert.equal(completeXPMatchRoster(matches[2].metadata), true);
});

test("a full team gets one XP award, legacy partial parties do not receive full-team standings", () => {
  const match = completed("full", 5, 20);
  const team = { id: "full-a", metadata: { team_type: "xp", is_active: true, roster_size: 5 } };
  const result = buildXPTeamStandings([match, match], [team], "teams");
  assert.equal(result[0].total_xp, 20);
  assert.equal(result[0].wins, 1);
  const partial = structuredClone(match); partial.metadata.team_alpha_party_teams[0].player_ids = ["p"];
  assert.deepEqual(buildXPTeamStandings([partial], [team], "teams"), []);
  assert.deepEqual(buildXPTeamStandings([match], [{ ...team, metadata: { ...team.metadata, xp_reset_at: new Date(Date.now() + 1000).toISOString() } }], "teams"), []);
});

function membershipFixture() {
  let state = { teams: [], members: [], invites: [], notifications: [] };
  const clone = (value) => structuredClone(value);
  const filter = (row, where) => where?.metadata ? row.metadata[where.metadata.path[0]] === where.metadata.equals : true;
  const model = (name) => ({
    findUnique: async ({ where }) => clone(state[name].find((row) => row.id === where.id) || null),
    findMany: async ({ where } = {}) => clone(state[name].filter((row) => filter(row, where))),
    create: async ({ data }) => { const row = { id: `${name}-${state[name].length}`, ...clone(data) }; state[name].push(row); return clone(row); },
    update: async ({ where, data }) => { const row = state[name].find((row) => row.id === where.id); Object.assign(row, clone(data)); return clone(row); },
  });
  const actor = { id: "p", username: "P", metadata: { activision_id: "P#123" } };
  const tx = { team: model("teams"), teamMember: model("members"), teamInvite: model("invites"), notification: model("notifications"),
    user: { findMany: async ({ where }) => where.id.in.map((id) => ({ ...actor, id })) }, xPMatch: { findMany: async () => [] },
    $executeRaw: async () => 1,
    $queryRaw: async (_sql, ...values) => {
      const ids = values.flatMap((value) => value?.values || [value]);
      return clone(state.teams.filter((team) => team.metadata.is_active !== false && (ids.includes(team.metadata.captain_id) || state.members.some((member) => member.metadata.team_id === team.id && member.metadata.is_active !== false && ids.includes(member.metadata.user_id)))));
    },
  };
  let queue = Promise.resolve();
  const db = { $transaction: (operation) => { const result = queue.then(async () => { const before = clone(state); try { return await operation(tx); } catch (error) { state = before; throw error; } }); queue = result.catch(() => {}); return result; } };
  return { db, tx, actor, state: () => state };
}

test("simultaneous XP team creation leaves exactly one active membership", async () => {
  const f = membershipFixture();
  const results = await Promise.all([1, 2].map((size) => manageXPTeam(f.db, f.actor, { action: "create", name: "XP roster", tag: "XP", roster_size: size })));
  assert.equal(results.filter((result) => result.success).length, 1);
  assert.equal(f.state().teams.length, 1);
  assert.equal(f.state().members.length, 1);
  assert.match(results.find((result) => !result.success).error, /Leave it first/);
});

test("captains must disband, members must leave, and switching preserves personal XP data", async () => {
  const f = membershipFixture();
  const { team } = await manageXPTeam(f.db, f.actor, { action: "create", name: "My XP team", tag: "XP", roster_size: 1 });
  assert.equal((await manageXPTeam(f.db, f.actor, { action: "leave", team_id: team.id })).success, false);
  assert.equal((await manageXPTeam(f.db, f.actor, { action: "disband", team_id: team.id })).success, true);
  assert.equal((await manageXPTeam(f.db, f.actor, { action: "create", name: "My new XP team", tag: "XP", roster_size: 5 })).success, true);
  assert.equal(f.state().teams.filter((row) => row.metadata.is_active !== false).length, 1);
  assert.equal(f.state().members.filter((row) => row.metadata.is_active !== false).length, 1);
});

test("XP enrollment rejects other competition types, incomplete rosters and duplicate memberships", async () => {
  const f = membershipFixture();
  const { team } = await manageXPTeam(f.db, f.actor, { action: "create", name: "XP solo", tag: "XP", roster_size: 1 });
  assert.equal((await readXPParty(f.tx, team.id, "p", 1)).size, 1);
  await assert.rejects(readXPParty(f.tx, team.id, "p", 2), /complete/);
  f.state().teams.push({ id: "another", metadata: { ...team, captain_id: "p", is_active: true } });
  await assert.rejects(readXPParty(f.tx, team.id, "p", 1), /another XP team/);
  f.state().teams.pop(); f.state().teams[0].metadata.team_type = "ranked";
  await assert.rejects(readXPParty(f.tx, team.id, "p", 1), /dedicated XP team/);
});


test("competing invites cannot enroll one player into two XP teams; a member can leave and create another", async () => {
  const f = membershipFixture();
  const q = { ...f.actor, id: "q" }, r = { ...f.actor, id: "r" };
  const first = await manageXPTeam(f.db, f.actor, { action: "create", name: "First duo", tag: "ONE", roster_size: 2 });
  const second = await manageXPTeam(f.db, q, { action: "create", name: "Second duo", tag: "TWO", roster_size: 2 });
  const invitations = await Promise.all([first.team, second.team].map((team) => f.tx.teamInvite.create({ data: { metadata: { team_id: team.id, invited_user_id: r.id, status: "pending" } } })));
  const results = await Promise.all(invitations.map((invite) => manageXPTeam(f.db, r, { action: "respond_invite", team_id: invite.metadata.team_id, invite_id: invite.id, decision: "accept" })));
  assert.equal(results.filter((result) => result.success).length, 1);
  const joined = results.find((result) => result.success).member.team_id;
  const captain = f.state().teams.find((team) => team.id === joined).metadata.captain_id;
  f.state().members.reverse();
  assert.equal((await readXPParty(f.tx, joined, captain, 2)).ids[0], captain);
  assert.equal((await manageXPTeam(f.db, r, { action: "leave", team_id: joined })).success, true);
  assert.equal((await manageXPTeam(f.db, r, { action: "create", name: "My solo", tag: "NEW", roster_size: 1 })).success, true);
});

test("team-page XP and the format ladder use the same score ledger", async () => {
  const matches = [completed("five", 5, 20)];
  const teams = [{ id: "five-a", metadata: { team_type: "xp", is_active: true, roster_size: 5 } }];
  const db = { xPMatch: { findMany: async () => matches }, team: { findMany: async () => teams } };
  const summary = await getXPTeamsSummary(db, ["five-a"], "bo7");
  assert.deepEqual(summary["five-a"], buildXPTeamStandings(matches, teams, "teams")[0]);
});
