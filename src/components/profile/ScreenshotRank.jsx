import React from "react";
import { Link } from "react-router-dom";
import { Settings } from "lucide-react";
import { gameRankEquivalents, screenshotRankFor } from "@/lib/screenshotRanks";
import { gameRankEmblems } from "@/components/competition/GameRankEmblem";

export function ScreenshotRankPill({ rank }) {
  const config = screenshotRankFor(rank);
  const Emblem = gameRankEmblems[rank];
  const toneClass = config?.style.split(" ").find((token) => token.startsWith("text-")) || "text-white";
  return config ? <span title={`${config.label} · Equivalent to ${config.gameLabel}`} className={`inline-flex h-[26px] shrink-0 items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.025] px-2 text-[9px] font-bold uppercase tracking-[0.06em] ${toneClass}`}><Emblem className="h-5 w-5" />{config.label}</span> : null;
}

export function GameRankSettingsLink() {
  return <div id="rank-screenshot" className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-card p-4 sm:p-5">
    <div><h2 className="text-sm font-black text-white">Game rank</h2><p className="mt-1 text-xs leading-5 text-vapor">{gameRankEquivalents}.</p><p className="mt-1 text-xs leading-5 text-vapor">Choose your equivalent rank in Settings. Legend requires admin approval.</p></div>
    <Link to="/settings#settings-rank" className="inline-flex items-center gap-2 rounded-xl border border-orange/25 bg-orange/10 px-4 py-2.5 text-xs font-black text-orange"><Settings className="h-4 w-4" />Manage game rank</Link>
  </div>;
}
