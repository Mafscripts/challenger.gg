import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { X, Swords, Target, Zap, Users, Check, ChevronRight, DollarSign, Gamepad2, Monitor, Keyboard } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/use-toast";
import ActivisionIdNotice from "@/components/competition/ActivisionIdNotice";
import { activisionIdRequiredMessage, hasActivisionId } from "@/lib/activision";
import { WAGER_PLAY_RULES } from "@/lib/wagerRules";

const gameModes = [
  { id: "snd", name: "Search & Destroy", icon: Target, description: "Best of 11 rounds", tone: "yellow" },
  { id: "overload", name: "Overload", icon: Zap, description: "Capture and hold zones", tone: "purple" },
  { id: "hp", name: "Hardpoint", icon: Swords, description: "First to 250 score", tone: "red" },
];

const eightsSeriesFormats = [
  { id: "cdl_bo3", name: "CDL BO3", gameMode: "hp", modes: ["hp", "snd", "hp"], icon: Swords, description: "Hardpoint · Search & Destroy · Hardpoint", tone: "cyan" },
  { id: "hp_bo3", name: "Hardpoint BO3", gameMode: "hp", modes: ["hp", "hp", "hp"], icon: Target, description: "Hardpoint · Hardpoint · Hardpoint", tone: "red" },
];

const teamSizes = [
  { id: "1v1", name: "1v1", players: 2, tone: "cyan" },
  { id: "2v2", name: "2v2", players: 4, tone: "green" },
  { id: "3v3", name: "3v3", players: 6, tone: "purple" },
  { id: "4v4", name: "4v4", players: 8, tone: "orange" },
];

const choiceTones = {
  yellow: { card: "hover:border-yellow-400/45 hover:bg-yellow-400/[0.07]", selected: "border-yellow-400/55 bg-yellow-400/10 ring-2 ring-yellow-400/15", icon: "bg-yellow-400/15 text-yellow-400", text: "text-yellow-400", hoverText: "group-hover:text-yellow-400" },
  red: { card: "hover:border-red-500/45 hover:bg-red-500/[0.07]", selected: "border-red-500/55 bg-red-500/10 ring-2 ring-red-500/15", icon: "bg-red-500/15 text-red-400", text: "text-red-400", hoverText: "group-hover:text-red-400" },
  purple: { card: "hover:border-purple-400/45 hover:bg-purple-400/[0.07]", selected: "border-purple-400/55 bg-purple-400/10 ring-2 ring-purple-400/15", icon: "bg-purple-400/15 text-purple-400", text: "text-purple-400", hoverText: "group-hover:text-purple-400" },
  cyan: { card: "hover:border-cyan/45 hover:bg-cyan/[0.07]", selected: "border-cyan/55 bg-cyan/10 ring-2 ring-cyan/15", icon: "bg-cyan/15 text-cyan", text: "text-cyan", hoverText: "group-hover:text-cyan" },
  green: { card: "hover:border-green/45 hover:bg-green/[0.07]", selected: "border-green/55 bg-green/10 ring-2 ring-green/15", icon: "bg-green/15 text-green", text: "text-green", hoverText: "group-hover:text-green" },
  orange: { card: "hover:border-orange/45 hover:bg-orange/[0.07]", selected: "border-orange/55 bg-orange/10 ring-2 ring-orange/15", icon: "bg-orange/15 text-orange", text: "text-orange", hoverText: "group-hover:text-orange" },
};

const wagerAmounts = [5, 10, 25, 50, 100];
const playRuleIcons = { controller_only: Gamepad2, mixed_pc_allowed: Keyboard, console_only: Monitor };
const rosterSize = (teamSize) => Number.parseInt(String(teamSize || "1v1").split("v")[0], 10) || 1;

function PlayRulePicker({ selectedPlayRule, onSelect, matchLabel }) {
  return (
    <div className="border-t border-white/5 pt-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold">Input & Platform Rule</p>
          <p className="mt-0.5 text-xs text-vapor">Players see this rule before accepting your {matchLabel}.</p>
        </div>
        <span className="rounded-md border border-orange/20 bg-orange/10 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-orange">Required</span>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        {WAGER_PLAY_RULES.map((rule) => {
          const Icon = playRuleIcons[rule.value];
          const selected = selectedPlayRule === rule.value;
          return (
            <button key={rule.value} type="button" onClick={() => onSelect(rule.value)} className={`rounded-xl border p-3 text-left transition-colors ${selected ? "border-green/35 bg-green/10" : "border-white/[0.07] bg-secondary/70 hover:border-white/15 hover:bg-white/[0.04]"}`}>
              <div className="flex items-start justify-between gap-2"><span className={`flex h-8 w-8 items-center justify-center rounded-lg ${selected ? "bg-green/15 text-green" : "bg-background/40 text-vapor"}`}><Icon className="h-4 w-4" /></span>{selected && <Check className="h-4 w-4 text-green" />}</div>
              <p className="mt-2 text-[8px] font-black uppercase tracking-[0.14em] text-vapor">Allowed input</p>
              <p className={`mt-0.5 text-xs font-black ${selected ? "text-green" : "text-foreground"}`}>{rule.inputLabel}</p>
              <p className={`mt-1 text-[10px] font-bold ${rule.pcAllowed ? "text-cyan" : "text-orange"}`}>PC players {rule.pcAllowed ? "allowed" : "not allowed"}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

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
  const [userTeams, setUserTeams] = useState([]);
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [paymentMode, setPaymentMode] = useState("own");
  const [selectedPlayRule, setSelectedPlayRule] = useState("controller_only");
  const [step, setStep] = useState(1);
  const [isCreating, setIsCreating] = useState(false);

  const isWager = mode === "wager";
  const isRanked = mode === "ranked" || mode === "xp";
  const isEights = mode === "eights";
  const modeChoices = isEights ? eightsSeriesFormats : gameModes;
  const walletBalance = Number(user?.wallet?.available_balance ?? user?.wallet_balance ?? 0);
  const enteredAmount = Number(customAmount || selectedAmount || 0);
  const requiredPlayers = rosterSize(selectedTeamSize);
  const requiresTeam = isWager;
  const supportsRankedParty = isRanked && requiredPlayers > 1;
  const expectedTeamType = isWager ? "wager" : "ranked";
  const compatibleTeams = useMemo(() => (
    userTeams.filter((team) => {
      const teamType = team.team_type || "general";
      const rosterLimit = Number(team.roster_size || team.members.length || 1);
      if (teamType !== expectedTeamType || team.captain_id !== user?.id) return false;
      if (isRanked) return rosterLimit >= 2 && rosterLimit <= requiredPlayers && team.members.length === rosterLimit;
      return true;
    })
  ), [expectedTeamType, isRanked, requiredPlayers, user?.id, userTeams]);
  const selectedTeam = compatibleTeams.find((team) => team.id === selectedTeamId);
  const selectedTeamIsEligible = requiresTeam
    ? Boolean(selectedTeam && selectedTeam.members.length >= requiredPlayers)
    : !selectedTeamId || Boolean(selectedTeam);
  const paymentTotal = isWager && requiresTeam && paymentMode === "full_team"
    ? enteredAmount * requiredPlayers
    : enteredAmount;

  useEffect(() => {
    if (!isOpen || !user?.id) return;
    let active = true;
    const loadTeams = async () => {
      const memberships = await base44.entities.TeamMember.filter({ user_id: user.id }, "-joined_date", 50).catch(() => []);
      const teams = await Promise.all((memberships || [])
        .filter((membership) => membership.is_active !== false)
        .map(async (membership) => {
          const team = await base44.entities.Team.get(membership.team_id).catch(() => null);
          const members = team ? await base44.entities.TeamMember.filter({ team_id: team.id }, "-joined_date", 50).catch(() => []) : [];
          return team && team.is_active !== false
            ? { ...team, membership, members: (members || []).filter((member) => member.is_active !== false) }
            : null;
        }));
      if (active) setUserTeams(teams.filter(Boolean));
    };
    loadTeams();
    return () => {
      active = false;
    };
  }, [isOpen, user?.id]);

  useEffect(() => {
    if (!isOpen || typeof document === "undefined") return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  const handleCreate = async () => {
    if (!hasActivisionId(user)) {
      toast({ title: "Activision ID required", description: activisionIdRequiredMessage, variant: "destructive" });
      return;
    }

    if (selectedGameMode && selectedTeamSize && user) {
      setIsCreating(true);
      try {
        const selectedMode = modeChoices.find(gm => gm.id === selectedGameMode);
        const gameModeObj = isEights
          ? { id: selectedMode.gameMode, name: selectedMode.name }
          : selectedMode;
        const teamSizeObj = teamSizes.find(ts => ts.id === selectedTeamSize);
        let createdResult = {};
        
        const matchType = isEights ? '8s' : mode === 'xp' ? 'xp' : mode === 'ranked' ? 'ranked' : 'wagers';
        
        if (isWager) {
          const response = await base44.functions.invoke('createWager', {
            game_mode: selectedGameMode,
            game_mode_display: gameModeObj.name,
            team_size: selectedTeamSize,
            amount: enteredAmount,
            max_players: teamSizeObj.players,
            best_of: bestOf,
            team_id: selectedTeamId || undefined,
            payment_mode: paymentMode,
            play_rule: selectedPlayRule,
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

          window.dispatchEvent(new CustomEvent("topfragg:credits-updated"));
          window.dispatchEvent(new CustomEvent("topfragg:notifications-updated", { detail: { refresh: true } }));
          
          toast({
            title: "Wager created!",
            description: `Created ${selectedTeamSize} ${gameModeObj.name} for $${enteredAmount}. The map is selected after acceptance.`,
          });
          createdResult = {
            wager_id: response.data.wager_id || response.data.id || response.data.wager?.id,
            match: response.data.wager || response.data.match,
          };
        } else if (mode === "ranked" || mode === "xp") {
          const response = await base44.functions.invoke('createRankedMatch', {
            game_mode: selectedGameMode,
            game_mode_display: gameModeObj.name,
            team_size: selectedTeamSize,
            max_players: teamSizeObj.players,
            team_id: selectedTeamId || undefined,
            play_rule: selectedPlayRule,
          });

          if (response.data.error) {
            toast({
              title: "Failed to create XP match",
              description: response.data.error,
              variant: "destructive"
            });
            setIsCreating(false);
            return;
          }
          
          toast({
            title: "XP match created!",
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
          setSelectedTeamId("");
          setSelectedPlayRule("controller_only");
          setIsCreating(false);
          onClose();
          return;
        } else {
          const response = await base44.functions.invoke('createWager', {
            game_mode: gameModeObj.id,
            game_mode_display: gameModeObj.name,
            team_size: isEights ? "4v4" : selectedTeamSize,
            amount: 0,
            max_players: isEights ? 8 : teamSizeObj.players,
            best_of: isEights ? 3 : 1,
            team_id: selectedTeamId || undefined,
            host_banned_map: null,
            host_banned_map_name: "",
            final_map: "",
            final_map_name: "",
            series_format: isEights ? selectedMode.id : undefined,
            series_modes: isEights ? selectedMode.modes : undefined,
            play_rule: selectedPlayRule,
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
            title: isEights ? "8s lobby created!" : "Lobby created!",
            description: `Created ${isEights ? "4v4" : selectedTeamSize} ${gameModeObj.name}`,
          });
          createdResult = {
            wager_id: response.data.wager_id || response.data.id || response.data.wager?.id,
            match: response.data.wager || response.data.match,
          };
        }
        
        onCreate({
          gameMode: selectedGameMode,
          teamSize: selectedTeamSize,
          amount: isWager ? enteredAmount : 0,
          ...createdResult,
        });
        setStep(1);
        setSelectedGameMode(null);
        setSelectedTeamSize(null);
        setSelectedAmount(0);
        setCustomAmount("");
        setSelectedTeamId("");
        setPaymentMode("own");
        setSelectedPlayRule("controller_only");
        setIsCreating(false);
        onClose();
      } catch (error) {
        console.error("Failed to create lobby:", error);
        toast({
          title: "Error",
          description: error.message || "Failed to create lobby. Please try again.",
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
    setCustomAmount("");
    setSelectedTeamId("");
    setPaymentMode("own");
    setSelectedPlayRule("controller_only");
    onClose();
  };

  if (!isOpen || typeof document === "undefined") return null;

  return createPortal(
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.14 }}
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4"
        onClick={handleClose}
      >
        <motion.div
          initial={{ scale: 0.98, opacity: 0, y: 10 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          onClick={(e) => e.stopPropagation()}
          className="glass flex max-h-[calc(100vh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/10 will-change-transform"
        >
          {/* Header */}
          <div className="flex shrink-0 items-center justify-between border-b border-white/5 px-6 py-4">
            <div>
              <h2 className="text-xl font-black">{isEights ? "Create 8s Lobby" : isRanked ? "Create XP Match" : "Create Wager"}</h2>
              <p className="text-xs text-vapor mt-0.5">{isEights ? "Pick a BO3 series; teams are generated at 8 players" : isRanked ? "Configure your XP match settings" : "Configure your wager settings"}</p>
            </div>
            <button onClick={handleClose} className="p-2 hover:bg-white/5 rounded-lg transition-colors">
              <X className="w-5 h-5 text-vapor" />
            </button>
          </div>

          {/* Content */}
          <div className="overflow-y-auto p-6">
            <ActivisionIdNotice user={user} className="mb-5" />
            {/* Step 1: Game Mode */}
            {step === 1 && (
              <div>
                <h3 className="text-sm font-bold mb-4 flex items-center gap-2">
                  <span className="w-6 h-6 rounded bg-cyan/10 text-cyan flex items-center justify-center text-xs font-mono">1</span>
                  {isEights ? "Select BO3 Series" : "Select Game Mode"}
                </h3>
                <div className={`grid gap-4 ${isEights ? "sm:grid-cols-2" : "sm:grid-cols-3"}`}>
                  {modeChoices.map((mode) => {
                    const Icon = mode.icon;
                    const isSelected = selectedGameMode === mode.id;
                    const tone = choiceTones[mode.tone];
                    return (
                      <button
                        key={mode.id}
                        onClick={() => setSelectedGameMode(mode.id)}
                        className={`group relative transform-gpu p-4 rounded-xl border text-left transition-[transform,border-color,background-color] duration-150 hover:-translate-y-0.5 ${
                          isSelected
                            ? tone.selected
                            : `bg-secondary border-white/5 ${tone.card}`
                        }`}
                      >
                        <div className={`w-10 h-10 rounded-lg mb-3 flex items-center justify-center transition-colors duration-150 ${isSelected ? tone.icon : "bg-background/40 text-vapor"}`}>
                          <Icon className={`w-5 h-5 transition-colors duration-150 ${isSelected ? tone.text : `text-vapor ${tone.hoverText}`}`} />
                        </div>
                        <p className={`font-semibold text-sm mb-1 transition-colors duration-150 ${isSelected ? tone.text : tone.hoverText}`}>{mode.name}</p>
                        <p className="text-xs text-vapor">{mode.description}</p>
                        {isSelected && (
                          <div className="absolute top-3 right-3">
                            <Check className={`w-4 h-4 ${tone.text}`} />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-6 flex justify-end">
                  <button
                    onClick={() => {
                      if (isEights) {
                        setSelectedTeamSize("4v4");
                        setStep(3);
                      } else {
                        setStep(2);
                      }
                    }}
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
                    const tone = choiceTones[size.tone];
                    return (
                      <button
                        key={size.id}
                        onClick={() => { setSelectedTeamSize(size.id); setSelectedTeamId(""); }}
                        className={`group relative transform-gpu p-5 rounded-xl border text-left transition-[transform,border-color,background-color] duration-150 hover:-translate-y-0.5 ${
                          isSelected
                            ? tone.selected
                            : `bg-secondary border-white/5 ${tone.card}`
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                            isSelected ? tone.icon : "bg-background/40"
                          }`}>
                            <Users className={`w-6 h-6 transition-colors duration-150 ${isSelected ? tone.text : `text-vapor ${tone.hoverText}`}`} />
                          </div>
                          <div>
                            <p className={`font-bold text-lg transition-colors duration-150 ${isSelected ? tone.text : tone.hoverText}`}>{size.name}</p>
                            <p className="text-xs text-vapor">{size.players} players total</p>
                          </div>
                        </div>
                        {isSelected && (
                          <div className="absolute top-3 right-3">
                            <Check className={`w-4 h-4 ${tone.text}`} />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
                {(requiresTeam || supportsRankedParty) && (
                  <div className="mt-5 rounded-xl border border-white/5 bg-secondary/40 p-4">
                    <label className="text-xs text-vapor mb-2 block uppercase tracking-wider">
                      {isRanked ? "XP match party (optional)" : "Select wager team"}
                    </label>
                    <select
                      value={selectedTeamId}
                      onChange={(event) => setSelectedTeamId(event.target.value)}
                      className="w-full px-4 py-3 bg-background/60 rounded-lg text-sm border border-white/5 focus:border-cyan/30 focus:outline-none"
                    >
                      <option value="">{isRanked ? "Join as a solo player" : "Select team"}</option>
                      {compatibleTeams.map((team) => (
                        <option key={team.id} value={team.id}>
                          {team.name} ({team.members.length}-player party)
                        </option>
                      ))}
                    </select>
                    {compatibleTeams.length === 0 && (
                      isRanked ? (
                        <p className="mt-2 text-xs text-vapor">No complete XP Match Team fits this mode yet.</p>
                      ) : (
                        <p className="text-xs text-red-400 mt-2">Create a dedicated wager team first. Tournament teams cannot be used here.</p>
                      )
                    )}
                    {isRanked && (
                      <div className="mt-3 flex items-center justify-between gap-3 border-t border-white/5 pt-3">
                        <p className="text-[10px] leading-4 text-vapor">Parties stay together. Duo pairs with duo; trio leaves one solo slot.</p>
                        <Link to="/teams?create=ranked" className="shrink-0 text-[10px] font-black uppercase tracking-wider text-cyan hover:underline">Create team</Link>
                      </div>
                    )}
                    {!isRanked && selectedTeam && selectedTeam.members.length < requiredPlayers && (
                      <p className="text-xs text-orange mt-2">
                        {selectedTeam.name} has {selectedTeam.members.length}/{requiredPlayers} active players. Invite teammates from Teams before creating this lobby.
                      </p>
                    )}
                  </div>
                )}
                <div className="mt-6 flex justify-between">
                  <button
                    onClick={() => setStep(1)}
                    className="px-6 py-2.5 bg-secondary text-vapor font-bold text-xs rounded-lg hover:bg-white/10 transition-all uppercase tracking-wider"
                  >
                    Back
                  </button>
                  <button
                    onClick={() => setStep(3)}
                    disabled={!selectedTeamSize || !selectedTeamIsEligible}
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
                    <button
                      key={bo}
                      onClick={() => setBestOf(bo)}
                      className={`relative transform-gpu p-4 rounded-xl border text-center transition-[transform,border-color,background-color] duration-150 hover:-translate-y-0.5 ${
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
                    </button>
                  ))}
                </div>
                <div className="mb-6">
                  <PlayRulePicker selectedPlayRule={selectedPlayRule} onSelect={setSelectedPlayRule} matchLabel="wager" />
                </div>
                <div className="flex justify-between">
                  <button
                    onClick={() => setStep(isEights ? 1 : 2)}
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
                  <label className="text-xs text-vapor mb-2 block">Your Wallet: ${walletBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</label>
                  <div className="grid grid-cols-5 gap-2 mb-3">
                    {wagerAmounts.map((amount) => {
                      const isSelected = selectedAmount === amount && Number(customAmount) === amount;
                      return (
                        <button
                          key={amount}
                          type="button"
                          onClick={() => {
                            setSelectedAmount(amount);
                            setCustomAmount(String(amount));
                          }}
                          className={`py-2 rounded-lg text-xs font-bold border transition-all ${
                            isSelected
                              ? "bg-green/10 text-green border-green/30 ring-2 ring-green/10"
                              : "bg-secondary text-vapor border-white/5 hover:border-green/20 hover:text-green"
                          }`}
                        >
                          ${amount}
                        </button>
                      );
                    })}
                  </div>
                  <div className="relative">
                    <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-vapor" />
                    <input
                      type="number"
                      value={customAmount}
                      onChange={(e) => {
                        setCustomAmount(e.target.value);
                        setSelectedAmount(0);
                      }}
                      placeholder="0.00"
                      className="w-full pl-12 pr-4 py-3 bg-secondary border border-white/10 rounded-lg text-foreground font-mono font-bold focus:outline-none focus:border-green/50"
                      min="0"
                      step="0.01"
                    />
                  </div>
                  {enteredAmount > walletBalance && (
                    <p className="text-red-400 text-xs mt-2">Insufficient wallet balance</p>
                  )}
                  {requiresTeam && (
                    <div className="mt-4 rounded-xl border border-white/5 bg-secondary/40 p-4">
                      <p className="text-xs text-vapor mb-3 uppercase tracking-wider">Team payment</p>
                      <div className="grid sm:grid-cols-2 gap-2">
                        {[
                          { value: "own", label: "Pay my own entry only", cost: enteredAmount },
                          { value: "full_team", label: "Pay full team entry", cost: enteredAmount * requiredPlayers },
                        ].map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => setPaymentMode(option.value)}
                            className={`rounded-lg border px-3 py-2 text-left text-xs transition-all ${
                              paymentMode === option.value
                                ? "border-green/30 bg-green/10 text-green"
                                : "border-white/5 bg-background/40 text-vapor hover:text-foreground"
                            }`}
                          >
                            <span className="block font-bold">{option.label}</span>
                            <span className="font-mono">${option.cost.toFixed(2)}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {paymentTotal > walletBalance && (
                    <p className="text-red-400 text-xs mt-2">Insufficient wallet balance for selected payment option</p>
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
                    onClick={handleCreate}
                    disabled={!enteredAmount || enteredAmount <= 0 || paymentTotal > walletBalance || isCreating}
                    className="px-6 py-2.5 bg-green text-background font-bold text-xs rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg hover:shadow-green/25 transition-all uppercase tracking-wider flex items-center gap-2"
                  >
                    <Swords className="w-4 h-4" /> {isCreating ? "Posting..." : "Post Wager"}
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
                      {modeChoices.find(gm => gm.id === selectedGameMode)?.icon &&
                        React.createElement(modeChoices.find(gm => gm.id === selectedGameMode).icon, { className: "w-5 h-5 text-cyan" })
                      }
                    </div>
                    <div>
                      <p className="font-bold text-sm">{modeChoices.find(gm => gm.id === selectedGameMode)?.name}</p>
                      {isEights && <p className="mt-0.5 text-[10px] text-cyan">{modeChoices.find(gm => gm.id === selectedGameMode)?.description}</p>}
                      <p className="text-xs text-vapor">{isEights ? "4v4 · 8 solo players" : teamSizes.find(ts => ts.id === selectedTeamSize)?.name}</p>
                    </div>
                  </div>
                  <p className="text-xs text-green font-bold">{isEights ? "FREE · RANDOM TEAMS · XP ENABLED" : "FREE TO PLAY"}</p>
                  {selectedTeam && (
                    <p className="text-xs text-vapor mt-2">
                      XP match party: {selectedTeam.name} ({selectedTeam.members.length} players)
                    </p>
                  )}
                </div>
                <div className="mb-6">
                  <PlayRulePicker selectedPlayRule={selectedPlayRule} onSelect={setSelectedPlayRule} matchLabel={isEights ? "8s lobby" : "XP match"} />
                </div>
                <div className="flex justify-between">
                  <button
                    onClick={() => setStep(isEights ? 1 : 2)}
                    className="px-6 py-2.5 bg-secondary text-vapor font-bold text-xs rounded-lg hover:bg-white/10 transition-all uppercase tracking-wider"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleCreate}
                    disabled={isCreating}
                    className="px-6 py-2.5 bg-cyan text-background font-bold text-xs rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg hover:shadow-cyan/25 transition-all uppercase tracking-wider flex items-center gap-2"
                  >
                    <Swords className="w-4 h-4" /> {isCreating ? "Creating..." : isEights ? "Open 8s Lobby" : "Create XP Match"}
                  </button>
                </div>
              </div>
            )}

          </div>
        </motion.div>
      </motion.div>,
      document.body,
  );
}

