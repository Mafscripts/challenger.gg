import React from "react";
import { Check, X, Target, Zap, Shield } from "lucide-react";
import { getMapPool } from "@/lib/cdlMaps";

export default function MapVetoVertical({ wager }) {
  const maps = getMapPool(wager?.game_mode) || getMapPool("snd");
  const hostBannedMap = wager?.host_banned_map_name;
  const challengerBannedMap = wager?.challenger_banned_map_name;
  const finalMap = wager?.final_map_name;

  const Icon = wager?.game_mode === "snd" ? Target : wager?.game_mode === "hp" ? Shield : Zap;

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