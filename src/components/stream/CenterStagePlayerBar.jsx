import React from "react";
import TopfraggLogo from "@/components/brand/TopfraggLogo";
import "@/styles/center-stage-overlays.css";

export const CENTER_STAGE_THEMES = [
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
export default function CenterStagePlayerBar({ data, stale, theme, money, trophies }) {
  const { player, stats } = data;
  const design = CENTER_STAGE_THEMES.find(item => item.key === theme);
  return <div className="app-content centerbar" data-design={theme}>
    <div className="centerbar-fx" aria-hidden="true"><div className="centerbar-grid" /><div className="centerbar-ribbon" /><div className="centerbar-orbit" /><div className="centerbar-orbit centerbar-orbit-two" />{Array.from({ length: 18 }, (_, i) => <i key={i} style={{ "--i": i }} />)}<div className="centerbar-rail" /><div className="centerbar-rail centerbar-rail-bottom" /></div>
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
