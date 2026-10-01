import "dotenv/config";
import {
  ActionRowBuilder,
  ActivityType,
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
  staffRoleNames,
  TOPFRAGG_COLORS,
} from "./config.js";
import { prisma } from "../server/prisma.js";
import { syncTournamentDiscord } from "./announcements.js";

const config = discordEnvironment();
const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});
let tournamentSyncRunning = false;

const ephemeral = (content) => ({ content, flags: MessageFlags.Ephemeral });

const matchesSpecName = (actualName, spec) => (
  actualName === spec.name || (spec.legacyNames || []).includes(actualName)
);

function findConfiguredChannel(guild, key) {
  const spec = categorySpecs.flatMap((category) => category.channels).find((channel) => channel.key === key);
  return spec && guild.channels.cache.find((channel) => matchesSpecName(channel.name, spec));
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
  } catch (error) {
    console.error("[Topfragg Discord] Tournament synchronization failed:", error);
    await botLog(guild, "Tournament synchronization failed. Check the Topfragg Discord bot logs.");
  } finally {
    tournamentSyncRunning = false;
  }
}

async function createSupportTicket(interaction, { subject, reason }) {
  const guild = interaction.guild;
  const suffix = interaction.user.id.slice(-6);
  const existing = guild.channels.cache.find((channel) => channel.topic === `Topfragg ticket owner:${interaction.user.id}`);
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
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("topfragg:support:close")
          .setLabel("Close ticket")
          .setStyle(ButtonStyle.Secondary),
      ),
    ],
    allowedMentions: { users: [interaction.user.id] },
  });
  await interaction.reply(ephemeral(`Your private support ticket is ready: ${channel}`));
  await botLog(guild, `Support ticket ${channel.name} opened by ${interaction.user.tag}.`);
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
  setInterval(() => runTournamentDiscordSync(guild), 60_000);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.guildId !== config.guildId) return;
  try {
    if (interaction.isButton() && interaction.customId === "topfragg:support:open") {
      const modal = new ModalBuilder()
        .setCustomId("topfragg:support:form")
        .setTitle("Open a support ticket")
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("support_subject")
              .setLabel("What do you need help with?")
              .setPlaceholder("Account, tournament, match or player report")
              .setStyle(TextInputStyle.Short)
              .setMaxLength(80)
              .setRequired(true),
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("support_details")
              .setLabel("Explain your question or problem")
              .setPlaceholder("Include the relevant tournament, team or match details.")
              .setStyle(TextInputStyle.Paragraph)
              .setMinLength(10)
              .setMaxLength(1000)
              .setRequired(true),
          ),
        );
      await interaction.showModal(modal);
      return;
    }
    if (interaction.isModalSubmit() && interaction.customId === "topfragg:support:form") {
      await createSupportTicket(interaction, {
        subject: interaction.fields.getTextInputValue("support_subject"),
        reason: interaction.fields.getTextInputValue("support_details"),
      });
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
      const isOwner = interaction.channel?.topic === `Topfragg ticket owner:${interaction.user.id}`;
      const isStaff = staffRoleNames.some((name) => interaction.member.roles.cache.some((role) => role.name === name));
      if (!isOwner && !isStaff) {
        await interaction.reply(ephemeral("Only the ticket owner or Topfragg staff can close this ticket."));
        return;
      }
      await interaction.reply(ephemeral("Ticket closed. This channel will be removed in a few seconds."));
      await botLog(interaction.guild, `Support ticket ${interaction.channel.name} closed by ${interaction.user.tag}.`);
      setTimeout(() => interaction.channel.delete(`Ticket closed by ${interaction.user.tag}`).catch(() => null), 3000);
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
