// Illustrative league data only. Never persisted or sent to the competition API.
const teamDefinitions = [
  ["topfragg", "Topfragg", "TF", "Orbit", ["Aero", "Flux", "Vega", "Echo", "Drift", "Halo"], 5, 1, "WWLWW"],
  ["nova-reign", "Nova Reign", "NR", "Lyra", ["Nova", "Recoil", "Frost", "Blaze", "Rune", "Dash"], 4, 2, "WLWWW"],
  ["iron-wolves", "Iron Wolves", "IW", "Forge", ["Wolf", "Steel", "Onyx", "Bolt", "Ash", "Kilo"], 4, 2, "WWLWL"],
  ["neon-syndicate", "Neon Syndicate", "NS", "Pixel", ["Neon", "Glitch", "Prism", "Ghost", "Zero", "Jolt"], 3, 3, "LWWLL"],
  ["voltage", "Voltage", "VT", "Circuit", ["Spark", "Surge", "Amp", "Watt", "Switch", "Charge"], 3, 3, "WLLWW"],
  ["vortex-unit", "Vortex Unit", "VU", "Spiral", ["Vortex", "Cyclone", "Gale", "Storm", "Tide", "Gust"], 2, 4, "LLWLW"],
  ["phantom-crew", "Phantom Crew", "PC", "Spectre", ["Phantom", "Shade", "Wraith", "Mist", "Dusk", "Fade"], 2, 4, "LWLLL"],
  ["crimson-edge", "Crimson Edge", "CE", "Scarlet", ["Crimson", "Edge", "Ember", "Flare", "Cinder", "Ruby"], 1, 5, "LLLWL"],
];

export const LEAGUE_DEMO_TEAMS = teamDefinitions.map(([id, name, tag, manager, players, wins, losses, form], index) => ({
  id, name, tag, manager, wins, losses, form, position: index + 1, played: wins + losses,
  players: players.map((name, playerIndex) => ({ name, role: playerIndex >= 4 ? "Reserve" : playerIndex === 0 ? "Captain" : "Player" })),
}));

export const LEAGUE_DEMO_MATCHES = [
  { id: "topfragg-nova", teamA: "topfragg", teamB: "nova-reign", round: "Week 4", scheduledAt: "2027-03-19T19:00:00Z", status: "scheduled" },
  { id: "wolves-neon", teamA: "iron-wolves", teamB: "neon-syndicate", round: "Week 4", scheduledAt: "2027-03-20T18:00:00Z", status: "scheduled" },
  { id: "voltage-vortex", teamA: "voltage", teamB: "vortex-unit", round: "Week 4", scheduledAt: "2027-03-20T20:00:00Z", status: "scheduled" },
  { id: "phantom-crimson", teamA: "phantom-crew", teamB: "crimson-edge", round: "Week 4", scheduledAt: "2027-03-21T19:00:00Z", status: "scheduled" },
  { id: "topfragg-wolves", teamA: "topfragg", teamB: "iron-wolves", round: "Week 3", scheduledAt: "2027-03-12T19:00:00Z", status: "completed", scoreA: 2, scoreB: 1 },
];

// Fixed example dates, never a launch announcement or a real live schedule.
const demoScheduleFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC", weekday: "long", day: "2-digit", month: "short", year: "numeric",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});
export const leagueDemoSchedule = (match) => {
  const parts = Object.fromEntries(demoScheduleFormatter.formatToParts(new Date(match.scheduledAt)).map(({ type, value }) => [type, value]));
  return { day: parts.day, month: parts.month.toUpperCase(), year: parts.year, weekday: parts.weekday, time: `${parts.hour}:${parts.minute}`, fullDate: `${parts.day} ${parts.month} ${parts.year}`, timezone: "UTC" };
};

export const leagueDemoTeam = (id) => LEAGUE_DEMO_TEAMS.find((team) => team.id === id);
export const leagueDemoMatchUrl = (division, match = LEAGUE_DEMO_MATCHES[0]) => `/league/division/${division.id}/demo-match/${match.id}`;
