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

export const voiceRosterSignature = (match, participants) => JSON.stringify([
  match?.teams_generated_at || "",
  participants.map((row) => [row.user_id, row.team]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
]);

export const publicFreeEightsVoiceStatus = (config, match, participants, state, now = Date.now()) => {
  const age = now - new Date(state?.checked_at).getTime();
  const fresh = Boolean(state?.checked_at && age >= 0 && age < 20_000
    && state.guild_id === config.guildId && state.waiting_room_id === config.waitingRoomId && freeEightsVoiceCategoryIds(config).includes(state.category_id)
    && state.roster_signature === voiceRosterSignature(match, participants));
  return {
    enabled: config.enabled,
    configured: Boolean(validDiscordId(config.guildId) && validDiscordId(config.waitingRoomId) && validDiscordId(config.categoryId)),
    waiting_room_url: validDiscordId(config.guildId) && validDiscordId(config.waitingRoomId)
      ? `https://discord.com/channels/${config.guildId}/${config.waitingRoomId}` : null,
    fresh,
    snapshot_age_ms: Number.isFinite(age) && age >= 0 ? age : null,
    checked_at: state?.checked_at || null,
    error: fresh ? state?.error || null : null,
    players: participants.map((row) => ({
      user_id: row.user_id,
      team: row.team,
      status: config.enabled && fresh ? state?.players?.[row.user_id]?.status || "checking" : "unavailable",
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
