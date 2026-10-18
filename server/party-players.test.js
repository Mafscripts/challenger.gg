import test from "node:test";
import assert from "node:assert/strict";
import { searchPartyPlayers, selectedPartyAccounts } from "./party-players.js";

test("player suggestions include the host, limit public results and never expose private fields", async () => {
  let calls = 0;
  const db = { user: { findMany: async (args) => {
    calls++;
    assert.equal(args.where.is_banned, false);
    assert.equal(args.where.id, undefined, "the host's own account must be searchable");
    assert.equal(args.where.OR[0].username.contains, "li");
    assert.equal(args.where.OR[0].username.mode, "insensitive");
    assert.equal(args.take, 8);
    return [{ id: "host", username: "Liv", display_name: "Display", email: "private@example.com", metadata: { avatar_url: "/avatar.png", private_note: "secret" } }];
  } } };
  assert.deepEqual(await searchPartyPlayers(db, "l"), []);
  assert.deepEqual(await searchPartyPlayers(db, ["Liv"]), []);
  assert.equal(calls, 0);
  const users = await searchPartyPlayers(db, " li ");
  assert.deepEqual(users, [{ id: "host", name: "Liv", username: "Liv", avatar_url: "/avatar.png" }]);
  assert.equal(calls, 1);
});

test("selected accounts are revalidated, while guests work without any account lookup", async () => {
  let calls = 0;
  const db = { user: { findMany: async ({ where }) => {
    calls++;
    assert.equal(where.is_banned, false);
    return where.id.in.includes("valid") ? [{ id: "valid", username: "Liv" }] : [];
  } } };
  assert.equal((await selectedPartyAccounts(db, [{ name: "Guest" }, { name: "Other", user_id: null }])).size, 0);
  assert.equal(calls, 0);
  assert.equal((await selectedPartyAccounts(db, [{ user_id: "valid", name: "Spoofed name" }])).get("valid").name, "Liv");
  await assert.rejects(selectedPartyAccounts(db, [{ user_id: "missing" }]), { status: 409 });
  await assert.rejects(selectedPartyAccounts(db, [{ user_id: "valid" }, { user_id: "valid" }]), { status: 400 });
  await assert.rejects(selectedPartyAccounts(db, [{ user_id: { id: "valid" } }]), { status: 400 });
});
