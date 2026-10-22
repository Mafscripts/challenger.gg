import test from "node:test";
import assert from "node:assert/strict";
import { categorySpecs } from "./config.js";
import { activateVerificationGate, verificationCard, VERIFICATION_BUTTON_ID } from "./verification-gate.js";

test("onboarding entry channels and general stay public in the managed community configuration", () => {
  const publicChannels = categorySpecs.flatMap((category) => category.channels)
    .filter((channel) => ["chat", "read-only", "voice"].includes(channel.mode));
  assert.deepEqual(publicChannels.map((channel) => channel.key).sort(), ["general", "rules", "verification", "welcome"]);
  const staff = categorySpecs.find((category) => category.key === "staff");
  assert.ok(staff.channels.every((channel) => channel.mode === "staff"));
  assert.equal(categorySpecs.flatMap((category) => category.channels).find((channel) => channel.key === "caster-lounge").mode, "caster-voice");
});

test("the branded verification card explicitly accepts rules and provides a persistent button", () => {
  const card = verificationCard({ rulesChannel: "<#123>", logoUrl: "https://cdn.discordapp.com/icons/123/logo.png" });
  const embed = card.embeds[0].toJSON();
  assert.ok(embed.fields.some((field) => field.value.includes("<#123>")));
  assert.ok(embed.fields.some((field) => field.value.includes("agree to follow")));
  assert.equal(embed.thumbnail.url, "https://cdn.discordapp.com/icons/123/logo.png");
  assert.equal(card.components[0].toJSON().components[0].custom_id, VERIFICATION_BUTTON_ID);
  assert.deepEqual(card.allowedMentions, { parse: [] });
});

test("activation keeps onboarding chat open and preserves custom and private staff access", async () => {
  const edits = [], sent = [];
  const role = { id: "verified", name: "Verified Player", editable: true };
  const everyone = { id: "everyone" };
  const channel = (id, name, publicView = true) => ({
    id, name, type: 0,
    toString: () => `<#${id}>`, isTextBased: () => true,
    permissionsFor: (subject) => ({ has: () => subject === everyone ? publicView : true }),
    permissionOverwrites: { edit: async (subject, permissions) => edits.push({ id, subject: subject.id, permissions }) },
    messages: { fetch: async () => ({ find: () => undefined }) },
    send: async (card) => sent.push({ id, card }), setTopic: async () => {},
  });
  const channels = [channel("welcome", "👋・welcome"), channel("rules", "📜・rules"), channel("verify", "✅・verification"), channel("general", "💬・general"), channel("extra", "custom-public"), channel("lfg", "🔎・looking-for-team"), channel("staff", "staff-chat", false), channel("private", "private-team", false)];
  const cache = new Map(channels.map((item) => [item.id, item]));
  cache.find = (predicate) => [...cache.values()].find(predicate);
  const guild = {
    roles: { fetch: async () => {}, cache: { find: (predicate) => predicate(role) ? role : undefined }, everyone },
    channels: { fetch: async () => {}, cache }, members: { fetchMe: async () => ({ id: "bot" }) },
    client: { user: { id: "bot" } }, iconURL: () => "https://cdn.discordapp.com/icons/123/logo.png",
  };
  await activateVerificationGate(guild);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].id, "verify");
  for (const id of ["welcome", "rules", "verify"]) assert.ok(edits.some((edit) => edit.id === id && edit.subject === "everyone" && edit.permissions.ViewChannel === true));
  assert.ok(edits.some((edit) => edit.id === "general" && edit.subject === "everyone" && edit.permissions.ViewChannel === true && edit.permissions.SendMessages === true));
  assert.ok(!edits.some((edit) => edit.id === "general" && edit.permissions.ViewChannel === false));
  for (const id of ["lfg"]) {
    assert.ok(edits.some((edit) => edit.id === id && edit.subject === "everyone" && edit.permissions.ViewChannel === false));
    assert.ok(edits.some((edit) => edit.id === id && edit.subject === "verified" && edit.permissions.ViewChannel === true));
  }
  assert.ok(!edits.some((edit) => ["extra", "staff", "private"].includes(edit.id)));
});
