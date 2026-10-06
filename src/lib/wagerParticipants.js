import { trophyCountsFor, trophyFields } from "./trophyCounts";

export async function loadWagerParticipants(base44, wager, options = {}) {
  const participantRows = options.participantRows || await base44.entities.WagerParticipant
    [options.fresh ? "filterFresh" : "filter"]({ wager_id: wager.id })
    .catch(() => []);

  const trophyCountsPromise = base44.profile.trophyCounts((participantRows || []).map((row) => row.user_id)).catch(() => ({}));
  const playersPromise = Promise.all((participantRows || []).map(async (participant) => {
    const [userRow, profileRows] = await Promise.all([
      base44.entities.User[options.fresh ? "getFresh" : "get"](participant.user_id).catch(() => null),
      options.includeProfile === false
        ? Promise.resolve([])
        : base44.entities.PlayerProfile[options.fresh ? "filterFresh" : "filter"]({ user_id: participant.user_id }, "-created_date", 1).catch(() => []),
    ]);
    const profileRow = profileRows?.[0] || {};

    const trophies = trophyCountsFor(userRow, profileRow);

    return {
      id: participant.id,
      user_id: participant.user_id,
      full_name: userRow?.display_name || userRow?.full_name || userRow?.username || participant.user_name || "Unnamed player",
      display_name_color: userRow?.display_name_color || profileRow?.display_name_color || "",
      avatar_url: userRow?.avatar_url || profileRow?.avatar_url || profileRow?.profile_picture_url || participant.avatar_url || "",
      activision_id: userRow?.activision_id || "",
      wager_wins: userRow?.wager_wins || 0,
      wager_losses: userRow?.wager_losses || 0,
      total_wager_earnings: userRow?.total_wager_earnings || 0,
      lifetime_earnings: Math.max(Number(userRow?.lifetime_earnings || 0), Number(userRow?.total_wager_earnings || 0)),
      current_win_streak: userRow?.current_win_streak || 0,
      biggest_wager_win: userRow?.biggest_wager_win || 0,
      account_created_date: userRow?.account_created_date,
      is_premium: userRow?.is_premium || false,
      premium_expires: userRow?.premium_expires || null,
      badges: userRow?.badges || [],
      verified_player: userRow?.verified_player || userRow?.is_verified_player || false,
      streamer_badge: userRow?.streamer_badge || userRow?.is_streamer || false,
      force_stream_required: userRow?.force_stream_required || userRow?.stream_override_required || false,
      monitor_cam_required: userRow?.monitor_cam_required || userRow?.required_monitor_cam || userRow?.moni_cam_required || false,
      trophies,
      ...trophyFields(trophies),
      socials: {
        discord: userRow?.discord_username || profileRow.discord || userRow?.discord || "",
        twitter: profileRow.twitter || profileRow.x || userRow?.twitter || userRow?.x || "",
        twitch: profileRow.twitch || userRow?.twitch || "",
        youtube: profileRow.youtube || userRow?.youtube || "",
        website: profileRow.website || userRow?.website || "",
      },
      team: participant.team,
      role: participant.is_captain ? "captain" : "member",
      entry_fee_paid: participant.entry_fee_paid,
      payment_status: participant.payment_status,
      paid_by: participant.paid_by,
    };
  }));
  const [hydratedPlayers, trophyCountsByUser] = await Promise.all([playersPromise, trophyCountsPromise]);
  const players = hydratedPlayers.map((player) => {
    const trophies = trophyCountsByUser[player.user_id] || player.trophies;
    return { ...player, trophies, ...trophyFields(trophies) };
  });

  return {
    teamAPlayers: players.filter((player) => player.team === "host"),
    teamBPlayers: players.filter((player) => player.team === "challenger"),
    participants: players,
  };
}
