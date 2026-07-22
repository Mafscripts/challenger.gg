import React from "react";
import { Check, X, Target, Zap, Shield } from "lucide-react";
import { getMapPool } from "@/lib/cdlMaps";

export default function MapVetoVertical({ wager, ranked = false, compact = false }) {
  const maps = getMapPool(wager?.game_mode) || getMapPool("snd");
  const hostBannedMap = wager?.host_banned_map_name;
  const challengerBannedMap = wager?.challenger_banned_map_name;
  const finalMap = wager?.final_map_name;

  const Icon = wager?.game_mode === "snd" ? Target : wager?.game_mode === "hp" ? Shield : Zap;

  if (ranked) {
    if (compact) {
      return (
        <div className="glass flex flex-col gap-3 rounded-xl border border-cyan/20 px-4 py-3 sm:flex-row sm:items-center">
          <div className="flex shrink-0 items-center gap-2">
            <Icon className="h-4 w-4 text-cyan" />
            <span className="text-[10px] font-black uppercase tracking-wider text-cyan">Ranked Map</span>
            <span className="rounded-full border border-cyan/20 bg-cyan/10 px-2 py-0.5 text-[8px] font-black uppercase text-cyan">BO1</span>
          </div>
          <div className="hidden h-5 w-px bg-white/10 sm:block" />
          {finalMap ? <div className="flex flex-1 items-center justify-between gap-3"><span className="font-black text-green">{finalMap}</span><span className="text-[9px] font-black uppercase tracking-wider text-green">Randomly selected · Play map</span></div> : <span className="text-xs font-bold text-vapor">Map will be revealed when both rosters are full</span>}
        </div>
      );
    }
    return (
      <div className="glass rounded-xl border border-cyan/20 p-6">
        <div className="mb-6 flex items-center gap-2">
          <Icon className="h-5 w-5 text-cyan" />
          <h3 className="text-sm font-bold">RANKED MAP</h3>
          <span className="ml-auto rounded-full border border-cyan/20 bg-cyan/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-cyan">BO1</span>
        </div>
        {finalMap ? (
          <div className="flex items-center justify-between rounded-xl border border-green/20 bg-green/5 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full border border-green/30 bg-green/15">
                <Check className="h-4 w-4 text-green" />
              </div>
              <div>
                <p className="text-[9px] font-black uppercase tracking-wider text-vapor">Randomly selected</p>
                <p className="text-lg font-black text-green">{finalMap}</p>
              </div>
            </div>
            <span className="text-[10px] font-black uppercase tracking-wider text-green">Play map</span>
          </div>
        ) : (
          <p className="rounded-xl border border-white/5 bg-background/30 p-5 text-center text-sm text-vapor">Selecting map...</p>
        )}
      </div>
    );
  }

  return (
    <div className="glass rounded-xl border border-white/5 p-6">
      <div className="flex items-center gap-2 mb-6">
        <Icon className="w-5 h-5 text-cyan" />
        <h3 className="font-bold text-sm">CDL 2026 MAP VETO</h3>
      </div>

      <div className="space-y-3">
        {maps.map((map) => {
          const isHostBanned = map.name === hostBannedMap;
          const isChallengerBanned = map.name === challengerBannedMap;
          const isFinal = map.name === finalMap;
          
          let status = "";
          if (isFinal) status = "SELECTED";
          else if (isHostBanned) status = "VETOED BY ALPHA";
          else if (isChallengerBanned) status = "VETOED BY BRAVO";
          else return null;

          return (
            <div key={map.id} className="flex items-center justify-between py-3 border-b border-white/5 last:border-0">
              <div className="flex items-center gap-3">
                {isFinal ? (
                  <div className="w-6 h-6 rounded-full bg-green/20 border border-green/30 flex items-center justify-center">
                    <Check className="w-4 h-4 text-green" />
                  </div>
                ) : isHostBanned || isChallengerBanned ? (
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                    isHostBanned ? 'bg-cyan/20 border border-cyan/30' : 'bg-orange/20 border border-orange/30'
                  }`}>
                    <X className={`w-4 h-4 ${isHostBanned ? 'text-cyan' : 'text-orange'}`} />
                  </div>
                ) : null}
                <span className={`text-sm font-bold ${
                  isFinal ? "text-green" :
                  isHostBanned ? "text-cyan" :
                  isChallengerBanned ? "text-orange" :
                  "text-vapor"
                }`}>
                  {map.name}
                </span>
              </div>
              <span className="text-[10px] text-vapor uppercase tracking-wider">{status}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
