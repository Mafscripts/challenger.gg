import "dotenv/config";
import {
  ActivityType,
  ChannelType,
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  MessageFlags,
  PermissionFlagsBits,
} from "discord.js";
import {
  categorySpecs,
  discordEnvironment,
  roleSpecs,
  staffRoleNames,
  TOPFRAGG_COLORS,
} from "./config.js";

const config = discordEnvironment();
const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

const ephemeral = (content) => ({ content, flags: MessageFlags.Ephemeral });

async function botLog(guild, message) {
  const channel = guild.channels.cache.find((item) => item.name === "bot-log" && item.isTextBased());
  if (channel) await channel.send({ content: message, allowedMentions: { parse: [] } }).catch(() => null);
}

async function createSupportTicket(interaction) {
  const guild = interaction.guild;
  const suffix = interaction.user.id.slice(-6);
  const existing = guild.channels.cache.find((channel) => channel.topic === `Topfragg ticket owner:${interaction.user.id}`);
  if (existing) {
    await interaction.reply(ephemeral(`You already have an open ticket: ${existing}`));
    return;
  }

  const supportCategory = guild.channels.cache.find((channel) => (
    channel.type === ChannelType.GuildCategory && channel.name === "SUPPORT"
  ));
  if (!supportCategory) {
    await interaction.reply(ephemeral("The support category has not been configured yet. Ask an admin to run the Discord setup."));
    return;
  }

  const reason = interaction.options.getString("reason", true);
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
        .setTitle("Topfragg Support Ticket")
        .setDescription(reason)
        .addFields({ name: "Opened by", value: interaction.user.tag, inline: true })
        .setTimestamp(),
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
  if (!guild) process.stderr.write(`[Topfragg Discord] Server ${config.guildId} is unavailable.\n`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand() || interaction.guildId !== config.guildId) return;
  try {
    if (interaction.commandName === "ping") {
      await interaction.reply(ephemeral(`Topfragg Bot is online — ${client.ws.ping}ms.`));
      return;
    }
    if (interaction.commandName === "verify") {
      await interaction.reply(ephemeral(`Open ${config.publicUrl}/settings and add your Discord username to your Topfragg profile. Then use \`/support\` if staff verification is required.`));
      return;
    }
    if (interaction.commandName === "tournaments") {
      await interaction.reply(ephemeral(`Browse and enter Topfragg tournaments: ${config.publicUrl}/tournaments`));
      return;
    }
    if (interaction.commandName === "support") {
      await createSupportTicket(interaction);
      return;
    }
    if (interaction.commandName === "setup-status") {
      const roleCount = roleSpecs.filter((spec) => interaction.guild.roles.cache.some((role) => role.name === spec.name)).length;
      const channelNames = categorySpecs.flatMap((category) => category.channels.map((channel) => channel.name));
      const channelCount = channelNames.filter((name) => interaction.guild.channels.cache.some((channel) => channel.name === name)).length;
      await interaction.reply(ephemeral(`Topfragg setup: ${roleCount}/${roleSpecs.length} roles and ${channelCount}/${channelNames.length} channels found.`));
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
