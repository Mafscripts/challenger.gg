import { ChannelType, PermissionFlagsBits } from "discord.js";

const adminPermissions = PermissionFlagsBits.ManageGuild.toString();
const channelOption = { name: "channel", description: "Where to post (defaults to the current channel).", type: 7, channelTypes: [ChannelType.GuildText, ChannelType.GuildAnnouncement] };
const everyoneOption = { name: "everyone", description: "Ping @everyone when publishing (default: no).", type: 5 };

export const communityCommandSpecs = [
  { name: "help", description: "Show Topfragg Bot commands and how to use them." },
  { name: "rules", description: "Read the Topfragg community and competition rules." },
  { name: "8s", description: "Join Free 8s and find your match room." },
  { name: "streams", description: "Find Topfragg community streams and live coverage." },
  { name: "retard", description: "Give a player a lighthearted gaming roast.", options: [
    { name: "username", description: "Choose the player to joke about.", type: 6, required: true },
  ] },
  { name: "announce", description: "Write an announcement, preview it privately, then publish.", defaultMemberPermissions: adminPermissions, options: [channelOption, everyoneOption] },
  { name: "poll", description: "Create a community poll with a private preview before publishing.", defaultMemberPermissions: adminPermissions, options: [
    { ...channelOption, channelTypes: [ChannelType.GuildText] },
    { name: "hours", description: "Voting duration in hours (default: 24).", type: 4, minValue: 1, maxValue: 768 },
    { name: "multiple", description: "Allow voting for multiple answers (default: no).", type: 5 },
    everyoneOption,
  ] },
  { name: "poll-end", description: "Preview and end a Topfragg Bot poll early.", defaultMemberPermissions: adminPermissions, options: [
    { name: "message", description: "Discord message link or message ID of the poll.", type: 3, required: true, maxLength: 200 },
    channelOption,
  ] },
];

// Registration can run without starting another Gateway connection or server setup.
export const commandApiPayload = (spec) => ({
  name: spec.name, description: spec.description,
  ...(spec.defaultMemberPermissions ? { default_member_permissions: spec.defaultMemberPermissions } : {}),
  ...(spec.options ? { options: spec.options.map((option) => {
    const { channelTypes, minValue, maxValue, maxLength, ...rest } = option;
    return { ...rest, required: Boolean(rest.required), ...(channelTypes ? { channel_types: channelTypes } : {}), ...(minValue !== undefined ? { min_value: minValue } : {}), ...(maxValue !== undefined ? { max_value: maxValue } : {}), ...(maxLength !== undefined ? { max_length: maxLength } : {}) };
  }) } : {}),
});
