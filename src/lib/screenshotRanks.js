export const screenshotRanks = [
  { id: "diamond", label: "Diamond", style: "border-blue-400/35 bg-blue-500/10 text-blue-300" },
  { id: "crimson", label: "Crimson", style: "border-red-400/35 bg-red-400/10 text-red-300" },
  { id: "iridescent", label: "Iridescent", style: "border-fuchsia-400/35 bg-fuchsia-400/10 text-fuchsia-200" },
  { id: "top250", label: "Top 250", style: "border-amber-300/35 bg-amber-300/10 text-amber-200" },
];
export const screenshotRankFor = (id) => screenshotRanks.find((rank) => rank.id === id);
