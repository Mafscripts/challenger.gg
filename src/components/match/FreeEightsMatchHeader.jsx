import React from "react";
import { Shield, Trophy } from "lucide-react";
import { freeEightsMatchCode, freeEightsMatchFormat } from "@/lib/freeEightsRoomIdentity";
import FreeEightsGameName from "@/components/competition/FreeEightsGameName";
import { DEFAULT_EIGHTS_GAMES, eightsGameId } from "@/lib/freeEightsGames";

export default function FreeEightsMatchHeader({ match, actions }) {
  return (
    <div className="free-eights-room-header relative overflow-hidden px-5 py-5 sm:px-6 sm:py-6">
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-orange/45 via-white/10 to-cyan/60" />
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between lg:gap-8">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[10px] font-bold uppercase tracking-[0.14em]">
            <span className="inline-flex items-center gap-1.5 text-cyan"><Shield className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />Free 8s</span>
            <span aria-hidden="true" className="h-3 w-px bg-white/15" />
            <span className="text-vapor"><FreeEightsGameName game={match.game_config || DEFAULT_EIGHTS_GAMES.find((game) => game.id === eightsGameId(match))} /></span>
            <span className="rounded-full border border-cyan/20 bg-cyan/[0.06] px-2 py-0.5 text-[9px] tracking-wider text-cyan">ELO</span>
          </div>
          <h1 className="mt-3 flex flex-wrap items-baseline gap-x-2.5 gap-y-1 text-2xl font-black leading-tight tracking-tight text-white sm:gap-x-3 sm:text-3xl">
            <span>Team Alpha</span><span className="text-sm font-medium tracking-normal text-vapor/65 sm:text-base">vs</span><span>Team Bravo</span>
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-vapor">
            <p>{freeEightsMatchFormat(match)}</p>
            <span aria-hidden="true" className="h-3 w-px bg-white/10" />
            <span className="inline-flex items-baseline gap-1.5">
              <span className="text-[10px]">Match ID</span>
              <span className="select-all font-mono text-[11px] font-bold tracking-wide text-white/80">#{freeEightsMatchCode(match.id)}</span>
            </span>
          </div>
        </div>
        <div className="flex min-w-0 flex-col items-start gap-3 border-t border-white/[0.07] pt-4 lg:items-end lg:border-0 lg:pt-0">
          <div className="free-eights-room-header-actions max-w-full">{actions}</div>
          {eightsGameId(match) === "bo7" && <div className="inline-flex max-w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-full border border-yellow-300/15 bg-yellow-300/[0.04] px-3 py-1.5">
            <p className="flex items-center gap-1.5 text-[10px] font-medium text-vapor"><Trophy className="h-3.5 w-3.5 text-yellow-300" aria-hidden="true" />Monthly ladder prize</p>
            <p className="font-mono text-sm font-black text-yellow-300">$100</p>
          </div>}
        </div>
      </div>
    </div>
  );
}
