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
  memberCountSpec,
  discordEnvironment,
  roleSpecs,
  staffRoleNames,
  TOPFRAGG_COLORS,
} from "./config.js";

const config = discordEnvironment();
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const log = (message) => process.stdout.write(`[Topfragg Discord] ${message}\n`);

const matchesSpecName = (actualName, spec) => (
  actualName === spec.name
  || (spec.legacyNames || []).includes(actualName)
  || (spec.key === "member-count" && /^👥・members[-:]\s*[\d,]+$/u.test(actualName))
);

function roleIdsByName(guild) {
  return new Map(guild.roles.cache.map((role) => [role.name, role.id]));
}

function overwriteForMode(guild, roles, configuredMode) {
  const requiresVerification = configuredMode.startsWith("verified-");
  const mode = requiresVerification ? configuredMode.slice("verified-".length) : configuredMode;
  const everyone = guild.roles.everyone.id;
  const muted = roles.get("Muted");
  const verified = roles.get("Verified Player");
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

  if (mode === "counter") {
    return [
      {
        id: everyone,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
        deny: [
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.CreatePublicThreads,
          PermissionFlagsBits.CreatePrivateThreads,
        ],
      },
      ...(botRuntimeId ? [{ id: botRuntimeId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ManageChannels] }] : []),
    ];
  }

  if (mode === "read-only") {
    if (requiresVerification && verified) {
      return [
        {
          id: everyone,
          deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.CreatePublicThreads, PermissionFlagsBits.CreatePrivateThreads],
        },
        { id: verified, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory] },
        ...staffIds.map((id) => ({ id, allow: staffAllow })),
        ...(botRuntimeId ? [{ id: botRuntimeId, allow: staffAllow }] : []),
      ];
    }
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
    if (requiresVerification && verified) {
      const voiceAccess = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak];
      return [
        { id: everyone, deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect] },
        { id: verified, allow: voiceAccess },
        ...staffIds.map((id) => ({ id, allow: voiceAccess })),
        ...(muted ? [{ id: muted, deny: [PermissionFlagsBits.Speak] }] : []),
      ];
    }
    return [
      { id: everyone, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] },
      ...(muted ? [{ id: muted, deny: [PermissionFlagsBits.Speak] }] : []),
    ];
  }

  if (requiresVerification && verified) {
    return [
      { id: everyone, deny: [PermissionFlagsBits.ViewChannel] },
      {
        id: verified,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages],
      },
      ...staffIds.map((id) => ({ id, allow: staffAllow })),
      ...(botRuntimeId ? [{ id: botRuntimeId, allow: staffAllow }] : []),
      ...(muted ? [{ id: muted, deny: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.AddReactions] }] : []),
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

async function ensureMemberCountChannel(guild, roles) {
  const matchingChannels = guild.channels.cache.filter((channel) => (
    channel.type === memberCountSpec.type && matchesSpecName(channel.name, memberCountSpec)
  ));
  let channel = matchingChannels.find((candidate) => !candidate.parentId) || matchingChannels.first();

  if (!channel) {
    channel = await guild.channels.create({
      name: memberCountSpec.name,
      type: memberCountSpec.type,
      permissionOverwrites: overwriteForMode(guild, roles, memberCountSpec.mode),
      reason: "Create the Topfragg member counter above the categories",
    });
    await channel.setPosition(0, { reason: "Keep the Topfragg member counter above the categories" });
    log(`Created root member counter: ${channel.name}`);
    return channel;
  }

  if (channel.parentId) {
    await channel.setParent(null, { lockPermissions: false, reason: "Keep the Topfragg member counter above the categories" });
  }
  await channel.permissionOverwrites.set(
    overwriteForMode(guild, roles, memberCountSpec.mode),
    "Apply Topfragg member counter access policy",
  );
  await channel.setPosition(0, { reason: "Keep the Topfragg member counter above the categories" });
  if (matchingChannels.size > 1) {
    log(`Found ${matchingChannels.size} member counter channels; kept ${channel.name} at the server root and left extras untouched.`);
  }
  return channel;
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
      if (!existing.editable) {
        log(`Skipped role ${spec.name}: it is above the Topfragg Bot role.`);
        continue;
      }
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

async function ensureTopfraggRoleOrder(guild) {
  await guild.roles.fetch();
  const lowestToHighest = [...roleSpecs].reverse();

  for (let index = 0; index < lowestToHighest.length; index += 1) {
    const spec = lowestToHighest[index];
    const role = guild.roles.cache.find((item) => item.name === spec.name && !item.managed);
    const desiredPosition = index + 1;
    if (!role || role.position === desiredPosition) continue;
    try {
      await role.setPosition(desiredPosition, "Keep Topfragg staff roles above player roles");
      log(`Positioned role: ${spec.name}`);
    } catch (error) {
      if ([50001, 50013].includes(error.code)) {
        log(`Could not position ${spec.name}: move Topfragg Bot Access above it first.`);
        continue;
      }
      throw error;
    }
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
  created.set(memberCountSpec.key, await ensureMemberCountChannel(guild, roles));

  for (const categorySpec of categorySpecs) {
    let categoryRuntimeAccess = true;
    let category = guild.channels.cache.find((channel) => (
      channel.type === ChannelType.GuildCategory && matchesSpecName(channel.name, categorySpec)
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
      if (categoryRuntimeAccess && category.name !== categorySpec.name) {
        category = await category.edit({ name: categorySpec.name, reason: "Topfragg channel styling" });
      }
      log(categoryRuntimeAccess
        ? `Updated category access: ${categorySpec.name}`
        : `Skipped hidden category without access: ${categorySpec.name}`);
    } else if (category.name !== categorySpec.name) {
      category = await category.edit({ name: categorySpec.name, reason: "Topfragg channel styling" });
      log(`Renamed category: ${categorySpec.name}`);
    }
    created.set(categorySpec.key, category);

    for (const channelSpec of categorySpec.channels) {
      let existing = guild.channels.cache.find((channel) => (
        channel.parentId === category.id && matchesSpecName(channel.name, channelSpec)
      ));
      const permissionOverwrites = overwriteForMode(guild, roles, channelSpec.mode || categorySpec.mode || "chat");
      if (existing) {
        if (existing.type !== channelSpec.type) {
          if (channelSpec.key === "member-count") {
            await existing.delete("Replace voice member counter with read-only text counter");
            guild.channels.cache.delete(existing.id);
            existing = null;
            log("Replaced voice member counter with a text member counter.");
          } else {
            log(`Skipped ${channelSpec.name}: an existing channel has a different type.`);
            continue;
          }
        }
        if (existing && categorySpec.mode === "staff" && !categoryRuntimeAccess) {
          log(`Skipped hidden channel without access: ${categorySpec.name}/${channelSpec.name}`);
          continue;
        }
        if (existing) {
          try {
            await existing.permissionOverwrites.set(
              permissionOverwrites,
              "Apply Topfragg channel access policy",
            );
            if (["read-only", "staff"].includes(channelSpec.mode || categorySpec.mode)) {
              await grantRuntimeChannelAccess(existing, roles);
            }
            if (channelSpec.topic !== undefined) {
              await existing.edit({
                name: channelSpec.name,
                topic: channelSpec.topic,
                reason: "Topfragg server setup",
              });
            } else if (existing.name !== channelSpec.name) {
              await existing.edit({ name: channelSpec.name, reason: "Topfragg channel styling" });
            }
          } catch (error) {
            if ([50001, 50013].includes(error.code)) {
              log(`Skipped channel without access: ${categorySpec.name}/${channelSpec.name}`);
              continue;
            }
            throw error;
          }
          log(`Updated channel: ${categorySpec.name}/${channelSpec.name}`);
          continue;
        }
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

async function ensureCategoryOrder(guild) {
  await guild.channels.fetch();
  for (let index = 0; index < categorySpecs.length; index += 1) {
    const spec = categorySpecs[index];
    const category = guild.channels.cache.find((channel) => (
      channel.type === ChannelType.GuildCategory && matchesSpecName(channel.name, spec)
    ));
    if (!category) continue;
    try {
      await category.setPosition(index + 1, "Keep the Topfragg member counter above the categories");
      log(`Positioned category: ${spec.name}`);
    } catch (error) {
      if ([50001, 50013].includes(error.code)) {
        log(`Skipped category positioning without access: ${spec.name}`);
        continue;
      }
      throw error;
    }
  }
}

async function sendSeedEmbed(channel, marker, embed, components = [], previousTitles = []) {
  if (!channel?.isTextBased()) return;
  const messages = await channel.messages.fetch({ limit: 50 });
  const managedMessages = messages.filter((message) => (
    message.author.id === client.user.id
    && message.embeds.some((item) => (
      item.footer?.text === marker
      || item.title === embed.data.title
      || previousTitles.includes(item.title)
    ))
  ));
  const existing = managedMessages.first();
  if (existing) {
    await existing.edit({ embeds: [embed], components, allowedMentions: { parse: [] } });
    for (const duplicate of managedMessages.filter((message) => message.id !== existing.id).values()) {
      await duplicate.delete().catch(() => null);
    }
    log(`Updated information card in #${channel.name}`);
    return;
  }
  await channel.send({ embeds: [embed], components, allowedMentions: { parse: [] } });
  log(`Seeded #${channel.name}`);
}

async function seedInformation(guild) {
  const byKey = (key) => {
    const spec = categorySpecs.flatMap((category) => category.channels).find((channel) => channel.key === key);
    return spec && guild.channels.cache.find((channel) => matchesSpecName(channel.name, spec));
  };
  const welcomeChannel = byKey("welcome");
  const rulesChannel = byKey("rules");
  const announcementsChannel = byKey("announcements");
  const verificationChannel = byKey("verification");
  const faqChannel = byKey("faq");
  const tournamentsChannel = byKey("tournaments");
  const liveNowChannel = byKey("live-now");
  const lookingForTeamChannel = byKey("looking-for-team");
  const clipsChannel = byKey("clips-and-content");
  const tournamentSignupsChannel = byKey("tournament-signups");
  const matchResultsChannel = byKey("match-results");
  const leaderboardsChannel = byKey("leaderboards");
  const disputesChannel = byKey("disputes");
  const createTicketChannel = byKey("create-ticket");
  const playerReportsChannel = byKey("player-reports");
  const giveawaysChannel = byKey("giveaways");
  await sendSeedEmbed(
    welcomeChannel,
    "Topfragg setup:v1:welcome",
    new EmbedBuilder()
      .setColor(TOPFRAGG_COLORS.orange)
      .setTitle("⚡ Welcome to Topfragg.gg")
      .setDescription("Your competitive arena starts here. Enter tournaments, build your roster, climb the leaderboards and prove who owns the lobby.")
      .addFields(
        { name: "📜 1. Know the rules", value: `Start in ${rulesChannel} and keep every match fair.`, inline: true },
        { name: "✅ 2. Get verified", value: `Visit ${verificationChannel} and connect your identity.`, inline: true },
        { name: "🏆 3. Enter the arena", value: `Find your next event in ${tournamentsChannel}.`, inline: true },
        { name: "🔥 Ready to compete?", value: "Bring your squad, play for prizes and build your reputation in the Topfragg community." },
      ),
    [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel("Browse tournaments")
          .setEmoji("🏆")
          .setStyle(ButtonStyle.Link)
          .setURL(`${config.publicUrl}/tournaments`),
        new ButtonBuilder()
          .setCustomId("topfragg:support:open")
          .setLabel("Get support")
          .setStyle(ButtonStyle.Secondary),
      ),
    ],
    ["Welcome to Topfragg.gg"],
  );
  await sendSeedEmbed(
    rulesChannel,
    "Topfragg setup:v1:rules",
    new EmbedBuilder()
      .setColor(TOPFRAGG_COLORS.cyan)
      .setTitle("📜 Topfragg Community Rules")
      .setDescription([
        "🤝 **Respect competitors.** No harassment, discrimination or threats.",
        "🎯 **Compete fairly.** Cheating, exploiting or falsifying results is prohibited.",
        `🔒 **Keep disputes private.** Use ${createTicketChannel} instead of public accusations.`,
        "🛡️ **Protect personal information.** Never share passwords, tokens or payment details.",
        "⚖️ **Follow staff instructions.** Use the official appeal process when you disagree with a decision.",
      ].join("\n\n")),
    [],
    ["Topfragg Community Rules"],
  );
  await sendSeedEmbed(
    verificationChannel,
    "Topfragg setup:v1:verification",
    new EmbedBuilder()
      .setColor(TOPFRAGG_COLORS.green)
      .setTitle("✅ Verify your Topfragg identity")
      .setDescription("Link Discord securely through Topfragg. We verify your unique Discord user ID automatically—never by trusting a typed username or old #1234 tag.")
      .addFields(
        { name: "1. Connect", value: "Open Topfragg Settings and press **Connect Discord**." },
        { name: "2. Approve", value: "Authorize basic identity access on Discord. Topfragg never receives your password." },
        { name: "3. Verify", value: "The **Verified Player** role is assigned automatically. Use `/verify` to synchronize it again." },
        { name: "Automatic roles", value: "**Premium**, **Team Captain** and **Tournament Participant** update automatically from your Topfragg account." },
      ),
    [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel("Connect Discord securely")
          .setEmoji("🔗")
          .setStyle(ButtonStyle.Link)
          .setURL(`${config.publicUrl}/settings?connect=discord`),
      ),
    ],
    ["Verify your Topfragg identity"],
  );
  await sendSeedEmbed(
    announcementsChannel,
    "Topfragg setup:v1:announcements",
    new EmbedBuilder()
      .setColor(TOPFRAGG_COLORS.orange)
      .setTitle("📢 Official Topfragg Updates")
      .setDescription("Tournament drops, platform updates, featured matches and community news will be posted here. Turn on channel notifications so you never miss registration."),
  );
  await sendSeedEmbed(
    faqChannel,
    "Topfragg setup:v1:faq",
    new EmbedBuilder()
      .setColor(TOPFRAGG_COLORS.purple)
      .setTitle("❓ Quick Answers")
      .addFields(
        { name: "How do I enter a tournament?", value: `Open ${tournamentsChannel}, choose an event and complete registration on Topfragg.gg.` },
        { name: "Where can I find teammates?", value: "Use **🔎・looking-for-team** and include your region, platform, mode and availability." },
        { name: "How do I contact staff?", value: `Read **ℹ️・support-info**, then open a private ticket in ${createTicketChannel}.` },
        { name: "How do I report someone?", value: `Use ${playerReportsChannel}. Reports are private and should include evidence when available.` },
      ),
  );
  await sendSeedEmbed(
    tournamentsChannel,
    "Topfragg setup:v1:tournaments",
    new EmbedBuilder()
      .setColor(TOPFRAGG_COLORS.gold)
      .setTitle("🏆 Your next tournament starts here")
      .setDescription("Discover free and featured competitions, register your team and fight for a place on the leaderboard."),
    [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel("View Topfragg tournaments")
          .setEmoji("🔥")
          .setStyle(ButtonStyle.Link)
          .setURL(`${config.publicUrl}/tournaments`),
      ),
    ],
  );
  await sendSeedEmbed(
    liveNowChannel,
    "Topfragg setup:v1:live-now",
    new EmbedBuilder()
      .setColor(TOPFRAGG_COLORS.red)
      .setTitle("🔴 Live Topfragg matches")
      .setDescription("When a tournament match goes live on Topfragg, it appears here automatically. Follow the match card to see the matchup and live room."),
  );
  await sendSeedEmbed(
    lookingForTeamChannel,
    "Topfragg setup:v1:looking-for-team",
    new EmbedBuilder()
      .setColor(TOPFRAGG_COLORS.purple)
      .setTitle("🔎 Find your next Topfragg team")
      .setDescription("Create a clean player card so captains can find you quickly. Choose the roles that fit you, then share your region, platform, mode and availability.")
      .addFields(
        { name: "Step 1", value: "Pick your notification roles below.", inline: true },
        { name: "Step 2", value: "Press **Create LFG post** and complete the form.", inline: true },
        { name: "Keep it useful", value: "No spam, no account selling and no personal details." },
      ),
    [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("topfragg:role:EU").setLabel("EU").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("topfragg:role:NA").setLabel("NA").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("topfragg:role:2v2").setLabel("2v2").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("topfragg:role:S&D").setLabel("S&D").setStyle(ButtonStyle.Secondary),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("topfragg:lfg:open")
          .setLabel("Create LFG post")
          .setEmoji("🔎")
          .setStyle(ButtonStyle.Primary),
      ),
    ],
  );
  await sendSeedEmbed(
    clipsChannel,
    "Topfragg setup:v1:clips-and-content",
    new EmbedBuilder()
      .setColor(TOPFRAGG_COLORS.purple)
      .setTitle("🎬 Share your Topfragg highlight")
      .setDescription("Hit a clutch? Won a match? Share your Twitch, YouTube or TikTok highlight with the community. Keep it competitive, respectful and relevant to Topfragg.")
      .addFields(
        { name: "How it works", value: "Press **Post a highlight**, add a title and link, then the bot creates a clean clip card for you." },
        { name: "Who can post?", value: "Verified Players only. No self-promo spam, account selling or unrelated links." },
      ),
    [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("topfragg:clip:open")
          .setLabel("Post a highlight")
          .setEmoji("🎬")
          .setStyle(ButtonStyle.Primary),
      ),
    ],
  );
  await sendSeedEmbed(
    tournamentSignupsChannel,
    "Topfragg setup:v1:tournament-signups",
    new EmbedBuilder()
      .setColor(TOPFRAGG_COLORS.gold)
      .setTitle("📝 Tournament sign-ups")
      .setDescription("Official tournament registration happens on Topfragg.gg. This channel is for roster calls, finding a teammate and quick registration questions.")
      .addFields(
        { name: "1. Choose an event", value: "Open the tournament page and select the competition you want to play." },
        { name: "2. Register your team", value: "Sign in to Topfragg, create or select your team, then complete registration." },
        { name: "3. Need a teammate?", value: "Post your region, platform, mode, rank and availability here. Do not post private account details." },
      ),
    [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel("Browse tournaments")
          .setEmoji("🏆")
          .setStyle(ButtonStyle.Link)
          .setURL(`${config.publicUrl}/tournaments`),
      ),
    ],
  );
  await sendSeedEmbed(
    matchResultsChannel,
    "Topfragg setup:v1:match-results",
    new EmbedBuilder()
      .setColor(TOPFRAGG_COLORS.cyan)
      .setTitle("📊 Official match results")
      .setDescription("Confirmed scores and completed tournament matches are published here. Results are managed through Topfragg to keep every bracket accurate.")
      .addFields({ name: "Wrong result?", value: `Do not argue publicly. Open a private ticket in ${createTicketChannel} with the tournament, teams and evidence.` }),
  );
  await sendSeedEmbed(
    leaderboardsChannel,
    "Topfragg setup:v1:leaderboards",
    new EmbedBuilder()
      .setColor(TOPFRAGG_COLORS.purple)
      .setTitle("👑 Topfragg leaderboards")
      .setDescription("Track the players and teams setting the pace this season. Your tournament results and wins shape your standing."),
    [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel("View leaderboards")
          .setEmoji("👑")
          .setStyle(ButtonStyle.Link)
          .setURL(`${config.publicUrl}/leaderboards`),
      ),
    ],
  );
  await sendSeedEmbed(
    disputesChannel,
    "Topfragg setup:v1:disputes",
    new EmbedBuilder()
      .setColor(TOPFRAGG_COLORS.red)
      .setTitle("⚖️ Match disputes")
      .setDescription("Keep disputes private and respectful. Staff can only review a case when the details are in a private ticket.")
      .addFields({ name: "Include", value: "Tournament name, both teams, match time, score, what happened and screenshots or clips when available." }),
    [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("topfragg:support:open:tournament")
          .setLabel("Open private dispute ticket")
          .setEmoji("⚖️")
          .setStyle(ButtonStyle.Danger),
      ),
    ],
  );
  await sendSeedEmbed(
    byKey("support-info"),
    "Topfragg setup:v1:support",
    new EmbedBuilder()
      .setColor(TOPFRAGG_COLORS.cyan)
      .setTitle("Topfragg Support Guide")
      .setDescription("Read this before opening a ticket so the Topfragg team can help you quickly.")
      .addFields(
        { name: "How do I get help?", value: `Go to ${createTicketChannel}, press **Open support ticket**, and answer the two questions.` },
        { name: "Tournament or match issue", value: "Include the tournament name, teams, match time and result when applicable." },
        { name: "Reporting a player", value: `Use ${playerReportsChannel} for cheating, harassment or other confidential reports.` },
        { name: "After opening a ticket", value: "A private channel appears under SUPPORT. Continue the conversation there and use **Close ticket** when finished." },
        { name: "Stay secure", value: "Topfragg staff will never ask for your password, bot token or security codes." },
      ),
    [],
    ["Private player support", "Topfragg Support Center"],
  );
  await sendSeedEmbed(
    createTicketChannel,
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
          .setCustomId("topfragg:support:open:account")
          .setLabel("Account help")
          .setEmoji("🎫")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId("topfragg:support:open:tournament")
          .setLabel("Tournament / match")
          .setEmoji("🏆")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId("topfragg:support:open:payment")
          .setLabel("Payment / prize")
          .setEmoji("💳")
          .setStyle(ButtonStyle.Secondary),
      ),
    ],
  );
  await sendSeedEmbed(
    playerReportsChannel,
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
  await sendSeedEmbed(
    giveawaysChannel,
    "Topfragg setup:v1:giveaways",
    new EmbedBuilder()
      .setColor(TOPFRAGG_COLORS.purple)
      .setTitle("🎁 Official Topfragg giveaways")
      .setDescription("Verified players can enter live giveaways with the button on each official giveaway post. Winners are selected automatically when the countdown ends.")
      .addFields(
        { name: "Stay safe", value: "Topfragg giveaways never ask for your password, token, payment details or a direct-message reply." },
        { name: "How to enter", value: "Verify your Discord account, then press **Enter giveaway** on an active post." },
      ),
  );
}

async function run() {
  await client.login(config.token);
  await new Promise((resolve) => client.once(Events.ClientReady, resolve));
  log(`Connected as ${client.user.tag}`);
  const guild = await client.guilds.fetch(config.guildId);
  log(`Preparing server: ${guild.name}`);
  await ensureRoles(guild);
  await ensureTopfraggRoleOrder(guild);
  await ensureBotRuntimeRole(guild);
  await ensureChannels(guild);
  await ensureCategoryOrder(guild);
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
