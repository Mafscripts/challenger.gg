import React from "react";
import TopfraggLogo from "@/components/brand/TopfraggLogo";
import UserBadges from "@/components/ui/UserBadges";
import "@/styles/studio-player-overlays.css";

export const STUDIO_OVERLAY_THEMES = [
  { key: "apex", label: "Apex", caption: "Race-day broadcast", edition: "06", description: "Apex / 06 — racing red, crisp white stat blocks and an angular player panel." },
  { key: "obsidian", label: "Obsidian", caption: "Black & champagne", edition: "07", description: "Obsidian / 07 — champagne gold on black, a central player signature and a trophy gallery." },
  { key: "aurora", label: "Aurora", caption: "Floating light", edition: "08", description: "Aurora / 08 — separate floating panels, deep indigo and soft mint-to-violet light." },
  { key: "terminal", label: "Terminal", caption: "Phosphor green", edition: "09", description: "Terminal / 09 — green phosphor, monospace readouts and a compact two-row dashboard." },
  { key: "editorial", label: "Editorial", caption: "Ivory & vermilion", edition: "10", description: "Editorial / 10 — warm ivory, vermilion accents, oversized serif numbers and a print-inspired layout." },
];

function StudioIdentity({ player, stale }) {
  const effect = player.display_name_color;
  return <div className="studio-identity">
    <div className="studio-identity-meta"><span className="studio-handle">{player.username ? `@${player.username}` : "Topfragg player"}</span><span className="studio-status" data-stale={stale}><i aria-hidden="true" />{stale ? "Reconnecting" : "Player stats"}</span></div>
    <div className="studio-name-row"><h1 className={`studio-name player-name-wrap ${effect ? "player-name-color" : ""}`} data-name-effect={effect || undefined} style={effect ? { "--player-name-color": effect } : undefined}>{player.display_name}</h1><UserBadges user={player} size="xs" iconOnly showTooltip={false} showForceStream={false} showMonitorCam={false} /></div>
    <span className="studio-identity-decoration" aria-hidden="true"><i /><i /><i /></span>
  </div>;
}

function StudioStats({ stats, rank, money }) {
  const metrics = [
    { key: "ranked", label: "Ranked ELO", value: Number(stats.elo || 0).toLocaleString("en-US"), detail: stats.has_ranked_matches ? rank.name : "Unranked" },
    { key: "eights", label: "8s ELO", value: Number(stats.free_eights_elo || 0).toLocaleString("en-US"), detail: "Black Ops 7" },
    { key: "skill", label: "8s SR", value: stats.free_eights_sr || "Newb", detail: stats.free_eights_sr_source === "screenshot" ? "Verified game rank" : "Free 8s skill rank" },
    { key: "record", label: "Record", value: `${stats.wins}W / ${stats.losses}L`, detail: "Wins / losses" },
    { key: "rate", label: "Win rate", value: `${stats.win_rate}%`, detail: "Overall record" },
    { key: "earnings", label: "Earnings", value: money, detail: "Lifetime / USD" },
  ];
  return <div className="studio-stats">{metrics.map((metric, index) => <div className={`studio-stat studio-stat-${metric.key}`} key={metric.key}>
    <span className="studio-stat-label"><span className="studio-stat-index" aria-hidden="true">0{index + 1}</span>{metric.label}</span>
    <strong className="studio-stat-value" key={metric.value} title={String(metric.value)}>{metric.value}</strong>
    <span className="studio-stat-detail">{metric.detail}</span>
  </div>)}</div>;
}

function StudioTrophies({ counts, trophies }) {
  return <div className="studio-cabinet">
    <div className="studio-cabinet-heading"><span>Trophy cabinet</span><i aria-hidden="true" /><span>Achievements</span></div>
    <div className="studio-trophies">{trophies.map(trophy => <div className="studio-trophy" data-tier={trophy.key} key={trophy.key}>
      <img src={trophy.image} alt="" />
      <strong key={counts[trophy.key] || 0}>{counts[trophy.key] || 0}</strong>
      <span>{trophy.label}</span>
    </div>)}</div>
  </div>;
}

export default function StudioPlayerStatsBar({ data, stale, theme, rank, money, trophies }) {
  const design = STUDIO_OVERLAY_THEMES.find(option => option.key === theme);
  return <div className="app-content studio-player-bar" data-theme={theme}>
    <div className="studio-brand">
      <TopfraggLogo showWordmark={false} markClassName="studio-brand-mark" />
      <div className="studio-brand-copy"><strong>TOPFRAGG<span>.GG</span></strong><span className="studio-edition">{design.label} / {design.edition}</span></div>
    </div>
    <StudioIdentity player={data.player} stale={stale} />
    <StudioStats stats={data.stats} rank={rank} money={money} />
    <StudioTrophies counts={data.trophies} trophies={trophies} />
  </div>;
}
