export const playerCardThemes = [
  { id: "tokyo-afterglow", name: "Tokyo Afterglow", accent: "#41dcff", detail: "Rain · neon reflections", motion: "rain" },
  { id: "crimson-ronin", name: "Crimson Ronin", accent: "#ff6076", detail: "Red moon · drifting embers", motion: "embers", focus: "right 56%" },
  { id: "astral-tide", name: "Astral Tide", accent: "#7ba7ff", detail: "Cosmic ocean · starlight", motion: "tide" },
  { id: "solar-dynasty", name: "Solar Dynasty", accent: "#f6cd72", detail: "Golden eclipse · solar glint", motion: "solar" },
  { id: "frostbite", name: "Frostbite", accent: "#9eeaff", detail: "Frozen peaks · crystal shimmer", motion: "snow" },
  { id: "violet-serpent", name: "Violet Serpent", accent: "#c59aff", detail: "Mythic dragon · violet mist", motion: "mist", focus: "right 43%" },
  { id: "emerald-drift", name: "Emerald Drift", accent: "#6ce4ac", detail: "Jade waterfall · fireflies", motion: "fireflies" },
  { id: "chrome-circuit", name: "Chrome Circuit", accent: "#b9d5f5", detail: "Liquid silver · flowing light", motion: "chrome", focus: "right 56%" },
  { id: "inferno-bloom", name: "Inferno Bloom", accent: "#ff9d61", detail: "Volcanic glass · molten glow", motion: "lava" },
  { id: "sakura-eclipse", name: "Sakura Eclipse", accent: "#f4a5d0", detail: "Moonlit garden · falling petals", motion: "petals" },
];
export const validPlayerCard = value => value === "" || playerCardThemes.some(theme => theme.id === value);
export const playerCardTheme = player => playerCardThemes.find(theme => theme.id === (typeof player === "string" ? player : player?.player_card_theme || player?.metadata?.player_card_theme));
export const validPlayerCardMotion = value => ["auto", "on", "off"].includes(value);
export function playerCardAppearance(player, motionOverride) {
  const theme = playerCardTheme(player);
  const motion = motionOverride || player?.player_card_motion || player?.metadata?.player_card_motion || "auto";
  return theme ? { "data-player-card": theme.id, "data-card-animation": validPlayerCardMotion(motion) ? motion : "auto", "data-card-motion": theme.motion, style: { "--pc-art": `url("/images/player-cards/${theme.id}.webp")`, "--pc-desktop-art": `url("/images/player-cards/desktop/${theme.id}.webp")`, "--pc-accent": theme.accent, "--pc-focus": theme.focus || "right center" } } : {};
}
