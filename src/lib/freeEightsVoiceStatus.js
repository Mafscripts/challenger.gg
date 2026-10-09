const FRESH_MS = 20_000;
const CHECKING_GRACE_MS = 15_000;
const confirmedStatuses = new Set(["not_linked", "not_in_waiting_room", "in_waiting_room", "in_team_voice", "move_failed"]);

const samePlayer = (left, right) => left?.user_id === right.user_id && left.team === right.team;

export function recordFreeEightsVoiceResponse(previous, { matchId, userId, data, failed = false, now = Date.now() }) {
  const sameRoom = previous?.matchId === matchId && previous?.userId === userId;
  const current = sameRoom ? previous : { matchId, userId, data: null, receivedAt: null, pendingSince: now };
  if (failed) return { ...current, requestFailed: true, pendingSince: current.pendingSince ?? now };
  let lastConfirmed = current.lastConfirmed;
  if (data?.enabled && data.configured && data.fresh && Number(data.snapshot_age_ms || 0) < FRESH_MS) {
    // Keep bot observations separate from transport health. A pending/stale
    // response must never replace a player's last observed voice channel.
    lastConfirmed = { ...data, players: (data.players || []).map((player) => {
      const previousPlayer = lastConfirmed?.players?.find((row) => samePlayer(row, player));
      return confirmedStatuses.has(player.status) ? player : { ...player, status: previousPlayer?.status || "unknown" };
    }) };
  }
  return { matchId, userId, data, receivedAt: now, requestFailed: false,
    lastConfirmed,
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
    const observed = available ? statuses.get(player.user_id)?.status : null;
    const lastObserved = result?.lastConfirmed?.players?.find((row) => samePlayer(row, player))?.status;
    const status = confirmedStatuses.has(observed) ? observed : lastObserved || "unknown";
    return { ...player, status, ready: available && ["in_waiting_room", "in_team_voice"].includes(observed) };
  });
  const displayVoice = voice || result?.lastConfirmed;
  return { voice: displayVoice && { ...displayVoice, waiting_room_url: voice?.waiting_room_url || result?.lastConfirmed?.waiting_room_url || null },
    available, checking, refreshing, configurationFailure, playerStates,
    hasConfirmedStatus: playerStates.length > 0 && playerStates.every((player) => confirmedStatuses.has(player.status)),
    displayReadyCount: playerStates.filter((player) => ["in_waiting_room", "in_team_voice"].includes(player.status)).length,
    readyCount: playerStates.filter((player) => player.ready).length,
    warning: !checking && (!available || Boolean(voice?.error)) };
}

export function freeEightsVoiceDisplaySignature(result, players) {
  const view = freeEightsVoiceView(result, players);
  return JSON.stringify([result?.matchId, result?.userId, view.voice?.waiting_room_url,
    view.playerStates.map((player) => [player.user_id, player.team, player.status])]);
}
