import test from "node:test";
import assert from "node:assert/strict";
import { assignVerifiedPlayerRole, handleVerificationInteraction, syncVerifiedPlayerRoles } from "./member-verification.js";

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

function interactionFixture(fetchMember) {
  const replies = [], deferrals = [];
  return {
    replies, deferrals, user: { id: "member" },
    guild: { members: { fetch: fetchMember } },
    deferReply: async (options) => deferrals.push(options),
    editReply: async (message) => replies.push(message),
  };
}

test("verification confirms access only after role assignment and edits the thinking response", async () => {
  const f = fixture(), member = f.member("member");
  const interaction = interactionFixture(async (options) => {
    assert.deepEqual(options, { user: "member", force: true });
    return member;
  });
  await handleVerificationInteraction(interaction);
  assert.equal(f.writes.length, 1);
  assert.equal(interaction.deferrals.length, 1);
  assert.equal(interaction.replies.length, 1);
  assert.match(interaction.replies[0], /Rules accepted/);
});

test("permission failures finish the original response with an actionable message", async () => {
  const interaction = interactionFixture(async () => ({}));
  await handleVerificationInteraction(interaction, {
    assign: async () => { throw Object.assign(new Error("Missing Permissions"), { code: 50013 }); },
  });
  assert.equal(interaction.replies.length, 1);
  assert.match(interaction.replies[0], /Manage Roles/);
  assert.doesNotMatch(interaction.replies[0], /Rules accepted/);
});

test("a stalled member lookup or role assignment cannot leave verification thinking forever", async () => {
  for (const phase of ["fetch", "assign"]) {
    const never = new Promise(() => {});
    const interaction = interactionFixture(async () => phase === "fetch" ? never : {});
    await handleVerificationInteraction(interaction, { timeoutMs: 5, assign: async () => never });
    assert.equal(interaction.replies.length, 1);
    assert.match(interaction.replies[0], /taking too long/);
    assert.doesNotMatch(interaction.replies[0], /Rules accepted/);
  }
});

test("pending Discord screening explains the remaining step without granting access", async () => {
  const f = fixture();
  const interaction = interactionFixture(async () => f.member("member", { pending: true }));
  await handleVerificationInteraction(interaction);
  assert.equal(f.writes.length, 0);
  assert.match(interaction.replies[0], /screening first/);
});
