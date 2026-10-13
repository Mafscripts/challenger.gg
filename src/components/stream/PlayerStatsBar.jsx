import React, { useEffect, useState } from "react";
import { DollarSign, Swords, Target } from "lucide-react";
import TopfraggLogo from "@/components/brand/TopfraggLogo";
import UserBadges from "@/components/ui/UserBadges";
import { base44 } from "@/api/base44Client";
import { getRankForElo } from "@/lib/ranks";
import "@/styles/player-overlay.css";

export const PLAYER_OVERLAY_WIDTH = 1920;
export const PLAYER_OVERLAY_HEIGHT = 160;
const REFRESH_MS = 15000;
const trophies = [
  { key: "gold", label: "Gold", image: "/assets/trophies/profile/gold.png" },
  { key: "silver", label: "Silver", image: "/assets/trophies/profile/silver.png" },
  { key: "bronze", label: "Bronze", image: "/assets/trophies/profile/bronze.png" },
  { key: "premium", label: "Premium", image: "/assets/trophies/profile/premium.png" },
  { key: "topfragg", label: "Topfragg", image: "/assets/trophies/compact/topfragg.png" },
  { key: "hosted", label: "Hosted", image: "/assets/trophies/compact/hosted.png" },
];

export const playerOverlayUrl = identifier => `${window.location.origin}/overlay/player/${encodeURIComponent(identifier)}`;

export function usePlayerOverlay(identifier) {
  const [state, setState] = useState({ data: null, error: "", loading: true, stale: false });
  useEffect(() => {
    let disposed = false;
    let timer;
    let failedAttempts = 0;
    setState({ data: null, error: "", loading: true, stale: false });
    const refresh = async () => {
      try {
        const data = await base44.public.playerOverlay(identifier);
        if (disposed) return;
        failedAttempts = 0;
        setState({ data, error: "", loading: false, stale: false });
      } catch (error) {
        if (disposed) return;
        failedAttempts += 1;
        const missing = [400, 404].includes(error.status);
        setState(previous => ({
          data: missing ? null : previous.data,
          error: missing ? "Player not found. Check the player URL." : "Player stats are temporarily unavailable. Reconnecting…",
          loading: false,
          stale: true,
        }));
      }
      if (!disposed) timer = window.setTimeout(refresh, Math.min(REFRESH_MS * Math.max(1, failedAttempts), 60000));
    };
    refresh();
    return () => { disposed = true; window.clearTimeout(timer); };
  }, [identifier]);
  return state;
}

export default function PlayerStatsBar({ data, stale = false }) {
  const [failedAvatar, setFailedAvatar] = useState("");
  const player = data.player;
  const stats = data.stats;
  const rank = getRankForElo(stats.elo);
  const effect = player.display_name_color;
  const money = Number(stats.earnings || 0).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return <div className="app-content stream-player-bar">
    <div className="stream-player-brand">
      <TopfraggLogo showWordmark={false} markClassName="stream-brand-mark" />
      <div><strong><span>TOP</span><span>FRAGG</span><span>.GG</span></strong><span className="stream-brand-caption">Player overview</span></div>
    </div>
    <div className="stream-player-identity">
      <span className="stream-player-avatar">{player.avatar_url && failedAvatar !== player.avatar_url ? <img src={player.avatar_url} alt="" onError={() => setFailedAvatar(player.avatar_url)} /> : player.display_name.slice(0, 1).toUpperCase()}</span>
      <div className="stream-player-identity-copy">
        <span className="stream-player-handle">{player.username ? `@${player.username}` : "Topfragg player"}</span>
        <div className="stream-player-name-row"><h1 className={`stream-player-name player-name-wrap ${effect ? "player-name-color" : ""}`} data-name-effect={effect || undefined} style={effect ? { "--player-name-color": effect } : undefined}>{player.display_name}</h1><UserBadges user={player} size="xs" iconOnly showTooltip={false} showForceStream={false} showMonitorCam={false} /></div>
      </div>
    </div>
    <div className="stream-player-stat stream-player-rank">
      <span className="stream-player-label">Ranked ELO</span>
      <div>{stats.has_ranked_matches && <img src={`/assets/ranks/compact/${rank.tier}.png`} alt="" />}<strong>{Number(stats.elo || 0).toLocaleString("en-US")}</strong></div>
      <small>{stats.has_ranked_matches ? rank.name : "Unranked"}</small>
    </div>
    <div className="stream-player-stat"><span className="stream-player-label"><Swords size={14} />Record</span><strong className="stream-player-record"><span>{stats.wins}W</span><span> / </span><span>{stats.losses}L</span></strong><small>Wins / losses</small></div>
    <div className="stream-player-stat"><span className="stream-player-label"><Target size={14} />Win rate</span><strong>{stats.win_rate}<span className="stream-player-percent">%</span></strong><small>Overall record</small></div>
    <div className="stream-player-stat stream-player-earnings"><span className="stream-player-label"><DollarSign size={14} />Earnings</span><strong>{money}</strong><small>Lifetime · USD</small></div>
    <div className="stream-player-trophies"><span className="stream-player-label">Trophy cabinet</span><div>{trophies.map(trophy => <div key={trophy.key} className="stream-player-trophy" data-tier={trophy.key}><img src={trophy.image} alt="" /><strong>{data.trophies[trophy.key] || 0}</strong><span>{trophy.label}</span></div>)}</div></div>
    {stale && <span className="stream-player-reconnecting">Reconnecting · last saved stats</span>}
  </div>;
}
