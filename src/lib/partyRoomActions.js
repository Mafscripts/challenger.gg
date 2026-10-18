// A gateway can lose the response after the database committed a reset.
// Read back the outcome; never repeat a destructive action automatically.
export async function submitPartyRoomAction(api, room, action, input = {}, matchId) {
  try {
    return await api.change(room.id, { action, revision: room.revision, view_match_id: matchId, ...input });
  } catch (error) {
    const uncertain = [502, 503, 504].includes(error.status) || error instanceof TypeError;
    if (action !== "reset" || !uncertain) throw error;
    let current;
    try { current = (await api.get(room.id, null, { fresh: true })).room; }
    catch { throw error; }
    const expectedRound = room.round + (room.status === "ready" ? 1 : 0);
    const reset = current?.management_log?.[0];
    if (current?.id === room.id && current.revision > room.revision && current.status === "open"
      && current.round === expectedRound && current.bracket === null && current.spin === null
      && reset?.action === "reset_teams" && reset.round === expectedRound
      && current.players.length === room.players.length
      && current.players.every((player) => player.side === null && room.players.some((previous) => previous.id === player.id))) {
      return { room: current };
    }
    throw error;
  }
}
