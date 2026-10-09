import crypto from "node:crypto";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, EmbedBuilder, MessageFlags, ModalBuilder, PermissionFlagsBits, TextInputBuilder, TextInputStyle } from "discord.js";
import { TOPFRAGG_COLORS } from "./config.js";
import { playerJokePayload } from "./player-jokes.js";

const prefix = "topfragg:community:";
const draftLifetime = 10 * 60_000;
const privateReply = (content) => ({ content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
const has = (permissions, permission) => Boolean(permissions?.has(permission));
const isAdmin = (member) => has(member?.permissions, PermissionFlagsBits.ManageGuild);
const textChannel = (channel) => [ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel?.type);
const field = (id, label, style, length, required = true) => new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setMaxLength(length).setRequired(required));
const controls = (id, ending = false) => new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId(`${prefix}publish:${id}`).setLabel(ending ? "End poll" : "Publish").setStyle(ending ? ButtonStyle.Danger : ButtonStyle.Success),
  new ButtonBuilder().setCustomId(`${prefix}cancel:${id}`).setLabel("Cancel").setStyle(ButtonStyle.Secondary),
);

export function parsePollAnswers(value) {
  const answers = String(value || "").split(/\r?\n/).map((answer) => answer.trim()).filter(Boolean);
  if (answers.length < 2 || answers.length > 10) throw new Error("Enter 2–10 answers, one answer per line.");
  if (answers.some((answer) => answer.length > 55)) throw new Error("Each poll answer must be at most 55 characters.");
  if (new Set(answers.map((answer) => answer.toLowerCase())).size !== answers.length) throw new Error("Use a different answer on each line.");
  return answers;
}

export function parsePollMessage(value, guildId, channelId) {
  if (/^\d{17,20}$/.test(value)) return { channelId, messageId: value };
  const link = String(value || "").match(/^https:\/\/(?:www\.)?(?:discord\.com|discordapp\.com)\/channels\/(\d{17,20})\/(\d{17,20})\/(\d{17,20})$/);
  if (!link || link[1] !== guildId) throw new Error("Use a message ID or a Discord message link from this server.");
  return { channelId: link[2], messageId: link[3] };
}

export function communityPayload(draft) {
  const ping = draft.everyone ? "@everyone\n\n" : "";
  const common = { allowedMentions: { parse: draft.everyone ? ["everyone"] : [] }, nonce: draft.id.replaceAll("-", "").slice(0, 24), enforceNonce: true };
  if (draft.kind === "announce") return { ...common, content: `${ping}${draft.title ? `📢 **${draft.title}**\n\n` : ""}${draft.message}` };
  return { ...common, content: `${ping}📊 **Community poll**${draft.description ? `\n${draft.description}` : ""}`, poll: { question: { text: draft.question }, answers: draft.answers.map((text) => ({ text })), duration: draft.hours, allowMultiselect: draft.multiple } };
}

function preview(draft) {
  const embed = new EmbedBuilder().setColor(TOPFRAGG_COLORS.orange).setTitle(draft.kind === "poll-end" ? "⏹️ End poll preview" : "👀 Private preview")
    .setFooter({ text: "This preview expires in 10 minutes. Nothing is published until you confirm." });
  if (draft.kind === "announce") embed.setDescription(communityPayload({ ...draft, everyone: false }).content);
  else if (draft.kind === "poll") embed.setDescription(`**${draft.question}**\n\n${draft.answers.map((answer, index) => `${index + 1}. ${answer}`).join("\n")}${draft.description ? `\n\n${draft.description}` : ""}`)
    .addFields({ name: "Voting", value: `${draft.hours} hours · ${draft.multiple ? "Multiple choices" : "One choice per member"}` });
  else embed.setDescription(`End **${draft.question}** early?\n[View poll](${draft.messageUrl})`);
  embed.addFields({ name: "Destination", value: `<#${draft.channelId}>`, inline: true }, { name: "Everyone ping", value: draft.everyone ? "Yes — @everyone" : "No", inline: true });
  return { embeds: [embed], components: [controls(draft.id, draft.kind === "poll-end")], allowedMentions: { parse: [] } };
}

export function createCommunityCommandHandler({ guildId, publicUrl, findChannel, log = async () => {}, now = Date.now }) {
  const drafts = new Map();
  const funCooldowns = new Map();
  const remember = (interaction, data) => {
    for (const [id, draft] of drafts) if (draft.expires <= now() && draft.status !== "publishing") drafts.delete(id);
    if (drafts.size >= 500) throw new Error("Too many previews are open. Try again in a few minutes.");
    const draft = { ...data, id: crypto.randomUUID(), ownerId: interaction.user.id, guildId, expires: now() + draftLifetime, status: "editing" };
    drafts.set(draft.id, draft); return draft;
  };
  const ownedDraft = (interaction, id) => {
    const draft = drafts.get(id);
    if (!draft || draft.expires <= now()) throw new Error("This preview expired or the bot restarted. Run the command again.");
    if (draft.ownerId !== interaction.user.id || draft.guildId !== interaction.guildId) throw new Error("Only the admin who created this preview can confirm it.");
    return draft;
  };
  const destination = async (interaction, draft) => {
    const [channel, member, bot] = await Promise.all([
      interaction.guild.channels.fetch(draft.channelId), interaction.guild.members.fetch({ user: interaction.user.id, force: true }), interaction.guild.members.fetchMe({ force: true }),
    ]);
    if (!isAdmin(member)) throw new Error("Only admins with Manage Server permission can use this command.");
    if (!textChannel(channel) || channel.guildId !== guildId || (draft.kind === "poll" && channel.type !== ChannelType.GuildText)) throw new Error("Choose a text channel in this server. Polls need a regular text channel.");
    const memberPermissions = channel.permissionsFor(member), botPermissions = channel.permissionsFor(bot);
    if (!has(memberPermissions, PermissionFlagsBits.ViewChannel)) throw new Error("You cannot view the selected channel.");
    for (const permission of [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]) if (!has(botPermissions, permission)) throw new Error("The bot needs View Channel and Send Messages in the selected channel.");
    if (draft.kind === "poll" && !has(botPermissions, PermissionFlagsBits.SendPolls)) throw new Error("Enable Create Polls for Topfragg Bot in the selected channel.");
    if (draft.everyone && (!has(memberPermissions, PermissionFlagsBits.MentionEveryone) || !has(botPermissions, PermissionFlagsBits.MentionEveryone))) throw new Error("Both you and Topfragg Bot need Mention Everyone permission in the selected channel.");
    return channel;
  };
  const help = (interaction) => new EmbedBuilder().setColor(TOPFRAGG_COLORS.cyan).setTitle("🤖 Topfragg Bot commands")
    .setDescription("Info replies and draft previews are private. Fun commands appear in the channel.")
    .addFields({ name: "🎮 Players", value: "`/8s` — Free 8s\n`/tournaments` — Tournament signups\n`/streams` — Stream channels\n`/rules` — Server rules\n`/verify` — Restore your automatic community role\n`/support` — Open a ticket\n`/ping` — Bot status\n`/autobots` — Autobots, roll out!\n`/retard username:@player` — Random gaming roast" },
      ...(has(interaction.memberPermissions, PermissionFlagsBits.ManageGuild) ? [{ name: "🛡️ Admins", value: "`/announce` — Announcement with private preview\n`/poll` — Poll with private preview\n`/poll-end` — End a bot poll early\n`/giveaway start` / `/giveaway end` — Giveaways\n`/setup-status` — Check server setup\nChoose `everyone:true` only when you want an everyone ping." }] : []));

  return async (interaction) => {
    const command = interaction.isChatInputCommand?.() ? interaction.commandName : null;
    const managed = ["help", "rules", "8s", "streams", "autobots", "retard", "announce", "poll", "poll-end"].includes(command) || String(interaction.customId || "").startsWith(prefix);
    if (!managed) return false;
    if (interaction.guildId !== guildId) { await interaction.reply(privateReply("Use this command in the Topfragg server.")); return true; }
    try {
      if (command === "help") { await interaction.reply({ ...privateReply(""), embeds: [help(interaction)] }); return true; }
      if (command === "autobots" || command === "retard") {
        const currentTime = now();
        for (const [id, until] of funCooldowns) if (until <= currentTime) funCooldowns.delete(id);
        const cooldownKey = `${command}:${interaction.user.id}`;
        const until = funCooldowns.get(cooldownKey);
        if (until) { await interaction.reply(privateReply(`Wait ${Math.ceil((until - currentTime) / 1000)} seconds before using /${command} again.`)); return true; }
        const payload = command === "autobots"
          ? { content: "🤖🚗 **Autobots, roll out!** 😂🤣🔥", allowedMentions: { parse: [] } }
          : playerJokePayload(interaction.options.getUser("username", true).id);
        funCooldowns.set(cooldownKey, currentTime + 30_000);
        await interaction.reply(payload); return true;
      }
      if (["rules", "8s", "streams"].includes(command)) {
        const channel = findChannel(interaction.guild, command === "rules" ? "rules" : "live-now");
        const content = command === "8s" ? `🎮 **Free 8s**\nJoin a lobby: ${publicUrl}/ranked/8s\nChoose your game rank in Settings, link Discord and join your lobby's waiting room.`
          : command === "rules" ? `📜 **Topfragg rules**\n${channel ? `Read the server rules in <#${channel.id}>.\n` : ""}Competition rules: ${publicUrl}/rules`
            : `📺 **Community streams**\n${channel ? `Find live streams in <#${channel.id}>.\n` : ""}Browse tournaments and follow live coverage: ${publicUrl}/tournaments`;
        await interaction.reply(privateReply(content)); return true;
      }
      if (!has(interaction.memberPermissions, PermissionFlagsBits.ManageGuild)) throw new Error("Only admins with Manage Server permission can use this command.");
      if (command === "announce" || command === "poll") {
        const channel = interaction.options.getChannel("channel") || interaction.channel;
        if (!textChannel(channel) || channel.guildId !== guildId || (command === "poll" && channel.type !== ChannelType.GuildText)) throw new Error("Choose a text channel in this server. Polls need a regular text channel.");
        const hours = command === "poll" ? interaction.options.getInteger("hours") ?? 24 : null;
        if (command === "poll" && (!Number.isInteger(hours) || hours < 1 || hours > 768)) throw new Error("Poll duration must be 1–768 hours.");
        const draft = remember(interaction, { kind: command, channelId: channel.id, everyone: interaction.options.getBoolean("everyone") === true, hours, multiple: command === "poll" && interaction.options.getBoolean("multiple") === true });
        const modal = new ModalBuilder().setCustomId(`${prefix}form:${draft.id}`).setTitle(command === "announce" ? "Write announcement" : "Create community poll");
        if (command === "announce") modal.addComponents(field("title", "Title (optional)", TextInputStyle.Short, 100, false), field("message", "Announcement message", TextInputStyle.Paragraph, 1850));
        else modal.addComponents(field("question", "Poll question", TextInputStyle.Short, 300), field("answers", "Answers — one per line (2–10 answers)", TextInputStyle.Paragraph, 600), field("description", "Introduction (optional)", TextInputStyle.Paragraph, 1000, false));
        await interaction.showModal(modal); return true;
      }
      if (command === "poll-end") {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const ids = parsePollMessage(interaction.options.getString("message", true), guildId, interaction.options.getChannel("channel")?.id || interaction.channelId);
        const draft = remember(interaction, { kind: command, channelId: ids.channelId, messageId: ids.messageId, everyone: false });
        const channel = await destination(interaction, draft);
        const message = await channel.messages.fetch(draft.messageId);
        if (message.author?.id !== interaction.client.user.id || !message.poll) throw new Error("Choose a poll posted by Topfragg Bot.");
        if (message.poll.resultsFinalized || (message.poll.expiresAt && +message.poll.expiresAt <= now())) throw new Error("This poll has already ended.");
        Object.assign(draft, { question: message.poll.question.text, messageUrl: message.url, status: "ready" });
        await interaction.editReply(preview(draft)); return true;
      }
      const [, action, id] = interaction.customId.slice("topfragg:".length).split(":");
      const draft = ownedDraft(interaction, id);
      if (interaction.isModalSubmit?.() && action === "form") {
        if (draft.status !== "editing") throw new Error("This form has already been submitted.");
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        if (draft.status !== "editing") throw new Error("This form has already been submitted.");
        draft.status = "validating";
        if (draft.kind === "announce") {
          draft.title = interaction.fields.getTextInputValue("title").trim(); draft.message = interaction.fields.getTextInputValue("message").trim();
          if (!draft.message || draft.title.length > 100 || draft.message.length > 1850 || communityPayload(draft).content.length > 2000) throw new Error("Use a message of 1–1850 characters and a title up to 100 characters.");
        } else {
          draft.question = interaction.fields.getTextInputValue("question").trim(); draft.answers = parsePollAnswers(interaction.fields.getTextInputValue("answers")); draft.description = interaction.fields.getTextInputValue("description").trim();
          if (!draft.question || draft.question.length > 300 || draft.description.length > 1000) throw new Error("Use a question of 1–300 characters and an introduction up to 1000 characters.");
        }
        await destination(interaction, draft);
        if (draft.status !== "validating") throw new Error("This preview was cancelled.");
        draft.status = "ready"; await interaction.editReply(preview(draft)); return true;
      }
      if (interaction.isButton?.() && action === "cancel") {
        if (draft.status === "publishing" || draft.status === "published") throw new Error("This preview has already been confirmed.");
        draft.status = "cancelled"; drafts.delete(draft.id); await interaction.update({ content: "Cancelled. Nothing was posted or changed.", embeds: [], components: [], allowedMentions: { parse: [] } }); return true;
      }
      if (interaction.isButton?.() && action === "publish") {
        if (draft.status !== "ready") throw new Error(draft.status === "failed" ? "Publication could not be confirmed. Check the destination channel before creating another preview." : "This preview has already been confirmed or is not ready.");
        await interaction.deferUpdate();
        const channel = await destination(interaction, draft);
        if (draft.status !== "ready") throw new Error("This preview has already been confirmed.");
        draft.status = "publishing";
        let message;
        try {
          if (draft.kind === "poll-end") {
            message = await channel.messages.fetch(draft.messageId);
            if (message.author?.id !== interaction.client.user.id || !message.poll) throw new Error("This message is no longer a Topfragg Bot poll.");
            if (!message.poll.resultsFinalized && (!message.poll.expiresAt || +message.poll.expiresAt > now())) message = await message.poll.end();
          } else message = await channel.send(communityPayload(draft));
        } catch (error) { draft.status = "failed"; throw error; }
        draft.status = "published";
        await interaction.editReply({ content: `${draft.kind === "poll-end" ? "⏹️ Poll ended" : "✅ Published"}: ${message.url}`, embeds: [], components: [], allowedMentions: { parse: [] } });
        await log(interaction.guild, `${interaction.user.tag || interaction.user.username} used /${draft.kind} in #${channel.name} (${message.id}); everyone=${draft.everyone}.`).catch(() => {});
        return true;
      }
      throw new Error("This preview is no longer valid. Run the command again.");
    } catch (error) {
      const message = [50001, 50013].includes(error.code) ? "The bot is missing access or permissions in that channel. Check its channel permissions, then create a new preview." : error.message || "Could not complete this command.";
      if (interaction.deferred || interaction.replied) await interaction.editReply({ content: message, embeds: [], components: [], allowedMentions: { parse: [] } });
      else await interaction.reply(privateReply(message));
      return true;
    }
  };
}
