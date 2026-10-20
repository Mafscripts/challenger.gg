import test from "node:test";
import assert from "node:assert/strict";
import { deleteAdminUser, deleteOwnAccount } from "../server/admin-users.js";

const user = { id: "player1", username: "player1", email: "player@example.invalid", role: "user", password_hash: "stored-hash", wallet_balance: 0 };
function fixture(overrides = {}) {
  const deleted = [], writes = [];
  const empty = { findMany: async () => [], deleteMany: async () => ({ count: 0 }) };
  const tx = new Proxy({ user: { findUnique: async () => ({ ...user, ...overrides }), delete: async ({ where }) => deleted.push(where.id) }, wallet: { findMany: async () => [] },
    $executeRaw: async () => { writes.push(true); return 0; }, $queryRaw: async () => [], adminAction: { create: async () => ({}) } }, { get: (target, key) => target[key] ?? empty });
  return { db: { $transaction: callback => callback(tx) }, deleted, tx };
}
const verify = async (password, hash) => password === "correct-password" && hash === "stored-hash";
test("self-service deletion authenticates the password and targets only its account", async () => {
  const f = fixture();
  const result = await deleteOwnAccount(f.db, user, { user_id: "another-player", password: "correct-password", confirmation: "player1" }, verify);
  assert.deepEqual(f.deleted, ["player1"]); assert.equal(result.success, true);
});
test("wrong password, missing confirmation, ownership and outstanding funds stop deletion", async () => {
  for (const [overrides, body, status] of [
    [{}, { password: "wrong", confirmation: "player1" }, 401],
    [{}, { password: "correct-password", confirmation: "someone-else" }, 400],
    [{ role: "ceo" }, { password: "correct-password", confirmation: "player1" }, 409],
    [{ wallet_balance: 10 }, { password: "correct-password", confirmation: "player1" }, 409],
  ]) { const f = fixture(overrides); await assert.rejects(deleteOwnAccount(f.db, user, body, verify), { status }); assert.deepEqual(f.deleted, []); }
});
test("self-service deletion stops for active competition records and preserves admin authorization", async () => {
  const f = fixture(); f.tx.$queryRaw = async () => [{ id: "active-match" }];
  await assert.rejects(deleteOwnAccount(f.db, user, { password: "correct-password", confirmation: "player1" }, verify), { status: 409 });
  await assert.rejects(deleteAdminUser(f.db, user, { user_id: "other" }), { status: 403 });
  assert.deepEqual(f.deleted, []);
});
