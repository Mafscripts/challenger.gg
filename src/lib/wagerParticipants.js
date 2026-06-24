export async function loadWagerParticipants(base44, wager) {
  const participantRows = await base44.entities.WagerParticipant
    .filter({ wager_id: wager.id })
    .catch(() => []);

  const hydratedPlayers = await Promise.all((participantRows || []).map(async (participant) => {
    const userRow = await base44.entities.User.get(participant.user_id).catch(() => null);

    return {
      id: participant.id,
      user_id: participant.user_id,
      full_name: userRow?.display_name || userRow?.full_name || userRow?.username || participant.user_name || "Unnamed player",
      wager_wins: userRow?.wager_wins || 0,
      wager_losses: userRow?.wager_losses || 0,
      total_wager_earnings: userRow?.total_wager_earnings || 0,
      xp_level: userRow?.xp_level || 1,
      current_win_streak: userRow?.current_win_streak || 0,
      biggest_wager_win: userRow?.biggest_wager_win || 0,
      account_created_date: userRow?.account_created_date,
      is_premium: userRow?.is_premium || false,
      badges: userRow?.badges || [],
      verified_player: userRow?.verified_player || userRow?.is_verified_player || false,
      streamer_badge: userRow?.streamer_badge || userRow?.is_streamer || false,
      force_stream_required: userRow?.force_stream_required || userRow?.stream_override_required || false,
      gold_count: userRow?.gold_count || 0,
      silver_count: userRow?.silver_count || 0,
      bronze_count: userRow?.bronze_count || 0,
      premium_count: userRow?.premium_count || 0,
      champion_count: userRow?.champion_count || 0,
      team: participant.team,
      entry_fee_paid: participant.entry_fee_paid,
      payment_status: participant.payment_status,
      paid_by: participant.paid_by,
    };
  }));

  return {
    teamAPlayers: hydratedPlayers.filter((player) => player.team === "host"),
    teamBPlayers: hydratedPlayers.filter((player) => player.team === "challenger"),
    participants: hydratedPlayers,
  };
}
