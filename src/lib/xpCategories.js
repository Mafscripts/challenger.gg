export const XP_CATEGORIES = [
  { id: "solo", label: "Solo", detail: "1v1", sizes: [1] },
  { id: "duos", label: "Duos", detail: "2v2", sizes: [2] },
  { id: "teams", label: "Teams", detail: "3v3 · 4v4 · 5v5", sizes: [3, 4, 5] },
];
export const xpCategoryForSize = (value) => {
  const text = String(value || "");
  const size = Number(text.includes("v") ? /^([1-5])v\1$/.exec(text)?.[1] : text);
  return size === 1 ? "solo" : size === 2 ? "duos" : [3, 4, 5].includes(size) ? "teams" : null;
};
export const xpCategory = (value) => XP_CATEGORIES.find((entry) => entry.id === value) || XP_CATEGORIES[0];
