import crypto from "node:crypto";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
} from "discord.js";
import { prisma } from "../server/prisma.js";
import { TOPFRAGG_COLORS } from "./config.js";

const giveawayEmbed = (giveaway, { winners = null, entryCount = null } = {}) => {
  const endsAt = Math.floor(new Date(giveaway.ends_at).getTime() / 1000);
  const ended = giveaway.status === "ended";
  const description = ended
    ? (winners?.length ? `Congratulations ${winners.map((id) => `<@${id}>`).join(", ")}!` : "No eligible entries were received for this giveaway.")
    : "Verified Topfragg players can enter with the button below.";
  const embed = new EmbedBuilder()
    .setColor(ended ? TOPFRAGG_COLORS.green : TOPFRAGG_COLORS.purple)
    .setTitle(`${ended ? "🎉 Ended" : "🎁 Giveaway"} · ${giveaway.title}`)
    .setDescription(description)
    .addFields(
      { name: "Prize", value: giveaway.prize, inline: true },
      { name: "Winners", value: String(giveaway.winner_count), inline: true },
      { name: ended ? "Ended" : "Ends", value: ended ? `<t:${endsAt}:F>` : `<t:${endsAt}:F>\n<t:${endsAt}:R>`, inline: true },
    )
    .setFooter({ text: entryCount === null ? "Official Topfragg giveaway" : `${entryCount} eligible entr${entryCount === 1 ? "y" : "ies"}` })
    .setTimestamp();
  return embed;
};

const enterButton = (giveaway) => new ActionRowBuilder().addComponents(
  new ButtonBuilder()
    .setCustomId(`topfragg:giveaway:enter:${giveaway.id}`)
    .setLabel("Enter giveaway")
    .setEmoji("🎉")
    .setStyle(ButtonStyle.Primary),
);

const uniqueWinners = (entries, count) => {
  const pool = [...entries];
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swapIndex = crypto.randomInt(index + 1);
    [pool[index], pool[swapIndex]] = [pool[swapIndex], pool[index]];
  }
  return pool.slice(0, Math.min(count, pool.length)).map((entry) => entry.discord_user_id);
};

export async function startGiveaway(interaction, giveawaysChannel) {
  const minutes = interaction.options.getInteger("minutes", true);
  const winnerCount = interaction.options.getInteger("winners", true);
  const giveaway = await prisma.discordGiveaway.create({
    data: {
      title: interaction.options.getString("title", true),
      prize: interaction.options.getString("prize", true),
      channel_id: giveawaysChannel.id,
      ends_at: new Date(Date.now() + (minutes * 60 * 1000)),
      winner_count: winnerCount,
    },
  });
  const message = await giveawaysChannel.send({
    embeds: [giveawayEmbed(giveaway)],
    components: [enterButton(giveaway)],
    allowedMentions: { parse: [] },
  });
  await prisma.discordGiveaway.update({ where: { id: giveaway.id }, data: { message_id: message.id } });
  await interaction.reply({ content: `Giveaway started in ${giveawaysChannel}. ID: \`${giveaway.id}\``, flags: MessageFlags.Ephemeral });
}

export async function enterGiveaway(interaction, giveawayId) {
  const verifiedRole = interaction.guild.roles.cache.find((role) => role.name === "Verified Player");
  if (!verifiedRole || !interaction.member.roles.cache.has(verifiedRole.id)) {
    await interaction.reply({ content: "Verify your Topfragg identity before entering giveaways.", flags: MessageFlags.Ephemeral });
    return;
  }
  const giveaway = await prisma.discordGiveaway.findUnique({ where: { id: giveawayId } });
  if (!giveaway || giveaway.status !== "open" || new Date(giveaway.ends_at).getTime() <= Date.now()) {
    await interaction.reply({ content: "This giveaway is no longer open.", flags: MessageFlags.Ephemeral });
    return;
  }
  try {
    await prisma.discordGiveawayEntry.create({ data: { giveaway_id: giveaway.id, discord_user_id: interaction.user.id } });
    await interaction.reply({ content: "You are entered — good luck!", flags: MessageFlags.Ephemeral });
  } catch (error) {
    if (error.code === "P2002") {
      await interaction.reply({ content: "You are already entered in this giveaway.", flags: MessageFlags.Ephemeral });
      return;
    }
    throw error;
  }
}

export async function endGiveaway(guild, giveawayId, { force = false } = {}) {
  const giveaway = await prisma.discordGiveaway.findUnique({ where: { id: giveawayId } });
  if (!giveaway || giveaway.status !== "open") return { ended: false, reason: "not-open" };
  if (!force && new Date(giveaway.ends_at).getTime() > Date.now()) return { ended: false, reason: "not-finished" };
  const entries = await prisma.discordGiveawayEntry.findMany({ where: { giveaway_id: giveaway.id } });
  const winners = uniqueWinners(entries, giveaway.winner_count);
  const ended = await prisma.discordGiveaway.update({ where: { id: giveaway.id }, data: { status: "ended" } });
  const channel = giveaway.channel_id ? await guild.channels.fetch(giveaway.channel_id).catch(() => null) : null;
  if (channel?.isTextBased() && giveaway.message_id) {
    const message = await channel.messages.fetch(giveaway.message_id).catch(() => null);
    await message?.edit({ embeds: [giveawayEmbed(ended, { winners, entryCount: entries.length })], components: [], allowedMentions: { users: winners } });
  }
  if (channel?.isTextBased()) {
    await channel.send({
      content: winners.length ? `🎉 Congratulations ${winners.map((id) => `<@${id}>`).join(", ")}!` : "🎁 Giveaway ended with no eligible entries.",
      allowedMentions: { users: winners },
    });
  }
  return { ended: true, winners, giveaway: ended };
}

export async function closeExpiredGiveaways(guild, log) {
  const rows = await prisma.discordGiveaway.findMany({
    where: { status: "open", ends_at: { lte: new Date() } },
    take: 50,
  });
  for (const giveaway of rows) {
    const result = await endGiveaway(guild, giveaway.id);
    if (result.ended) log(`Ended giveaway: ${giveaway.title}`);
  }
}
