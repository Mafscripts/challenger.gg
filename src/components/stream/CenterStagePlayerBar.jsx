import React from "react";
import TopfraggLogo from "@/components/brand/TopfraggLogo";
import "@/styles/center-stage-overlays.css";
import "@/styles/vivid-player-overlays.css";
import "@/styles/tokyo-midnight-overlay.css";
import AfterHoursDecorations from "./AfterHoursDecorations";

import { CENTER_STAGE_THEMES } from "@/lib/playerOverlayConfig";
export { CENTER_STAGE_THEMES } from "@/lib/playerOverlayConfig";
const format = value => Number(value || 0).toLocaleString("en-US");
function Metric({ label, value }) {
  return <div className="centerbar-metric"><span>{label}</span><strong key={String(value)} title={String(value)}>{value}</strong></div>;
}
function VividAnimation({ theme }) {
  if (["miami-vice", "venom-core", "ember-forge", "astral-gate"].includes(theme)) return <AfterHoursDecorations theme={theme} />;
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
    <div className="centerbar-identity"><span className="centerbar-handle">{"TOPFRAGG PLAYER"}</span><h1 title={player.display_name}>{player.display_name}</h1><span className="centerbar-live" data-stale={stale}><i />{stale ? "RECONNECTING · LAST SAVED STATS" : "LIVE PLAYER STATS"}</span></div>
    <div className="centerbar-wing centerbar-right">
      <Metric label={`XP · level ${format(stats.xp_level || 1)}`} value={format(stats.total_xp)} /><Metric label="Record" value={`${format(stats.wins)}W / ${format(stats.losses)}L`} /><Metric label="Earnings" value={money} />
      <div className="centerbar-trophies">{trophies.map(trophy => <div key={trophy.key} title={trophy.label}><img src={trophy.image} alt={trophy.label} /><strong>{format(data.trophies?.[trophy.key])}</strong></div>)}</div>
    </div>
  </div>;
}
