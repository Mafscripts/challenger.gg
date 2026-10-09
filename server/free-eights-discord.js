import { discordGuildMembership, discordInviteUrl } from "./discord.js";

export const freeEightsVoiceKey = (id) => `free8s-voice:${id}`;
export const freeEightsChannelKey = (id) => `free8s-channel:${id}`;
export const freeEightsVoiceClosed = new Set(["completed", "cancelled", "expired", "closed"]);
export const validDiscordId = (id) => /^\d{17,20}$/.test(String(id || ""));
export const hasDiscordLink = (user) => validDiscordId(user?.discord_user_id) && Boolean(user?.discord_connected_at);

export const freeEightsDiscordConfig = () => ({
  enabled: process.env.DISCORD_FREE_8S_VOICE_ENABLED === "true",
  guildId: String(process.env.DISCORD_GUILD_ID || "").trim(),
  waitingRoomId: String(process.env.DISCORD_FREE_8S_WAITING_ROOM_ID || "").trim(),
  categoryId: String(process.env.DISCORD_FREE_8S_VOICE_CATEGORY_ID || "").trim(),
  overflowCategoryIds: String(process.env.DISCORD_FREE_8S_VOICE_OVERFLOW_CATEGORY_IDS || "").split(",").map((id) => id.trim()).filter(Boolean),
});

export const freeEightsVoiceCategoryIds = (config) => [...new Set([config.categoryId, ...(config.overflowCategoryIds || [])])].filter(validDiscordId);

export const freeEightsVoiceLog = (event, details = {}) => {
  console.log("[Topfragg Free 8s Discord]", JSON.stringify({ event, ...details }));
};

export const freeEightsDiscordJoinError = (matchType, user) => {
  if (matchType !== "8s") return null;
  const linked = hasDiscordLink(user);
  freeEightsVoiceLog("discord-link-check", { user_id: user?.id, linked });
  return linked ? null : {
    success: false,
    error: "Connect Discord to join Free 8s",
    code: "FREE_EIGHTS_DISCORD_REQUIRED",
  };
};

export async function freeEightsDiscordMembershipJoinError(matchType, user) {
  if (matchType !== "8s") return null;
  if (!hasDiscordLink(user)) return freeEightsDiscordJoinError(matchType, user);
  try {
    const { inGuild } = await discordGuildMembership(user.discord_user_id);
    freeEightsVoiceLog("discord-server-membership-check", { user_id: user.id, in_guild: inGuild });
    if (inGuild) return null;
    return { success: false, code: "FREE_EIGHTS_DISCORD_SERVER_REQUIRED",
      error: "Join the Topfragg Discord server with your linked account before creating or joining Free 8s.", action_url: discordInviteUrl() };
  } catch (error) {
    freeEightsVoiceLog("discord-server-membership-unavailable", { user_id: user.id, discord_status: error.discordStatus || null });
    return { success: false, code: "FREE_EIGHTS_DISCORD_MEMBERSHIP_UNAVAILABLE",
      error: "We could not verify your Topfragg Discord membership. Please try again shortly." };
  }
}

export const voiceRosterSignature = (match, participants) => JSON.stringify([
  match?.teams_generated_at || "",
  participants.map((row) => [row.user_id, row.team]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
]);

export const publicFreeEightsVoiceStatus = (config, match, participants, state, now = Date.now()) => {
  const age = now - new Date(state?.checked_at).getTime();
  const room = config.enabled && validDiscordId(config.guildId) && match?.id && match.match_type === "8s"
    && state?.match_id === match.id && !freeEightsVoiceClosed.has(match.status)
    && state?.guild_id === config.guildId && freeEightsVoiceCategoryIds(config).includes(state?.category_id)
    && validDiscordId(state?.channels?.waiting) && state.waiting_room_id === state.channels.waiting
    ? state.channels.waiting : null;
  const fresh = Boolean(state?.checked_at && age >= 0 && age < 20_000
    && room
    && state.roster_signature === voiceRosterSignature(match, participants));
  // Keep the last bot observation available after F5 and during a sweep. It
  // is display-only: map generation still requires the fresh exact roster.
  let observedRoster = [];
  try {
    const roster = JSON.parse(state?.roster_signature || "[]")[1];
    if (Array.isArray(roster)) observedRoster = roster.filter(Array.isArray);
  } catch { /* No trusted previous roster. */ }
  return {
    enabled: config.enabled,
    configured: Boolean(validDiscordId(config.guildId) && validDiscordId(config.categoryId)),
    closed: freeEightsVoiceClosed.has(match?.status),
    waiting_room_url: room ? `https://discord.com/channels/${config.guildId}/${room}` : null,
    fresh,
    snapshot_age_ms: Number.isFinite(age) && age >= 0 ? age : null,
    checked_at: state?.checked_at || null,
    error: fresh ? state?.error || null : null,
    players: participants.map((row) => ({
      user_id: row.user_id,
      team: row.team,
      status: config.enabled && fresh ? state?.players?.[row.user_id]?.status || "checking" : "unavailable",
      last_observed_status: room && observedRoster.some(([id, team]) => id === row.user_id && team === row.team)
        ? state?.players?.[row.user_id]?.status || null : null,
    })),
  };
};

// Only the existing bot's fresh, exact-roster snapshot can release map
// generation. Presence in another match's team voice is not Waiting Room readiness.
export const freeEightsWaitingRoomReady = (config, match, participants, state, now = Date.now()) => {
  if (match?.match_type !== "8s") return true;
  if (participants.length !== 8 || participants.some((player) => !player.user_id)
    || new Set(participants.map((player) => player.user_id)).size !== 8) return false;
  const voice = publicFreeEightsVoiceStatus(config, match, participants, state, now);
  return voice.enabled && voice.configured && voice.fresh
    && voice.players.every((player) => player.status === "in_waiting_room");
};
