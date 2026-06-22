import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Swords, Target, Zap, Users, Check, ChevronRight, DollarSign } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/use-toast";

const gameModes = [
  { id: "snd", name: "Search & Destroy", icon: Target, description: "Best of 11 rounds" },
  { id: "overload", name: "Overload", icon: Zap, description: "Capture and hold zones" },
  { id: "hp", name: "Hardpoint", icon: Swords, description: "First to 250 score" },
];

const teamSizes = [
  { id: "1v1", name: "1v1", players: 2 },
  { id: "2v2", name: "2v2", players: 4 },
  { id: "3v3", name: "3v3", players: 6 },
  { id: "4v4", name: "4v4", players: 8 },
];

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

export default function CreateLobbyModal({ isOpen, onClose, onCreate, user, mode = "wager" }) {
  const [selectedGameMode, setSelectedGameMode] = useState(null);
  const [selectedTeamSize, setSelectedTeamSize] = useState(null);
  const [selectedAmount, setSelectedAmount] = useState(0);
  const [customAmount, setCustomAmount] = useState("");
  const [bestOf, setBestOf] = useState(1);
  const [hostBannedMap, setHostBannedMap] = useState(null);
  const [step, setStep] = useState(1);
  const [isCreating, setIsCreating] = useState(false);

  const isWager = mode === "wager";

  const handleCreate = async () => {
    if (selectedGameMode && selectedTeamSize && user) {
      setIsCreating(true);
      try {
        const gameModeObj = gameModes.find(gm => gm.id === selectedGameMode);
        const teamSizeObj = teamSizes.find(ts => ts.id === selectedTeamSize);
        
        const matchType = mode === 'ranked' ? 'ranked' : mode === 'xp' ? 'xp' : mode === '8s' ? '8s' : 'wagers';
        
        if (isWager) {
          const mapPool = mapsByMode[selectedGameMode] || [];
          const remainingMaps = mapPool.filter(m => m.id !== hostBannedMap);
          const autoSelectedMap = remainingMaps[Math.floor(Math.random() * remainingMaps.length)];
          
          const response = await base44.functions.invoke('createWager', {
            game_mode: selectedGameMode,
            game_mode_display: gameModeObj.name,
            team_size: selectedTeamSize,
            amount: parseFloat(customAmount) || 0,
            max_players: teamSizeObj.players,
            best_of: bestOf,
            host_banned_map: hostBannedMap,
            host_banned_map_name: mapPool.find(m => m.id === hostBannedMap)?.name || "",
            final_map: autoSelectedMap?.id,
            final_map_name: autoSelectedMap?.name,
            match_type: matchType,
          });
          
          if (response.data.error) {
            toast({
              title: "Failed to create wager",
              description: response.data.error === 'Insufficient wallet balance' ? "You don't have enough wallet balance" : response.data.error,
              variant: "destructive"
            });
            setIsCreating(false);
            return;
          }
          
          toast({
            title: "Wager created!",
            description: `Created ${selectedTeamSize} ${gameModeObj.name} for $${customAmount}`,
          });
        } else if (mode === "ranked") {
          const mapPool = mapsByMode[selectedGameMode] || [];
          const randomMap = mapPool[Math.floor(Math.random() * mapPool.length)];

          const response = await base44.functions.invoke('createRankedMatch', {
            game_mode: selectedGameMode,
            game_mode_display: gameModeObj.name,
            team_size: selectedTeamSize,
            max_players: teamSizeObj.players,
            best_of: 1,
            final_map: randomMap?.id,
            final_map_name: randomMap?.name,
          });

          if (response.data.error) {
            toast({
              title: "Failed to create ranked match",
              description: response.data.error,
              variant: "destructive"
            });
            setIsCreating(false);
            return;
          }
          
          toast({
            title: "Ranked match created!",
            description: `Created ${selectedTeamSize} ${gameModeObj.name}`,
          });

          onCreate({
            gameMode: selectedGameMode,
            teamSize: selectedTeamSize,
            amount: 0,
            ranked_match_id: response.data.ranked_match_id,
            match: response.data.match,
          });
          setStep(1);
          setSelectedGameMode(null);
          setSelectedTeamSize(null);
          setSelectedAmount(0);
          setCustomAmount("");
          setIsCreating(false);
          onClose();
          return;
        } else {
          const mapPool = mapsByMode[selectedGameMode] || [];
          const randomMap = mapPool[Math.floor(Math.random() * mapPool.length)];

          const response = await base44.functions.invoke('createWager', {
            game_mode: selectedGameMode,
            game_mode_display: gameModeObj.name,
            team_size: selectedTeamSize,
            amount: 0,
            max_players: teamSizeObj.players,
            best_of: 1,
            host_banned_map: null,
            host_banned_map_name: "",
            final_map: randomMap?.id,
            final_map_name: randomMap?.name,
            match_type: matchType,
          });

          if (response.data.error) {
            toast({
              title: "Failed to create lobby",
              description: response.data.error,
              variant: "destructive"
            });
            setIsCreating(false);
            return;
          }

          toast({
            title: "Lobby created!",
            description: `Created ${selectedTeamSize} ${gameModeObj.name}`,
          });
        }
        
        onCreate({ gameMode: selectedGameMode, teamSize: selectedTeamSize, amount: isWager ? parseFloat(customAmount) : 0 });
        setStep(1);
        setSelectedGameMode(null);
        setSelectedTeamSize(null);
        setSelectedAmount(0);
        setCustomAmount("");
        setIsCreating(false);
        onClose();
      } catch (error) {
        console.error("Failed to create lobby:", error);
        toast({
          title: "Error",
          description: "Failed to create lobby. Please try again.",
          variant: "destructive"
        });
        setIsCreating(false);
      }
    }
  };

  const handleClose = () => {
    setStep(1);
    setSelectedGameMode(null);
    setSelectedTeamSize(null);
    setSelectedAmount(0);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        onClick={handleClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
          className="glass rounded-2xl border border-white/10 w-full max-w-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-black">Create Lobby</h2>
              <p className="text-xs text-vapor mt-0.5">Configure your match settings</p>
            </div>
            <button onClick={handleClose} className="p-2 hover:bg-white/5 rounded-lg transition-colors">
              <X className="w-5 h-5 text-vapor" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6">
            {/* Step 1: Game Mode */}
            {step === 1 && (
              <div>
                <h3 className="text-sm font-bold mb-4 flex items-center gap-2">
                  <span className="w-6 h-6 rounded bg-cyan/10 text-cyan flex items-center justify-center text-xs font-mono">1</span>
                  Select Game Mode
                </h3>
                <div className="grid sm:grid-cols-3 gap-4">
                  {gameModes.map((mode) => {
                    const Icon = mode.icon;
                    const isSelected = selectedGameMode === mode.id;
                    return (
                      <motion.button
                        key={mode.id}
                        whileHover={{ y: -4 }}
                        onClick={() => setSelectedGameMode(mode.id)}
                        className={`p-4 rounded-xl border text-left transition-all ${
                          isSelected
                            ? "bg-cyan/10 border-cyan/30 ring-2 ring-cyan/20"
                            : "bg-secondary border-white/5 hover:border-white/10"
                        }`}
                      >
                        <div className={`w-10 h-10 rounded-lg mb-3 flex items-center justify-center ${
                          isSelected ? "bg-cyan/20" : "bg-secondary"
                        }`}>
                          <Icon className={`w-5 h-5 ${isSelected ? "text-cyan" : "text-vapor"}`} />
                        </div>
                        <p className={`font-semibold text-sm mb-1 ${isSelected ? "text-cyan" : ""}`}>{mode.name}</p>
                        <p className="text-xs text-vapor">{mode.description}</p>
                        {isSelected && (
                          <div className="absolute top-3 right-3">
                            <Check className="w-4 h-4 text-cyan" />
                          </div>
                        )}
                      </motion.button>
                    );
                  })}
                </div>
                <div className="mt-6 flex justify-end">
                  <button
                    onClick={() => setStep(2)}
                    disabled={!selectedGameMode}
                    className="px-6 py-2.5 bg-cyan text-background font-bold text-xs rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg hover:shadow-cyan/25 transition-all uppercase tracking-wider flex items-center gap-2"
                  >
                    Next <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Step 2: Team Size */}
            {step === 2 && (
              <div>
                <h3 className="text-sm font-bold mb-4 flex items-center gap-2">
                  <span className="w-6 h-6 rounded bg-cyan/10 text-cyan flex items-center justify-center text-xs font-mono">2</span>
                  Select Team Size
                </h3>
                <div className="grid sm:grid-cols-2 gap-4">
                  {teamSizes.map((size) => {
                    const isSelected = selectedTeamSize === size.id;
                    return (
                      <motion.button
                        key={size.id}
                        whileHover={{ y: -4 }}
                        onClick={() => setSelectedTeamSize(size.id)}
                        className={`p-5 rounded-xl border text-left transition-all ${
                          isSelected
                            ? "bg-cyan/10 border-cyan/30 ring-2 ring-cyan/20"
                            : "bg-secondary border-white/5 hover:border-white/10"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                            isSelected ? "bg-cyan/20" : "bg-secondary"
                          }`}>
                            <Users className={`w-6 h-6 ${isSelected ? "text-cyan" : "text-vapor"}`} />
                          </div>
                          <div>
                            <p className={`font-bold text-lg ${isSelected ? "text-cyan" : ""}`}>{size.name}</p>
                            <p className="text-xs text-vapor">{size.players} players total</p>
                          </div>
                        </div>
                        {isSelected && (
                          <div className="absolute top-3 right-3">
                            <Check className="w-4 h-4 text-cyan" />
                          </div>
                        )}
                      </motion.button>
                    );
                  })}
                </div>
                <div className="mt-6 flex justify-between">
                  <button
                    onClick={() => setStep(1)}
                    className="px-6 py-2.5 bg-secondary text-vapor font-bold text-xs rounded-lg hover:bg-white/10 transition-all uppercase tracking-wider"
                  >
                    Back
                  </button>
                  <button
                    onClick={() => setStep(3)}
                    disabled={!selectedTeamSize}
                    className="px-6 py-2.5 bg-cyan text-background font-bold text-xs rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg hover:shadow-cyan/25 transition-all uppercase tracking-wider flex items-center gap-2"
                  >
                    Next <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: Best Of Selection (Wagers only) */}
            {step === 3 && isWager && (
              <div>
                <h3 className="text-sm font-bold mb-4 flex items-center gap-2">
                  <span className="w-6 h-6 rounded bg-cyan/10 text-cyan flex items-center justify-center text-xs font-mono">3</span>
                  Select Series Format
                </h3>
                <div className="grid grid-cols-3 gap-4 mb-6">
                  {[1, 3, 5].map(bo => (
                    <motion.button
                      key={bo}
                      whileHover={{ y: -4 }}
                      onClick={() => setBestOf(bo)}
                      className={`p-4 rounded-xl border text-center transition-all ${
                        bestOf === bo
                          ? "bg-cyan/10 border-cyan/30 ring-2 ring-cyan/20"
                          : "bg-secondary border-white/5 hover:border-white/10"
                      }`}
                    >
                      <p className={`font-bold text-lg ${bestOf === bo ? "text-cyan" : ""}`}>BO{bo}</p>
                      <p className="text-xs text-vapor">{bo === 1 ? "Single Map" : `First to ${Math.ceil(bo/2)}`}</p>
                      {bestOf === bo && (
                        <div className="absolute top-3 right-3">
                          <Check className="w-4 h-4 text-cyan" />
                        </div>
                      )}
                    </motion.button>
                  ))}
                </div>
                <div className="flex justify-between">
                  <button
                    onClick={() => setStep(2)}
                    className="px-6 py-2.5 bg-secondary text-vapor font-bold text-xs rounded-lg hover:bg-white/10 transition-all uppercase tracking-wider"
                  >
                    Back
                  </button>
                  <button
                    onClick={() => setStep(4)}
                    className="px-6 py-2.5 bg-cyan text-background font-bold text-xs rounded-lg hover:shadow-lg hover:shadow-cyan/25 transition-all uppercase tracking-wider flex items-center gap-2"
                  >
                    Next <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Step 4: Wager Amount (Wagers only) */}
            {step === 4 && isWager && (
              <div>
                <h3 className="text-sm font-bold mb-4 flex items-center gap-2">
                  <span className="w-6 h-6 rounded bg-cyan/10 text-cyan flex items-center justify-center text-xs font-mono">4</span>
                  Enter Wager Amount
                </h3>
                <div className="mb-4">
                  <label className="text-xs text-vapor mb-2 block">Your Wallet: ${user?.wallet_balance || 0}</label>
                  <div className="relative">
                    <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-vapor" />
                    <input
                      type="number"
                      value={customAmount}
                      onChange={(e) => setCustomAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full pl-12 pr-4 py-3 bg-secondary border border-white/10 rounded-lg text-foreground font-mono font-bold focus:outline-none focus:border-green/50"
                      min="0"
                      step="0.01"
                    />
                  </div>
                  {parseFloat(customAmount) > (user?.wallet_balance || 0) && (
                    <p className="text-red-400 text-xs mt-2">Insufficient wallet balance</p>
                  )}
                </div>
                <div className="mt-6 flex justify-between">
                  <button
                    onClick={() => setStep(3)}
                    className="px-6 py-2.5 bg-secondary text-vapor font-bold text-xs rounded-lg hover:bg-white/10 transition-all uppercase tracking-wider"
                  >
                    Back
                  </button>
                  <button
                    onClick={() => setStep(5)}
                    disabled={!customAmount || parseFloat(customAmount) <= 0 || parseFloat(customAmount) > (user?.wallet_balance || 0)}
                    className="px-6 py-2.5 bg-cyan text-background font-bold text-xs rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg hover:shadow-cyan/25 transition-all uppercase tracking-wider flex items-center gap-2"
                  >
                    Next <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Step 5: Map Ban (Wagers only - Host bans 1 map) */}
            {step === 5 && isWager && (
              <div>
                <h3 className="text-sm font-bold mb-2 flex items-center gap-2">
                  <span className="w-6 h-6 rounded bg-cyan/10 text-cyan flex items-center justify-center text-xs font-mono">5</span>
                  Ban One Map
                </h3>
                <p className="text-xs text-vapor mb-4">As the host, you'll ban one map. The challenger will ban another when accepting.</p>
                <div className="grid grid-cols-2 gap-3 mb-6">
                  {(mapsByMode[selectedGameMode] || []).map((map) => {
                    const isSelected = hostBannedMap === map.id;
                    return (
                      <motion.button
                        key={map.id}
                        whileHover={{ y: -2 }}
                        onClick={() => setHostBannedMap(map.id)}
                        className={`p-3 rounded-lg border text-left transition-all ${
                          isSelected
                            ? "bg-red-500/10 border-red-500/30 ring-2 ring-red-500/20"
                            : "bg-secondary border-white/5 hover:border-white/10"
                        }`}
                      >
                        <p className={`font-semibold text-sm ${isSelected ? "text-red-400" : ""}`}>{map.name}</p>
                        {isSelected && (
                          <div className="absolute top-2 right-2">
                            <X className="w-4 h-4 text-red-400" />
                          </div>
                        )}
                      </motion.button>
                    );
                  })}
                </div>
                <div className="flex justify-between">
                  <button
                    onClick={() => setStep(4)}
                    className="px-6 py-2.5 bg-secondary text-vapor font-bold text-xs rounded-lg hover:bg-white/10 transition-all uppercase tracking-wider"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleCreate}
                    disabled={!hostBannedMap || isCreating}
                    className="px-6 py-2.5 bg-green text-background font-bold text-xs rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg hover:shadow-green/25 transition-all uppercase tracking-wider flex items-center gap-2"
                  >
                    <Swords className="w-4 h-4" /> {isCreating ? "Creating..." : "Create Wager"}
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: Create Lobby (Free modes) */}
            {step === 3 && !isWager && (
              <div>
                <h3 className="text-sm font-bold mb-4">Review & Create</h3>
                <div className="glass rounded-xl border border-white/5 p-4 mb-6">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-lg bg-cyan/10 flex items-center justify-center">
                      {gameModes.find(gm => gm.id === selectedGameMode)?.icon && 
                        React.createElement(gameModes.find(gm => gm.id === selectedGameMode).icon, { className: "w-5 h-5 text-cyan" })
                      }
                    </div>
                    <div>
                      <p className="font-bold text-sm">{gameModes.find(gm => gm.id === selectedGameMode)?.name}</p>
                      <p className="text-xs text-vapor">{teamSizes.find(ts => ts.id === selectedTeamSize)?.name}</p>
                    </div>
                  </div>
                  <p className="text-xs text-green font-bold">FREE TO PLAY</p>
                </div>
                <div className="flex justify-between">
                  <button
                    onClick={() => setStep(2)}
                    className="px-6 py-2.5 bg-secondary text-vapor font-bold text-xs rounded-lg hover:bg-white/10 transition-all uppercase tracking-wider"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleCreate}
                    disabled={isCreating}
                    className="px-6 py-2.5 bg-cyan text-background font-bold text-xs rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg hover:shadow-cyan/25 transition-all uppercase tracking-wider flex items-center gap-2"
                  >
                    <Swords className="w-4 h-4" /> {isCreating ? "Creating..." : "Create Lobby"}
                  </button>
                </div>
              </div>
            )}

          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
