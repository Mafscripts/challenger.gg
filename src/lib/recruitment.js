export const recruitmentGames = [{ id: "bo7", name: "Black Ops 7" }, { id: "bo6", name: "Black Ops 6" }, { id: "mw3", name: "Modern Warfare 3" }, { id: "mw4", name: "Modern Warfare 4" }];
export const recruitmentModes = [
  { id: "xp", name: "XP Matches", team: "xp" }, { id: "ranked", name: "Ranked", team: "ranked" },
  { id: "eights", name: "Free 8s", team: null }, { id: "money8s", name: "Money 8s", team: null },
  { id: "challenge", name: "Challenge a Team", team: "challenge" }, { id: "wagers", name: "Cash Matches", team: "wager" },
  { id: "tournaments", name: "Tournaments", team: "tournament" },
];
export const recruitmentRegions = [{ id: "any", name: "Any region" }, { id: "NA", name: "North America" }, { id: "EU", name: "Europe" }];
export const recruitmentLanguages = [{ id: "any", name: "Any language" }, { id: "en", name: "English" }, { id: "nl", name: "Dutch" }, { id: "de", name: "German" }, { id: "fr", name: "French" }, { id: "es", name: "Spanish" }, { id: "pt", name: "Portuguese" }];
export const recruitmentAvailability = [{ id: "flexible", name: "Flexible" }, { id: "now", name: "Ready now" }, { id: "evenings", name: "Evenings" }, { id: "weekends", name: "Weekends" }];
export const recruitmentLabel = (items, id) => items.find((item) => item.id === id)?.name || id;

export function recruitmentTeamFits(team, competition) {
  const type = recruitmentModes.find((mode) => mode.id === competition)?.team;
  return Boolean(type && (team.team_type === type || (type === "xp" && team.team_type === "ranked")));
}

export const recruitmentGamesFor = (competition) => ["eights", "challenge", "tournaments"].includes(competition) ? recruitmentGames : recruitmentGames.filter((game) => game.id === "bo7");
