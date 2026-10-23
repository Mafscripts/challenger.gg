import React from "react";
import TopfraggLogo from "@/components/brand/TopfraggLogo";
import "@/styles/center-stage-overlays.css";
import "@/styles/vivid-player-overlays.css";
import "@/styles/tokyo-midnight-overlay.css";

export const CENTER_STAGE_THEMES = [
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
const format = value => Number(value || 0).toLocaleString("en-US");
function Metric({ label, value }) {
  return <div className="centerbar-metric"><span>{label}</span><strong key={String(value)} title={String(value)}>{value}</strong></div>;
}
function VividAnimation({ theme }) {
  if (theme === "volt-rush") return <div className="tokyo-atmosphere" aria-hidden="true"><div className="tokyo-city"><span>東京</span><span>深夜</span><span>電光</span><span>東京</span><span>深夜</span><span>電光</span></div><div className="tokyo-rain">{Array.from({ length: 18 }, (_, index) => <i key={index} style={{ "--n": index }} />)}</div><span className="tokyo-signal" /><span className="tokyo-track" /><span className="tokyo-track tokyo-track-bottom" /></div>;
  const family = { "crimson-overdrive": "turbine", "volt-rush": "circuit", "cobalt-strike": "radar", "gilded-reign": "theatre", "silver-spectre": "chrome" }[theme];
  return <div className={`unique-engine unique-${family}`} aria-hidden="true"><span className="broadcast-energy broadcast-energy-left" /><span className="broadcast-energy broadcast-energy-right" /><span className="broadcast-edge" /><span className="broadcast-edge broadcast-edge-bottom" />{Array.from({ length: family === "circuit" ? 8 : 20 }, (_, index) => <i key={index} style={{ "--n": index }} />)}</div>;
}
export default function CenterStagePlayerBar({ data, stale, theme, money, trophies }) {
  const { player, stats } = data;
  const design = CENTER_STAGE_THEMES.find(item => item.key === theme);
  return <div className="app-content centerbar" data-design={theme} data-vivid={(design.vivid && theme !== "crimson-overdrive") || undefined}>
    {design.vivid && theme !== "crimson-overdrive" && <VividAnimation theme={theme} />}
    <div className="centerbar-fx" aria-hidden="true"><div className="centerbar-grid" /><div className="centerbar-ribbon" /><div className="centerbar-orbit" /><div className="centerbar-orbit centerbar-orbit-two" />{Array.from({ length: 18 }, (_, i) => <i key={i} style={{ "--i": i }} />)}{design.vivid && <><span className="vivid-sweep" /><span className="vivid-sweep vivid-sweep-reverse" /><span className="vivid-sonar" /><span className="vivid-sonar vivid-sonar-delayed" /></>}<div className="centerbar-rail" /><div className="centerbar-rail centerbar-rail-bottom" /></div>
    <div className="centerbar-wing centerbar-left">
      <div className="centerbar-brand"><TopfraggLogo showWordmark={false} markClassName="centerbar-logo" /><div><strong>TOP<span>FRAGG</span>.GG</strong><small>{design.label}</small></div></div>
      <Metric label="Ranked ELO" value={format(stats.elo)} /><Metric label="8s ELO" value={format(stats.free_eights_elo)} /><Metric label="8s SR" value={stats.free_eights_sr || "Newb"} />
    </div>
    <div className="centerbar-identity"><span className="centerbar-handle">{player.username ? `@${player.username}` : "TOPFRAGG PLAYER"}</span><h1 title={player.display_name}>{player.display_name}</h1><span className="centerbar-live" data-stale={stale}><i />{stale ? "RECONNECTING · LAST SAVED STATS" : "LIVE PLAYER STATS"}</span></div>
    <div className="centerbar-wing centerbar-right">
      <Metric label={`XP · level ${format(stats.xp_level || 1)}`} value={format(stats.total_xp)} /><Metric label="Record" value={`${format(stats.wins)}W / ${format(stats.losses)}L`} /><Metric label="Earnings" value={money} />
      <div className="centerbar-trophies">{trophies.map(trophy => <div key={trophy.key} title={trophy.label}><img src={trophy.image} alt={trophy.label} /><strong>{format(data.trophies?.[trophy.key])}</strong></div>)}</div>
    </div>
  </div>;
}
