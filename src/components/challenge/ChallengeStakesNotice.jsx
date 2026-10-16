import React from "react";
import { LockKeyhole } from "lucide-react";

export default function ChallengeStakesNotice() {
  return <section className="flex flex-wrap items-center gap-3 rounded-xl border border-orange/20 bg-orange/[0.04] p-4">
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-orange/20 bg-orange/10 text-orange"><LockKeyhole className="h-4 w-4" /></span>
    <div className="min-w-0 flex-1"><h2 className="text-xs font-black">Raise the stakes. Coming later.</h2><p className="mt-1 text-[11px] leading-5 text-vapor">Cash stakes are planned for Challenge a Team. For now, every challenge is free and played for XP.</p></div>
    <button type="button" disabled className="rounded-lg border border-white/10 px-3 py-2 text-[9px] font-bold uppercase tracking-wider text-vapor opacity-50">Cash stakes disabled</button>
  </section>;
}
