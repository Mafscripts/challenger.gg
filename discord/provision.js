import "dotenv/config";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  PermissionFlagsBits,
  PermissionsBitField,
} from "discord.js";
import {
  botRuntimeRoleSpec,
  categorySpecs,
  commandSpecs,
  discordEnvironment,
  roleSpecs,
  staffRoleNames,
  TOPFRAGG_COLORS,
} from "./config.js";

const config = discordEnvironment();
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const log = (message) => process.stdout.write(`[Topfragg Discord] ${message}\n`);

function roleIdsByName(guild) {
  return new Map(guild.roles.cache.map((role) => [role.name, role.id]));
}

function overwriteForMode(guild, roles, mode) {
  const everyone = guild.roles.everyone.id;
  const muted = roles.get("Muted");
  const staffIds = staffRoleNames.map((name) => roles.get(name)).filter(Boolean);
  const botRuntimeId = roles.get(botRuntimeRoleSpec.name);
  const staffAllow = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.ReadMessageHistory,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.EmbedLinks,
    PermissionFlagsBits.AttachFiles,
    PermissionFlagsBits.ManageMessages,
  ];

  if (mode === "staff") {
    return [
      { id: everyone, deny: [PermissionFlagsBits.ViewChannel] },
      ...staffIds.map((id) => ({ id, allow: staffAllow })),
      ...(botRuntimeId ? [{ id: botRuntimeId, allow: staffAllow }] : []),
    ];
  }

  if (mode === "caster-voice") {
    const casterIds = [roles.get("Caster"), ...staffIds].filter(Boolean);
    return [
      { id: everyone, deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect] },
      ...casterIds.map((id) => ({ id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] })),
    ];
  }

  if (mode === "read-only") {
    return [
      {
        id: everyone,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
        deny: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.CreatePublicThreads, PermissionFlagsBits.CreatePrivateThreads],
      },
      ...staffIds.map((id) => ({ id, allow: staffAllow })),
      ...(botRuntimeId ? [{ id: botRuntimeId, allow: staffAllow }] : []),
    ];
  }

  if (mode === "voice") {
    return [
      { id: everyone, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] },
      ...(muted ? [{ id: muted, deny: [PermissionFlagsBits.Speak] }] : []),
    ];
  }

  return [
    {
      id: everyone,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages],
    },
    ...(muted ? [{ id: muted, deny: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.AddReactions] }] : []),
  ];
}

async function grantRuntimeChannelAccess(channel, roles) {
  const botRuntimeId = roles.get(botRuntimeRoleSpec.name);
  if (!botRuntimeId) return false;
  try {
    await channel.permissionOverwrites.edit(
      botRuntimeId,
      {
        ViewChannel: true,
        ReadMessageHistory: true,
        SendMessages: true,
        EmbedLinks: true,
        AttachFiles: true,
        ManageMessages: true,
      },
      { reason: "Allow Topfragg Bot to maintain managed channels" },
    );
    return true;
  } catch (error) {
    if ([50001, 50013].includes(error.code)) return false;
    throw error;
  }
}

async function ensureRoles(guild) {
  await guild.roles.fetch();
  const botMember = await guild.members.fetchMe();
  for (const spec of [...roleSpecs].reverse()) {
    const existing = guild.roles.cache.find((role) => role.name === spec.name && !role.managed);
    const canGrantPermissions = botMember.permissions.has(new PermissionsBitField(spec.permissions));
    if (existing) {
      await existing.edit({
        colors: { primaryColor: spec.color },
        hoist: spec.hoist,
        mentionable: false,
        ...(canGrantPermissions ? { permissions: spec.permissions } : {}),
        reason: "Topfragg server setup",
      });
      log(`Updated role: ${spec.name}${canGrantPermissions ? "" : " (kept existing permissions)"}`);
      continue;
    }
    if (!canGrantPermissions) {
      log(`Skipped missing role ${spec.name}: temporary Administrator access is required to create it.`);
      continue;
    }
    await guild.roles.create({
      name: spec.name,
      colors: { primaryColor: spec.color },
      hoist: spec.hoist,
      mentionable: false,
      permissions: spec.permissions,
      reason: "Topfragg server setup",
    });
    log(`Created role: ${spec.name}`);
  }
  await guild.roles.fetch();
}

async function ensureBotRuntimeRole(guild) {
  await guild.roles.fetch();
  const botMember = await guild.members.fetchMe();
  let runtimeRole = guild.roles.cache.find((role) => (
    role.name === botRuntimeRoleSpec.name && !role.managed
  ));
  const roleData = {
    colors: { primaryColor: botRuntimeRoleSpec.color },
    hoist: false,
    mentionable: false,
    permissions: botRuntimeRoleSpec.permissions,
    reason: "Topfragg bot least-privilege runtime access",
  };

  if (runtimeRole) {
    runtimeRole = await runtimeRole.edit(roleData);
    log(`Updated role: ${botRuntimeRoleSpec.name}`);
  } else {
    runtimeRole = await guild.roles.create({
      name: botRuntimeRoleSpec.name,
      ...roleData,
    });
    log(`Created role: ${botRuntimeRoleSpec.name}`);
  }

  if (!botMember.roles.cache.has(runtimeRole.id)) {
    await botMember.roles.add(runtimeRole, "Topfragg bot runtime access");
    log(`Assigned ${botRuntimeRoleSpec.name} to ${botMember.user.tag}`);
  }

  const managedBotRole = botMember.roles.cache
    .filter((role) => role.managed)
    .sort((left, right) => right.position - left.position)
    .first();
  const highestTopfraggPosition = Math.max(
    ...roleSpecs
      .map((spec) => guild.roles.cache.find((role) => role.name === spec.name)?.position)
      .filter(Number.isInteger),
    0,
  );
  const desiredPosition = managedBotRole
    ? Math.min(managedBotRole.position - 1, highestTopfraggPosition + 1)
    : highestTopfraggPosition + 1;
  if (desiredPosition > 0 && runtimeRole.position !== desiredPosition) {
    await runtimeRole.setPosition(desiredPosition, "Keep Topfragg bot access above Topfragg staff roles");
    log(`Positioned ${botRuntimeRoleSpec.name} above Topfragg staff roles.`);
  }
}

async function ensureChannels(guild) {
  await guild.channels.fetch();
  const roles = roleIdsByName(guild);
  const created = new Map();

  for (const categorySpec of categorySpecs) {
    let categoryRuntimeAccess = true;
    let category = guild.channels.cache.find((channel) => (
      channel.type === ChannelType.GuildCategory && channel.name === categorySpec.name
    ));
    const categoryOverwrites = overwriteForMode(guild, roles, categorySpec.mode || "chat");
    if (!category) {
      category = await guild.channels.create({
        name: categorySpec.name,
        type: ChannelType.GuildCategory,
        permissionOverwrites: categoryOverwrites,
        reason: "Topfragg server setup",
      });
      log(`Created category: ${categorySpec.name}`);
    } else if (categorySpec.mode === "staff") {
      categoryRuntimeAccess = await grantRuntimeChannelAccess(category, roles);
      log(categoryRuntimeAccess
        ? `Updated category access: ${categorySpec.name}`
        : `Skipped hidden category without access: ${categorySpec.name}`);
    }
    created.set(categorySpec.name, category);

    for (const channelSpec of categorySpec.channels) {
      const existing = guild.channels.cache.find((channel) => (
        channel.parentId === category.id && channel.name === channelSpec.name
      ));
      const permissionOverwrites = overwriteForMode(guild, roles, channelSpec.mode || categorySpec.mode || "chat");
      if (existing) {
        if (existing.type !== channelSpec.type) {
          log(`Skipped ${channelSpec.name}: an existing channel has a different type.`);
          continue;
        }
        if (categorySpec.mode === "staff" && !categoryRuntimeAccess) {
          log(`Skipped hidden channel without access: ${categorySpec.name}/${channelSpec.name}`);
          continue;
        }
        if (["read-only", "staff"].includes(channelSpec.mode || categorySpec.mode)) {
          await grantRuntimeChannelAccess(existing, roles);
        }
        if (channelSpec.topic !== undefined) {
          await existing.edit({
            topic: channelSpec.topic,
            reason: "Topfragg server setup",
          });
        }
        log(`Updated channel: ${categorySpec.name}/${channelSpec.name}`);
        continue;
      }
      const channel = await guild.channels.create({
        name: channelSpec.name,
        type: channelSpec.type,
        parent: category.id,
        topic: channelSpec.topic,
        permissionOverwrites,
        reason: "Topfragg server setup",
      });
      guild.channels.cache.set(channel.id, channel);
      log(`Created channel: ${categorySpec.name}/${channelSpec.name}`);
    }
  }

  return created;
}

async function sendSeedEmbed(channel, marker, embed, components = []) {
  if (!channel?.isTextBased()) return;
  const messages = await channel.messages.fetch({ limit: 50 });
  const existing = messages.find((message) => (
    message.author.id === client.user.id
    && message.embeds.some((item) => (
      item.footer?.text === marker || item.title === embed.data.title
    ))
  ));
  if (existing) {
    await existing.edit({ embeds: [embed], components, allowedMentions: { parse: [] } });
    log(`Updated information card in #${channel.name}`);
    return;
  }
  await channel.send({ embeds: [embed], components, allowedMentions: { parse: [] } });
  log(`Seeded #${channel.name}`);
}

async function seedInformation(guild) {
  const byName = (name) => guild.channels.cache.find((channel) => channel.name === name);
  await sendSeedEmbed(
    byName("welcome"),
    "Topfragg setup:v1:welcome",
    new EmbedBuilder()
      .setColor(TOPFRAGG_COLORS.orange)
      .setTitle("Welcome to Topfragg.gg")
      .setDescription("Compete in tournaments, build your roster, climb the leaderboards and prove who owns the lobby.")
      .addFields(
        { name: "1. Read the rules", value: "Start in **#rules** before joining the competition." },
        { name: "2. Verify", value: "Use `/verify` to connect your Topfragg identity." },
        { name: "3. Compete", value: "Use `/tournaments` to find your next event." },
      ),
  );
  await sendSeedEmbed(
    byName("rules"),
    "Topfragg setup:v1:rules",
    new EmbedBuilder()
      .setColor(TOPFRAGG_COLORS.cyan)
      .setTitle("Topfragg Community Rules")
      .setDescription([
        "**1. Respect competitors.** No harassment, discrimination or threats.",
        "**2. Compete fairly.** Cheating, exploiting or falsifying results is prohibited.",
        "**3. Keep disputes private.** Use `/support` instead of public accusations.",
        "**4. Protect personal information.** Never share passwords, tokens or payment details.",
        "**5. Follow staff instructions.** Tournament and moderation decisions must use the official appeal process.",
      ].join("\n\n")),
  );
  await sendSeedEmbed(
    byName("verification"),
    "Topfragg setup:v1:verification",
    new EmbedBuilder()
      .setColor(TOPFRAGG_COLORS.green)
      .setTitle("Verify your Topfragg identity")
      .setDescription(`Use \`/verify\` for the current verification instructions. Never send your password or security codes to staff.\n\nTopfragg: ${config.publicUrl}`),
  );
  await sendSeedEmbed(
    byName("support-info"),
    "Topfragg setup:v1:support",
    new EmbedBuilder()
      .setColor(TOPFRAGG_COLORS.cyan)
      .setTitle("Topfragg Support Center")
      .setDescription("Need help? Choose the right private support option below. Your conversation is only visible to you and authorized Topfragg staff.")
      .addFields(
        { name: "Account & verification", value: "Help with login, profiles, verification and account access.", inline: true },
        { name: "Tournaments & matches", value: "Questions about registrations, teams, results and disputes.", inline: true },
        { name: "Player reports", value: "Use **#player-reports** for confidential fair-play or conduct reports.", inline: true },
        { name: "Response time", value: "Provide clear details once. A staff member will respond in your private ticket as soon as possible." },
      ),
    [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("topfragg:support:open")
          .setLabel("Open support ticket")
          .setEmoji("🎫")
          .setStyle(ButtonStyle.Primary),
      ),
    ],
  );
  await sendSeedEmbed(
    byName("create-ticket"),
    "Topfragg setup:v1:create-ticket",
    new EmbedBuilder()
      .setColor(TOPFRAGG_COLORS.orange)
      .setTitle("Need help from Topfragg staff?")
      .setDescription("Open a private support ticket and answer two short questions. Only you and the Topfragg staff team can see your ticket.")
      .addFields(
        { name: "Account support", value: "Login, verification or profile questions.", inline: true },
        { name: "Competition support", value: "Tournament, match or result questions.", inline: true },
        { name: "Player reports", value: "Private reports and fair-play concerns.", inline: true },
      ),
    [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("topfragg:support:open")
          .setLabel("Open support ticket")
          .setEmoji("🎫")
          .setStyle(ButtonStyle.Primary),
      ),
    ],
  );
  await sendSeedEmbed(
    byName("player-reports"),
    "Topfragg setup:v1:player-reports",
    new EmbedBuilder()
      .setColor(TOPFRAGG_COLORS.red)
      .setTitle("Confidential Player Report")
      .setDescription("Report cheating, harassment or other rule violations privately. Do not accuse players in public channels.")
      .addFields(
        { name: "Include", value: "Player name, tournament or match, what happened, and any available evidence." },
        { name: "Privacy", value: "Only you and authorized Topfragg staff can see the resulting ticket." },
      ),
    [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("topfragg:report:open")
          .setLabel("Report a player")
          .setStyle(ButtonStyle.Danger),
      ),
    ],
  );
}

async function run() {
  await client.login(config.token);
  await new Promise((resolve) => client.once(Events.ClientReady, resolve));
  log(`Connected as ${client.user.tag}`);
  const guild = await client.guilds.fetch(config.guildId);
  log(`Preparing server: ${guild.name}`);
  await ensureRoles(guild);
  await ensureBotRuntimeRole(guild);
  await ensureChannels(guild);
  await guild.channels.fetch();
  await guild.commands.set(commandSpecs);
  log(`Registered ${commandSpecs.length} slash commands.`);
  await seedInformation(guild);
  log("Setup complete. Existing unrelated roles and channels were left untouched.");
  client.destroy();
}

run().catch((error) => {
  console.error("[Topfragg Discord] Setup failed:", error);
  client.destroy();
  process.exitCode = 1;
});
