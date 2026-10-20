import { normalizeTeamRosterSize } from "@/lib/teamFormats";

const teamTypes = {
  xp: { label: "XP Matches", description: "Your dedicated roster for XP matches.", icon: "xp" },
  xp: { label: "XP Matches", description: "Your dedicated roster for XP matches.", icon: "xp" },
  challenge: { label: "Challenge a Team", description: "A dedicated roster for team challenges.", icon: "challenge" },
  tournament: { label: "Tournaments", description: "Compete together in team tournaments.", icon: "tournament" },
  wager: { label: "Cash Matches", description: "Your roster for team cash matches.", icon: "wager" },
  ranked: { label: "Ranked", description: "Play team matches and climb the ranked ladder.", icon: "ranked" },
  general: { label: "General", description: "A shared team for your regular squad.", icon: "general" },
};

export const teamPurposeFor = (team) => teamTypes[String(team?.team_type || "general").toLowerCase()] || teamTypes.general;
export const teamPlayerFormat = (team) => {
  const size = normalizeTeamRosterSize(team?.roster_size);
  return `${size}v${size}`;
};
export const teamPageUrl = (team, tab = "overview") => `/teams?team=${encodeURIComponent(team.id)}${tab === "overview" ? "" : `&tab=${encodeURIComponent(tab)}`}`;
