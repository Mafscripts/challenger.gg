import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from "discord.js";
import { prisma } from "../server/prisma.js";
import { TOPFRAGG_COLORS } from "./config.js";

const HOUR = 60 * 60 * 1000;
const ACTIVE_TOURNAMENT_STATUSES = new Set(["open", "registration", "waiting", "available", "in_progress", "started", "live"]);

const flat = (row) => ({ ...(row?.metadata || {}), ...row });
const memberUserIds = (participant) => [
  participant?.user_id,
  participant?.captain_id,
  ...(Array.isArray(participant?.members) ? participant.members.map((member) => member?.user_id) : []),
].filter(Boolean).map(String).filter((value, index, values) => values.indexOf(value) === index);
const asText = (value, fallback = "TBD") => String(value || fallback).slice(0, 1024);
const money = (value) => `$${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const timestamp = (value) => {
  const millis = new Date(value || 0).getTime();
  return Number.isFinite(millis) && millis > 0 ? Math.floor(millis / 1000) : null;
};
const isHttpUrl = (value) => /^https?:\/\//i.test(String(value || ""));

async function wasDispatched(eventKey) {
  return Boolean(await prisma.discordEventDispatch.findUnique({ where: { event_key: eventKey } }));
}

async function markDispatched(eventKey, metadata = {}) {
  try {
    await prisma.discordEventDispatch.create({ data: { event_key: eventKey, metadata } });
    return true;
  } catch (error) {
    if (error.code === "P2002") return false;
    throw error;
  }
}

function eventUrl(publicUrl, tournament) {
  return `${publicUrl}/tournaments/${encodeURIComponent(tournament.id)}`;
}

function tournamentEmbed(tournament) {
  const start = timestamp(tournament.start_date);
  const embed = new EmbedBuilder()
    .setColor(TOPFRAGG_COLORS.orange)
    .setTitle(`🏆 ${asText(tournament.name, "New Topfragg tournament")}`)
    .setDescription(asText(tournament.description, "Registration is open. Build your roster and claim your place in the bracket."))
    .addFields(
      { name: "Prize pool", value: money(tournament.prize_pool), inline: true },
      { name: "Format", value: asText(tournament.game_mode || tournament.team_size || tournament.format, "Tournament"), inline: true },
      { name: "Teams", value: `${Number(tournament.registered_teams || 0)} / ${tournament.max_teams || "Open"}`, inline: true },
      { name: "Starts", value: start ? `<t:${start}:F>\n<t:${start}:R>` : "To be announced", inline: false },
    )
    .setFooter({ text: "Topfragg tournament announcement" })
    .setTimestamp();
  const image = tournament.image_url || tournament.banner_url || tournament.cover_image_url || tournament.feature_image_url;
  if (isHttpUrl(image)) embed.setImage(image);
  return embed;
}

function resultEmbed(tournament, match) {
  const scoreA = match.team_a_score ?? match.score_alpha ?? 0;
  const scoreB = match.team_b_score ?? match.score_bravo ?? 0;
  return new EmbedBuilder()
    .setColor(TOPFRAGG_COLORS.green)
    .setTitle(`📊 Result · ${asText(tournament.name, "Topfragg tournament")}`)
    .setDescription(`**${asText(match.team_a_name, "Team A")}** ${scoreA} — ${scoreB} **${asText(match.team_b_name, "Team B")}**`)
    .addFields(
      { name: "Winner", value: `🏆 ${asText(match.winner_name, "Winner pending")}`, inline: true },
      { name: "Round", value: asText(match.round_name || match.round || "Tournament match"), inline: true },
    )
    .setFooter({ text: "Official Topfragg match result" })
    .setTimestamp(new Date(match.completed_date || match.updated_date || Date.now()));
}

function reminderEmbed(tournament, label) {
  const start = timestamp(tournament.start_date);
  return new EmbedBuilder()
    .setColor(TOPFRAGG_COLORS.cyan)
    .setTitle(`⏰ ${tournament.name} starts ${label}`)
    .setDescription(`Your team is registered. Be ready in Discord and on Topfragg${start ? ` by <t:${start}:t> (<t:${start}:R>)` : ""}.`)
    .addFields({ name: "Quick check", value: "Confirm your roster, check the bracket and be online before your first match." })
    .setFooter({ text: "Topfragg player reminder" });
}

function liveMatchEmbed(tournament, match) {
  const start = timestamp(match.scheduled_start_date || match.start_date || tournament.start_date);
  return new EmbedBuilder()
    .setColor(TOPFRAGG_COLORS.red)
    .setTitle("🔴 LIVE NOW · Topfragg")
    .setDescription(`**${asText(match.team_a_name, "Team A")}** vs **${asText(match.team_b_name, "Team B")}**`)
    .addFields(
      { name: "Tournament", value: asText(tournament.name, "Topfragg tournament"), inline: true },
      { name: "Round", value: asText(match.round_name || match.round || "Tournament match"), inline: true },
      { name: "Started", value: start ? `<t:${start}:R>` : "Now", inline: true },
    )
    .setFooter({ text: "Follow the match on Topfragg" })
    .setTimestamp();
}

function teamInviteEmbed(invite) {
  return new EmbedBuilder()
    .setColor(TOPFRAGG_COLORS.purple)
    .setTitle("👥 You have a Topfragg team invite")
    .setDescription(`**${asText(invite.invited_by_name, "A captain")}** invited you to join **${asText(invite.team_name, "a team")}**.`)
    .addFields(
      { name: "Team type", value: asText(invite.team_type, "Team"), inline: true },
      { name: "Next step", value: "Open Topfragg to accept or decline the invitation." },
    )
    .setFooter({ text: "Topfragg team invitation" })
    .setTimestamp(new Date(invite.created_date || Date.now()));
}

async function participantDiscordIds(tournamentId) {
  const rows = await prisma.tournamentParticipant.findMany({ orderBy: { updated_date: "desc" }, take: 500 });
  const userIds = new Set();
  rows.map(flat).filter((row) => String(row.tournament_id || "") === String(tournamentId)).forEach((participant) => {
    memberUserIds(participant).forEach((userId) => userIds.add(userId));
  });
  if (!userIds.size) return [];
  const users = await prisma.user.findMany({
    where: { id: { in: [...userIds] }, discord_user_id: { not: null } },
    select: { discord_user_id: true },
  });
  return users.map((user) => user.discord_user_id).filter(Boolean);
}

async function sendPlayerReminder(client, tournament, reminderKey, label, publicUrl) {
  const eventKey = `tournament-reminder:${reminderKey}:${tournament.id}`;
  if (await wasDispatched(eventKey)) return;
  const discordIds = await participantDiscordIds(tournament.id);
  const embed = reminderEmbed(tournament, label);
  const components = [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setLabel("Open tournament").setStyle(ButtonStyle.Link).setURL(eventUrl(publicUrl, tournament)),
  )];
  let delivered = 0;
  for (const discordId of discordIds) {
    try {
      const user = await client.users.fetch(discordId);
      await user.send({ embeds: [embed], components });
      delivered += 1;
    } catch {
      // Players can disable server direct messages; one failed DM must not stop the event loop.
    }
  }
  await markDispatched(eventKey, { tournament_id: tournament.id, delivered, recipient_count: discordIds.length });
}

async function sendTeamInviteNotifications(client, publicUrl, log) {
  const rows = await prisma.teamInvite.findMany({ orderBy: { created_date: "desc" }, take: 200 });
  const cutoff = Date.now() - (7 * 24 * HOUR);
  for (const invite of rows.map(flat)) {
    if (invite.status !== "pending" || new Date(invite.created_date || 0).getTime() < cutoff) continue;
    const eventKey = `team-invite:${invite.id}`;
    if (await wasDispatched(eventKey)) continue;
    const user = await prisma.user.findUnique({
      where: { id: String(invite.invited_user_id || "") },
      select: { discord_user_id: true },
    }).catch(() => null);
    let delivered = false;
    if (user?.discord_user_id) {
      try {
        const discordUser = await client.users.fetch(user.discord_user_id);
        await discordUser.send({
          embeds: [teamInviteEmbed(invite)],
          components: [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setLabel("View team invite").setStyle(ButtonStyle.Link).setURL(`${publicUrl}/teams`),
          )],
        });
        delivered = true;
      } catch {
        // Direct messages are optional and can be disabled by the receiving player.
      }
    }
    await markDispatched(eventKey, { invite_id: invite.id, delivered });
    log(`Processed team invite notification: ${invite.id}${delivered ? "" : " (DM unavailable)"}`);
  }
}

async function sendFirstTournamentMessages(client, publicUrl, log) {
  const rows = (await prisma.tournamentParticipant.findMany({ orderBy: { created_date: "asc" }, take: 500 })).map(flat);
  const cutoff = Date.now() - (7 * 24 * HOUR);
  const firstParticipantIdByUser = new Map();
  rows.forEach((participant) => {
    memberUserIds(participant).forEach((userId) => {
      if (!firstParticipantIdByUser.has(userId)) firstParticipantIdByUser.set(userId, participant.id);
    });
  });
  for (const participant of rows) {
    if (new Date(participant.created_date || 0).getTime() < cutoff) continue;
    for (const userId of memberUserIds(participant)) {
      if (firstParticipantIdByUser.get(userId) !== participant.id) continue;
      const eventKey = `first-tournament:${userId}`;
      if (await wasDispatched(eventKey)) continue;
      const [user, tournament] = await Promise.all([
        prisma.user.findUnique({ where: { id: userId }, select: { discord_user_id: true } }).catch(() => null),
        prisma.tournament.findUnique({ where: { id: String(participant.tournament_id || "") } }).catch(() => null),
      ]);
      let delivered = false;
      if (user?.discord_user_id && tournament) {
        const event = flat(tournament);
        try {
          const discordUser = await client.users.fetch(user.discord_user_id);
          await discordUser.send({
            embeds: [new EmbedBuilder()
              .setColor(TOPFRAGG_COLORS.green)
              .setTitle("🏆 Your first Topfragg tournament")
              .setDescription(`You are registered for **${asText(event.name, "a Topfragg tournament")}**. Get your team ready and good luck in the arena!`)
              .addFields({ name: "Next step", value: "Check your roster, tournament details and match room before the event starts." })
              .setTimestamp()],
            components: [new ActionRowBuilder().addComponents(
              new ButtonBuilder().setLabel("Open tournament").setStyle(ButtonStyle.Link).setURL(eventUrl(publicUrl, event)),
            )],
          });
          delivered = true;
        } catch {
          // Direct messages can be disabled by the player.
        }
      }
      await markDispatched(eventKey, { user_id: userId, tournament_id: participant.tournament_id, delivered });
      log(`Processed first tournament DM: ${userId}${delivered ? "" : " (DM unavailable)"}`);
    }
  }
}

export async function syncTournamentDiscord(guild, client, { publicUrl, findChannel, log }) {
  const [tournamentRows, matchRows] = await Promise.all([
    prisma.tournament.findMany({ orderBy: { updated_date: "desc" }, take: 200 }),
    prisma.tournamentMatch.findMany({ orderBy: { updated_date: "desc" }, take: 300 }),
  ]);
  const now = Date.now();
  const tournaments = tournamentRows.map(flat);
  const byId = new Map(tournaments.map((tournament) => [String(tournament.id), tournament]));
  const tournamentChannel = findChannel(guild, "tournaments");
  const resultsChannel = findChannel(guild, "match-results");
  const liveChannel = findChannel(guild, "live-now");

  for (const tournament of tournaments) {
    const status = String(tournament.status || "open").toLowerCase();
    const start = new Date(tournament.start_date || 0).getTime();
    const isCurrent = ACTIVE_TOURNAMENT_STATUSES.has(status) && (!start || start > now - (7 * 24 * HOUR));
    if (!isCurrent) continue;

    const announcementKey = `tournament-announcement:${tournament.id}`;
    if (tournamentChannel && !await wasDispatched(announcementKey)) {
      await tournamentChannel.send({
        embeds: [tournamentEmbed(tournament)],
        components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder().setLabel("Join on Topfragg").setEmoji("🎮").setStyle(ButtonStyle.Link).setURL(eventUrl(publicUrl, tournament)),
        )],
        allowedMentions: { parse: [] },
      });
      await markDispatched(announcementKey, { tournament_id: tournament.id });
      log(`Posted tournament announcement: ${tournament.name || tournament.id}`);
    }

    if (start > now && start <= now + HOUR) {
      await sendPlayerReminder(client, tournament, "1h", "in about 1 hour", publicUrl);
    } else if (start > now + HOUR && start <= now + 24 * HOUR) {
      await sendPlayerReminder(client, tournament, "24h", "within 24 hours", publicUrl);
    }
  }

  for (const row of matchRows.map(flat)) {
    const tournament = byId.get(String(row.tournament_id || ""));
    const complete = row.completed || String(row.status || "").toLowerCase() === "completed";
    const finished = new Date(row.completed_date || row.updated_date || 0).getTime();
    if (!tournament || !complete || !row.winner_name || !finished || finished < now - (7 * 24 * HOUR)) continue;
    const resultKey = `tournament-result:${row.id}:${new Date(row.completed_date || row.updated_date).toISOString()}`;
    if (!resultsChannel || await wasDispatched(resultKey)) continue;
    await resultsChannel.send({
      embeds: [resultEmbed(tournament, row)],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setLabel("Open match").setStyle(ButtonStyle.Link).setURL(`${publicUrl}/tournament-match/${encodeURIComponent(row.id)}`),
      )],
      allowedMentions: { parse: [] },
    });
    await markDispatched(resultKey, { tournament_id: tournament.id, match_id: row.id });
    log(`Posted match result: ${row.team_a_name || "Team A"} vs ${row.team_b_name || "Team B"}`);
  }

  for (const row of matchRows.map(flat)) {
    const tournament = byId.get(String(row.tournament_id || ""));
    const isLive = ["in_progress", "live"].includes(String(row.status || "").toLowerCase());
    if (!tournament || !isLive || !liveChannel) continue;
    const liveKey = `tournament-live:${row.id}`;
    if (await wasDispatched(liveKey)) continue;
    await liveChannel.send({
      embeds: [liveMatchEmbed(tournament, row)],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setLabel("Follow match").setStyle(ButtonStyle.Link).setURL(`${publicUrl}/tournament-match/${encodeURIComponent(row.id)}`),
      )],
      allowedMentions: { parse: [] },
    });
    await markDispatched(liveKey, { tournament_id: tournament.id, match_id: row.id });
    log(`Posted live match: ${row.team_a_name || "Team A"} vs ${row.team_b_name || "Team B"}`);
  }

  await sendTeamInviteNotifications(client, publicUrl, log);
  await sendFirstTournamentMessages(client, publicUrl, log);
}
