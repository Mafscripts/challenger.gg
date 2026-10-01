import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from "discord.js";
import { prisma } from "../server/prisma.js";
import { getLiveTwitchStreams } from "../server/twitch.js";
import { TOPFRAGG_COLORS } from "./config.js";

const eventKeyFor = (stream) => `twitch-live:${stream.id}`;

const wasPosted = async (eventKey) => Boolean(await prisma.discordEventDispatch.findUnique({ where: { event_key: eventKey } }));
const markPosted = async (eventKey, metadata) => {
  try {
    await prisma.discordEventDispatch.create({ data: { event_key: eventKey, metadata } });
  } catch (error) {
    if (error.code !== "P2002") throw error;
  }
};

const streamEmbed = (stream, player) => {
  const image = String(stream.thumbnail_url || "").replace("{width}", "1280").replace("{height}", "720");
  const embed = new EmbedBuilder()
    .setColor(TOPFRAGG_COLORS.purple)
    .setTitle(`🔴 ${stream.user_name || player.twitch_display_name || "Topfragg streamer"} is live on Twitch`)
    .setDescription(stream.title || "Live now with the Topfragg community.")
    .addFields(
      { name: "Game", value: stream.game_name || "Live stream", inline: true },
      { name: "Viewers", value: String(stream.viewer_count || 0), inline: true },
    )
    .setFooter({ text: "Official Topfragg stream alert" })
    .setTimestamp(new Date(stream.started_at || Date.now()));
  if (/^https?:\/\//i.test(image)) embed.setImage(image);
  return embed;
};

export async function syncTwitchLiveStreams(guild, findChannel, log) {
  const channel = findChannel(guild, "live-now");
  if (!channel?.isTextBased()) return;
  const players = await prisma.user.findMany({
    where: { twitch_user_id: { not: null }, discord_user_id: { not: null } },
    select: { id: true, display_name: true, twitch_user_id: true, twitch_login: true, twitch_display_name: true, discord_user_id: true },
    take: 100,
  });
  if (!players.length) return;
  let streams;
  try {
    streams = await getLiveTwitchStreams(players.map((player) => player.twitch_user_id));
  } catch (error) {
    if (error.code === "TWITCH_NOT_CONFIGURED") return;
    throw error;
  }
  const playerByTwitchId = new Map(players.map((player) => [String(player.twitch_user_id), player]));
  const streamerRole = guild.roles.cache.find((role) => role.name === "Streamer");
  for (const stream of streams) {
    const player = playerByTwitchId.get(String(stream.user_id));
    if (!player) continue;
    const member = await guild.members.fetch(player.discord_user_id).catch(() => null);
    if (!member || !streamerRole || !member.roles.cache.has(streamerRole.id)) continue;
    const eventKey = eventKeyFor(stream);
    if (await wasPosted(eventKey)) continue;
    const url = `https://www.twitch.tv/${encodeURIComponent(stream.user_login || player.twitch_login)}`;
    await channel.send({
      content: `<@${player.discord_user_id}> is live!`,
      embeds: [streamEmbed(stream, player)],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setLabel("Watch on Twitch").setStyle(ButtonStyle.Link).setURL(url),
      )],
      allowedMentions: { users: [player.discord_user_id] },
    });
    await markPosted(eventKey, { player_id: player.id, twitch_user_id: player.twitch_user_id, started_at: stream.started_at });
    log(`Posted Twitch live alert: ${stream.user_name || player.twitch_login}`);
  }
}
