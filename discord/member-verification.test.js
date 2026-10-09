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

test("joining grants the community role without a linked website account or rules acceptance", async () => {
  const f = fixture();
  const newcomer = f.member("1", { pending: true });
  assert.equal(await assignVerifiedPlayerRole(newcomer), true);
  assert.deepEqual(f.writes, [{ id: "1", roleId: f.role.id }]);
  assert.equal(await assignVerifiedPlayerRole(newcomer), false);
  assert.equal(await assignVerifiedPlayerRole(f.member("2", { bot: true })), false);
  assert.equal(f.writes.length, 1);
});

test("startup recovery paginates all members, continues after failures and retries on the next sync", async () => {
  const f = fixture();
  const first = new Map(Array.from({ length: 1000 }, (_, index) => {
    const id = String(index + 1);
    return [id, f.member(id, { verified: index > 1, fail: index === 0 })];
  }));
  const second = new Map([["1001", f.member("1001")], ["1002", f.member("1002", { bot: true })]]);
  const requests = [], logs = [];
  f.guild.members = { list: async (options) => {
    requests.push(options); return options.after ? second : first;
  } };
  assert.deepEqual(await syncVerifiedPlayerRoles(f.guild, { log: (message) => logs.push(message) }), { assigned: 2, failed: 1 });
  assert.deepEqual(requests, [{ limit: 1000 }, { limit: 1000, after: "1000" }]);
  assert.deepEqual(f.writes.map((write) => write.id), ["2", "1001"]);
  assert.ok(logs.some((message) => message.includes("failed for 1")));
  first.set("1", f.member("1"));
  assert.deepEqual(await syncVerifiedPlayerRoles(f.guild), { assigned: 1, failed: 0 });
  assert.deepEqual(f.writes.map((write) => write.id), ["2", "1001", "1"]);
});

test("missing or unmanageable roles fail explicitly without changing member roles", async () => {
  const f = fixture();
  f.role.editable = false;
  await assert.rejects(assignVerifiedPlayerRole(f.member("1")), /Manage Roles.*above Verified Player/);
  f.role.editable = true;
  f.role.managed = true;
  await assert.rejects(assignVerifiedPlayerRole(f.member("1")), /role is missing/);
  assert.deepEqual(f.writes, []);
});
