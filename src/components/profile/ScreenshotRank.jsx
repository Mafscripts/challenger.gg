import React from "react";
import { Link } from "react-router-dom";
import { Settings } from "lucide-react";
import { gameRankEquivalents, screenshotRankFor } from "@/lib/screenshotRanks";
import { gameRankEmblems } from "@/components/competition/GameRankEmblem";

export function ScreenshotRankPill({ rank }) {
  const config = screenshotRankFor(rank);
  const Emblem = gameRankEmblems[rank];
  return config ? <span title={`${config.label} · Equivalent to ${config.gameLabel}`} className={`inline-flex items-center gap-2 rounded-lg border py-1 pl-1.5 pr-3 text-[10px] font-black uppercase tracking-wider ${config.style}`}><Emblem className="h-6 w-6" />{config.label}</span> : null;
}

export function GameRankSettingsLink() {
  return <div id="rank-screenshot" className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-card p-4 sm:p-5">
    <div><h2 className="text-sm font-black text-white">Game rank</h2><p className="mt-1 text-xs leading-5 text-vapor">{gameRankEquivalents}.</p><p className="mt-1 text-xs leading-5 text-vapor">Choose your equivalent rank in Settings. Legend requires admin approval.</p></div>
    <Link to="/settings#settings-rank" className="inline-flex items-center gap-2 rounded-xl border border-orange/25 bg-orange/10 px-4 py-2.5 text-xs font-black text-orange"><Settings className="h-4 w-4" />Manage game rank</Link>
  </div>;
}
