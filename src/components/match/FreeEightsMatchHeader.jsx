import React from "react";
import { Shield, Trophy } from "lucide-react";

export default function FreeEightsMatchHeader({ match, actions }) {
  return (
    <div className="relative overflow-hidden bg-[#0b1016]">
      <img src="/assets/competition/free-eights-elo-header.webp" alt="Free 8s ELO" width={2172} height={724} className="block h-auto w-full" />
      <div className="flex flex-col gap-4 border-t border-white/[0.08] bg-[#0d131a]/95 p-4 sm:p-5 lg:absolute lg:inset-x-0 lg:bottom-0 lg:flex-row lg:items-center lg:justify-between lg:gap-5 lg:py-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[8px] font-black uppercase tracking-[0.2em] text-cyan"><Shield className="h-3 w-3 shrink-0" aria-hidden="true" />Free 8s match room</p>
          <h1 className="mt-1 text-xl font-black leading-tight text-white sm:text-2xl">Team Alpha <span className="text-vapor">vs</span> Team Bravo</h1>
          <p className="mt-1 text-[10px] leading-4 text-vapor">{match.game_mode_display || match.game_mode} · BO{match.best_of || 3} · Match #{String(match.id).slice(-8).toUpperCase()}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 lg:justify-end">
          {actions}
          <div className="rounded-lg border border-yellow-300/20 bg-yellow-300/[0.06] px-3 py-2 text-center">
            <p className="flex items-center justify-center gap-1.5 text-[8px] font-black uppercase tracking-[0.14em] text-yellow-300"><Trophy className="h-3 w-3" aria-hidden="true" />Monthly ladder prize</p>
            <p className="mt-1 font-mono text-xl font-black text-yellow-300">$100</p>
          </div>
        </div>
      </div>
    </div>
  );
}
