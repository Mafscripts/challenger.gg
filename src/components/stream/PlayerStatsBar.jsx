import { trophyAssets } from "@/lib/trophyAssets";

import React from "react";
import { DollarSign, Medal, Swords, Target, Zap } from "lucide-react";
import TopfraggLogo from "@/components/brand/TopfraggLogo";
import UserBadges from "@/components/ui/UserBadges";
import ChristmasOverlayDecorations, { ChristmasBrandMark, ChristmasPlayerScene } from "./ChristmasOverlayDecorations";
import SignalPlayerStatsBar from "./SignalPlayerStatsBar";
import CenterStagePlayerBar, { CENTER_STAGE_THEMES } from "./CenterStagePlayerBar";
import StudioPlayerStatsBar, { STUDIO_OVERLAY_THEMES } from "./StudioPlayerStatsBar";

import { getRankForElo } from "@/lib/ranks";
import "@/styles/player-overlay.css";

import { normalizePlayerOverlayTheme } from "@/lib/playerOverlayConfig";
export { PLAYER_OVERLAY_WIDTH, PLAYER_OVERLAY_HEIGHT, PLAYER_OVERLAY_THEMES, normalizePlayerOverlayTheme, playerOverlayUrl } from "@/lib/playerOverlayConfig";

const brandLetters = [..."TOPFRAGG.GG"].map((letter, index) => ({
  letter,
  tone: index < 3 ? "white" : index < 8 ? "cyan" : "domain",
  motion: {
    "--brand-enter-x": `${-100 + index * 6}px`,
    "--brand-enter-y": `${-20 - (index % 3) * 8}px`,
    "--brand-enter-turn": `${-18 + index * 2}deg`,
    "--brand-fall-x": `${(index - 5) * 9}px`,
    "--brand-fall-y": `${35 + (index % 4) * 8}px`,
    "--brand-fall-turn": `${(index % 2 ? 1 : -1) * (18 + index * 4)}deg`,
  },
}));
const trophies = [
  { key: "gold", label: "Gold", image: trophyAssets.gold },
  { key: "silver", label: "Silver", image: trophyAssets.silver },
  { key: "bronze", label: "Bronze", image: trophyAssets.bronze },
  { key: "premium", label: "Premium", image: trophyAssets.premium },
];



export { usePlayerOverlay } from "@/hooks/usePlayerOverlay";

export default function PlayerStatsBar({ data, stale = false, theme = "blue" }) {
  const player = data.player;
  const stats = data.stats;
  const rank = getRankForElo(stats.elo);
  const effect = player.display_name_color;
  const money = Number(stats.earnings || 0).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const updatedAt = data.updated_at || "initial";
  const selectedTheme = normalizePlayerOverlayTheme(theme);
  const isChristmas = selectedTheme === "xmas";
  if (CENTER_STAGE_THEMES.some(option => option.key === selectedTheme)) return <CenterStagePlayerBar data={data} stale={stale} theme={selectedTheme} money={money} trophies={trophies} />;
  if (selectedTheme === "signal") return <SignalPlayerStatsBar data={data} stale={stale} rank={rank} money={money} trophies={trophies} />;
  if (STUDIO_OVERLAY_THEMES.some(option => option.key === selectedTheme)) return <StudioPlayerStatsBar data={data} stale={stale} theme={selectedTheme} rank={rank} money={money} trophies={trophies} />;
  const valueKey = (name, value) => `${name}-${isChristmas ? value : updatedAt}`;
  const logo = <TopfraggLogo showWordmark={false} markClassName="stream-brand-mark" />;
  return <div className="app-content stream-player-bar" data-theme={selectedTheme}>
    {isChristmas && <ChristmasOverlayDecorations />}
    <div className="stream-player-brand">
      {isChristmas ? <ChristmasBrandMark>{logo}</ChristmasBrandMark> : logo}
      <div><strong className="stream-brand-wordmark" aria-label="Topfragg.gg">{brandLetters.map(({ letter, tone, motion }, index) => <span key={index} className="stream-brand-letter" data-tone={tone} style={motion} aria-hidden="true">{letter}</span>)}</strong><span className="stream-brand-caption"><i aria-hidden="true" />{isChristmas ? "Merry Fragmas" : "Live player"}</span></div>
    </div>
    <div className="stream-player-identity">
      {isChristmas && <ChristmasPlayerScene />}
      <div className="stream-player-identity-copy">
        <span className="stream-player-handle">{player.username ? `@${player.username}` : "Topfragg player"}</span>
        <div className="stream-player-name-row"><h1 className={`stream-player-name player-name-wrap ${effect ? "player-name-color" : ""}`} data-name-effect={effect || undefined} style={effect ? { "--player-name-color": effect } : undefined}>{player.display_name}</h1><UserBadges user={player} size="xs" iconOnly showTooltip={false} showForceStream={false} showMonitorCam={false} /></div>
      </div>
    </div>
    <div className="stream-player-stat stream-player-rank">
      <span className="stream-player-label">Ranked ELO</span>
      <div>{stats.has_ranked_matches && <img src={`/assets/ranks/compact/${rank.tier}.png`} alt="" />}<strong key={valueKey("ranked", stats.elo)}>{Number(stats.elo || 0).toLocaleString("en-US")}</strong></div>
      <small>{stats.has_ranked_matches ? rank.name : "Unranked"}</small>
    </div>
    <div className="stream-player-stat stream-player-free-elo"><span className="stream-player-label"><Zap size={14} />8s ELO</span><strong key={valueKey("free-elo", stats.free_eights_elo)}>{Number(stats.free_eights_elo || 0).toLocaleString("en-US")}</strong><small>Black Ops 7</small></div>
    <div className="stream-player-stat stream-player-free-sr" data-sr={stats.free_eights_sr_key || "newb"}><span className="stream-player-label"><Medal size={14} />8s SR</span><strong key={valueKey("free-sr", stats.free_eights_sr)}>{stats.free_eights_sr || "Newb"}</strong><small>{stats.free_eights_sr_source === "screenshot" ? "Verified game rank" : "Free 8s skill rank"}</small></div>
    <div className="stream-player-stat"><span className="stream-player-label"><Swords size={14} />Record</span><strong key={valueKey("record", `${stats.wins}-${stats.losses}`)} className="stream-player-record"><span>{stats.wins}W</span><span> / </span><span>{stats.losses}L</span></strong><small>Wins / losses</small></div>
    <div className="stream-player-stat"><span className="stream-player-label"><Target size={14} />Win rate</span><strong key={valueKey("win-rate", stats.win_rate)}>{stats.win_rate}<span className="stream-player-percent">%</span></strong><small>Overall record</small></div>
    <div className="stream-player-stat stream-player-earnings"><span className="stream-player-label"><DollarSign size={14} />Earnings</span><strong key={valueKey("earnings", money)}>{money}</strong><small>Lifetime · USD</small></div>
    <div className="stream-player-trophies"><span className="stream-player-label">Trophy cabinet</span><div>{trophies.map(trophy => <div key={trophy.key} className="stream-player-trophy" data-tier={trophy.key}><img src={trophy.image} alt="" /><strong key={valueKey(trophy.key, data.trophies[trophy.key] || 0)}>{data.trophies[trophy.key] || 0}</strong><span>{trophy.label}</span></div>)}</div></div>
    {stale && <span className="stream-player-reconnecting">Reconnecting · last saved stats</span>}
  </div>;
}
