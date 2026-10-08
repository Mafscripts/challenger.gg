const FRESH_MS = 20_000;
const CHECKING_GRACE_MS = 15_000;

export function recordFreeEightsVoiceResponse(previous, { matchId, userId, data, failed = false, now = Date.now() }) {
  const sameRoom = previous?.matchId === matchId && previous?.userId === userId;
  const current = sameRoom ? previous : { matchId, userId, data: null, receivedAt: null, pendingSince: now };
  if (failed) return { ...current, requestFailed: true, pendingSince: current.pendingSince ?? now };
  return { matchId, userId, data, receivedAt: now, requestFailed: false,
    pendingSince: data?.fresh ? null : current.pendingSince ?? now };
}

export function freeEightsVoiceView(result, players, now = Date.now()) {
  const voice = result?.data;
  // Use server-calculated snapshot age + time since receipt, avoiding a false
  // outage when a player's computer clock differs from the server's clock.
  const elapsed = Math.max(0, now - (result?.receivedAt ?? now));
  const snapshotAge = Math.max(0, Number(voice?.snapshot_age_ms) || 0);
  const rosterMatches = voice?.players?.length === players.length
    && players.every((player) => voice.players.some((row) => row.user_id === player.user_id && row.team === player.team));
  const available = Boolean(voice?.enabled && voice.configured && voice.fresh && rosterMatches && snapshotAge + elapsed < FRESH_MS);
  const configurationFailure = voice && (voice.enabled === false || voice.configured === false);
  const expiredAt = (result?.receivedAt ?? now) + Math.max(0, FRESH_MS - snapshotAge);
  const pendingSince = result?.pendingSince ?? (voice?.fresh && rosterMatches ? expiredAt : now);
  const checking = !available && !configurationFailure && now - pendingSince < CHECKING_GRACE_MS;
  const refreshing = Boolean(checking || result?.requestFailed);
  const statuses = new Map((voice?.players || []).map((player) => [player.user_id, player]));
  const playerStates = players.map((player) => {
    const status = available ? statuses.get(player.user_id)?.status || "checking" : checking ? "checking" : "unavailable";
    return { ...player, status, ready: ["in_waiting_room", "in_team_voice"].includes(status) };
  });
  return { voice, available, checking, refreshing, configurationFailure, playerStates,
    readyCount: playerStates.filter((player) => player.ready).length,
    warning: !checking && (!available || Boolean(voice?.error)) };
}
