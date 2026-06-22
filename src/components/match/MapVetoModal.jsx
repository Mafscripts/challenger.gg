import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Check, Shield, Target, Zap } from "lucide-react";
import { base44 } from "@/api/base44Client";

const mapsByMode = {
  snd: [
    { id: "raid", name: "Raid", img: "https://media.base44.com/images/public/6a38e7860fd3c41494b9c695/map_raid.png" },
    { id: "exposure", name: "Exposure", img: "https://media.base44.com/images/public/6a38e7860fd3c41494b9c695/map_exposure.png" },
    { id: "colossus", name: "Colossus", img: "https://media.base44.com/images/public/6a38e7860fd3c41494b9c695/map_colossus.png" },
    { id: "scar", name: "Scar", img: "https://media.base44.com/images/public/6a38e7860fd3c41494b9c695/map_scar.png" },
    { id: "den", name: "Den", img: "https://media.base44.com/images/public/6a38e7860fd3c41494b9c695/map_den.png" },
    { id: "outpost", name: "Outpost", img: "https://media.base44.com/images/public/6a38e7860fd3c41494b9c695/map_outpost.png" },
    { id: "skyline", name: "Skyline", img: "https://media.base44.com/images/public/6a38e7860fd3c41494b9c695/map_skyline.png" },
  ],
  overload: [
    { id: "grid", name: "Grid", img: "https://media.base44.com/images/public/6a38e7860fd3c41494b9c695/map_grid.png" },
    { id: "nexus", name: "Nexus", img: "https://media.base44.com/images/public/6a38e7860fd3c41494b9c695/map_nexus.png" },
    { id: "circuit", name: "Circuit", img: "https://media.base44.com/images/public/6a38e7860fd3c41494b9c695/map_circuit.png" },
    { id: "terminal", name: "Terminal", img: "https://media.base44.com/images/public/6a38e7860fd3c41494b9c695/map_terminal.png" },
    { id: "vault", name: "Vault", img: "https://media.base44.com/images/public/6a38e7860fd3c41494b9c695/map_vault.png" },
  ],
  hp: [
    { id: "karst", name: "Karst", img: "https://media.base44.com/images/public/6a38e7860fd3c41494b9c695/map_karst.png" },
    { id: "incline", name: "Incline", img: "https://media.base44.com/images/public/6a38e7860fd3c41494b9c695/map_incline.png" },
    { id: "quarry", name: "Quarry", img: "https://media.base44.com/images/public/6a38e7860fd3c41494b9c695/map_quarry.png" },
    { id: "ruins", name: "Ruins", img: "https://media.base44.com/images/public/6a38e7860fd3c41494b9c695/map_ruins.png" },
    { id: "fortress", name: "Fortress", img: "https://media.base44.com/images/public/6a38e7860fd3c41494b9c695/map_fortress.png" },
    { id: "summit", name: "Summit", img: "https://media.base44.com/images/public/6a38e7860fd3c41494b9c695/map_summit.png" },
  ],
};

export default function MapVetoModal({ isOpen, onClose, wager, user, onComplete }) {
  const [challengerBannedMap, setChallengerBannedMap] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const maps = mapsByMode[wager?.game_mode] || mapsByMode.snd;
  const hostBannedMap = wager?.host_banned_map_id || wager?.host_banned_map;
  const remainingMaps = maps.filter(m => !hostBannedMap || m.id !== hostBannedMap);

  const handleBan = async (mapId) => {
    if (isProcessing || mapId === hostBannedMap) return;
    
    setIsProcessing(true);
    setChallengerBannedMap(mapId);
    
    // Auto-pick the final map from remaining
    const finalMap = remainingMaps.find(m => m.id !== mapId);
    setTimeout(() => {
      onComplete({ 
        challenger_banned_map: mapId,
        challenger_banned_map_name: maps.find(m => m.id === mapId)?.name || "",
        final_map: finalMap?.id,
        final_map_name: finalMap?.name || ""
      });
      setIsProcessing(false);
    }, 500);
  };

  const handleClose = () => {
    setChallengerBannedMap(null);
    setIsProcessing(false);
    onClose();
  };

  if (!isOpen || !wager) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        onClick={handleClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
          className="glass rounded-2xl border border-white/10 w-full max-w-4xl overflow-hidden"
        >
          {/* Header */}
          <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-black">Map Veto</h2>
              <p className="text-xs text-vapor mt-0.5">
                {wager.team_size} {wager.game_mode_display} · Best of {wager.best_of || 1}
              </p>
            </div>
            <button onClick={handleClose} className="p-2 hover:bg-white/5 rounded-lg transition-colors">
              <X className="w-5 h-5 text-vapor" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6">
            {/* Turn indicator */}
            <div className="mb-6 text-center">
              <div className="inline-flex items-center gap-3 px-6 py-3 rounded-xl bg-secondary border border-white/5">
                <Target className="w-5 h-5 text-cyan" />
                <span className="font-bold text-sm">
                  Ban one map to complete the veto
                </span>
              </div>
              {hostBannedMap && (
                <p className="text-xs text-vapor mt-3">
                  Host banned: <span className="text-red-400 font-semibold">{maps.find(m => m.id === hostBannedMap)?.name}</span>
                </p>
              )}
            </div>

            {/* Map grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {maps.map((map) => {
                const isHostBanned = map.id === hostBannedMap;
                const isChallengerBanned = map.id === challengerBannedMap;
                const isBanned = isHostBanned || isChallengerBanned;
                const isRemaining = !isBanned;
                const Icon = wager.game_mode === "snd" ? Target : wager.game_mode === "hp" ? Shield : Zap;

                return (
                  <motion.div
                    key={map.id}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: isBanned ? 0.4 : 1, scale: isBanned ? 0.95 : 1 }}
                    className={`relative rounded-xl border overflow-hidden transition-all ${
                      isHostBanned
                        ? "border-red-500/30 bg-red-500/5"
                        : isChallengerBanned
                        ? "border-cyan/30 bg-cyan/5"
                        : isRemaining
                        ? "border-white/10 bg-secondary hover:border-cyan/30 cursor-pointer"
                        : "border-white/5 opacity-50"
                    }`}
                    onClick={() => isRemaining && handleBan(map.id)}
                  >
                    <div className="aspect-video relative">
                      <img
                        src={map.img}
                        alt={map.name}
                        className={`w-full h-full object-cover ${isBanned ? "grayscale" : ""}`}
                      />
                      
                      {/* Banned overlay */}
                      {isHostBanned && (
                        <div className="absolute inset-0 bg-red-500/20 flex items-center justify-center">
                          <X className="w-12 h-12 text-red-400" />
                        </div>
                      )}
                      {isChallengerBanned && (
                        <div className="absolute inset-0 bg-cyan/20 flex items-center justify-center">
                          <Check className="w-12 h-12 text-cyan" />
                        </div>
                      )}

                      {/* Map icon */}
                      {!isBanned && (
                        <div className="absolute top-2 right-2 p-1.5 rounded bg-black/60">
                          <Icon className="w-4 h-4 text-cyan" />
                        </div>
                      )}
                    </div>

                    <div className="p-3">
                      <p className={`font-semibold text-sm ${isHostBanned ? "text-red-400 line-through" : isChallengerBanned ? "text-cyan" : ""}`}>
                        {map.name}
                      </p>
                    </div>
                  </motion.div>
                );
              })}
            </div>

            {/* Instructions */}
            <div className="mt-6 p-4 rounded-xl bg-secondary border border-white/5">
              <p className="text-xs text-vapor text-center">
                Take turns banning maps. The last remaining map will be automatically selected.
              </p>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
