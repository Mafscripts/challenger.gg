export async function loadWagerParticipants(base44, wager) {
  const participantRows = await base44.entities.WagerParticipant
    .filter({ wager_id: wager.id })
    .catch(() => []);

  const hydratedPlayers = await Promise.all((participantRows || []).map(async (participant) => {
    const [userRow, inventoryRows] = await Promise.all([
      base44.entities.User.get(participant.user_id).catch(() => null),
      base44.entities.UserInventory.filter({ user_id: participant.user_id }, "-acquired_date", 200).catch(() => []),
    ]);

    const inventoryTrophies = (inventoryRows || []).reduce((counts, item) => {
      const text = String([item.item_name, item.unlock_key, item.item_rarity, item.purchase_method].filter(Boolean).join(" ")).toLowerCase();
      if (item.item_category !== "trophy" && !text.includes("trophy")) return counts;
      if (text.includes("premium")) counts.premium += 1;
      else if (text.includes("champion") || text.includes("invit")) counts.champion += 1;
      else if (text.includes("gold")) counts.gold += 1;
      else if (text.includes("silver")) counts.silver += 1;
      else if (text.includes("bronze")) counts.bronze += 1;
      else if (["exclusive", "mythic"].includes(item.item_rarity)) counts.champion += 1;
      else if (["legendary", "epic"].includes(item.item_rarity)) counts.gold += 1;
      else if (item.item_rarity === "rare") counts.silver += 1;
      else counts.bronze += 1;
      return counts;
    }, { gold: 0, silver: 0, bronze: 0, premium: 0, champion: 0 });

    return {
      id: participant.id,
      user_id: participant.user_id,
      full_name: userRow?.display_name || userRow?.full_name || userRow?.username || participant.user_name || "Unnamed player",
      wager_wins: userRow?.wager_wins || 0,
      wager_losses: userRow?.wager_losses || 0,
      total_wager_earnings: userRow?.total_wager_earnings || 0,
      lifetime_earnings: Math.max(Number(userRow?.lifetime_earnings || 0), Number(userRow?.total_wager_earnings || 0)),
      xp_level: userRow?.xp_level || 1,
      current_win_streak: userRow?.current_win_streak || 0,
      biggest_wager_win: userRow?.biggest_wager_win || 0,
      account_created_date: userRow?.account_created_date,
      is_premium: userRow?.is_premium || false,
      badges: userRow?.badges || [],
      verified_player: userRow?.verified_player || userRow?.is_verified_player || false,
      streamer_badge: userRow?.streamer_badge || userRow?.is_streamer || false,
      force_stream_required: userRow?.force_stream_required || userRow?.stream_override_required || false,
      monitor_cam_required: userRow?.monitor_cam_required || userRow?.required_monitor_cam || userRow?.moni_cam_required || false,
      gold_count: Number(userRow?.gold_count || 0) + inventoryTrophies.gold,
      silver_count: Number(userRow?.silver_count || 0) + inventoryTrophies.silver,
      bronze_count: Number(userRow?.bronze_count || 0) + inventoryTrophies.bronze,
      premium_count: Number(userRow?.premium_count || 0) + inventoryTrophies.premium,
      champion_count: Number(userRow?.champion_count || userRow?.invitational_count || 0) + inventoryTrophies.champion,
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
