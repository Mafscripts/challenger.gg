import { xpMatchRoster } from "./xpMatchRating.js";

export function xpTeamMatchesFor(matches, teamId) {
  return matches.flatMap((match) => {
    const side = ["alpha", "bravo"].find((key) => (
      (match[`team_${key}_party_teams`] || []).some((party) => String(party.team_id) === String(teamId))
      || String(match[key === "alpha" ? "host_party_team_id" : "challenger_party_team_id"] || "") === String(teamId)
    ));
    if (!side) return [];
    const other = side === "alpha" ? "bravo" : "alpha";
    const completed = match.status === "completed";
    const winner = match.xp_rating_outcome?.winning_side
      || (xpMatchRoster(match, "alpha").includes(match.winner_id) ? "alpha" : xpMatchRoster(match, "bravo").includes(match.winner_id) ? "bravo" : null);
    const parties = match[`team_${other}_party_teams`] || [];
    const oppositeTeams = parties.map((party) => party.name).filter(Boolean);
    const oppositePlayers = (match[`team_${other}_player_names`] || []).filter(Boolean);
    const partyPlayers = new Set(parties.flatMap((party) => party.player_ids || []));
    const soloNames = oppositePlayers.filter((_name, index) => !partyPlayers.has(xpMatchRoster(match, other)[index]));
    return [{
      id: `xp-${match.id}`, sourceId: match.id, source: "XP Matches",
      opponent: [...oppositeTeams, ...soloNames].join(" + ")
        || match[other === "alpha" ? "host_name" : "challenger_name"] || "Waiting for opponent",
      mode: match.game_mode_display || match.game_mode || "XP match",
      format: match.team_size, status: match.status, completed,
      outcome: completed && winner ? (winner === side ? "win" : "loss") : null,
      ownScore: match[`confirmed_score_${side}`] ?? match[`reported_score_${side}`],
      opponentScore: match[`confirmed_score_${other}`] ?? match[`reported_score_${other}`],
      date: match.match_started_date || match.created_date,
      completed_date: match.match_completed_date || match.completed_date,
      href: `/xp-match/${match.id}`,
    }];
  });
}
