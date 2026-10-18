import { freeEightsDiscordConfig, publicFreeEightsVoiceStatus } from "./free-eights-discord.js";
import { partySpinning } from "../src/lib/partyWheel.js";

export const partyVoiceKey = (id) => `party-voice:${id}`;
export const PARTY_ROOM_LIFETIME_MS = 24 * 60 * 60 * 1000;
export function partyDiscordConfig() {
  const shared = freeEightsDiscordConfig();
  return { ...shared, modeLabel: "Co-ed / Switcheroo",
    enabled: process.env.DISCORD_PARTY_VOICE_ENABLED === undefined ? shared.enabled : process.env.DISCORD_PARTY_VOICE_ENABLED === "true",
    categoryId: process.env.DISCORD_PARTY_VOICE_CATEGORY_ID || shared.categoryId,
    waitingRoomId: process.env.DISCORD_PARTY_RETURN_ROOM_ID || shared.waitingRoomId,
    channelName: (id, side, match) => `SPIN-${id.slice(-6).toUpperCase()} · ${side === "waiting" ? "Waiting Room" : match.teams.find((team) => team.id === side)?.name || "Team"}`,
    teamSize: (match) => match.team_size,
    channelSides: (match) => ["waiting", ...(match?.teams || []).map((team) => team.id)],
    channelLimit: (match, side) => side === "waiting" ? match.team_size * match.teams.length : match.team_size,
    privateTeams: true,
    canAssign: (match, players) => Boolean(match?.teams_generated_at) && match.status === "in_progress"
      && players.length === match.team_size * match.teams.length && new Set(players.map((player) => player.user_id)).size === players.length
      && match.teams.every((team) => players.filter((player) => player.team === team.id).length === match.team_size),
  };
}
export function partyVoiceMatch(room) {
  const expired = Date.now() - Date.parse(room.updated_date) > PARTY_ROOM_LIFETIME_MS;
  return { id: room.id, match_type: "8s", team_size: room.team_size, teams: room.teams,
    status: expired || room.status === "closed" ? "closed" : room.status === "ready" && !partySpinning(room) ? "in_progress" : "open",
    teams_generated_at: room.status === "ready" && !partySpinning(room) ? `${room.id}:${room.round}` : "" };
}
export const partyVoiceRoster = (room) => room.players.map((player) => ({
  user_id: player.user_id || `manual:${player.id}`, user_name: player.name, team: player.side || "unassigned",
}));
export function partyVoiceStatus(room, state, config = partyDiscordConfig()) {
  const voice = publicFreeEightsVoiceStatus(config, partyVoiceMatch(room), partyVoiceRoster(room), state);
  const url = (side) => voice.fresh && state?.channels?.[side] ? `https://discord.com/channels/${config.guildId}/${state.channels[side]}` : null;
  return { ...voice, team_urls: Object.fromEntries(room.teams.map((team) => [team.id, url(team.id)])) };
}
