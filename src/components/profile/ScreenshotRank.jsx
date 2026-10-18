import React from "react";
import { screenshotRankFor } from "@/lib/screenshotRanks";
import { gameRankEmblems } from "@/components/competition/GameRankEmblem";

export function ScreenshotRankPill({ rank }) {
  const config = screenshotRankFor(rank);
  const Emblem = gameRankEmblems[rank];
  const toneClass = config?.style.split(" ").find((token) => token.startsWith("text-")) || "text-white";
  return config ? <span title={`${config.label} · Equivalent to ${config.gameLabel}`} className={`inline-flex h-[26px] shrink-0 items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.025] px-2 text-[9px] font-bold uppercase tracking-[0.06em] ${toneClass}`}><Emblem className="h-5 w-5" />{config.label}</span> : null;
}
