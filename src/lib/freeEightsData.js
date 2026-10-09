export async function loadFreeEightsOverview(api, gameId) {
  const response = await api.functions.invoke("getFreeEightsOverview", { ...(gameId ? { game_id: gameId } : { all_games: true }) });
  if (!response.data?.success) throw new Error(response.data?.error || "Could not load Free 8s");
  return response.data;
}

export async function loadFreeEightsProgression(api, matchId, players) {
  if (!players.length) return [];
  const response = await api.functions.invoke("getFreeEightsPlayerStats", { wager_id: matchId });
  if (!response.data?.success) throw new Error(response.data?.error || "Could not load Free 8s player stats");
  return players.map((player) => ({ ...player, ...response.data.stats?.[player.user_id] }));
}
