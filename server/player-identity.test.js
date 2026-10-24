import test from "node:test";
import assert from "node:assert/strict";
import { playerDisplayName, profilePresentationPatch } from "../src/lib/playerIdentity.js";
import { buildFreeEightsStandings } from "../src/lib/freeEightsStandings.js";

test("display names win over account slugs, stale roster labels and Twitter handles", () => {
  const player = { display_name: " dev ", full_name: "Older name", user_name: "topfragg-dev", name: "Old roster name", username: "topfragg-dev", handle: "twitter-handle", x: "@twitter-handle" };
  assert.equal(playerDisplayName(player), "dev");
  assert.equal(playerDisplayName({ ...player, user: { display_name: "Current name" } }), "Current name");
  assert.equal(playerDisplayName({ username: "account", handle: "twitter" }), "account");
  assert.equal(playerDisplayName({ name: "dev", username: "account", handle: "twitter" }), "dev");
  assert.equal(playerDisplayName({ handle: "twitter", email: "private@example.test" }), "Player");
  assert.equal(playerDisplayName({ display_name: "  " }, "Open slot"), "Open slot");
});

test("Free 8s standings use the current display name while keeping the account profile URL", () => {
  const rows = [{ id: "stats", user_id: "player", username: "Old name", free_eights_elo: 1200 }];
  const users = new Map([["player", { id: "player", display_name: "dev", username: "topfragg-dev", handle: "twitter-handle" }]]);
  const [standing] = buildFreeEightsStandings(rows, users);
  assert.equal(standing.name, "dev");
  assert.equal(standing.slug, "topfragg-dev");
  assert.equal(users.get("player").handle, "twitter-handle");
});

test("confirmed appearance updates patch only presentation fields without replacing wallet or permissions", () => {
  const original = { id: "player", role: "admin", wallet: { available_balance: 42 }, display_name: "Old name" };
  const patch = profilePresentationPatch({ displayName: "dev", username: "topfragg-dev", avatarUrl: "", playerCardTheme: "astral-tide", role: "ceo", wallet: { available_balance: 0 } });
  const next = { ...original, ...patch };
  assert.equal(next.display_name, "dev");
  assert.equal(next.role, "admin");
  assert.equal(next.wallet, original.wallet);
  assert.equal(next.avatar_url, "");
  assert.deepEqual(profilePresentationPatch({ userId: "player" }), {});
});
