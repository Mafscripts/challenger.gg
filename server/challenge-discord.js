import { freeEightsDiscordConfig, publicFreeEightsVoiceStatus, voiceRosterSignature } from "./free-eights-discord.js";

export const challengeVoiceKey = (id) => `challenge-voice:${id}`;
export function challengeDiscordConfig() {
  const shared = freeEightsDiscordConfig();
  return { ...shared,
    modeLabel: "Challenge a Team",
    enabled: process.env.DISCORD_CHALLENGE_VOICE_ENABLED === undefined ? shared.enabled : process.env.DISCORD_CHALLENGE_VOICE_ENABLED === "true",
    categoryId: process.env.DISCORD_CHALLENGE_VOICE_CATEGORY_ID || shared.categoryId,
    waitingRoomId: process.env.DISCORD_CHALLENGE_RETURN_ROOM_ID || shared.waitingRoomId,
    channelName: (id, side) => `CAT-${id.slice(-6).toUpperCase()} · ${side === "waiting" ? "Lobby" : side === "host" ? "Squad" : "Challengers"}`,
    teamSize: (match) => match.size,
  };
}
export function challengeVoiceMatch(match) {
  return { ...match, match_type: "8s", teams_generated_at: match.started_at || "",
    status: match.voice_retired ? "completed" : match.status === "ready_check" ? "open" : match.status === "awaiting_confirmation" ? "awaiting_completion" : match.status };
}
export const challengeVoiceRoster = (match) => (match.players || []).map((player) => ({ ...player, team: player.side === "alpha" ? "host" : "challenger" }));
export function challengeVoiceStatus(match, state) {
  const config = challengeDiscordConfig();
  const result = publicFreeEightsVoiceStatus(config, challengeVoiceMatch(match), challengeVoiceRoster(match), state);
  const fresh = result.fresh && state?.roster_signature === voiceRosterSignature(challengeVoiceMatch(match), challengeVoiceRoster(match));
  const url = (side) => fresh && state?.channels?.[side] ? `https://discord.com/channels/${config.guildId}/${state.channels[side]}` : null;
  return { ...result, alpha_url: url("host"), bravo_url: url("challenger") };
}
