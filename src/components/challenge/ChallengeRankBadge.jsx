import React from "react";
import { ShieldCheck } from "lucide-react";
import { challengeRank } from "@/lib/challengeRanks";

export default function ChallengeRankBadge({ xp = 0, showXp = false }) {
  const rank = challengeRank(xp);
  return <span className="inline-flex flex-wrap items-center gap-2">
    <span className="inline-flex h-[26px] shrink-0 items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.025] px-2 text-[9px] font-bold uppercase tracking-[0.06em]" style={{ color: rank.color }} title={`${rank.name} · ${xp.toLocaleString()} Challenge XP`}><ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />{rank.name}</span>
    {showXp && <span className="font-mono text-[11px] font-bold text-vapor">{xp.toLocaleString()} XP</span>}
  </span>;
}
