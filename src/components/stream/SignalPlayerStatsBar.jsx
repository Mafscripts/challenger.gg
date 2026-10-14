import React from "react";
import TopfraggLogo from "@/components/brand/TopfraggLogo";
import UserBadges from "@/components/ui/UserBadges";
import "@/styles/signal-player-overlay.css";

function SignalStat({ label, value, detail, tone = "", children }) {
  return <div className={`signal-stat ${tone ? `signal-stat-${tone}` : ""}`}>
    <span className="signal-stat-label">{label}</span>
    <strong className="signal-stat-value" key={String(value)}>{children || value}</strong>
    <span className="signal-stat-detail">{detail}</span>
  </div>;
}

export default function SignalPlayerStatsBar({ data, stale, rank, money, trophies }) {
  const { player, stats } = data;
  const effect = player.display_name_color;
  const winRate = Math.min(100, Math.max(0, Number(stats.win_rate) || 0));
  return <div className="app-content signal-player-bar" data-theme="signal">
    <div className="signal-player-panel">
      <div className="signal-brand">
        <div className="signal-brand-lockup"><TopfraggLogo showWordmark={false} markClassName="signal-brand-mark" /><strong>TOPFRAGG<span>.GG</span></strong></div>
        <span className="signal-edition"><i aria-hidden="true" />SIGNAL / 05</span>
      </div>
      <div className="signal-identity">
        <div className="signal-identity-meta"><span className="signal-player-handle">{player.username ? `@${player.username}` : "Topfragg player"}</span><span className="signal-connection" data-stale={stale}><i aria-hidden="true" />{stale ? "Reconnecting" : "Player stats"}</span></div>
        <div className="signal-player-name-row"><h1 className={`signal-player-name player-name-wrap ${effect ? "player-name-color" : ""}`} data-name-effect={effect || undefined} style={effect ? { "--player-name-color": effect } : undefined}>{player.display_name}</h1><UserBadges user={player} size="xs" iconOnly showTooltip={false} showForceStream={false} showMonitorCam={false} /></div>
        <div className="signal-identity-track" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /></div>
      </div>
    </div>

    <div className="signal-stats">
      <SignalStat label="Ranked ELO" value={Number(stats.elo || 0).toLocaleString("en-US")} detail={stats.has_ranked_matches ? rank.name : "Unranked"} tone="ranked" />
      <SignalStat label="8s ELO" value={Number(stats.free_eights_elo || 0).toLocaleString("en-US")} detail="Black Ops 7" tone="eights" />
      <SignalStat label="8s skill rank" value={stats.free_eights_sr || "Newb"} detail={stats.free_eights_sr_source === "screenshot" ? "Verified game rank" : "Free 8s skill rank"} tone="skill" />
      <SignalStat label="Match record" value={`${stats.wins}-${stats.losses}`} detail="Wins / losses" tone="record"><span>{stats.wins}<small>W</small></span><b aria-hidden="true">/</b><span>{stats.losses}<small>L</small></span></SignalStat>
      <SignalStat label="Win rate" value={stats.win_rate} detail={<span className="signal-win-track" role="img" aria-label={`${stats.win_rate}% win rate`}><i style={{ width: `${winRate}%` }} /></span>} tone="win"><span>{stats.win_rate}<small>%</small></span></SignalStat>
      <SignalStat label="Total earnings" value={money} detail="Lifetime / USD" tone="earnings" />
    </div>

    <div className="signal-cabinet">
      <div className="signal-cabinet-heading"><span>Trophy cabinet</span><span className="signal-cabinet-rule" aria-hidden="true" /><span>COLLECTION / 06</span></div>
      <div className="signal-trophies">{trophies.map(trophy => <div className="signal-trophy" data-tier={trophy.key} key={trophy.key}>
        <img src={trophy.image} alt="" />
        <strong key={data.trophies[trophy.key] || 0}>{data.trophies[trophy.key] || 0}</strong>
        <span>{trophy.label}</span>
      </div>)}</div>
    </div>
  </div>;
}
