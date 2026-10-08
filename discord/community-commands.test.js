import test from "node:test";
import assert from "node:assert/strict";
import { ChannelType, MessageFlags, PermissionFlagsBits as P, PermissionsBitField, SlashCommandBuilder } from "discord.js";
import { communityPayload, createCommunityCommandHandler, parsePollAnswers, parsePollMessage } from "./community-commands.js";
import { communityCommandSpecs, commandApiPayload } from "./community-command-specs.js";
import { registerCommunityCommands } from "./register-community-commands.js";

const guildId = "100000000000000001", channelId = "100000000000000002", messageId = "100000000000000003";
const admin = new PermissionsBitField([P.ManageGuild, P.ViewChannel, P.MentionEveryone]);
const botPermissions = new PermissionsBitField([P.ViewChannel, P.SendMessages, P.SendPolls, P.MentionEveryone]);

function fixture() {
  const state = { time: 0, sent: [], ended: 0, logs: [], memberPermissions: admin, botPermissions, beforeFetch: null };
  const pollMessage = { id: messageId, url: `https://discord.com/channels/${guildId}/${channelId}/${messageId}`, author: { id: "bot" },
    poll: { question: { text: "Which format?" }, resultsFinalized: false, expiresAt: new Date(1000000), end: async () => { state.ended++; pollMessage.poll.resultsFinalized = true; return pollMessage; } } };
  const channel = { id: channelId, guildId, name: "general", type: ChannelType.GuildText,
    permissionsFor: (member) => member.id === "bot" ? state.botPermissions : state.memberPermissions,
    messages: { fetch: async () => pollMessage },
    send: async (payload) => { state.sent.push(payload); return { id: messageId, url: pollMessage.url }; } };
  const guild = { channels: { fetch: async () => { await state.beforeFetch?.(); return channel; } }, members: {
    fetch: async () => ({ id: "admin", permissions: state.memberPermissions }), fetchMe: async () => ({ id: "bot" }),
  } };
  const handler = createCommunityCommandHandler({ guildId, publicUrl: "https://topfragg.gg", findChannel: (_, key) => ({ id: key }), now: () => state.time, log: async (_, text) => state.logs.push(text) });
  const interaction = (kind, values = {}) => ({
    guildId, guild, channel, channelId, user: { id: "admin", username: "Admin" }, client: { user: { id: "bot" } }, memberPermissions: admin,
    deferred: false, replied: false, responses: [], commandName: kind === "slash" ? "announce" : null,
    isChatInputCommand: () => kind === "slash", isModalSubmit: () => kind === "modal", isButton: () => kind === "button",
    options: { getChannel: () => null, getBoolean: () => null, getInteger: () => null, getString: () => messageId },
    fields: { getTextInputValue: (name) => ({ title: "Tournament", message: "Join today!", question: "Which format?", answers: "2v2\n3v3\n4v4", description: "Vote below." })[name] },
    async reply(payload) { this.replied = true; this.responses.push(payload); },
    async deferReply(payload) { this.deferred = true; this.ack = payload; },
    async deferUpdate() { this.deferred = true; },
    async editReply(payload) { this.responses.push(payload); },
    async update(payload) { this.replied = true; this.responses.push(payload); },
    async showModal(modal) { this.replied = true; this.modal = modal.toJSON(); },
    ...values,
  });
  async function draft(command = "announce", options) {
    const slash = interaction("slash", { commandName: command, ...(options ? { options } : {}) });
    assert.equal(await handler(slash), true);
    assert.ok(slash.modal, JSON.stringify(slash.responses));
    const modal = interaction("modal", { customId: slash.modal.custom_id });
    await handler(modal);
    const response = modal.responses.at(-1);
    assert.ok(response.components, JSON.stringify(response));
    const customId = response.components[0].toJSON().components[0].custom_id;
    return { slash, modal, customId, publish: () => interaction("button", { customId }), cancel: () => interaction("button", { customId: customId.replace(":publish:", ":cancel:") }) };
  }
  return { state, handler, interaction, draft, channel, pollMessage };
}

test("poll inputs enforce Discord limits and local-server links", () => {
  assert.deepEqual(parsePollAnswers(" 2v2 \n\n 3v3\r\n4v4"), ["2v2", "3v3", "4v4"]);
  for (const value of ["one", Array(11).fill("A").join("\n"), "A\na", `${"A".repeat(56)}\nB`]) assert.throws(() => parsePollAnswers(value));
  assert.deepEqual(parsePollMessage(messageId, guildId, channelId), { channelId, messageId });
  assert.deepEqual(parsePollMessage(`https://discord.com/channels/${guildId}/${channelId}/${messageId}`, guildId, channelId), { channelId, messageId });
  assert.throws(() => parsePollMessage(`https://discord.com/channels/999999999999999999/${channelId}/${messageId}`, guildId, channelId));
  assert.throws(() => parsePollMessage("https://example.com/123", guildId, channelId));
});

test("announcement stays private until confirmed, then publishes exactly once", async () => {
  const f = fixture(), d = await f.draft();
  assert.equal(f.state.sent.length, 0);
  assert.equal(d.modal.ack.flags, MessageFlags.Ephemeral);
  const button = d.publish();
  await f.handler(button);
  await f.handler(d.publish());
  assert.equal(f.state.sent.length, 1);
  assert.equal(f.state.sent[0].content, "📢 **Tournament**\n\nJoin today!");
  assert.deepEqual(f.state.sent[0].allowedMentions, { parse: [] });
  assert.equal(f.state.logs.length, 1);
  assert.match(button.responses[0].content, /Published/);
});

test("native poll supports duration, multiple choices and explicit everyone ping", async () => {
  const f = fixture(), d = await f.draft("poll", { getChannel: () => null, getBoolean: () => true, getInteger: () => 48 });
  assert.equal(f.state.sent.length, 0);
  assert.ok(d.modal.responses[0].embeds[0].toJSON().fields.some((field) => field.name === "Everyone ping" && field.value.includes("Yes")));
  await f.handler(d.publish());
  assert.deepEqual(f.state.sent[0].poll, { question: { text: "Which format?" }, answers: [{ text: "2v2" }, { text: "3v3" }, { text: "4v4" }], duration: 48, allowMultiselect: true });
  assert.deepEqual(f.state.sent[0].allowedMentions, { parse: ["everyone"] });
  assert.match(f.state.sent[0].content, /^@everyone/);
});

test("typing mentions cannot bypass explicit everyone choice or ping roles/users", () => {
  const base = { id: "12345678-1234-1234-1234-123456789abc", kind: "announce", title: "", message: "@everyone <@123> <@&456>" };
  assert.deepEqual(communityPayload(base).allowedMentions.parse, []);
  assert.deepEqual(communityPayload({ ...base, everyone: true }).allowedMentions.parse, ["everyone"]);
  assert.equal(communityPayload(base).nonce.length, 24);
  assert.equal(communityPayload(base).enforceNonce, true);
});

test("ordinary members, other owners and expired previews cannot publish", async () => {
  const f = fixture();
  const nonAdmin = f.interaction("slash", { memberPermissions: new PermissionsBitField() });
  await f.handler(nonAdmin); assert.match(nonAdmin.responses[0].content, /Only admins/); assert.equal(nonAdmin.modal, undefined);
  const d = await f.draft(), stranger = d.publish(); stranger.user = { id: "other" };
  await f.handler(stranger); assert.match(stranger.responses[0].content, /Only the admin/);
  f.state.time = 600001;
  const expired = d.publish(); await f.handler(expired); assert.match(expired.responses[0].content, /expired/);
  assert.equal(f.state.sent.length, 0);
});

test("publication rechecks admin privileges after preview", async () => {
  const f = fixture(), d = await f.draft();
  f.state.memberPermissions = new PermissionsBitField([P.ViewChannel]);
  const button = d.publish(); await f.handler(button);
  assert.equal(f.state.sent.length, 0); assert.match(button.responses[0].content, /Only admins/);
});

test("bot poll and everyone permissions are checked before publication", async () => {
  for (const [command, missing, expected] of [["poll", P.SendPolls, /Create Polls/], ["announce", P.MentionEveryone, /Mention Everyone/]]) {
    const f = fixture(), d = await f.draft(command, { getChannel: () => null, getInteger: () => null, getBoolean: (name) => name === "everyone" });
    f.state.botPermissions = new PermissionsBitField(botPermissions.bitfield).remove(missing);
    const button = d.publish(); await f.handler(button);
    assert.equal(f.state.sent.length, 0); assert.match(button.responses[0].content, expected);
  }
});

test("concurrent confirm clicks send once", async () => {
  const f = fixture(), d = await f.draft();
  await Promise.all([f.handler(d.publish()), f.handler(d.publish())]);
  assert.equal(f.state.sent.length, 1);
});

test("cancel prevents publication, including a confirm already checking permissions", async () => {
  const f = fixture(), d = await f.draft();
  let entered, release;
  const started = new Promise((resolve) => { entered = resolve; });
  const pending = new Promise((resolve) => { release = resolve; });
  f.state.beforeFetch = async () => { entered(); await pending; };
  const publish = f.handler(d.publish()); await started;
  await f.handler(d.cancel()); release(); await publish;
  await f.handler(d.publish()); assert.equal(f.state.sent.length, 0);
});

test("send failures are not retried by another confirm", async () => {
  const f = fixture(), d = await f.draft(); let attempts = 0;
  f.channel.send = async () => { attempts++; throw new Error("Connection lost"); };
  await f.handler(d.publish()); const again = d.publish(); await f.handler(again);
  assert.equal(attempts, 1); assert.match(again.responses[0].content, /Check the destination/);
});

test("poll-end previews first, ends own bot poll once and rejects foreign polls", async () => {
  const f = fixture(), slash = f.interaction("slash", { commandName: "poll-end" });
  await f.handler(slash); assert.equal(f.state.ended, 0);
  const customId = slash.responses[0].components[0].toJSON().components[0].custom_id;
  await f.handler(f.interaction("button", { customId }));
  await f.handler(f.interaction("button", { customId }));
  assert.equal(f.state.ended, 1); assert.equal(f.state.sent.length, 0);
  f.pollMessage.author.id = "another-bot";
  const foreign = f.interaction("slash", { commandName: "poll-end" }); await f.handler(foreign);
  assert.match(foreign.responses[0].content, /posted by Topfragg Bot/);
});

test("help and player shortcuts are private, with admin commands shown to admins", async () => {
  const f = fixture();
  for (const commandName of ["help", "rules", "8s", "streams"]) {
    const interaction = f.interaction("slash", { commandName, memberPermissions: new PermissionsBitField() });
    await f.handler(interaction); assert.equal(interaction.responses[0].flags, MessageFlags.Ephemeral);
    if (commandName === "help") assert.equal(interaction.responses[0].embeds[0].toJSON().fields.length, 1);
    if (commandName === "streams") assert.match(interaction.responses[0].content, /live-now/);
  }
  const help = f.interaction("slash", { commandName: "help" }); await f.handler(help);
  assert.equal(help.responses[0].embeds[0].toJSON().fields.length, 2);
  assert.equal(f.state.sent.length, 0);
});

test("unrelated support/giveaway interactions are left to existing handlers", async () => {
  const f = fixture();
  for (const interaction of [f.interaction("slash", { commandName: "giveaway" }), f.interaction("button", { customId: "topfragg:support:open" }), f.interaction("modal", { customId: "topfragg:clip:form" })]) {
    assert.equal(await f.handler(interaction), false); assert.equal(interaction.responses.length, 0);
  }
  const elsewhere = f.interaction("slash", { guildId: "elsewhere" }); await f.handler(elsewhere);
  assert.match(elsewhere.responses[0].content, /Topfragg server/);
});

test("registration upserts seven guild commands, preserving unrelated commands", async () => {
  const calls = [];
  const names = await registerCommunityCommands({ rest: { post: async (path, data) => calls.push({ path, body: data.body }) }, applicationId: "bot", guildId });
  assert.deepEqual(names, ["help", "rules", "8s", "streams", "announce", "poll", "poll-end"]);
  assert.ok(calls.every((call) => call.path === `/applications/bot/guilds/${guildId}/commands`));
  for (const spec of communityCommandSpecs) {
    const payload = commandApiPayload(spec);
    // discord.js's builder validates the exact REST data shape and constraints.
    const builder = new SlashCommandBuilder().setName(payload.name).setDescription(payload.description);
    if (payload.default_member_permissions) builder.setDefaultMemberPermissions(BigInt(payload.default_member_permissions));
    for (const option of spec.options || []) {
      const common = (value) => value.setName(option.name).setDescription(option.description).setRequired(Boolean(option.required));
      if (option.type === 7) builder.addChannelOption((value) => common(value).addChannelTypes(...option.channelTypes));
      if (option.type === 5) builder.addBooleanOption(common);
      if (option.type === 4) builder.addIntegerOption((value) => common(value).setMinValue(option.minValue).setMaxValue(option.maxValue));
      if (option.type === 3) builder.addStringOption((value) => common(value).setMaxLength(option.maxLength));
    }
    const validated = JSON.parse(JSON.stringify(builder.toJSON()));
    assert.equal(validated.name, payload.name);
    assert.equal(validated.default_member_permissions, payload.default_member_permissions);
    assert.deepEqual(validated.options, payload.options || []);
  }
});
