import "dotenv/config";
import {
  ActionRowBuilder,
  ActivityType,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import {
  categorySpecs,
  discordEnvironment,
  roleSpecs,
  selfAssignableRoleNames,
  staffRoleNames,
  TOPFRAGG_COLORS,
} from "./config.js";
import { prisma } from "../server/prisma.js";
import { syncTournamentDiscord } from "./announcements.js";
import { syncManagedDiscordRoles } from "./managed-roles.js";
import { closeExpiredGiveaways, endGiveaway, enterGiveaway, startGiveaway } from "./giveaways.js";
import { syncTwitchLiveStreams } from "./streams.js";

const config = discordEnvironment();
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});
let tournamentSyncRunning = false;
const recentPublicMessages = new Map();
const publicChatKeys = ["general", "looking-for-team", "clips-and-content", "off-topic", "tournament-signups"];
const spamPhrases = [/discord\.gift/i, /free\s+nitro/i, /claim\s+(your\s+)?airdrop/i, /send\s+(me\s+)?(your\s+)?token/i];

const ephemeral = (content) => ({ content, flags: MessageFlags.Ephemeral });

const matchesSpecName = (actualName, spec) => (
  actualName === spec.name || (spec.legacyNames || []).includes(actualName)
);

function findConfiguredChannel(guild, key) {
  const spec = categorySpecs.flatMap((category) => category.channels).find((channel) => channel.key === key);
  if (!spec) return null;
  if (key === "member-count") {
    return guild.channels.cache.find((channel) => /^👥・members[-:]\s*[\d,]+$/u.test(channel.name));
  }
  return guild.channels.cache.find((channel) => matchesSpecName(channel.name, spec));
}

function findConfiguredCategory(guild, key) {
  const spec = categorySpecs.find((category) => category.key === key);
  return spec && guild.channels.cache.find((channel) => (
    channel.type === ChannelType.GuildCategory && matchesSpecName(channel.name, spec)
  ));
}

async function botLog(guild, message) {
  const channel = findConfiguredChannel(guild, "bot-log");
  if (channel) await channel.send({ content: message, allowedMentions: { parse: [] } }).catch(() => null);
}

async function syncMemberCount(guild) {
  const channel = findConfiguredChannel(guild, "member-count");
  if (!channel) return;
  const desiredName = `👥・members-${Number(guild.memberCount || 0).toLocaleString("en-US")}`;
  if (channel.name === desiredName) return;
  await channel.setName(desiredName, "Keep Topfragg member counter current");
  process.stdout.write(`[Topfragg Discord] Updated member counter: ${desiredName}\n`);
}

async function runTournamentDiscordSync(guild) {
  if (tournamentSyncRunning) return;
  tournamentSyncRunning = true;
  try {
    await guild.channels.fetch();
    await syncTournamentDiscord(guild, client, {
      publicUrl: config.publicUrl,
      findChannel: findConfiguredChannel,
      log: (message) => process.stdout.write(`[Topfragg Discord] ${message}\n`),
    });
    await syncManagedDiscordRoles(
      guild,
      (message) => process.stdout.write(`[Topfragg Discord] ${message}\n`),
    );
    await closeExpiredGiveaways(
      guild,
      (message) => process.stdout.write(`[Topfragg Discord] ${message}\n`),
    );
    await syncTwitchLiveStreams(
      guild,
      findConfiguredChannel,
      (message) => process.stdout.write(`[Topfragg Discord] ${message}\n`),
    );
  } catch (error) {
    console.error("[Topfragg Discord] Tournament synchronization failed:", error);
    await botLog(guild, "Tournament synchronization failed. Check the Topfragg Discord bot logs.");
  } finally {
    tournamentSyncRunning = false;
  }
}

function isStaffMember(member) {
  return staffRoleNames.some((name) => member?.roles?.cache?.some((role) => role.name === name));
}

function ticketOwnerId(channel) {
  return String(channel?.topic || "").match(/Topfragg ticket owner:(\d+)/)?.[1] || null;
}

function ticketControls({ closed = false } = {}) {
  const controls = [
    new ButtonBuilder()
      .setCustomId("topfragg:support:close")
      .setLabel(closed ? "Ticket closed" : "Close ticket")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(closed),
    new ButtonBuilder()
      .setCustomId("topfragg:support:transcript")
      .setLabel("Download transcript")
      .setStyle(ButtonStyle.Primary),
  ];
  if (closed) {
    controls.splice(1, 0, new ButtonBuilder()
      .setCustomId("topfragg:support:reopen")
      .setLabel("Reopen ticket")
      .setStyle(ButtonStyle.Success));
    controls.push(new ButtonBuilder()
      .setCustomId("topfragg:support:delete")
      .setLabel("Delete ticket")
      .setStyle(ButtonStyle.Danger));
  }
  return new ActionRowBuilder().addComponents(controls);
}

function escapeTranscriptHtml(value) {
  return String(value || "").replace(/[&<>\"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
  })[character]);
}

function ticketMessageText(message) {
  const parts = [message.content];
  for (const embed of message.embeds) {
    if (embed.title) parts.push(embed.title);
    if (embed.description) parts.push(embed.description);
    for (const field of embed.fields || []) parts.push(`${field.name}: ${field.value}`);
  }
  return parts.filter(Boolean).join("\n\n");
}

async function buildTicketTranscript(channel) {
  const messages = [];
  let before;
  while (messages.length < 1_000) {
    const batch = await channel.messages.fetch({ limit: 100, before });
    const batchMessages = [...batch.values()];
    messages.push(...batchMessages);
    if (batch.size < 100) break;
    before = batchMessages.at(-1)?.id;
    if (!before) break;
  }

  messages.sort((left, right) => left.createdTimestamp - right.createdTimestamp);
  const entries = messages.map((message) => {
    const name = message.member?.displayName || message.author?.username || "Unknown user";
    const body = escapeTranscriptHtml(ticketMessageText(message)).replace(/\n/g, "<br>");
    const attachments = [...message.attachments.values()]
      .map((attachment) => `<li><a href="${escapeTranscriptHtml(attachment.url)}">${escapeTranscriptHtml(attachment.name || "Attachment")}</a></li>`)
      .join("");
    return `<article><header><strong>${escapeTranscriptHtml(name)}</strong><time>${escapeTranscriptHtml(new Date(message.createdTimestamp).toISOString())}</time></header>${body ? `<p>${body}</p>` : ""}${attachments ? `<ul>${attachments}</ul>` : ""}</article>`;
  }).join("\n");

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeTranscriptHtml(channel.name)} transcript</title><style>body{margin:0;background:#0b111b;color:#e7edf7;font-family:Arial,sans-serif}main{max-width:900px;margin:0 auto;padding:36px 20px}h1{margin:0;color:#20d7ff;font-size:26px}p.meta{color:#96a4b7;margin:8px 0 24px}article{background:#182231;border:1px solid #314053;border-radius:10px;padding:14px 16px;margin:12px 0}header{display:flex;gap:12px;align-items:center;color:#fff}time{margin-left:auto;color:#96a4b7;font-size:12px}p{line-height:1.55;overflow-wrap:anywhere}a{color:#20d7ff}ul{padding-left:18px}</style></head><body><main><h1>Topfragg ticket transcript</h1><p class="meta">#${escapeTranscriptHtml(channel.name)} · ${messages.length} messages · exported ${escapeTranscriptHtml(new Date().toISOString())}</p>${entries || "<p>No messages were found in this ticket.</p>"}</main></body></html>`;
}

function canManageTicket(interaction) {
  const ownerId = ticketOwnerId(interaction.channel);
  return Boolean(ownerId) && (ownerId === interaction.user.id || isStaffMember(interaction.member));
}

function isPublicChatChannel(guild, channel) {
  return publicChatKeys.some((key) => findConfiguredChannel(guild, key)?.id === channel.id);
}

async function removeSpamMessage(message, reason) {
  await message.delete().catch(() => null);
  const warning = await message.channel.send({
    content: `<@${message.author.id}> ${reason}`,
    allowedMentions: { users: [message.author.id] },
  }).catch(() => null);
  if (warning) setTimeout(() => warning.delete().catch(() => null), 10_000);
  await botLog(message.guild, `Anti-spam removed a message from ${message.author.tag}: ${reason}`);
}

async function createSupportTicket(interaction, { subject, reason }) {
  const guild = interaction.guild;
  const suffix = interaction.user.id.slice(-6);
  const existing = guild.channels.cache.find((channel) => (
    ticketOwnerId(channel) === interaction.user.id && !String(channel.topic || "").includes("status:closed")
  ));
  if (existing) {
    await interaction.reply(ephemeral(`You already have an open ticket: ${existing}`));
    return;
  }

  const supportCategory = findConfiguredCategory(guild, "support");
  if (!supportCategory) {
    await interaction.reply(ephemeral("The support category has not been configured yet. Ask an admin to run the Discord setup."));
    return;
  }

  const botMember = guild.members.me;
  if (!botMember?.permissions.has(PermissionFlagsBits.ManageChannels)) {
    await interaction.reply(ephemeral("Topfragg Bot needs the Manage Channels permission before it can create private support tickets."));
    return;
  }
  const staffRoles = staffRoleNames
    .map((name) => guild.roles.cache.find((role) => role.name === name)?.id)
    .filter(Boolean);
  const channel = await guild.channels.create({
    name: `ticket-${interaction.user.username}-${suffix}`.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 90),
    type: ChannelType.GuildText,
    parent: supportCategory.id,
    topic: `Topfragg ticket owner:${interaction.user.id}`,
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      {
        id: client.user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.EmbedLinks,
          PermissionFlagsBits.ManageChannels,
          PermissionFlagsBits.ManageMessages,
        ],
      },
      {
        id: interaction.user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.AttachFiles,
        ],
      },
      ...staffRoles.map((id) => ({
        id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ManageMessages,
        ],
      })),
    ],
    reason: `Support ticket opened by ${interaction.user.tag}`,
  });

  await channel.send({
    content: `<@${interaction.user.id}>`,
    embeds: [
      new EmbedBuilder()
        .setColor(TOPFRAGG_COLORS.purple)
        .setTitle(subject || "Topfragg Support Ticket")
        .setDescription(reason)
        .addFields({ name: "Opened by", value: interaction.user.tag, inline: true })
        .setTimestamp(),
    ],
    components: [ticketControls()],
    allowedMentions: { users: [interaction.user.id] },
  });
  await interaction.reply(ephemeral(`Your private support ticket is ready: ${channel}`));
  await botLog(guild, `Support ticket ${channel.name} opened by ${interaction.user.tag}.`);
}

async function addControlsToExistingTickets(guild) {
  const ticketChannels = guild.channels.cache.filter((channel) => (
    channel.type === ChannelType.GuildText && Boolean(ticketOwnerId(channel))
  ));
  for (const channel of ticketChannels.values()) {
    const recentMessages = await channel.messages.fetch({ limit: 100 }).catch(() => null);
    if (!recentMessages) continue;
    const hasTicketControls = recentMessages.some((message) => (
      message.author?.id === client.user?.id
      && message.components.some((row) => row.components.some((component) => (
        String(component.customId || "").startsWith("topfragg:support:")
      )))
    ));
    if (hasTicketControls) continue;

    const closed = String(channel.topic || "").includes("status:closed");
    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(closed ? TOPFRAGG_COLORS.orange : TOPFRAGG_COLORS.cyan)
          .setTitle("Ticket management")
          .setDescription(closed
            ? "This archived ticket can be reopened or exported below."
            : "Use these controls to close this ticket or download a transcript whenever needed.")
          .setTimestamp(),
      ],
      components: [ticketControls({ closed })],
    }).catch(() => null);
  }
}

function supportModal(kind = "general") {
  const details = {
    account: { title: "Account support", subject: "Account support", placeholder: "Login, verification or profile question" },
    tournament: { title: "Tournament or match support", subject: "Tournament / match support", placeholder: "Tournament name, teams, match time or result" },
    payment: { title: "Payment or prize support", subject: "Payment / prize support", placeholder: "Order, payment, prize or withdrawal question" },
    general: { title: "Open a support ticket", subject: "Topfragg Support Ticket", placeholder: "Account, tournament, match or player report" },
  }[kind] || { title: "Open a support ticket", subject: "Topfragg Support Ticket", placeholder: "Explain what you need help with" };
  return new ModalBuilder()
    .setCustomId(`topfragg:support:form:${kind}`)
    .setTitle(details.title)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("support_subject")
          .setLabel("What do you need help with?")
          .setPlaceholder(details.placeholder)
          .setStyle(TextInputStyle.Short)
          .setMaxLength(80)
          .setRequired(true),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("support_details")
          .setLabel("Explain your question or problem")
          .setPlaceholder("Include the relevant details so staff can help quickly.")
          .setStyle(TextInputStyle.Paragraph)
          .setMinLength(10)
          .setMaxLength(1000)
          .setRequired(true),
      ),
    );
}

function isPublicHttpsUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    return url.protocol === "https:" && Boolean(url.hostname) && url.hostname !== "localhost";
  } catch {
    return false;
  }
}

async function publishHighlight(interaction) {
  const verifiedRole = interaction.guild.roles.cache.find((role) => role.name === "Verified Player");
  if (!verifiedRole || !interaction.member.roles.cache.has(verifiedRole.id)) {
    await interaction.reply(ephemeral("Verify your Topfragg identity before posting highlights."));
    return;
  }
  const title = interaction.fields.getTextInputValue("clip_title").trim();
  const link = interaction.fields.getTextInputValue("clip_link").trim();
  const description = interaction.fields.getTextInputValue("clip_description").trim();
  if (!isPublicHttpsUrl(link)) {
    await interaction.reply(ephemeral("Use a valid HTTPS link from Twitch, YouTube, TikTok or another public clip page."));
    return;
  }
  const channel = findConfiguredChannel(interaction.guild, "clips-and-content");
  if (!channel?.isTextBased()) {
    await interaction.reply(ephemeral("The clips channel is unavailable. Please contact staff."));
    return;
  }
  const embed = new EmbedBuilder()
    .setColor(TOPFRAGG_COLORS.purple)
    .setTitle(`🎬 ${title}`)
    .setURL(link)
    .setDescription(description || "A fresh Topfragg community highlight.")
    .setAuthor({ name: `${interaction.user.username}'s highlight`, iconURL: interaction.user.displayAvatarURL() })
    .addFields({ name: "Watch", value: `[Open this highlight](${link})` })
    .setFooter({ text: "Topfragg community content" })
    .setTimestamp();
  await channel.send({
    content: `<@${interaction.user.id}> shared a new highlight!`,
    embeds: [embed],
    allowedMentions: { users: [interaction.user.id] },
  });
  await interaction.reply(ephemeral(`Your highlight is live in ${channel}.`));
}

async function toggleSelfRole(interaction, roleName) {
  if (!selfAssignableRoleNames.includes(roleName)) return;
  const verifiedRole = interaction.guild.roles.cache.find((role) => role.name === "Verified Player");
  if (!verifiedRole || !interaction.member.roles.cache.has(verifiedRole.id)) {
    await interaction.reply(ephemeral("Verify your Topfragg identity before choosing player roles."));
    return;
  }
  const role = interaction.guild.roles.cache.find((item) => item.name === roleName);
  if (!role) {
    await interaction.reply(ephemeral("That role is not ready yet. Ask staff to run the Discord setup."));
    return;
  }
  if (interaction.member.roles.cache.has(role.id)) {
    await interaction.member.roles.remove(role, "Topfragg self-service role selection");
    await interaction.reply(ephemeral(`Removed the **${roleName}** role.`));
    return;
  }
  await interaction.member.roles.add(role, "Topfragg self-service role selection");
  await interaction.reply(ephemeral(`Added the **${roleName}** role.`));
}

async function publishLookingForTeamPost(interaction) {
  const verifiedRole = interaction.guild.roles.cache.find((role) => role.name === "Verified Player");
  if (!verifiedRole || !interaction.member.roles.cache.has(verifiedRole.id)) {
    await interaction.reply(ephemeral("Verify your Topfragg identity before creating a team-finder post."));
    return;
  }
  const channel = findConfiguredChannel(interaction.guild, "looking-for-team");
  if (!channel?.isTextBased()) {
    await interaction.reply(ephemeral("The team-finder channel has not been configured yet."));
    return;
  }
  const mode = interaction.fields.getTextInputValue("lfg_mode");
  const region = interaction.fields.getTextInputValue("lfg_region");
  const profile = interaction.fields.getTextInputValue("lfg_profile");
  const availability = interaction.fields.getTextInputValue("lfg_availability");
  const notes = interaction.fields.getTextInputValue("lfg_notes");
  await channel.send({
    content: `<@${interaction.user.id}> is looking for a team`,
    embeds: [
      new EmbedBuilder()
        .setColor(TOPFRAGG_COLORS.purple)
        .setAuthor({ name: `${interaction.user.username} · Looking for team`, iconURL: interaction.user.displayAvatarURL() })
        .addFields(
          { name: "Mode", value: mode, inline: true },
          { name: "Region", value: region, inline: true },
          { name: "Platform / rank", value: profile, inline: true },
          { name: "Availability", value: availability, inline: false },
          { name: "About", value: notes, inline: false },
        )
        .setFooter({ text: "Reply in this channel or contact the player directly." })
        .setTimestamp(),
    ],
    allowedMentions: { users: [interaction.user.id] },
  });
  await interaction.reply(ephemeral(`Your Looking for Team post is live in ${channel}.`));
}

client.once(Events.ClientReady, async (readyClient) => {
  readyClient.user.setActivity("Topfragg tournaments", { type: ActivityType.Competing });
  process.stdout.write(`[Topfragg Discord] Online as ${readyClient.user.tag}\n`);
  const guild = await readyClient.guilds.fetch(config.guildId).catch(() => null);
  if (!guild) {
    process.stderr.write(`[Topfragg Discord] Server ${config.guildId} is unavailable.\n`);
    return;
  }
  await runTournamentDiscordSync(guild);
  await addControlsToExistingTickets(guild).catch((error) => console.error("[Topfragg Discord] Ticket control sync failed:", error));
  await syncMemberCount(guild).catch((error) => console.error("[Topfragg Discord] Member counter sync failed:", error));
  setInterval(() => runTournamentDiscordSync(guild), 60_000);
  setInterval(() => syncMemberCount(guild).catch((error) => console.error("[Topfragg Discord] Member counter sync failed:", error)), 60_000);
});

client.on(Events.MessageCreate, async (message) => {
  if (!message.guild || message.guild.id !== config.guildId || message.author.bot) return;
  if (!isPublicChatChannel(message.guild, message.channel) || isStaffMember(message.member)) return;

  const content = String(message.content || "").trim();
  if (spamPhrases.some((pattern) => pattern.test(content))) {
    await removeSpamMessage(message, "that looks like a scam or token request, so it was removed.");
    return;
  }

  const now = Date.now();
  const history = (recentPublicMessages.get(message.author.id) || []).filter((item) => now - item.at < 60_000);
  const normalized = content.toLowerCase().replace(/\s+/g, " ");
  const recentBurst = history.filter((item) => now - item.at < 8_000);
  const duplicateCount = normalized && history.filter((item) => item.text === normalized).length;
  history.push({ at: now, text: normalized });
  recentPublicMessages.set(message.author.id, history);

  if (recentBurst.length >= 5) {
    await removeSpamMessage(message, "please slow down — messages are limited to 5 every 8 seconds.");
    return;
  }
  if (duplicateCount >= 2) {
    await removeSpamMessage(message, "please do not repeat the same message.");
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.guildId !== config.guildId) return;
  try {
    if (interaction.isButton() && interaction.customId === "topfragg:support:open") {
      await interaction.showModal(supportModal());
      return;
    }
    if (interaction.isButton() && interaction.customId.startsWith("topfragg:support:open:")) {
      await interaction.showModal(supportModal(interaction.customId.slice("topfragg:support:open:".length)));
      return;
    }
    if (interaction.isButton() && interaction.customId.startsWith("topfragg:giveaway:enter:")) {
      await enterGiveaway(interaction, interaction.customId.slice("topfragg:giveaway:enter:".length));
      return;
    }
    if (interaction.isButton() && interaction.customId === "topfragg:clip:open") {
      const modal = new ModalBuilder()
        .setCustomId("topfragg:clip:form")
        .setTitle("Post a Topfragg highlight")
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId("clip_title").setLabel("Highlight title").setPlaceholder("1v2 final-round clutch").setStyle(TextInputStyle.Short).setMaxLength(100).setRequired(true),
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId("clip_link").setLabel("Public clip link").setPlaceholder("https://www.twitch.tv/... or https://youtu.be/...").setStyle(TextInputStyle.Short).setMaxLength(500).setRequired(true),
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId("clip_description").setLabel("Optional context").setPlaceholder("Tournament, game mode, team or moment").setStyle(TextInputStyle.Paragraph).setMaxLength(500).setRequired(false),
          ),
        );
      await interaction.showModal(modal);
      return;
    }
    if (interaction.isButton() && interaction.customId.startsWith("topfragg:role:")) {
      await toggleSelfRole(interaction, interaction.customId.slice("topfragg:role:".length));
      return;
    }
    if (interaction.isButton() && interaction.customId === "topfragg:lfg:open") {
      const modal = new ModalBuilder()
        .setCustomId("topfragg:lfg:form")
        .setTitle("Looking for a Topfragg team")
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId("lfg_mode").setLabel("Mode you want to play").setPlaceholder("2v2 S&D, Warzone, Ranked 8s...").setStyle(TextInputStyle.Short).setMaxLength(60).setRequired(true),
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId("lfg_region").setLabel("Region").setPlaceholder("EU, NA East, NA West...").setStyle(TextInputStyle.Short).setMaxLength(60).setRequired(true),
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId("lfg_profile").setLabel("Platform and rank").setPlaceholder("PS5 · Crimson, PC · Diamond...").setStyle(TextInputStyle.Short).setMaxLength(100).setRequired(true),
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId("lfg_availability").setLabel("When are you available?").setPlaceholder("Weekdays after 19:00 CET").setStyle(TextInputStyle.Short).setMaxLength(120).setRequired(true),
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId("lfg_notes").setLabel("What should a team know about you?").setPlaceholder("Playstyle, experience and what you are looking for.").setStyle(TextInputStyle.Paragraph).setMaxLength(500).setRequired(true),
          ),
        );
      await interaction.showModal(modal);
      return;
    }
    if (interaction.isModalSubmit() && interaction.customId.startsWith("topfragg:support:form:")) {
      const kind = interaction.customId.slice("topfragg:support:form:".length);
      const label = {
        account: "Account support",
        tournament: "Tournament / match support",
        payment: "Payment / prize support",
      }[kind] || "Topfragg Support Ticket";
      await createSupportTicket(interaction, {
        subject: `${label}: ${interaction.fields.getTextInputValue("support_subject")}`,
        reason: interaction.fields.getTextInputValue("support_details"),
      });
      return;
    }
    if (interaction.isModalSubmit() && interaction.customId === "topfragg:clip:form") {
      await publishHighlight(interaction);
      return;
    }
    if (interaction.isModalSubmit() && interaction.customId === "topfragg:lfg:form") {
      await publishLookingForTeamPost(interaction);
      return;
    }
    if (interaction.isButton() && interaction.customId === "topfragg:report:open") {
      const modal = new ModalBuilder()
        .setCustomId("topfragg:report:form")
        .setTitle("Confidential player report")
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("reported_player")
              .setLabel("Player name or Discord username")
              .setStyle(TextInputStyle.Short)
              .setMaxLength(80)
              .setRequired(true),
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("report_context")
              .setLabel("Tournament, team or match")
              .setPlaceholder("Add the relevant event or match if known")
              .setStyle(TextInputStyle.Short)
              .setMaxLength(100)
              .setRequired(false),
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("report_details")
              .setLabel("What happened?")
              .setPlaceholder("Describe the incident and mention any evidence you have.")
              .setStyle(TextInputStyle.Paragraph)
              .setMinLength(20)
              .setMaxLength(1500)
              .setRequired(true),
          ),
        );
      await interaction.showModal(modal);
      return;
    }
    if (interaction.isModalSubmit() && interaction.customId === "topfragg:report:form") {
      const player = interaction.fields.getTextInputValue("reported_player");
      const context = interaction.fields.getTextInputValue("report_context") || "Not provided";
      const details = interaction.fields.getTextInputValue("report_details");
      await createSupportTicket(interaction, {
        subject: `Player report: ${player}`,
        reason: `**Tournament / match:** ${context}\n\n**Report:** ${details}`,
      });
      return;
    }
    if (interaction.isButton() && interaction.customId === "topfragg:support:close") {
      if (!canManageTicket(interaction)) {
        await interaction.reply(ephemeral("Only the ticket owner or Topfragg staff can close this ticket."));
        return;
      }
      const ownerId = ticketOwnerId(interaction.channel);
      await interaction.channel.permissionOverwrites.edit(ownerId, {
        SendMessages: false,
      }, `Ticket closed by ${interaction.user.tag}`);
      await interaction.channel.setTopic(`Topfragg ticket owner:${ownerId} | status:closed`);
      await interaction.message.edit({ components: [ticketControls({ closed: true })] }).catch(() => null);
      await interaction.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(TOPFRAGG_COLORS.orange)
            .setTitle("Ticket closed")
            .setDescription("This ticket is archived, not deleted. The owner or Topfragg staff can reopen it at any time. A transcript can also be downloaded below.")
            .setTimestamp(),
        ],
        components: [ticketControls({ closed: true })],
      });
      await interaction.reply(ephemeral("Ticket closed and archived. It can be reopened or exported whenever you need it."));
      await botLog(interaction.guild, `Support ticket ${interaction.channel.name} closed by ${interaction.user.tag}.`);
      return;
    }
    if (interaction.isButton() && interaction.customId === "topfragg:support:reopen") {
      if (!canManageTicket(interaction)) {
        await interaction.reply(ephemeral("Only the ticket owner or Topfragg staff can reopen this ticket."));
        return;
      }
      const ownerId = ticketOwnerId(interaction.channel);
      await interaction.channel.permissionOverwrites.edit(ownerId, {
        SendMessages: true,
      }, `Ticket reopened by ${interaction.user.tag}`);
      await interaction.channel.setTopic(`Topfragg ticket owner:${ownerId}`);
      await interaction.message.edit({ components: [ticketControls()] }).catch(() => null);
      await interaction.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(TOPFRAGG_COLORS.green)
            .setTitle("Ticket reopened")
            .setDescription("This ticket is active again. Please send any extra details here and a staff member will help you.")
            .setTimestamp(),
        ],
        components: [ticketControls()],
      });
      await interaction.reply(ephemeral("Ticket reopened."));
      await botLog(interaction.guild, `Support ticket ${interaction.channel.name} reopened by ${interaction.user.tag}.`);
      return;
    }
    if (interaction.isButton() && interaction.customId === "topfragg:support:delete") {
      if (!isStaffMember(interaction.member)) {
        await interaction.reply(ephemeral("Only Topfragg staff can permanently delete a ticket."));
        return;
      }
      if (!String(interaction.channel?.topic || "").includes("status:closed")) {
        await interaction.reply(ephemeral("Close this ticket before deleting it. This keeps active support conversations safe."));
        return;
      }
      await interaction.reply({
        content: "Delete this ticket permanently? Download a transcript first if you need a record. This cannot be undone.",
        flags: MessageFlags.Ephemeral,
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId("topfragg:support:delete-confirm")
              .setLabel("Delete permanently")
              .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
              .setCustomId("topfragg:support:delete-cancel")
              .setLabel("Cancel")
              .setStyle(ButtonStyle.Secondary),
          ),
        ],
      });
      return;
    }
    if (interaction.isButton() && interaction.customId === "topfragg:support:delete-cancel") {
      await interaction.update({ content: "Ticket deletion cancelled.", components: [] });
      return;
    }
    if (interaction.isButton() && interaction.customId === "topfragg:support:delete-confirm") {
      if (!isStaffMember(interaction.member) || !canManageTicket(interaction)) {
        await interaction.reply(ephemeral("Only Topfragg staff can permanently delete this ticket."));
        return;
      }
      if (!String(interaction.channel?.topic || "").includes("status:closed")) {
        await interaction.reply(ephemeral("This ticket is active again and cannot be deleted."));
        return;
      }
      const channelName = interaction.channel.name;
      await interaction.reply(ephemeral("Ticket permanently deleted."));
      await botLog(interaction.guild, `Support ticket ${channelName} permanently deleted by ${interaction.user.tag}.`);
      await interaction.channel.delete(`Ticket permanently deleted by ${interaction.user.tag}`);
      return;
    }
    if (interaction.isButton() && interaction.customId === "topfragg:support:transcript") {
      if (!canManageTicket(interaction)) {
        await interaction.reply(ephemeral("Only the ticket owner or Topfragg staff can download this transcript."));
        return;
      }
      if (!interaction.channel?.isTextBased()) {
        await interaction.reply(ephemeral("This ticket channel cannot be exported."));
        return;
      }
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const transcript = await buildTicketTranscript(interaction.channel);
      const filename = `${interaction.channel.name.replace(/[^a-z0-9-]/gi, "-")}-transcript.html`;
      await interaction.editReply({
        content: "Your ticket transcript is ready.",
        files: [new AttachmentBuilder(Buffer.from(transcript, "utf8"), { name: filename })],
      });
      return;
    }
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName === "ping") {
      await interaction.reply(ephemeral(`Topfragg Bot is online — ${client.ws.ping}ms.`));
      return;
    }
    if (interaction.commandName === "verify") {
      const linkedUser = await prisma.user.findUnique({
        where: { discord_user_id: interaction.user.id },
      });
      if (!linkedUser) {
        await interaction.reply({
          content: "Connect this Discord account to your Topfragg account first. No username or #1234 tag is needed.",
          flags: MessageFlags.Ephemeral,
          components: [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setLabel("Connect Discord on Topfragg")
                .setStyle(ButtonStyle.Link)
                .setURL(`${config.publicUrl}/settings?connect=discord`),
            ),
          ],
        });
        return;
      }
      const verifiedRole = interaction.guild.roles.cache.find((role) => role.name === "Verified Player");
      if (!verifiedRole) {
        await interaction.reply(ephemeral("The Verified Player role is unavailable. Please contact Topfragg support."));
        return;
      }
      await interaction.member.roles.add(verifiedRole, "Topfragg website Discord identity verified");
      await interaction.reply(ephemeral(`Verified successfully. Welcome back, ${linkedUser.display_name || linkedUser.username || interaction.user.username}!`));
      return;
    }
    if (interaction.commandName === "tournaments") {
      await interaction.reply(ephemeral(`Browse and enter Topfragg tournaments: ${config.publicUrl}/tournaments`));
      return;
    }
    if (interaction.commandName === "giveaway") {
      const subcommand = interaction.options.getSubcommand();
      if (subcommand === "start") {
        const giveawaysChannel = findConfiguredChannel(interaction.guild, "giveaways");
        if (!giveawaysChannel?.isTextBased()) {
          await interaction.reply(ephemeral("The giveaways channel is not configured yet. Run the Discord setup first."));
          return;
        }
        await startGiveaway(interaction, giveawaysChannel);
        return;
      }
      const result = await endGiveaway(interaction.guild, interaction.options.getString("id", true), { force: true });
      await interaction.reply(ephemeral(result.ended
        ? `Giveaway ended. Winner${result.winners.length === 1 ? "" : "s"}: ${result.winners.map((id) => `<@${id}>`).join(", ") || "no eligible entries"}.`
        : "That giveaway is not currently open."));
      return;
    }
    if (interaction.commandName === "support") {
      await createSupportTicket(interaction, {
        subject: "Topfragg Support Ticket",
        reason: interaction.options.getString("reason", true),
      });
      return;
    }
    if (interaction.commandName === "setup-status") {
      const roleCount = roleSpecs.filter((spec) => interaction.guild.roles.cache.some((role) => role.name === spec.name)).length;
      const channelSpecs = categorySpecs.flatMap((category) => category.channels);
      const channelCount = channelSpecs.filter((spec) => (
        interaction.guild.channels.cache.some((channel) => matchesSpecName(channel.name, spec))
      )).length;
      await interaction.reply(ephemeral(`Topfragg setup: ${roleCount}/${roleSpecs.length} roles and ${channelCount}/${channelSpecs.length} channels found.`));
    }
  } catch (error) {
    console.error("[Topfragg Discord] Command failed:", error);
    const response = ephemeral("Something went wrong. The incident has been logged for staff.");
    if (interaction.replied || interaction.deferred) await interaction.followUp(response).catch(() => null);
    else await interaction.reply(response).catch(() => null);
    await botLog(interaction.guild, `Command /${interaction.commandName} failed for ${interaction.user.tag}.`);
  }
});

client.login(config.token).catch((error) => {
  console.error("[Topfragg Discord] Login failed:", error);
  process.exitCode = 1;
});
