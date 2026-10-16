import { profileMatchOutcome, profileMatchSideFor } from "@/lib/profileMatchResults";

const cleanKey = (value) => String(value || "").trim().toLowerCase();
export const matchRouteFor = (match) => {
  const type = cleanKey(match?.match_type || match?.competition_type || match?.competition);
  if (type === "challenge") return `/challenge-a-team/${encodeURIComponent(match.id)}`;
  if (match?.tournament_id || type === "tournament" || type === "tournament_match" || type === "streamer_tournament") {
    return `/tournament-match/${match.id}`;
  }
  if (type === "xp" || type === "xp_match" || type === "xpmatch") return `/xp-match/${match.id}`;
  if (type === "ranked" || type === "elo") return `/ranked-match/${match.id}`;
  if (type === "8s" || type === "eights" || type === "free8s" || type === "free-8s" || type === "free_8s" || type === "money8s" || type === "money-8s" || type === "money_8s") {
    return `/8s-match/${match.id}`;
  }
  if (type === "wager" || type === "wagers" || match.entry_fee !== undefined || match.amount !== undefined) {
    return `/wagers-match/${match.id}`;
  }
  return `/ranked-match/${match.id}`;
};

export const matchScoreFor = (match, userId) => {
  if (cleanKey(match.status) !== "completed") return { text: "—", label: "Awaiting result" };
  const ownSide = match.profile_side || profileMatchSideFor(match, userId);
  const alpha = match.confirmed_score_alpha ?? match.team_alpha_score ?? match.team_a_score ?? match.reported_score_alpha;
  const bravo = match.confirmed_score_bravo ?? match.team_bravo_score ?? match.team_b_score ?? match.reported_score_bravo;
  const isScore = (value) => value !== undefined && value !== null && value !== "" && Number.isFinite(Number(value));
  if (isScore(alpha) && isScore(bravo)) {
    return { text: ownSide === "bravo" ? `${bravo} – ${alpha}` : `${alpha} – ${bravo}`, label: ownSide ? "Own team first" : "Team A – Team B" };
  }
  if (isScore(match.winner_score) && isScore(match.loser_score) && ["win", "loss"].includes(match.profile_result)) {
    return { text: match.profile_result === "win" ? `${match.winner_score} – ${match.loser_score}` : `${match.loser_score} – ${match.winner_score}`, label: "Own team first" };
  }
  return { text: "—", label: "Score unavailable" };
};
export const matchOpponentFor = (match, userId) => {
  const ownSide = match.profile_side || profileMatchSideFor(match, userId);
  const alpha = match.team_a_name || match.team_alpha_name || match.host_team_name || match.host_name;
  const bravo = match.team_b_name || match.team_bravo_name || match.challenger_team_name || match.challenger_name;
  if (ownSide) return `vs ${ownSide === "alpha" ? bravo || "Team Bravo" : alpha || "Team Alpha"}`;
  return alpha && bravo ? `${alpha} vs ${bravo}` : "Team match";
};
export const matchRewardsFor = (match, userId) => {
  if (cleanKey(match.status) !== "completed") return "";
  const eloChange = match.elo_changes?.[userId]?.delta;
  const xpChange = match.xp_changes?.[userId]?.amount;
  const rewards = [];
  if (typeof eloChange === "number" && Number.isFinite(eloChange)) rewards.push(`${eloChange > 0 ? "+" : ""}${eloChange} ELO`);
  if (typeof xpChange === "number" && Number.isFinite(xpChange)) rewards.push(`${xpChange > 0 ? "+" : ""}${xpChange} XP`);
  return rewards.join(" · ");
};
export const matchResultFor = (match, userId) => {
  const outcome = match?.profile_result || profileMatchOutcome(match, userId);
  if (outcome === "win") return ["Win", "text-green", "border-green/25 bg-green/10"];
  if (outcome === "loss") return ["Loss", "text-red-300", "border-red-400/20 bg-red-500/10"];
  const statusLabels = {
    open: "Open lobby", ready: "Ready", scheduled: "Scheduled", in_progress: "In progress",
    awaiting_team_alpha_report: "Awaiting score", awaiting_team_bravo_report: "Awaiting score",
    awaiting_team_a_report: "Awaiting score", awaiting_team_b_report: "Awaiting score",
    awaiting_report: "Awaiting score", awaiting_completion: "Awaiting result",
    score_conflict: "Score conflict", disputed: "Disputed",
  };
  return [statusLabels[cleanKey(match?.status)] || "Pending", "text-vapor", "border-white/5 bg-background/25"];
};
export const matchDateMs = (match) => new Date(
  match.match_completed_date || match.completed_date || match.accepted_date || match.created_date || 0
).getTime() || 0;
export const competitionLabelFor = (match) => {
  const type = cleanKey(match?.match_type || match?.competition_type || match?.competition);
  if (type === "challenge") return "Challenge a Team";
  if (type === "money8s" || type === "money-8s" || type === "money_8s" || type === "money 8s") return "Money 8s";
  if (type === "8s" || type === "eights" || type === "free8s" || type === "free-8s" || type === "free_8s") return "Free 8s";
  if (type === "tournament" || type === "streamer_tournament" || type === "tournament_match" || match?.tournament_id) return "Tournament";
  if (type === "xp" || type === "xp_match" || type === "xpmatch") return "XP Match";
  if (type === "ranked" || type === "elo") return "Ranked";
  if (type === "wager" || type === "wagers") return "Wager";
  return "Match";
};
export const competitionToneFor = (label) => {
  if (label === "Challenge a Team") return "border-purple-300/20 bg-purple-300/10 text-purple-200";
  if (label === "Money 8s") return "border-green/20 bg-green/10 text-green";
  if (label === "Free 8s") return "border-cyan/20 bg-cyan/10 text-cyan";
  if (label === "Tournament") return "border-orange/20 bg-orange/10 text-orange";
  if (label === "XP Match") return "border-purple-300/20 bg-purple-300/10 text-purple-200";
  if (label === "Ranked") return "border-yellow-400/20 bg-yellow-400/10 text-yellow-300";
  if (label === "Wager") return "border-orange/25 bg-orange/10 text-orange";
  return "border-white/15 bg-white/[0.06] text-white";
};

