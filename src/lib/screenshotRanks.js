export const screenshotRanks = [
  { id: "diamond", label: "Titan", gameLabel: "Diamond", style: "border-blue-400/35 bg-blue-500/10 text-blue-300" },
  { id: "crimson", label: "Master", gameLabel: "Crimson", style: "border-red-400/35 bg-red-400/10 text-red-300" },
  { id: "iridescent", label: "Apex", gameLabel: "Iridescent", style: "border-fuchsia-400/35 bg-fuchsia-400/10 text-fuchsia-200" },
  { id: "top250", label: "Legend", gameLabel: "Top 250", style: "border-amber-300/35 bg-amber-300/10 text-amber-200" },
];
export const gameRankEquivalents = screenshotRanks.map((rank) => `${rank.label} = ${rank.gameLabel}`).join(" · ");
export const screenshotRankFor = (id) => screenshotRanks.find((rank) => rank.id === id);
export const selfSelectableRanks = screenshotRanks.filter((rank) => rank.id !== "top250");
export const top250RequestFor = (state) => (Array.isArray(state?.attempts) ? state.attempts : []).findLast((attempt) => attempt.kind === "top250_request") || null;
