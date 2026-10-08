import test from "node:test";
import assert from "node:assert/strict";
import { discordGuildMembership, discordInviteUrl } from "./discord.js";
import { freeEightsDiscordMembershipJoinError } from "./free-eights-discord.js";
import { isFreeEightsDiscordServerRequired } from "../src/lib/discordCommunity.js";

test("the existing bot verifies membership; outages and wrong-guild errors cannot grant entry", async (t) => {
  const environment = { DISCORD_TOKEN: "fake-token", DISCORD_GUILD_ID: "1555246540027596972" };
  const previous = Object.fromEntries(Object.keys(environment).map((key) => [key, process.env[key]]));
  Object.assign(process.env, environment);
  t.after(() => { for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
  const user = { id: "player", discord_user_id: "200000000000000001", discord_connected_at: new Date() };
  let status = 200, code = 0, calls = 0;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    calls++;
    assert.equal(url, `https://discord.com/api/v10/guilds/${environment.DISCORD_GUILD_ID}/members/${user.discord_user_id}`);
    assert.equal(options.headers.Authorization, "Bot fake-token");
    assert.ok(options.signal);
    return Response.json(status === 200 ? { user: { id: user.discord_user_id } } : { code }, { status });
  });
  assert.equal(discordInviteUrl(), "https://discord.gg/JwSgTHcHXe");
  assert.deepEqual(await discordGuildMembership(user.discord_user_id), { inGuild: true });
  assert.equal(await freeEightsDiscordMembershipJoinError("8s", user), null);
  status = 404; code = 10007;
  assert.deepEqual(await discordGuildMembership(user.discord_user_id), { inGuild: false });
  const missing = await freeEightsDiscordMembershipJoinError("8s", user);
  assert.equal(missing.code, "FREE_EIGHTS_DISCORD_SERVER_REQUIRED");
  assert.equal(missing.action_url, discordInviteUrl());
  assert.equal(isFreeEightsDiscordServerRequired(missing), true);
  for (const [upstreamStatus, upstreamCode] of [[404, 10004], [401, 0], [403, 50001], [429, 0], [500, 0]]) {
    status = upstreamStatus; code = upstreamCode;
    const error = await freeEightsDiscordMembershipJoinError("8s", user);
    assert.equal(error.code, "FREE_EIGHTS_DISCORD_MEMBERSHIP_UNAVAILABLE");
    assert.equal(isFreeEightsDiscordServerRequired({ data: error }), true);
    assert.ok(!JSON.stringify(error).includes(environment.DISCORD_TOKEN));
  }
  const before = calls;
  for (const type of ["money8s", "ranked", "xp", "wagers", "tournament"]) {
    assert.equal(await freeEightsDiscordMembershipJoinError(type, user), null);
  }
  assert.equal(calls, before);
  assert.equal((await freeEightsDiscordMembershipJoinError("8s", { id: "unlinked" })).code, "FREE_EIGHTS_DISCORD_REQUIRED");
  assert.equal(calls, before);
  status = 200;
  assert.equal(await freeEightsDiscordMembershipJoinError("8s", user), null);
  delete process.env.DISCORD_TOKEN;
  assert.equal((await freeEightsDiscordMembershipJoinError("8s", user)).code, "FREE_EIGHTS_DISCORD_MEMBERSHIP_UNAVAILABLE");
});
