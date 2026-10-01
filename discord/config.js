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
  { name: "Team Captain", color: TOPFRAGG_COLORS.green, hoist: false, permissions: [] },
  { name: "Tournament Participant", color: TOPFRAGG_COLORS.orange, hoist: false, permissions: [] },
  { name: "Verified Player", color: TOPFRAGG_COLORS.cyan, hoist: false, permissions: [] },
  { name: "Muted", color: TOPFRAGG_COLORS.graphite, hoist: false, permissions: [] },
];

export const categorySpecs = [
  {
    name: "START HERE",
    channels: [
      { name: "welcome", type: ChannelType.GuildText, mode: "read-only", topic: "Welcome to the official Topfragg.gg community." },
      { name: "rules", type: ChannelType.GuildText, mode: "read-only", topic: "Community and competition rules." },
      { name: "announcements", type: ChannelType.GuildText, mode: "read-only", topic: "Official Topfragg news and tournament announcements." },
      { name: "verification", type: ChannelType.GuildText, mode: "read-only", topic: "Connect your Topfragg identity and request verification." },
      { name: "faq", type: ChannelType.GuildText, mode: "read-only", topic: "Quick answers about Topfragg competitions." },
    ],
  },
  {
    name: "COMMUNITY",
    channels: [
      { name: "general", type: ChannelType.GuildText, mode: "chat", topic: "Topfragg community chat." },
      { name: "looking-for-team", type: ChannelType.GuildText, mode: "chat", topic: "Find teammates and complete your roster." },
      { name: "clips-and-content", type: ChannelType.GuildText, mode: "chat", topic: "Share your best plays, streams and videos." },
      { name: "off-topic", type: ChannelType.GuildText, mode: "chat", topic: "Community conversation outside competition." },
    ],
  },
  {
    name: "COMPETITION",
    channels: [
      { name: "tournaments", type: ChannelType.GuildText, mode: "read-only", topic: "Upcoming Topfragg tournaments." },
      { name: "tournament-signups", type: ChannelType.GuildText, mode: "chat", topic: "Tournament registration questions and roster calls." },
      { name: "match-results", type: ChannelType.GuildText, mode: "read-only", topic: "Official match results." },
      { name: "leaderboards", type: ChannelType.GuildText, mode: "read-only", topic: "Topfragg standings and season leaders." },
      { name: "disputes", type: ChannelType.GuildText, mode: "read-only", topic: "Use /support to open a private dispute ticket." },
    ],
  },
  {
    name: "SUPPORT",
    channels: [
      { name: "support-info", type: ChannelType.GuildText, mode: "read-only", topic: "Get help from the Topfragg support team." },
      { name: "create-ticket", type: ChannelType.GuildText, mode: "read-only", topic: "Use /support to open a private support ticket." },
      { name: "player-reports", type: ChannelType.GuildText, mode: "read-only", topic: "Use /support to privately report a player." },
    ],
  },
  {
    name: "VOICE",
    channels: [
      { name: "Community Lobby", type: ChannelType.GuildVoice, mode: "voice" },
      { name: "Looking for Group", type: ChannelType.GuildVoice, mode: "voice" },
      { name: "Team Alpha", type: ChannelType.GuildVoice, mode: "voice" },
      { name: "Team Bravo", type: ChannelType.GuildVoice, mode: "voice" },
      { name: "Caster Lounge", type: ChannelType.GuildVoice, mode: "caster-voice" },
    ],
  },
  {
    name: "STAFF",
    mode: "staff",
    channels: [
      { name: "staff-chat", type: ChannelType.GuildText, mode: "staff", topic: "Private Topfragg staff coordination." },
      { name: "tournament-ops", type: ChannelType.GuildText, mode: "staff", topic: "Tournament operations and bracket coordination." },
      { name: "moderation-log", type: ChannelType.GuildText, mode: "staff", topic: "Moderation actions and reports." },
      { name: "bot-log", type: ChannelType.GuildText, mode: "staff", topic: "Topfragg Bot status and automation logs." },
    ],
  },
];

export const commandSpecs = [
  { name: "ping", description: "Check whether Topfragg Bot is online." },
  { name: "verify", description: "See how to verify your Topfragg account." },
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
];

export const staffRoleNames = ["CEO", "Admin", "Tournament Admin", "Moderator", "Support"];

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
