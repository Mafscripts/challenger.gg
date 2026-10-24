import test from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { getAdminPlayerDossier } from "./admin-player-dossier.js";

const actor = role => ({ id: "staff", role });
function fixture() {
  const reads = [];
  const restrictionStatus = { active_ban: false, active_suspension: false, active_premium: false, suspended_until: null };
  const target = { id: "player", display_name: "dev", username: "topfragg-dev", full_name: "Player", role: "user", admin_role: null,
    email: "player@example.test", password_hash: "secret", is_banned: false, credits: 500, wallet_balance: 777,
    ban_reason: "Private ban context", metadata: { avatar_url: "/avatar.webp", role: "ceo", email: "injected@test.invalid", registration_ip: "1.2.3.4", password: "hidden" } };
  const db = { user: { findUnique: async args => { reads.push({ model: "user", ...args }); return args.where.id === "missing" ? null : target; } },
    $queryRaw: async (first, ...values) => {
      const query = first.sql ? first : Prisma.sql(first, ...values); reads.push({ query });
      if (query.sql.includes('AS active_premium')) return [{ ...restrictionStatus }];
      if (query.sql.includes('FROM pg_tables')) return ["XPMatch", "RankedMatch", "Wager", "TournamentMatch", "ChallengeMatch", "WagerParticipant", "TournamentParticipant"].map(name => ({ name }));
      return query.sql.includes('FROM "EightsStats"') ? [{ metadata: { wins: 5, losses: 3, elo: 9999 }, free_eights_elo: 650 }] : [];
    } };
  for (const model of ["playerProfile", "rankedStats", "xPStats", "eightsStats", "wallet", "walletTransaction", "userInventory"]) db[model] = {
    findFirst: async args => { reads.push({ model, ...args }); return { metadata: { user_id: "player", wins: 4, losses: 2, elo: 1400,
      available_balance: 22, locked_balance: 3, avatar_url: "/new-avatar.webp", registration_ip: "1.2.3.4", password_hash: "hidden" } }; },
    findMany: async args => { reads.push({ model, ...args }); return [{ id: "entry", created_date: new Date("2026-10-01"), metadata: {
      user_id: "player", item_name: "Cool card", item_type: "player_card", quantity: 2, available_balance: 1_000_000, secret: "hidden",
      amount: 5, type: "refund", payment_provider_payload: { card: "secret" } } }]; },
  };
  return { db, reads, target, restrictionStatus };
}

test("dossier refuses ordinary players, invalid identities, and forbidden wallet tabs before reading data", async () => {
  const f = fixture();
  await assert.rejects(getAdminPlayerDossier(f.db, actor("user"), { user_id: "player" }), { status: 403 });
  for (const user_id of [null, {}, " ", "a".repeat(201)]) await assert.rejects(getAdminPlayerDossier(f.db, actor("admin"), { user_id }), { status: 400 });
  await assert.rejects(getAdminPlayerDossier(f.db, actor("admin"), { user_id: "player", section: "sql" }), { status: 400 });
  for (const role of ["moderator", "developer"]) await assert.rejects(getAdminPlayerDossier(f.db, actor(role), { user_id: "player", section: "wallet" }), { status: 403 });
  assert.equal(f.reads.length, 0);
});

test("moderators and developers receive a safe identity and only the requested bounded overview", async () => {
  for (const role of ["moderator", "developer"]) {
    const f = fixture();
    const result = await getAdminPlayerDossier(f.db, actor(role), { user_id: "player" });
    assert.equal(result.player.display_name, "dev"); assert.equal(result.player.username, "topfragg-dev");
    assert.equal(result.player.role, "user", "metadata cannot upgrade a player's role");
    assert.equal(result.player.avatar_url, "/new-avatar.webp");
    for (const field of ["email", "credits", "ban_reason", "wallet_balance", "metadata", "password_hash", "registration_ip"]) assert.equal(Object.hasOwn(result.player, field), false, field);
    assert.deepEqual(result.stats.ranked, { wins: 4, losses: 2, elo: 1400 });
    assert.equal(result.permissions.wallet, false);
    assert.equal(f.reads.length, 6);
    for (const read of f.reads.slice(1)) assert.ok(read.where?.metadata.equals === "player" || read.query?.values.includes("player"));
    assert.equal(result.stats.eights.elo, 650, "canonical free ELO takes precedence over legacy metadata");
    assert.equal(f.reads.some(read => read.model?.startsWith("wallet") || (read.query && !read.query.sql.includes('FROM "EightsStats"') && !read.query.sql.includes('AS active_premium'))), false, "opening a name does not prefetch history or money");
  }
});

test("admins view only the selected player's canonical wallet and last twenty safe transactions", async () => {
  const f = fixture();
  const result = await getAdminPlayerDossier(f.db, actor("admin"), { user_id: "player", section: "wallet" });
  assert.equal(result.player.email, "player@example.test"); assert.equal(result.player.credits, 500);
  assert.equal(result.permissions.wallet, true); assert.equal(result.wallet.available_balance, 22);
  assert.equal(Object.hasOwn(result.wallet, "registration_ip"), false);
  assert.deepEqual(f.reads.find(read => read.model === "wallet").orderBy, [{ created_date: "asc" }, { id: "asc" }]);
  const transactions = f.reads.find(read => read.model === "walletTransaction");
  assert.equal(transactions.where.metadata.equals, "player"); assert.equal(transactions.take, 20);
  assert.equal(result.rows[0].amount, 5); assert.equal(Object.hasOwn(result.rows[0], "payment_provider_payload"), false);
  assert.equal(f.reads.length, 4);
});

test("support and match queries constrain membership, use parameters and never load entire chat metadata", async () => {
  const id = "' OR 1=1 --";
  const f = fixture();
  for (const section of ["support", "matches"]) {
    await getAdminPlayerDossier(f.db, actor("admin"), { user_id: id, section });
    const query = f.reads.at(-1).query;
    assert.ok(query.values.includes(id)); assert.equal(query.sql.includes(id), false);
    assert.match(query.sql, /LIMIT 20/); assert.doesNotMatch(query.sql, /SELECT (metadata(?:\s|,)|\* FROM \"(?:Ticket|Dispute|Wager|XPMatch))/);
    if (section === "support") {
      assert.match(query.sql, /reported_against/);
      assert.match(query.sql, /t\.id = "Dispute"\.metadata->>'ticket_id'/, "linked disputes resolve against the outer dispute, not ticket metadata");
    } else {
      assert.match(query.sql, /team_alpha_player_ids/); assert.match(query.sql, /WagerParticipant/);
      assert.match(query.sql, /FROM "ChallengeMatch"/); assert.match(query.sql, /player1_id/);
    }
  }
});

test("inventory reads are limited and history hides unstructured audit text from moderators", async () => {
  const f = fixture();
  const items = await getAdminPlayerDossier(f.db, actor("moderator"), { user_id: "player", section: "items" });
  const read = f.reads.at(-1);
  assert.equal(read.take, 20); assert.equal(read.where.metadata.equals, "player");
  assert.equal(items.rows[0].item_name, "Cool card"); assert.equal(Object.hasOwn(items.rows[0], "secret"), false);
  await getAdminPlayerDossier(f.db, actor("moderator"), { user_id: "player", section: "history" });
  const query = f.reads.at(-1).query;
  assert.match(query.sql, /''::text AS description/); assert.match(query.sql, /target_user_id/);
  assert.doesNotMatch(query.sql, /metadata->>'description'/);
  await assert.rejects(getAdminPlayerDossier(f.db, actor("admin"), { user_id: "missing" }), { status: 404 });
});

test("uninstalled match sources cannot break the dossier or silently masquerade as empty history", async () => {
  const f = fixture(), read = f.db.$queryRaw;
  f.db.$queryRaw = async (first, ...values) => {
    const query = first.sql ? first : Prisma.sql(first, ...values);
    if (query.sql.includes("FROM pg_tables")) return [{ name: "Wager" }];
    return read(first, ...values);
  };
  const result = await getAdminPlayerDossier(f.db, actor("moderator"), { user_id: "player", section: "matches" });
  assert.deepEqual(result.unavailable_sources, ["XP matches", "Ranked matches", "Tournaments", "Team challenges"]);
  assert.match(f.reads.at(-1).query.sql, /FROM "Wager"/);
  assert.doesNotMatch(f.reads.at(-1).query.sql, /FROM "(?:XPMatch|RankedMatch|TournamentMatch|ChallengeMatch|WagerParticipant)"/);
});

test("dossier uses the same active restrictions and expiry rules as the player directory", async () => {
  const f = fixture();
  f.target.is_banned = true; f.target.is_premium = true;
  f.target.premium_expires = new Date("2020-01-01");
  Object.assign(f.restrictionStatus, { active_ban: false, active_suspension: true, active_premium: false, suspended_until: new Date("2030-01-01") });
  const expired = await getAdminPlayerDossier(f.db, actor("moderator"), { user_id: "player", section: "items" });
  assert.equal(expired.player.active_ban, false, "expired account flags cannot display an active ban");
  assert.equal(expired.player.active_premium, false, "expired premium does not display as current membership");
  assert.equal(expired.player.active_suspension, true);
  assert.equal(expired.player.suspended_until.toISOString(), "2030-01-01T00:00:00.000Z");
  const status = f.reads.find(read => read.query?.sql.includes("AS active_premium")).query;
  assert.ok(status.values.includes("player")); assert.match(status.sql, /FROM "User" u WHERE u\.id = \? LIMIT 1/);
  assert.match(status.sql, /FROM "Ban"/); assert.match(status.sql, /LOWER\(u\.email\)/, "email bans use the same shared predicate");
  assert.match(status.sql, /expires_date/); assert.match(status.sql, /premium_expires > NOW\(\)/);
  assert.match(status.sql, /suspended_until/); assert.doesNotMatch(status.sql, /SELECT \*/);
  f.target.is_banned = false;
  Object.assign(f.restrictionStatus, { active_ban: true, active_suspension: false, active_premium: true });
  const bannedByRecord = await getAdminPlayerDossier(f.db, actor("admin"), { user_id: "player", section: "items" });
  assert.equal(bannedByRecord.player.active_ban, true, "active account or email ban records are visible even without the raw account flag");
  assert.equal(bannedByRecord.player.active_suspension, false); assert.equal(bannedByRecord.player.active_premium, true);
});
