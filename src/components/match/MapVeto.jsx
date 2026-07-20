import React from "react";
import { motion } from "framer-motion";
import { X, Check, Target, Zap, Shield } from "lucide-react";

const mapsByMode = {
  snd: [
    { id: "raid", name: "Raid" },
    { id: "shoot_house", name: "Shoot House" },
    { id: "shoothouse", name: "Shoothouse" },
    { id: "vacant", name: "Vacant" },
    { id: "nuketown", name: "Nuketown" },
    { id: "hackney_yard", name: "Hackney Yard" },
    { id: "gun_runner", name: "Gun Runner" },
  ],
  overload: [
    { id: "gaza", name: "Gaza" },
    { id: "airstrip", name: "Airstrip" },
    { id: "tipperary", name: "Tipperary" },
    { id: "rivet", name: "Rivet" },
    { id: "khandor", name: "Khandor" },
  ],
  hp: [
    { id: "terminal", name: "Terminal" },
    { id: "rust", name: "Rust" },
    { id: "shipment", name: "Shipment" },
    { id: "crash", name: "Crash" },
    { id: "backlot", name: "Backlot" },
  ],
};

export default function MapVeto({ wager }) {
  const maps = mapsByMode[wager?.game_mode] || mapsByMode.snd;
  const hostBannedMap = wager.host_banned_map_id || wager.host_banned_map;
  const challengerBannedMap = wager.challenger_banned_map_id || wager.challenger_banned_map;
  const finalMap = wager.final_map_id || wager.final_map;

  const Icon = wager?.game_mode === "snd" ? Target : wager?.game_mode === "hp" ? Shield : Zap;

  return (
    <div className="glass rounded-xl border border-white/5 p-6">
      <div className="flex items-center gap-2 mb-6">
        <Icon className="w-5 h-5 text-cyan" />
        <h3 className="font-bold text-sm">Map Veto Results</h3>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* Host Ban */}
        <div className="relative rounded-xl border border-red-500/30 bg-red-500/5 overflow-hidden">
          <div className="absolute top-2 right-2 p-1.5 rounded bg-red-500/20">
            <X className="w-4 h-4 text-red-400" />
          </div>
          <div className="p-4 text-center">
            <p className="text-xs text-red-400 font-semibold mb-1 uppercase tracking-wider">Host Banned</p>
            <p className="text-lg font-bold text-red-400">
              {maps.find(m => m.id === hostBannedMap)?.name || "—"}
            </p>
            <p className="text-[10px] text-vapor mt-1">{wager.host_name}</p>
          </div>
        </div>

        {/* Challenger Ban */}
        <div className="relative rounded-xl border border-cyan/30 bg-cyan/5 overflow-hidden">
          <div className="absolute top-2 right-2 p-1.5 rounded bg-cyan/20">
            <X className="w-4 h-4 text-cyan" />
          </div>
          <div className="p-4 text-center">
            <p className="text-xs text-cyan font-semibold mb-1 uppercase tracking-wider">Challenger Banned</p>
            <p className="text-lg font-bold text-cyan">
              {maps.find(m => m.id === challengerBannedMap)?.name || "—"}
            </p>
            <p className="text-[10px] text-vapor mt-1">{wager.challenger_name}</p>
          </div>
        </div>

        {/* Final Map */}
        <div className="relative rounded-xl border border-green/30 bg-green/5 overflow-hidden">
          <div className="absolute top-2 right-2 p-1.5 rounded bg-green/20">
            <Check className="w-4 h-4 text-green" />
          </div>
          <div className="p-4 text-center">
            <p className="text-xs text-green font-semibold mb-1 uppercase tracking-wider">Selected</p>
            <p className="text-lg font-bold text-green">
              {maps.find(m => m.id === finalMap)?.name || "Map pending"}
            </p>
            <p className="text-[10px] text-vapor mt-1">Auto-selected</p>
          </div>
        </div>
      </div>

      {/* All Maps Overview */}
      <div className="mt-6 pt-6 border-t border-white/5">
        <p className="text-xs text-vapor mb-3 font-semibold uppercase tracking-wider">Map Pool</p>
        <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
          {maps.map((map) => {
            const isHostBanned = map.id === hostBannedMap;
            const isChallengerBanned = map.id === challengerBannedMap;
            const isFinal = map.id === finalMap;

            return (
              <motion.div
                key={map.id}
                whileHover={{ scale: 1.05, transition: { duration: 0.1, ease: "easeOut" } }}
                className={`p-2 rounded-lg border text-center transition-all ${
                  isHostBanned
                    ? "border-red-500/30 bg-red-500/10"
                    : isChallengerBanned
                    ? "border-cyan/30 bg-cyan/10"
                    : isFinal
                    ? "border-green/30 bg-green/10"
                    : "border-white/5 bg-secondary"
                }`}
              >
                <p className={`text-[10px] font-semibold truncate ${
                  isHostBanned ? "text-red-400 line-through" :
                  isChallengerBanned ? "text-cyan" :
                  isFinal ? "text-green" : "text-vapor"
                }`}>
                  {map.name}
                </p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
