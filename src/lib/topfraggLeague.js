// Launch preview only. Registration, payments and match entry are closed.
export const TOPFRAGG_LEAGUE = Object.freeze({
  name: "Topfragg League",
  game: "Modern Warfare 4",
  status: "coming_soon",
  starters: 4,
  reserves: 2,
  registrationOpen: false,
});

export const LEAGUE_DIVISIONS = [
  ...Array.from({ length: 12 }, (_, index) => {
    const number = index + 1;
    return {
      id: `division-${number}`,
      name: `Division ${number}`,
      shortName: `DIV ${number}`,
      number,
      fee: number <= 2 ? 150 : 125,
      tier: number <= 2 ? "Premier divisions" : "League divisions",
    };
  }),
  { id: "challengers", name: "Challengers", shortName: "CHALLENGERS", number: null, fee: 250, tier: "Challengers ladder" },
];

export const leagueDivisionUrl = (division) => `/league/division/${division.id}`;
