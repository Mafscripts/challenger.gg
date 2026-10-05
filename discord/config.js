import {
  ChannelType,
  PermissionFlagsBits,
} from "discord.js";

export const TOPFRAGG_COLORS = {
  cyan: 0x14d8ff,
  orange: 0xff6c00,
  green: 0x00ff99,
  purple: 0x9858e8,
  red: 0xf04444,
  gold: 0xfacc15,
  graphite: 0x222a35,
};

export const botRuntimeRoleSpec = {
  name: "Topfragg Bot Access",
  color: TOPFRAGG_COLORS.cyan,
  permissions: [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.ReadMessageHistory,
    PermissionFlagsBits.EmbedLinks,
    PermissionFlagsBits.AttachFiles,
    PermissionFlagsBits.AddReactions,
    PermissionFlagsBits.UseApplicationCommands,
    PermissionFlagsBits.ManageChannels,
    PermissionFlagsBits.ManageRoles,
    PermissionFlagsBits.ManageMessages,
  ],
};

export const roleSpecs = [
  { name: "CEO", color: TOPFRAGG_COLORS.orange, hoist: true, permissions: [PermissionFlagsBits.Administrator] },
  { name: "Admin", color: TOPFRAGG_COLORS.red, hoist: true, permissions: [PermissionFlagsBits.Administrator] },
  {
    name: "Tournament Admin",
    color: TOPFRAGG_COLORS.gold,
    hoist: true,
    permissions: [
      PermissionFlagsBits.ManageChannels,
      PermissionFlagsBits.ManageRoles,
      PermissionFlagsBits.ManageMessages,
      PermissionFlagsBits.ManageThreads,
      PermissionFlagsBits.MoveMembers,
      PermissionFlagsBits.ModerateMembers,
    ],
  },
  {
    name: "Moderator",
    color: TOPFRAGG_COLORS.purple,
    hoist: true,
    permissions: [
      PermissionFlagsBits.ManageMessages,
      PermissionFlagsBits.ManageThreads,
      PermissionFlagsBits.ModerateMembers,
      PermissionFlagsBits.MoveMembers,
    ],
  },
  { name: "Support", color: TOPFRAGG_COLORS.cyan, hoist: true, permissions: [] },
  { name: "Caster", color: TOPFRAGG_COLORS.orange, hoist: true, permissions: [] },
  { name: "Streamer", color: 0x9146ff, hoist: true, permissions: [] },
  { name: "Premium", color: TOPFRAGG_COLORS.gold, hoist: true, permissions: [] },
  { name: "Team Captain", color: TOPFRAGG_COLORS.green, hoist: true, permissions: [] },
  { name: "Tournament Participant", color: TOPFRAGG_COLORS.orange, hoist: true, permissions: [] },
  { name: "Verified Player", color: TOPFRAGG_COLORS.cyan, hoist: true, permissions: [] },
  { name: "EU", color: 0, hoist: false, permissions: [] },
  { name: "NA", color: 0, hoist: false, permissions: [] },
  { name: "2v2", color: 0, hoist: false, permissions: [] },
  { name: "S&D", color: 0, hoist: false, permissions: [] },
  { name: "Muted", color: TOPFRAGG_COLORS.graphite, hoist: false, permissions: [] },
];

export const categorySpecs = [
  {
    key: "start-here",
    name: "👋 START HERE",
    legacyNames: ["START HERE"],
    channels: [
      { key: "welcome", name: "👋・welcome", legacyNames: ["welcome"], type: ChannelType.GuildText, mode: "read-only", topic: "Welcome to the official Topfragg.gg competitive community." },
      { key: "rules", name: "📜・rules", legacyNames: ["rules"], type: ChannelType.GuildText, mode: "read-only", topic: "The rules that keep Topfragg competitive, fair and fun." },
      { key: "announcements", name: "📢・announcements", legacyNames: ["announcements"], type: ChannelType.GuildText, mode: "read-only", topic: "Official Topfragg news, events and tournament announcements." },
      { key: "verification", name: "✅・verification", legacyNames: ["verification"], type: ChannelType.GuildText, mode: "read-only", topic: "Connect your Topfragg identity and request verification." },
      { key: "faq", name: "❓・faq", legacyNames: ["faq"], type: ChannelType.GuildText, mode: "read-only", topic: "Quick answers about accounts, teams and competitions." },
    ],
  },
  {
    key: "community",
    name: "💬 COMMUNITY",
    legacyNames: ["COMMUNITY"],
    channels: [
      { key: "general", name: "💬・general", legacyNames: ["general"], type: ChannelType.GuildText, mode: "chat", topic: "Talk Topfragg, competition and gaming with the community." },
      { key: "looking-for-team", name: "🔎・looking-for-team", legacyNames: ["looking-for-team"], type: ChannelType.GuildText, mode: "chat", topic: "Find teammates and complete your next winning roster." },
      { key: "clips-and-content", name: "🎬・clips-and-content", legacyNames: ["clips-and-content"], type: ChannelType.GuildText, mode: "chat", topic: "Share your best plays, streams, highlights and videos." },
      { key: "off-topic", name: "🎮・off-topic", legacyNames: ["off-topic"], type: ChannelType.GuildText, mode: "chat", topic: "Relax and talk about life outside the competition." },
    ],
  },
  {
    key: "competition",
    name: "🏆 COMPETITION",
    legacyNames: ["COMPETITION"],
    channels: [
      { key: "tournaments", name: "🏆・tournaments", legacyNames: ["tournaments"], type: ChannelType.GuildText, mode: "read-only", topic: "Upcoming Topfragg tournaments and featured competitions." },
      { key: "live-now", name: "🔴・live-now", legacyNames: ["live-now"], type: ChannelType.GuildText, mode: "read-only", topic: "Live Topfragg tournament matches and featured competition updates." },
      { key: "tournament-signups", name: "📝・tournament-signups", legacyNames: ["tournament-signups"], type: ChannelType.GuildText, mode: "chat", topic: "Tournament registration questions and roster calls." },
      { key: "match-results", name: "📊・match-results", legacyNames: ["match-results"], type: ChannelType.GuildText, mode: "read-only", topic: "Official match results and confirmed scores." },
      { key: "leaderboards", name: "👑・leaderboards", legacyNames: ["leaderboards"], type: ChannelType.GuildText, mode: "read-only", topic: "Topfragg standings, champions and season leaders." },
      { key: "disputes", name: "⚖️・disputes", legacyNames: ["disputes"], type: ChannelType.GuildText, mode: "read-only", topic: "Open a private support ticket for match disputes." },
    ],
  },
  {
    key: "events",
    name: "🎉 EVENTS",
    legacyNames: ["EVENTS"],
    channels: [
      { key: "giveaways", name: "🎁・giveaways", legacyNames: ["giveaways"], type: ChannelType.GuildText, mode: "read-only", topic: "Official Topfragg giveaways and community rewards." },
    ],
  },
  {
    key: "support",
    name: "🛟 SUPPORT",
    legacyNames: ["SUPPORT"],
    channels: [
      { key: "support-info", name: "ℹ️・support-info", legacyNames: ["support-info"], type: ChannelType.GuildText, mode: "read-only", topic: "Read this guide before contacting the Topfragg support team." },
      { key: "create-ticket", name: "🎫・create-ticket", legacyNames: ["create-ticket"], type: ChannelType.GuildText, mode: "read-only", topic: "Open a private support ticket with the Topfragg team." },
      { key: "player-reports", name: "🚨・player-reports", legacyNames: ["player-reports"], type: ChannelType.GuildText, mode: "read-only", topic: "Confidentially report cheating, harassment or rule violations." },
    ],
  },
  {
    key: "voice",
    name: "🔊 VOICE",
    legacyNames: ["VOICE"],
    channels: [
      { key: "community-lobby", name: "🎙️ Community Lobby", legacyNames: ["Community Lobby"], type: ChannelType.GuildVoice, mode: "voice" },
      { key: "looking-for-group", name: "🔎 Looking for Group", legacyNames: ["Looking for Group"], type: ChannelType.GuildVoice, mode: "voice" },
      { key: "team-alpha", name: "🔵 Team Alpha", legacyNames: ["Team Alpha"], type: ChannelType.GuildVoice, mode: "voice" },
      { key: "team-bravo", name: "🟠 Team Bravo", legacyNames: ["Team Bravo"], type: ChannelType.GuildVoice, mode: "voice" },
      { key: "caster-lounge", name: "🎙️ Caster Lounge", legacyNames: ["Caster Lounge"], type: ChannelType.GuildVoice, mode: "caster-voice" },
    ],
  },
  {
    key: "staff",
    name: "🛡️ STAFF",
    legacyNames: ["STAFF"],
    mode: "staff",
    channels: [
      { key: "staff-chat", name: "🛡️・staff-chat", legacyNames: ["staff-chat"], type: ChannelType.GuildText, mode: "staff", topic: "Private Topfragg staff coordination." },
      { key: "tournament-ops", name: "🏆・tournament-ops", legacyNames: ["tournament-ops"], type: ChannelType.GuildText, mode: "staff", topic: "Tournament operations and bracket coordination." },
      { key: "moderation-log", name: "🔨・moderation-log", legacyNames: ["moderation-log"], type: ChannelType.GuildText, mode: "staff", topic: "Moderation actions and reports." },
      { key: "bot-log", name: "🤖・bot-log", legacyNames: ["bot-log"], type: ChannelType.GuildText, mode: "staff", topic: "Topfragg Bot status and automation logs." },
    ],
  },
];

export const memberCountSpec = {
  key: "member-count",
  name: "👥・members-0",
  legacyNames: ["members"],
  type: ChannelType.GuildText,
  mode: "counter",
};

export const commandSpecs = [
  { name: "ping", description: "Check whether Topfragg Bot is online." },
  { name: "verify", description: "Verify your linked Topfragg and Discord identity." },
  { name: "tournaments", description: "Open the current Topfragg tournaments." },
  {
    name: "support",
    description: "Open a private Topfragg support ticket.",
    options: [
      {
        name: "reason",
        description: "Briefly describe what you need help with.",
        type: 3,
        required: true,
        maxLength: 500,
      },
    ],
  },
  {
    name: "setup-status",
    description: "Show the Topfragg Discord setup status.",
    defaultMemberPermissions: PermissionFlagsBits.ManageGuild.toString(),
  },
  {
    name: "giveaway",
    description: "Start or end an official Topfragg giveaway.",
    defaultMemberPermissions: PermissionFlagsBits.ManageGuild.toString(),
    options: [
      {
        name: "start",
        description: "Start a new giveaway in #giveaways.",
        type: 1,
        options: [
          { name: "title", description: "Giveaway title", type: 3, required: true, maxLength: 80 },
          { name: "prize", description: "What the winner receives", type: 3, required: true, maxLength: 120 },
          { name: "minutes", description: "Duration in minutes (5 to 10080)", type: 4, required: true, minValue: 5, maxValue: 10080 },
          { name: "winners", description: "Number of winners (1 to 10)", type: 4, required: true, minValue: 1, maxValue: 10 },
        ],
      },
      {
        name: "end",
        description: "End a giveaway now and draw winners.",
        type: 1,
        options: [
          { name: "id", description: "Giveaway ID", type: 3, required: true },
        ],
      },
    ],
  },
];

export const staffRoleNames = ["CEO", "Admin", "Tournament Admin", "Moderator", "Support"];
export const selfAssignableRoleNames = ["EU", "NA", "2v2", "S&D"];

export function discordEnvironment() {
  const config = {
    token: process.env.DISCORD_TOKEN?.trim(),
    clientId: process.env.DISCORD_CLIENT_ID?.trim(),
    guildId: process.env.DISCORD_GUILD_ID?.trim(),
    publicUrl: (process.env.TOPFRAGG_PUBLIC_URL || "https://topfragg.gg").replace(/\/$/, ""),
  };
  const missing = Object.entries(config)
    .filter(([key, value]) => key !== "publicUrl" && !value)
    .map(([key]) => key);
  if (missing.length) {
    throw new Error(`Missing Discord configuration: ${missing.join(", ")}. Add it to .env before continuing.`);
  }
  return config;
}
