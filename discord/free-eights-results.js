import crypto from "node:crypto";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, escapeMarkdown } from "discord.js";
import { prisma } from "../server/prisma.js";
import { TOPFRAGG_COLORS } from "./config.js";

const WEEK = 7 * 24 * 60 * 60 * 1000;
export const freeEightsResultKey = (guildId, matchId) => `free8s-result:${guildId}:${matchId}`;
const footerFor = (matchId) => `Topfragg • Free 8s • Match ${matchId}`;
const flat = (row) => ({ ...row.metadata, id: row.id });
const logResult = (event, details) => console.log("[Topfragg Free 8s Results]", JSON.stringify({ event, ...details }));

// The completed match and its stored participants are authoritative. A captain's
// winner_name is not the name of the entire winning team.
export function freeEightsResultPayload(match, participants, publicUrl) {
  if (match?.match_type !== "8s" || match.status !== "completed"
    || !match.host_id || !match.challenger_id || match.host_id === match.challenger_id
    || ![match.host_id, match.challenger_id].includes(match.winner_id)) return null;
  const wonAlpha = match.winner_id === match.host_id;
  const winnerScore = Number(match.winner_score), loserScore = Number(match.loser_score);
  const completedAt = Date.parse(match.match_completed_date);
  if (match.winner_score == null || match.loser_score == null
    || !Number.isInteger(winnerScore) || !Number.isInteger(loserScore)
    || loserScore < 0 || winnerScore <= loserScore || !Number.isFinite(completedAt)) return null;
  if (participants.length !== 8 || participants.some((player) => !player.user_id || player.wager_id !== match.id)
    || new Set(participants.map((player) => player.user_id)).size !== 8) return null;
  const alpha = participants.filter((player) => player.team === "host");
  const bravo = participants.filter((player) => player.team === "challenger");
  if (alpha.length !== 4 || bravo.length !== 4) return null;
  const names = (players) => players.map((player) => `• ${escapeMarkdown(String(player.user_name || "Player").replace(/[\r\n]/g, " ").slice(0, 80))}`).join("\n");
  const alphaScore = wonAlpha ? winnerScore : loserScore;
  const bravoScore = wonAlpha ? loserScore : winnerScore;
  const mode = escapeMarkdown(String(match.game_mode_display || match.game_mode || "Competitive").slice(0, 100));
  const embed = new EmbedBuilder()
    .setColor(TOPFRAGG_COLORS.green)
    .setTitle("🏆 Free 8s · Match result")
    .setDescription(`**Team ${wonAlpha ? "Alpha" : "Bravo"} wins ${winnerScore}–${loserScore}!**\n${mode} · 4v4`)
    .addFields(
      { name: `🔵 Team Alpha · ${alphaScore}${wonAlpha ? " · WINNERS" : ""}`, value: names(alpha), inline: true },
      { name: `🟠 Team Bravo · ${bravoScore}${wonAlpha ? "" : " · WINNERS"}`, value: names(bravo), inline: true },
    )
    .setFooter({ text: footerFor(match.id) })
    .setTimestamp(completedAt);
  return {
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(new ButtonBuilder()
      .setLabel("View match").setStyle(ButtonStyle.Link)
      .setURL(`${publicUrl.replace(/\/$/, "")}/8s-match/${encodeURIComponent(match.id)}`))],
    allowedMentions: { parse: [] },
  };
}

// If Discord accepted a message but the worker stopped before saving its ID,
// recover that exact bot message rather than posting the result a second time.
async function recoverMessage(channel, state, guard) {
  let before;
  for (;;) {
    await guard();
    const messages = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
    const found = messages.find((message) => message.author?.id === state.bot_id
      && message.embeds?.some((embed) => embed.footer?.text === footerFor(state.match_id)));
    if (found) return found;
    const oldest = messages.last();
    if (messages.size < 100 || !oldest || oldest.createdTimestamp < Date.parse(state.started_at) - 5000) return null;
    if (oldest.id === before) throw new Error("Discord history did not advance; refusing duplicate result");
    before = oldest.id;
  }
}

async function publishResult(guild, db, tx, matchId, channel, publicUrl, log) {
  const key = freeEightsResultKey(guild.id, matchId);
  const previous = await db.discordEventDispatch.findUnique({ where: { event_key: key } });
  if (previous?.metadata?.message_id) return;
  const row = await db.wager.findUnique({ where: { id: matchId } });
  if (!row) return;
  const participants = (await db.wagerParticipant.findMany({ where: { metadata: { path: ["wager_id"], equals: matchId } } })).map((player) => player.metadata);
  const payload = freeEightsResultPayload(flat(row), participants, publicUrl);
  if (!payload) { log("result-not-confirmed", { match_id: matchId }); return; }
  const state = structuredClone(previous?.metadata || {
    match_id: matchId, guild_id: guild.id, channel_id: channel.id,
    bot_id: guild.client.user.id, started_at: new Date().toISOString(), status: "pending",
    nonce: crypto.createHash("sha256").update(key).digest("hex").slice(0, 25),
  });
  if (state.match_id !== matchId || state.guild_id !== guild.id || state.bot_id !== guild.client.user.id) {
    throw new Error("Result dispatch ownership mismatch");
  }
  const workerToken = crypto.randomUUID();
  state.worker_token = workerToken;
  await tx.$queryRaw`SELECT 1`;
  // Save outside the lock transaction: a timeout must not erase a reservation
  // or receipt after Discord has accepted the message.
  if (previous) {
    const claim = await db.discordEventDispatch.updateMany({
      where: { event_key: key, metadata: { equals: previous.metadata } }, data: { metadata: state },
    });
    if (!claim.count) throw new Error("Result dispatch changed before claim; refusing stale worker");
  } else await db.discordEventDispatch.create({ data: { event_key: key, metadata: state } });
  const guard = async () => {
    await tx.$queryRaw`SELECT 1`;
    const current = await db.discordEventDispatch.findUnique({ where: { event_key: key } });
    if (current?.metadata?.worker_token !== workerToken) throw new Error("Result worker replaced; refusing stale Discord action");
  };
  const target = state.channel_id === channel.id ? channel : await guild.channels.fetch(state.channel_id);
  if (!target?.isTextBased() || typeof target.send !== "function") throw new Error("Stored results channel is unavailable");
  const recovered = previous ? await recoverMessage(target, state, guard) : null;
  await guard();
  log(recovered ? "result-recovered" : "result-send-attempt", { match_id: matchId, channel_id: target.id });
  const message = recovered || await target.send({ ...payload, nonce: state.nonce, enforceNonce: true });
  const saved = await db.discordEventDispatch.updateMany({
    where: { event_key: key, metadata: { path: ["worker_token"], equals: workerToken } },
    data: { metadata: { ...state, status: "sent", message_id: message.id, sent_at: new Date().toISOString() } },
  });
  if (!saved.count) throw new Error("Result receipt ownership changed; the next worker will recover the message");
  log("result-posted", { match_id: matchId, channel_id: target.id, message_id: message.id });
}

export async function syncFreeEightsResults(guild, { db = prisma, publicUrl, findChannel, log = logResult, now = new Date() } = {}) {
  const channel = findChannel(guild, "match-results");
  if (!channel?.isTextBased() || typeof channel.send !== "function") {
    log("results-channel-unavailable", { guild_id: guild.id });
    return;
  }
  const cutoff = new Date(now.getTime() - WEEK);
  let cursor;
  for (;;) {
    // Paginate by immutable ID: a busy week must not starve earlier results.
    const matches = await db.wager.findMany({ where: { AND: [
      { metadata: { path: ["match_type"], equals: "8s" } },
      { metadata: { path: ["status"], equals: "completed" } },
      { updated_date: { gte: cutoff } },
    ] }, orderBy: { id: "asc" }, take: 100, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
    if (!matches.length) return;
    for (const match of matches) {
      if (Date.parse(match.metadata?.match_completed_date) < cutoff.getTime()) continue;
      try {
        await db.$transaction(async (tx) => {
          const [lock] = await tx.$queryRaw`SELECT pg_try_advisory_xact_lock(hashtext(${freeEightsResultKey(guild.id, match.id)})) AS locked`;
          if (lock.locked) await publishResult(guild, db, tx, match.id, channel, publicUrl, log);
        }, { timeout: 60_000, maxWait: 5_000 });
      } catch (error) {
        log("result-send-failed", { match_id: match.id, code: error.code, error: error.message });
      }
    }
    if (matches.length < 100) return;
    cursor = matches.at(-1).id;
  }
}
