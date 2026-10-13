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
  { id: "topfragg-nova", teamA: "topfragg", teamB: "nova-reign", round: "Week 4", day: "Friday", time: "19:00 UTC", status: "scheduled" },
  { id: "wolves-neon", teamA: "iron-wolves", teamB: "neon-syndicate", round: "Week 4", day: "Saturday", time: "18:00 UTC", status: "scheduled" },
  { id: "voltage-vortex", teamA: "voltage", teamB: "vortex-unit", round: "Week 4", day: "Saturday", time: "20:00 UTC", status: "scheduled" },
  { id: "phantom-crimson", teamA: "phantom-crew", teamB: "crimson-edge", round: "Week 4", day: "Sunday", time: "19:00 UTC", status: "scheduled" },
  { id: "topfragg-wolves", teamA: "topfragg", teamB: "iron-wolves", round: "Week 3", day: "Example result", time: "Completed", status: "completed", scoreA: 2, scoreB: 1 },
];

export const leagueDemoTeam = (id) => LEAGUE_DEMO_TEAMS.find((team) => team.id === id);
export const leagueDemoMatchUrl = (division, match = LEAGUE_DEMO_MATCHES[0]) => `/league/division/${division.id}/demo-match/${match.id}`;
