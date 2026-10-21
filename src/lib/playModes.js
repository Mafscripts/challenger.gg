export const PLAY_MODES = [
  { id: "ranked", name: "Ranked", href: "/ranked", entry: "Solo or Ranked party · 1v1–4v4", progress: "Ranked ELO", detail: "Create or accept a match and climb the Ranked ladder. Parties stay together.", team: null },
  { id: "eights", name: "Free 8s", href: "/ranked/8s", entry: "Join solo · 2v2, 3v3 or 4v4", progress: "Free 8s ELO · separate per game", detail: "Join a lobby individually. Teams are balanced automatically, or players vote for a captain draft. Connect Discord and set your game rank first.", discord: true, rank: true },
  { id: "xp", name: "XP Matches", href: "/xp", entry: "XP team required · Solo, Duos, Teams (1v1–5v5)", progress: "XP Matches progression", detail: "Play with an XP team, including a one-player team for 1v1. Solo is 1v1, Duos 2v2, and Teams 3v3 to 5v5. One active XP team per player; use a complete matching roster. Only XP Matches affect this XP progression.", team: "xp" },
  { id: "challenge", name: "Challenge a Team", href: "/challenge-a-team", entry: "Post with a roster · accept with a team or solo", progress: "Separate Challenge a Team ladder", detail: "Challenge a roster in 1v1–4v4. Solo challengers can fill the opposing side. Discord is required; posting needs a complete Challenge a Team roster.", discord: true, team: "challenge", optionalTeam: true },
  { id: "money8s", name: "Money 8s", href: "/ranked/8s?mode=money", entry: "Join solo · 4v4 · wallet entry", progress: "Money 8s standings", detail: "Eight individual players enter a lobby and are assigned teams. Review the entry and wallet balance before joining. Stream every map.", stream: true },
  { id: "wagers", name: "Cash Matches", href: "/wagers", entry: "Wager team required · 1v1–4v4", progress: "Cash Match standings", detail: "Post or accept with a complete Wager team. Review the stake, payment option and roster each time. Stream every map.", stream: true, team: "wager" },
  { id: "tournaments", name: "Tournaments", href: "/tournaments", entry: "Event-specific roster and entry", progress: "Tournament results & trophies", detail: "Choose an event and check its format, roster, entry and check-in rules. Your team plays through the bracket. Stream every map.", stream: true, team: "tournament", eventTeam: true },
];

export const playModeFor = (id) => PLAY_MODES.find((mode) => mode.id === id) || PLAY_MODES[0];

// A preparation hint, not a replacement for the match-specific server checks.
export function preparedTeams(teams, mode, userId) {
  return teams.filter((team) => {
    const members = team.members || [];
    const size = Number(team.roster_size || members.length);
    const correctType = team.team_type === mode.team;
    return correctType && team.is_active !== false && team.captain_id === userId
      && Number.isInteger(size) && size >= 1 && size <= (mode.eventTeam ? 20 : mode.team === "xp" ? 5 : 4) && members.length === size
      && new Set(members.map((member) => member.user_id)).size === size
      && members.some((member) => member.user_id === userId);
  });
}
