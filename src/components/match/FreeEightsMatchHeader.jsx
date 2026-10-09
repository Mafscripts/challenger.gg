import React from "react";
import { Shield, Trophy } from "lucide-react";
import { freeEightsMatchCode, freeEightsMatchFormat } from "@/lib/freeEightsRoomIdentity";
import FreeEightsGameName from "@/components/competition/FreeEightsGameName";
import { DEFAULT_EIGHTS_GAMES, eightsGameId } from "@/lib/freeEightsGames";

export default function FreeEightsMatchHeader({ match, actions }) {
  return (
    <div className="relative overflow-hidden bg-[#0b1016]">
      <img src="/assets/competition/free-eights-elo-header.webp" alt="Free 8s ELO" width={2172} height={724} className="block h-auto w-full" />
      <div className="flex flex-col gap-4 border-t border-white/[0.08] bg-[#0d131a]/95 p-4 sm:p-5 lg:absolute lg:inset-x-0 lg:bottom-0 lg:flex-row lg:items-center lg:justify-between lg:gap-5 lg:py-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[8px] font-black uppercase tracking-[0.2em] text-cyan"><Shield className="h-3 w-3 shrink-0" aria-hidden="true" /><FreeEightsGameName game={match.game_config || DEFAULT_EIGHTS_GAMES.find((game) => game.id === eightsGameId(match))} prefix="Free 8s " /> match room</p>
          <h1 className="mt-1 text-xl font-black leading-tight text-white sm:text-2xl">Team Alpha <span className="text-vapor">vs</span> Team Bravo</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <p className="text-[10px] leading-4 text-vapor">{freeEightsMatchFormat(match)}</p>
            <span className="inline-flex items-center gap-2 rounded-md border border-cyan/25 bg-cyan/[0.08] px-2 py-1">
              <span className="text-[8px] font-black uppercase tracking-wider text-vapor">Match ID</span>
              <span className="font-mono text-[11px] font-black tracking-wide text-cyan">#{freeEightsMatchCode(match.id)}</span>
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 lg:justify-end">
          {actions}
          {eightsGameId(match) === "bo7" && <div className="rounded-lg border border-yellow-300/20 bg-yellow-300/[0.06] px-3 py-2 text-center">
            <p className="flex items-center justify-center gap-1.5 text-[8px] font-black uppercase tracking-[0.14em] text-yellow-300"><Trophy className="h-3 w-3" aria-hidden="true" />Monthly ladder prize</p>
            <p className="mt-1 font-mono text-xl font-black text-yellow-300">$100</p>
          </div>}
        </div>
      </div>
    </div>
  );
}
