import React from "react";
import { Link } from "react-router-dom";
import { Award, Settings } from "lucide-react";
import { screenshotRankFor } from "@/lib/screenshotRanks";

export function ScreenshotRankPill({ rank }) {
  const config = screenshotRankFor(rank);
  return config ? <span title="Game rank" className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-black ${config.style}`}><Award className="h-3.5 w-3.5" aria-hidden="true" />{config.label}</span> : null;
}

export function GameRankSettingsLink() {
  return <div id="rank-screenshot" className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-card p-4 sm:p-5">
    <div><h2 className="text-sm font-black text-white">Game rank</h2><p className="mt-1 text-xs leading-5 text-vapor">Choose Diamond, Crimson or Iridescent in Settings. Top 250 requires an admin request.</p></div>
    <Link to="/settings#settings-rank" className="inline-flex items-center gap-2 rounded-xl border border-orange/25 bg-orange/10 px-4 py-2.5 text-xs font-black text-orange"><Settings className="h-4 w-4" />Manage game rank</Link>
  </div>;
}
