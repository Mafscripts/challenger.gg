import test from "node:test";
import assert from "node:assert/strict";
import { assignVerifiedPlayerRole, syncVerifiedPlayerRoles } from "./member-verification.js";

function fixture() {
  const role = { id: "verified-role", name: "Verified Player", editable: true, managed: false };
  const guild = { roles: { cache: { find: (predicate) => predicate(role) ? role : undefined }, fetch: async () => {} } };
  const writes = [];
  const member = (id, { bot = false, verified = false, pending = false, fail = false } = {}) => {
    const roles = new Set(verified ? [role.id] : []);
    return { id, guild, user: { bot }, pending, roles: {
      cache: { has: (roleId) => roles.has(roleId) },
      add: async (addedRole) => {
        if (fail) throw new Error("Discord unavailable");
        writes.push({ id, roleId: addedRole.id }); roles.add(addedRole.id);
      },
    } };
  };
  return { role, guild, writes, member };
}

test("joining and background sync cannot grant access without explicit rules acceptance", async () => {
  const f = fixture();
  await assert.rejects(assignVerifiedPlayerRole(f.member("1")), /Accept the community rules/);
  assert.deepEqual(await syncVerifiedPlayerRoles(f.guild), { assigned: 0, failed: 0 });
  assert.deepEqual(f.writes, []);
});

test("accepting rules grants access once, excludes bots and respects Discord screening", async () => {
  const f = fixture();
  const newcomer = f.member("1");
  assert.equal(await assignVerifiedPlayerRole(newcomer, { acceptedRules: true }), true);
  assert.equal(await assignVerifiedPlayerRole(newcomer, { acceptedRules: true }), false);
  assert.equal(await assignVerifiedPlayerRole(f.member("2", { bot: true }), { acceptedRules: true }), false);
  await assert.rejects(assignVerifiedPlayerRole(f.member("3", { pending: true }), { acceptedRules: true }), /membership screening/);
  assert.deepEqual(f.writes, [{ id: "1", roleId: f.role.id }]);
});

test("missing or unmanageable roles fail explicitly without changing member roles", async () => {
  const f = fixture();
  f.role.editable = false;
  await assert.rejects(assignVerifiedPlayerRole(f.member("1"), { acceptedRules: true }), /Manage Roles.*above Verified Player/);
  f.role.editable = true;
  f.role.managed = true;
  await assert.rejects(assignVerifiedPlayerRole(f.member("1"), { acceptedRules: true }), /role is missing/);
  assert.deepEqual(f.writes, []);
});
