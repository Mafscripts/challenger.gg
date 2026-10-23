import { websiteOrigin } from "./appEnvironment";

export const STUDIO_OVERLAY_THEMES = [
  { key: "apex", label: "Apex", caption: "Race-day broadcast", edition: "06", description: "Apex / 06 — racing red, crisp white stat blocks and an angular player panel." },
  { key: "obsidian", label: "Obsidian", caption: "Black & champagne", edition: "07", description: "Obsidian / 07 — champagne gold on black, a central player signature and a trophy gallery." },
  { key: "aurora", label: "Aurora", caption: "Floating light", edition: "08", description: "Aurora / 08 — separate floating panels, deep indigo and soft mint-to-violet light." },
  { key: "terminal", label: "Terminal", caption: "Phosphor green", edition: "09", description: "Terminal / 09 — green phosphor, monospace readouts and a compact two-row dashboard." },
  { key: "editorial", label: "Editorial", caption: "Ivory & vermilion", edition: "10", description: "Editorial / 10 — warm ivory, vermilion accents, oversized serif numbers and a print-inspired layout." },
  { key: "hyperdrive", label: "Hyperdrive", caption: "Fully animated", edition: "11", description: "Hyperdrive / 11 — a fully animated cyan-and-magenta broadcast: orbiting logo rings, flowing light trails, moving grid, cascading stat highlights and floating trophies." },
  { key: "solar", label: "Solar Flare", caption: "Animated / fire & gold", edition: "12", cinematic: true, description: "Solar Flare / 12 — a molten-gold broadcast with a rotating solar corona, rising embers, flowing firelight and glowing trophy pedestals." },
  { key: "hologram", label: "Hologram", caption: "Animated / ice & cyan", edition: "13", cinematic: true, description: "Hologram / 13 — a cyan projection with a rotating radar, scanning light, moving grid and levitating trophies." },
  { key: "quantum", label: "Quantum", caption: "Animated / violet & mint", edition: "14", cinematic: true, description: "Quantum / 14 — drifting nebulae, orbiting geometry and luminous particles surround a central player panel and floating trophy gallery." },
];

export const CENTER_STAGE_THEMES = [
  { key: "miami-vice", label: "Miami Vice", vivid: true, caption: "Hot pink / turquoise skyline", description: "A rolling neon perspective grid, striped sunset and turquoise horizon beneath a centered pink signature." },
  { key: "venom-core", label: "Venom Core", vivid: true, caption: "Emerald / living energy", description: "Emerald energy filaments breathe and weave through dark glass while luminous motes rise around your name." },
  { key: "ember-forge", label: "Ember Forge", vivid: true, caption: "Copper / molten orange", description: "Brushed copper, molten seams, rising embers and a forged-metal player signature." },
  { key: "astral-gate", label: "Astral Gate", vivid: true, caption: "Violet / ice-blue starlight", description: "Counter-rotating portal rings, drifting stars and ice-blue orbital accents around your centered signature." },
  { key: "crimson-overdrive", label: "Crimson Overdrive", vivid: true, caption: "Scarlet / racing afterburners", description: "The original red afterburner design: rushing light trails, angular armor and a luminous centered player signature." },
  { key: "volt-rush", label: "Tokyo Midnight", vivid: true, caption: "Yellow neon / after-hours broadcast", description: "Tokyo after dark: animated Japanese neon signs, rain streaks, a yellow station-style nameplate and brief signal glitches. Your existing yellow overlay URL still works." },
  { key: "cobalt-strike", label: "Cobalt Strike", vivid: true, caption: "Royal blue / plasma ribbons", description: "Layered blue plasma ribbons flow behind a sharp ice-blue player frame." },
  { key: "gilded-reign", label: "Gilded Reign", vivid: true, caption: "Rich gold / polished metal", description: "Cut-gold facets, broad polished reflections and rising golden embers." },
  { key: "silver-spectre", label: "Silver Spectre", vivid: true, caption: "Chrome silver / liquid light", description: "Flowing liquid-chrome reflections and opposing diamond comets surround a silver player frame." },
  { key: "arc-reactor", label: "Arc Reactor", caption: "Electric cyan / reactor rings", description: "A centered player signature powered by spinning reactor rings, charging rails and electric particles." },
  { key: "rift-runner", label: "Rift Runner", caption: "Magenta / warp-speed trails", description: "An angular magenta broadcast with rushing warp trails, a split portal and cascading light." },
  { key: "crownline", label: "Crownline", caption: "Champagne / royal spotlight", description: "A black-and-gold signature with sweeping spotlights, orbiting gold dust and a radiant crown-shaped frame." },
  { key: "storm-circuit", label: "Storm Circuit", caption: "Lime / moving circuitry", description: "A kinetic lime dashboard with traveling circuit pulses, scanning grids and an energized player frame." },
  { key: "prism-tide", label: "Prism Tide", caption: "Iridescent / flowing ribbons", description: "A luminous pearl-and-violet broadcast with flowing iridescent ribbons, drifting light and a prismatic player signature." },
];

export const PLAYER_OVERLAY_WIDTH = 1920;
export const PLAYER_OVERLAY_HEIGHT = 80;
export const PLAYER_OVERLAY_THEMES = [
  { key: "blue", label: "Original blue", caption: "The Topfragg original" },
  { key: "orange", label: "Orange", caption: "Warm amber glow" },
  { key: "mono", label: "Black & white", caption: "Pure monochrome" },
  { key: "xmas", label: "Christmas", caption: "Merry Fragmas", description: "Merry Fragmas! Snow-white stats, festive lights and falling snow, with your original Topfragg branding." },
  { key: "signal", label: "Signal", caption: "Acid lime & lavender", description: "Signal / 05 — a fresh broadcast layout in acid lime, charcoal and lavender, with a dedicated trophy strip." },
  ...STUDIO_OVERLAY_THEMES,
  ...CENTER_STAGE_THEMES,
];
export const normalizePlayerOverlayTheme = theme => PLAYER_OVERLAY_THEMES.some(option => option.key === theme) ? theme : "blue";

export const playerOverlayUrl = (identifier, theme = "blue") => {
  const selectedTheme = normalizePlayerOverlayTheme(theme);
  return `${websiteOrigin}/overlay/player/${encodeURIComponent(identifier)}${selectedTheme === "blue" ? "" : `?theme=${selectedTheme}`}`;
};
