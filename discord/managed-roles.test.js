import test from "node:test";
import assert from "node:assert/strict";
import { syncManagedDiscordRoles } from "./managed-roles.js";
import { assignVerifiedPlayerRole } from "./member-verification.js";

function fixture() {
  const roles = ["Verified Player", "Team Captain", "Premium", "Tournament Participant"].map(name => ({ name, id: name, editable: true, managed: false }));
  const changes = [], memberRoles = new Set();
  const member = { id: "discord-player", user: { bot: false, tag: "Player" }, pending: false, roles: { cache: { has: id => memberRoles.has(id) },
    add: async role => { changes.push(["add", role.name]); memberRoles.add(role.id); },
    remove: async role => { changes.push(["remove", role.name]); memberRoles.delete(role.id); } } };
  const guild = { roles: { fetch: async () => {}, cache: { find: predicate => roles.find(predicate) } }, members: { fetch: async () => member } };
  member.guild = guild;
  const db = { user: { findMany: async () => [{ id: "website-player", discord_user_id: member.id, is_premium: false }] },
    team: { findMany: async () => { throw new Error("Captain ownership must not be used to assign Discord roles"); } },
    tournament: { findMany: async () => [] }, tournamentParticipant: { findMany: async () => [] } };
  return { member, memberRoles, guild, db, changes };
}

test("joining and the subsequent website sync grant only Verified Player, never Team Captain", async () => {
  const f = fixture();
  await assignVerifiedPlayerRole(f.member);
  await syncManagedDiscordRoles(f.guild, () => {}, { db: f.db });
  assert.deepEqual(f.changes, [["add", "Verified Player"]]);
  assert.equal(f.memberRoles.has("Team Captain"), false);
});
test("website sync preserves a Team Captain role explicitly assigned by staff", async () => {
  const f = fixture(); f.memberRoles.add("Team Captain");
  await syncManagedDiscordRoles(f.guild, () => {}, { db: f.db });
  assert.deepEqual(f.changes, []);
  assert.equal(f.memberRoles.has("Team Captain"), true);
});
test("Premium and active tournament membership continue to sync without assigning captain", async () => {
  const f = fixture();
  f.db.user.findMany = async () => [{ id: "website-player", discord_user_id: f.member.id, is_premium: true }];
  f.db.tournament.findMany = async () => [{ id: "tournament", metadata: { status: "open" } }];
  f.db.tournamentParticipant.findMany = async () => [{ id: "entry", metadata: { tournament_id: "tournament", captain_id: "website-player" } }];
  await syncManagedDiscordRoles(f.guild, () => {}, { db: f.db });
  assert.deepEqual(f.changes, [["add", "Premium"], ["add", "Tournament Participant"]]);
  assert.equal(f.memberRoles.has("Team Captain"), false);
});
