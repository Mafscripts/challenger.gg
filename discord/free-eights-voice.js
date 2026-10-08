import crypto from "node:crypto";
import { AuditLogEvent, ChannelType, OverwriteType, PermissionFlagsBits } from "discord.js";
import { prisma } from "../server/prisma.js";
import {
  freeEightsChannelKey, freeEightsDiscordConfig, freeEightsVoiceClosed, freeEightsVoiceKey,
  freeEightsVoiceCategoryIds, freeEightsVoiceLog, hasDiscordLink, validDiscordId, voiceRosterSignature,
} from "../server/free-eights-discord.js";

const activeStatuses = ["open", "in_progress", "awaiting_team_alpha_report", "awaiting_team_bravo_report", "awaiting_completion", "score_conflict", "disputed"];
const guildCategoryReservations = new WeakMap();
const unknownChannel = (error) => Number(error.code) === 10003;
const getChannel = async (guild, id) => {
  if (!id) return null;
  try { return await guild.channels.fetch(id); } catch (error) {
    if (unknownChannel(error)) return null;
    throw error;
  }
};
const rosterFor = async (db, matchId) => (await db.wagerParticipant.findMany({
  where: { metadata: { path: ["wager_id"], equals: matchId } },
})).map((row) => row.metadata);

export const canAssignFreeEightsVoice = (match, participants) => match?.match_type === "8s"
  && !freeEightsVoiceClosed.has(match.status) && Boolean(match.teams_generated_at)
  && participants.length === 8 && new Set(participants.map((row) => row.user_id)).size === 8
  && participants.filter((row) => row.team === "host").length === 4
  && participants.filter((row) => row.team === "challenger").length === 4;

async function channelOwner(db, guild, state, side, id) {
  const row = await db.discordEventDispatch.findUnique({ where: { event_key: freeEightsChannelKey(id) } });
  const owner = row?.metadata;
  if (!owner || owner.match_id !== state.match_id || owner.side !== side
    || owner.guild_id !== guild.id || owner.channel_id !== id) {
    throw new Error(`Channel ownership does not match Free 8s ${state.match_id}; refusing Discord action`);
  }
  return owner;
}

async function recordChannel(db, guild, state, side, id, provision) {
  const data = { match_id: state.match_id, side, channel_id: id, guild_id: guild.id,
    category_id: state.category_id, reason: provision.reason, created_at: new Date().toISOString(),
    discord_user_ids: [...(state.member_discord_ids || [])], deleted_at: null };
  try {
    // The existing unique event_key indexes ownership by channel ID.
    await db.discordEventDispatch.create({ data: { event_key: freeEightsChannelKey(id), metadata: data } });
  } catch (error) {
    if (error.code !== "P2002") throw error;
    const owner = await channelOwner(db, guild, state, side, id);
    if (owner.reason !== provision.reason) throw new Error("Channel belongs to a different provisioning operation");
  }
}

// Recover only a durably recorded creation operation by its bot actor and
// unique audit reason. Channel names never establish ownership.
async function recoverProvision(guild, db, state, side, provision, log) {
  const owned = await db.discordEventDispatch.findMany({ where: {
    event_key: { startsWith: "free8s-channel:" }, metadata: { path: ["match_id"], equals: state.match_id },
  } });
  const known = owned.find((row) => row.metadata?.reason === provision.reason && row.metadata?.side === side);
  if (known) return known.metadata.channel_id;
  let before;
  for (;;) {
    const audit = await guild.fetchAuditLogs({ type: AuditLogEvent.ChannelCreate, user: guild.client.user.id, limit: 100, ...(before ? { before } : {}) });
    const entry = audit.entries.find((item) => item.executorId === guild.client.user.id
      && item.action === AuditLogEvent.ChannelCreate && item.reason === provision.reason && item.targetId);
    if (entry) {
      await recordChannel(db, guild, state, side, entry.targetId, provision);
      log("provision-recovered", { match_id: state.match_id, side, channel_id: entry.targetId });
      return entry.targetId;
    }
    const oldest = audit.entries.last();
    if (audit.entries.size < 100 || !oldest || oldest.createdTimestamp < Date.parse(provision.started_at)) return null;
    before = oldest.id;
  }
}

export async function cleanupFreeEightsVoice(guild, state, { db = prisma, guard = async () => {}, save = async () => {}, log = freeEightsVoiceLog } = {}) {
  if (state.guild_id !== guild.id) throw new Error("Managed voice channels belong to a different guild");
  const waiting = await getChannel(guild, state.waiting_room_id);
  let complete = true;
  for (const side of ["host", "challenger"]) {
    const id = state.channels[side];
    if (!id) continue;
    const owner = await channelOwner(db, guild, state, side, id);
    const channel = await getChannel(guild, id);
    if (channel) {
      if (channel.type !== ChannelType.GuildVoice || channel.parentId !== owner.category_id
        || channel.id === state.waiting_room_id) throw new Error("Managed channel location changed; refusing deletion");
      const members = new Set([...(owner.discord_user_ids || []), ...(state.member_discord_ids || [])]);
      for (const member of channel.members.values()) {
        if (member.voice.channelId !== channel.id) continue;
        if (!members.has(member.id)) {
          log("cleanup-foreign-occupant", { match_id: state.match_id, discord_user_id: member.id, channel_id: id });
          complete = false;
          continue;
        }
        await guard();
        log("cleanup-move-attempt", { match_id: state.match_id, discord_user_id: member.id, channel_id: id });
        try {
          if (waiting?.type !== ChannelType.GuildVoice) throw new Error("Waiting room unavailable");
          if (member.voice.channelId !== id) continue;
          await member.voice.setChannel(waiting.id, `Free 8s ${state.match_id} cleanup`);
          log("cleanup-move-success", { match_id: state.match_id, discord_user_id: member.id });
        } catch (error) {
          complete = false;
          log("cleanup-move-failed", { match_id: state.match_id, discord_user_id: member.id, code: error.code, error: error.message });
        }
      }
      let occupied = false;
      for (const member of channel.members.values()) {
        const voice = await member.voice.fetch().catch(() => null);
        if (!voice || voice.channelId === id) occupied = true;
      }
      if (occupied) { complete = false; continue; }
      await guard();
      await channelOwner(db, guild, state, side, id);
      try {
        await channel.delete(`Free 8s ${state.match_id} temporary voice cleanup`);
        log("channel-deleted", { match_id: state.match_id, channel_id: id });
      } catch (error) {
        if (!unknownChannel(error)) {
          complete = false;
          log("channel-delete-failed", { match_id: state.match_id, channel_id: id, code: error.code, error: error.message });
          continue;
        }
      }
    }
    await guard();
    await db.discordEventDispatch.update({ where: { event_key: freeEightsChannelKey(id) },
      data: { metadata: { ...owner, deleted_at: owner.deleted_at || new Date().toISOString() } } });
    delete state.channels[side];
    delete state.provisions[side];
    delete state.channel_roster_signatures[side];
    await save();
  }
  if (complete && !Object.keys(state.channels).length && !Object.keys(state.provisions).length) {
    state.discord_channels_cleaned_at ||= new Date().toISOString();
    return true;
  }
  return false;
}

async function reconcileMatch(guild, db, matchId, config, guard, log, inventory) {
  const key = freeEightsVoiceKey(matchId);
  const previous = await db.discordEventDispatch.findUnique({ where: { event_key: key } });
  const state = structuredClone(previous?.metadata || { match_id: matchId });
  if (state.match_id !== matchId) throw new Error("Voice state belongs to another match");
  const workerToken = crypto.randomUUID();
  state.worker_token = workerToken;
  state.channels ||= {};
  state.provisions ||= {};
  state.channel_roster_signatures ||= {};
  state.players ||= {};
  await guard();
  if (previous) {
    const claim = await db.discordEventDispatch.updateMany({
      where: { event_key: key, metadata: { equals: previous.metadata } }, data: { metadata: state },
    });
    if (!claim.count) { log("state-changed-before-claim", { match_id: matchId }); return; }
  } else {
    try { await db.discordEventDispatch.create({ data: { event_key: key, metadata: state } }); }
    catch (error) { if (error.code === "P2002") return; throw error; }
  }
  const save = async () => {
    await guard();
    state.updated_at = new Date().toISOString();
    // Commit outside the lock transaction so a timeout cannot roll back the
    // durable reservation/channel IDs after Discord has acted on them.
    const saved = await db.discordEventDispatch.updateMany({
      where: { event_key: key, metadata: { path: ["worker_token"], equals: workerToken } },
      data: { metadata: state },
    });
    if (!saved.count) throw new Error("Voice state claimed by a newer worker; refusing stale state write");
  };
  const row = await db.wager.findUnique({ where: { id: matchId } });
  const match = row?.metadata;
  const participants = row ? await rosterFor(db, matchId) : [];
  const signature = voiceRosterSignature(match, participants);
  const closed = !match || match.match_type !== "8s" || freeEightsVoiceClosed.has(match.status);
  const assign = config.enabled && canAssignFreeEightsVoice(match, participants);
  for (const side of ["host", "challenger"]) {
    if (!state.channels[side] && state.provisions[side]) {
      await guard();
      const id = await recoverProvision(guild, db, state, side, state.provisions[side], log);
      if (!id) {
        state.error = "Discord channel creation is awaiting confirmation; no duplicate will be created";
        log("provision-awaiting-confirmation", { match_id: matchId, side });
        await save();
        return;
      }
      state.channels[side] = id;
      await save();
    }
  }
  // Validate both IDs before any moves, edits or cleanup for the match.
  for (const side of ["host", "challenger"]) {
    if (state.channels[side]) await channelOwner(db, guild, state, side, state.channels[side]);
  }
  const changedConfig = state.guild_id && (state.guild_id !== config.guildId
    || state.waiting_room_id !== config.waitingRoomId || !freeEightsVoiceCategoryIds(config).includes(state.category_id));
  if ((!assign || changedConfig) && Object.keys(state.channels).length) {
    state.error = "Voice cleanup pending";
    if (!await cleanupFreeEightsVoice(guild, state, { db, guard, save, log })) { await save(); return; }
    log("cleanup-complete", { match_id: matchId });
  }
  state.cleaned = closed;
  state.error = null;
  if (closed) {
    state.roster_signature = signature;
    state.players = {};
    state.checked_at = new Date().toISOString();
    state.discord_channels_cleaned_at ||= new Date().toISOString();
    await save();
    return;
  }
  const users = await db.user.findMany({ where: { id: { in: participants.map((player) => player.user_id) } },
    select: { id: true, discord_user_id: true, discord_connected_at: true } });
  const identities = new Map(users.map((user) => [user.id, user]));
  state.member_discord_ids = [...new Set([...(state.member_discord_ids || []), ...users.filter(hasDiscordLink).map((user) => user.discord_user_id)])];
  const waiting = config.enabled ? await getChannel(guild, config.waitingRoomId) : null;
  const categories = freeEightsVoiceCategoryIds(config).filter((id) => inventory?.get(id)?.type === ChannelType.GuildCategory);
  const configured = guild.id === config.guildId && waiting?.type === ChannelType.GuildVoice && categories.length > 0;
  state.guild_id = guild.id;
  state.waiting_room_id = config.waitingRoomId;
  state.category_id ||= config.categoryId;
  if (config.enabled && !configured) {
    state.error = "Free 8s Discord waiting room or category is not configured correctly";
    log("configuration-error", { match_id: matchId });
  }
  const readyChannels = {};
  if (assign && configured) {
    let reservations = guildCategoryReservations.get(guild);
    if (!reservations) { reservations = new Map(); guildCategoryReservations.set(guild, reservations); }
    let reservedSlots = 0;
    const releaseSlot = () => {
      if (!reservedSlots) return;
      reservations.set(state.category_id, Math.max(0, (reservations.get(state.category_id) || 0) - 1));
      reservedSlots--;
    };
    try {
      // Discord enforces 50 children per category. Keep each match's pair together;
      // on a capacity race, a later sweep safely removes its own partial pair first.
      const exists = (side) => inventory.has(state.channels[side]);
      const missing = ["host", "challenger"].filter((side) => !exists(side)).length;
      const roomFor = (id, needed) => inventory.filter((item) => item.parentId === id).size + (reservations.get(id) || 0) + needed <= 50;
      if (missing && (!categories.includes(state.category_id) || !roomFor(state.category_id, missing))) {
        if (Object.keys(state.channels).length && !await cleanupFreeEightsVoice(guild, state, { db, guard, save, log })) {
          state.error = "Voice cleanup pending before category change";
          await save();
          return;
        }
        state.category_id = categories.find((id) => roomFor(id, 2)) || config.categoryId;
        state.discord_channels_created_at = null;
      }
      const neededSlots = ["host", "challenger"].filter((side) => !exists(side)).length;
      const capacity = neededSlots === 0 || roomFor(state.category_id, neededSlots);
      if (capacity) {
        reservedSlots = neededSlots;
        reservations.set(state.category_id, (reservations.get(state.category_id) || 0) + reservedSlots);
      }
      if (!capacity) {
        state.error = "Free 8s voice categories are full; waiting for capacity";
        log("category-capacity-unavailable", { match_id: matchId });
      }
      for (const side of ["host", "challenger"]) {
        if (!capacity) break;
        const members = participants.filter((player) => player.team === side).map((player) => identities.get(player.user_id)).filter(hasDiscordLink);
        // Manage Roles is inherited from the bot's guild role. Discord only lets
        // administrators set that bit in channel overwrites (otherwise 50013).
        const overwrites = [
          { id: guild.id, type: OverwriteType.Role, deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect] },
          { id: guild.client.user.id, type: OverwriteType.Member, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.MoveMembers] },
          ...members.map((user) => ({ id: user.discord_user_id, type: OverwriteType.Member, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] })),
        ];
        const permissionSignature = JSON.stringify([signature, members.map((user) => user.discord_user_id)]);
        try {
          await guard();
          let channel = await getChannel(guild, state.channels[side]);
          if (!channel) {
            const deletedId = state.channels[side];
            if (deletedId) {
              const owner = await channelOwner(db, guild, state, side, deletedId);
              await db.discordEventDispatch.update({ where: { event_key: freeEightsChannelKey(deletedId) },
                data: { metadata: { ...owner, deleted_at: owner.deleted_at || new Date().toISOString() } } });
              delete state.channels[side];
              delete state.provisions[side];
              delete state.channel_roster_signatures[side];
              state.discord_channels_created_at = null;
              await save();
            }
            const provision = { reason: `Topfragg Free8s ${matchId} ${side} ${crypto.randomUUID()}`, started_at: new Date().toISOString() };
            state.provisions[side] = provision;
            state.discord_channels_cleaned_at = null;
            await save(); // Reserve BEFORE Discord creation.
            try {
              await guard();
              channel = await guild.channels.create({ name: `${matchId} • Team ${side === "host" ? "A" : "B"}`,
                type: ChannelType.GuildVoice, parent: state.category_id, permissionOverwrites: overwrites,
                reason: provision.reason, userLimit: 4 });
              releaseSlot();
            } catch (error) {
              // A definite rejection permits retry. Ambiguous outcomes retain
              // their operation for audit confirmation instead of duplicating it.
              if (Number(error.status) >= 400 && Number(error.status) < 500 && Number(error.status) !== 429) {
                delete state.provisions[side];
                await save();
              }
              throw error;
            }
            // Save ownership even if the lock expires during the Discord call.
            await recordChannel(db, guild, state, side, channel.id, provision);
            await guard();
            state.channels[side] = channel.id;
            await save();
            log("channel-created", { match_id: matchId, side, channel_id: channel.id });
          } else {
            const owner = await channelOwner(db, guild, state, side, channel.id);
            if (channel.parentId !== owner.category_id || channel.type !== ChannelType.GuildVoice || owner.deleted_at) throw new Error("Managed channel location or lifecycle changed");
            if (state.channel_roster_signatures[side] !== permissionSignature) {
              await guard();
              await channel.permissionOverwrites.set(overwrites, `Free 8s ${matchId} teams updated`);
            }
          }
          const permissionsChanged = state.channel_roster_signatures[side] !== permissionSignature;
          state.channel_roster_signatures[side] = permissionSignature;
          readyChannels[side] = channel.id;
          if (permissionsChanged) await save();
        } catch (error) {
          state.error = "Team voice channels could not be prepared; the bot will retry or confirm the pending creation";
          log("channel-prepare-failed", { match_id: matchId, side, code: error.code, error: error.message });
          await guard();
        }
      }
      if (readyChannels.host && readyChannels.challenger) state.discord_channels_created_at ||= new Date().toISOString();
    } finally { while (reservedSlots) releaseSlot(); }
  }
  const observedPlayers = {};
  for (const player of participants) {
    const identity = identities.get(player.user_id);
    let status = "not_linked";
    if (hasDiscordLink(identity)) {
      status = config.enabled && configured ? "not_in_waiting_room" : "unavailable";
      const voice = guild.voiceStates.cache.get(identity.discord_user_id);
      const source = voice?.channelId;
      const target = assign && readyChannels.host && readyChannels.challenger ? readyChannels[player.team] : null;
      if (target && source === target) status = "in_team_voice";
      else if (source === config.waitingRoomId && configured) status = "in_waiting_room";
      const inManagedTeam = Object.values(state.channels).includes(source);
      if (target && source && source !== target && (source === config.waitingRoomId || inManagedTeam)) {
        await guard();
        const latest = await db.wager.findUnique({ where: { id: matchId } });
        const roster = await rosterFor(db, matchId);
        if (!canAssignFreeEightsVoice(latest?.metadata, roster) || voiceRosterSignature(latest.metadata, roster) !== signature) {
          log("roster-changed-during-assignment", { match_id: matchId });
          state.roster_signature = "";
          await save();
          return;
        }
        await channelOwner(db, guild, state, player.team, target);
        if (inManagedTeam) await channelOwner(db, guild, state, source === state.channels.host ? "host" : "challenger", source);
        log("move-attempt", { match_id: matchId, user_id: player.user_id, from: source, to: target });
        try {
          if (voice.channelId !== source) throw new Error("Voice presence changed during assignment");
          await voice.setChannel(target, `Free 8s ${matchId} generated team assignment`);
          status = "in_team_voice";
          log("move-success", { match_id: matchId, user_id: player.user_id, side: player.team });
        } catch (error) {
          status = "move_failed";
          log("move-failed", { match_id: matchId, user_id: player.user_id, code: error.code, error: error.message });
        }
      }
    }
    observedPlayers[player.user_id] = { status };
    if (previous?.metadata?.players?.[player.user_id]?.status !== status) log("waiting-room-presence", { match_id: matchId, user_id: player.user_id, status });
  }
  // Publish one complete observation, never an empty/partial roster stamped
  // as fresh while REST channel creation or player moves are still running.
  state.players = observedPlayers;
  state.roster_signature = signature;
  state.checked_at = new Date().toISOString();
  await save();
}

export async function syncFreeEightsVoice(guild, { db = prisma, config = freeEightsDiscordConfig(), log = freeEightsVoiceLog } = {}) {
  if (guild.client.isReady?.() === false) { log("gateway-not-ready", { guild_id: guild.id }); return; }
  const managed = await db.discordEventDispatch.findMany({ where: { event_key: { startsWith: "free8s-voice:" } } });
  const matches = config.enabled ? await db.wager.findMany({ where: { AND: [
    { metadata: { path: ["match_type"], equals: "8s" } },
    { OR: activeStatuses.map((status) => ({ metadata: { path: ["status"], equals: status } })) },
  ] } }) : [];
  const ids = [...new Set([...matches.map((row) => row.id), ...managed.filter((row) => !row.metadata?.cleaned).map((row) => row.metadata?.match_id).filter(Boolean)])];
  if (!ids.length) return;
  // Fetch once per sweep rather than once for every match. The live cache also
  // reflects channels created/deleted by concurrent workers for capacity checks.
  const fetched = config.enabled ? await guild.channels.fetch() : null;
  const inventory = config.enabled ? guild.channels.cache || fetched : null;
  if (config.enabled && ![config.guildId, config.waitingRoomId, config.categoryId].every(validDiscordId)) log("configuration-error", { error: "Configure Free 8s guild, waiting room and category IDs" });
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(3, ids.length) }, async () => {
    while (cursor < ids.length) {
      const id = ids[cursor++];
      try {
        await db.$transaction(async (tx) => {
          const [lock] = await tx.$queryRaw`SELECT pg_try_advisory_xact_lock(hashtext(${freeEightsVoiceKey(id)})) AS locked`;
          if (!lock.locked) return;
          const guard = () => {
            if (guild.client.isReady?.() === false) throw new Error("Discord gateway disconnected; cached voice presence is not current");
            return tx.$queryRaw`SELECT 1`;
          };
          await reconcileMatch(guild, db, id, config, guard, log, inventory);
        }, { timeout: 60_000, maxWait: 5_000 });
      } catch (error) {
        log("sync-failed", { match_id: id, code: error.code, error: error.message });
      }
    }
  }));
}
