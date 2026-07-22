import React, { useState, useEffect, useRef } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion, useTransform } from "framer-motion";
import {
  AlertTriangle, Clock, Check, AlertCircle, Flag, Map as MapIcon,
  RefreshCw, Shield, Swords, Trophy
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/use-toast";
import MapVetoVertical from "@/components/match/MapVetoVertical";
import MatchChat from "@/components/match/MatchChat";
import UserBadges from "@/components/ui/UserBadges";
import ActivisionIdLabel from "@/components/competition/ActivisionIdLabel";
import { loadWagerParticipants } from "@/lib/wagerParticipants";

const playerName = (player) => player?.full_name || player?.display_name || player?.username || player?.user_name || "Unknown player";
const statusLabel = (status) => String(status || "open").replace(/_/g, " ");

function EightsResultOverlay({ wager, result, onContinue }) {
  const reduceMotion = useReducedMotion();
  const progress = useMotionValue(0);
  const [showContinue, setShowContinue] = useState(Boolean(reduceMotion));
  const levelChanged = result.new_level > result.previous_level;
  const displayedTotalXp = useTransform(progress, (value) => Math.round(
    result.previous_total_xp + ((result.new_total_xp - result.previous_total_xp) * value)
  ));
  const displayedLevel = useTransform(progress, (value) => (
    levelChanged && value >= 0.58 ? result.new_level : result.previous_level
  ));
  const displayedCurrentXp = useTransform(progress, (value) => {
    if (!levelChanged) {
      return Math.round(result.previous_current_xp + ((result.new_current_xp - result.previous_current_xp) * value));
    }
    if (value < 0.58) {
      return Math.round(result.previous_current_xp + ((result.previous_xp_to_next_level - result.previous_current_xp) * (value / 0.58)));
    }
    return Math.round(result.new_current_xp * ((value - 0.58) / 0.42));
  });
  const displayedTargetXp = useTransform(progress, (value) => (
    levelChanged && value >= 0.58 ? result.new_xp_to_next_level : result.previous_xp_to_next_level
  ));
  const progressScale = useTransform(progress, (value) => {
    if (!levelChanged) {
      const current = result.previous_current_xp + ((result.new_current_xp - result.previous_current_xp) * value);
      return Math.max(0, Math.min(1, current / Math.max(result.new_xp_to_next_level, 1)));
    }
    if (value < 0.58) {
      const current = result.previous_current_xp + ((result.previous_xp_to_next_level - result.previous_current_xp) * (value / 0.58));
      return Math.max(0, Math.min(1, current / Math.max(result.previous_xp_to_next_level, 1)));
    }
    return Math.max(0, Math.min(1, (result.new_current_xp * ((value - 0.58) / 0.42)) / Math.max(result.new_xp_to_next_level, 1)));
  });

  useEffect(() => {
    progress.set(reduceMotion ? 1 : 0);
    if (reduceMotion) {
      setShowContinue(true);
      return undefined;
    }
    setShowContinue(false);
    const controls = animate(progress, 1, {
      delay: 0.7,
      duration: 1.65,
      ease: [0.22, 1, 0.36, 1],
      onComplete: () => setShowContinue(true),
    });
    return () => controls.stop();
  }, [progress, reduceMotion]);

  const won = Boolean(result.won);
  const alphaScore = wager.confirmed_score_alpha ?? (wager.winner_id === wager.host_id ? wager.winner_score : wager.loser_score);
  const bravoScore = wager.confirmed_score_bravo ?? (wager.winner_id === wager.challenger_id ? wager.winner_score : wager.loser_score);

  return (
    <motion.div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <motion.div initial={{ opacity: 0, y: 30, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }} className={`relative w-full max-w-md overflow-hidden rounded-3xl border bg-card p-7 text-center shadow-2xl ${won ? "border-green/30" : "border-red-500/30"}`}>
        <motion.div className={`absolute inset-x-0 top-0 h-1 origin-left ${won ? "bg-green" : "bg-red-500"}`} initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.7, delay: 0.15 }} />
        <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-2xl ${won ? "bg-green/15 text-green" : "bg-red-500/15 text-red-400"}`}><Trophy className="h-8 w-8" /></div>
        <p className={`mt-5 text-xs font-black uppercase tracking-[0.24em] ${won ? "text-green" : "text-red-400"}`}>{won ? "Victory" : "Defeat"}</p>
        <h2 className="mt-2 text-4xl font-black">{alphaScore ?? 0} - {bravoScore ?? 0}</h2>
        <p className="mt-1 text-xs text-vapor">{won ? "Match won. Your XP has been added." : "Match completed. Your participation XP has been added."}</p>

        <div className="mt-6 rounded-2xl border border-white/5 bg-background/45 p-5 text-left">
          <div className="flex items-end justify-between gap-3">
            <div><p className="text-[10px] font-black uppercase tracking-wider text-vapor">XP progress</p><p className="mt-1 text-xl font-black">Level <motion.span>{displayedLevel}</motion.span></p></div>
            <div className="text-right"><p className={`font-mono text-2xl font-black ${won ? "text-green" : "text-cyan"}`}>+{result.amount} XP</p><p className="text-[10px] text-vapor"><motion.span>{displayedTotalXp}</motion.span> total XP</p></div>
          </div>
          <div className="mt-4 h-3 overflow-hidden rounded-full bg-white/5"><motion.div className={`h-full origin-left rounded-full ${won ? "bg-gradient-to-r from-cyan to-green" : "bg-cyan"}`} style={{ scaleX: progressScale }} /></div>
          <div className="mt-2 flex justify-between font-mono text-[11px] text-vapor"><span><motion.span>{displayedCurrentXp}</motion.span> XP</span><span><motion.span>{displayedTargetXp}</motion.span> XP</span></div>
          {levelChanged && <p className="mt-3 text-center text-xs font-black uppercase tracking-wider text-yellow-400">Level up · {result.previous_level} → {result.new_level}</p>}
        </div>

        <AnimatePresence>{showContinue && <motion.button initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} onClick={onContinue} className="mt-6 w-full rounded-xl bg-orange px-5 py-3.5 text-sm font-black uppercase tracking-wider text-background">Continue to 8s</motion.button>}</AnimatePresence>
      </motion.div>
    </motion.div>
  );
}

function RoomTeamCard({ label, tone, name, players, score, setScore, disabled, host }) {
  const cyan = tone === "cyan";
  const accent = cyan ? "text-cyan border-cyan/20 bg-cyan/5" : "text-orange border-orange/20 bg-orange/5";

  return (
    <section className={`glass rounded-xl border p-5 ${accent}`}>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.2em]">{label}</p>
          <div className="mt-2 flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-white/5 bg-background/40">
              <Shield className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-xl font-black">{name || "Open slot"}</h2>
              <p className="text-xs text-vapor">{host ? "Lobby host" : name ? "Challenger" : "Waiting for opponent"}</p>
            </div>
          </div>
        </div>
        <div className="shrink-0 rounded-xl border border-white/5 bg-background/35 p-2">
          <label className="mb-1 block text-center text-[9px] font-black uppercase tracking-wider text-vapor">Score</label>
          <input
            aria-label={`${label} score`}
            type="number"
            min="0"
            value={score}
            disabled={disabled || !name}
            onChange={(event) => setScore(Math.max(0, Number(event.target.value)))}
            className={`h-14 w-20 rounded-lg border bg-background/50 text-center font-mono text-3xl font-black outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50 ${cyan ? "border-cyan/30 text-cyan focus:ring-cyan/20" : "border-orange/30 text-orange focus:ring-orange/20"}`}
          />
        </div>
      </div>

      <div className="border-t border-white/5 pt-4">
        <p className="mb-2 text-[10px] font-black uppercase tracking-wider text-vapor">Players</p>
        {players.length === 0 ? (
          <p className="rounded-lg border border-dashed border-white/10 px-3 py-5 text-center text-xs text-vapor">Roster unavailable</p>
        ) : (
          <div className="space-y-2">
            {players.map((player, index) => (
              <div key={player.id || player.user_id || index} className="flex items-center gap-3 rounded-lg border border-white/5 bg-background/30 px-3 py-2">
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded text-[10px] font-black ${cyan ? "bg-cyan/15 text-cyan" : "bg-orange/15 text-orange"}`}>
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{playerName(player)}</p>
                  <ActivisionIdLabel user={player} className="mt-0.5 max-w-full" />
                </div>
                <UserBadges user={player} badges={player.badges || []} size="xs" iconOnly showMonitorCam />
                <span className="text-[10px] font-mono text-vapor">{player.wager_wins || 0}-{player.wager_losses || 0}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export default function EightsMatchRoom() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [wager, setWager] = useState(null);
  const [user, setUser] = useState(null);
  const [teamAPlayers, setTeamAPlayers] = useState([]);
  const [teamBPlayers, setTeamBPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [timeRemaining, setTimeRemaining] = useState(null);
  const [scoreA, setScoreA] = useState(0);
  const [scoreB, setScoreB] = useState(0);
  const [supporting, setSupporting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [disputing, setDisputing] = useState(false);
  const [resettingDispute, setResettingDispute] = useState(false);
  const [resultDismissed, setResultDismissed] = useState(false);
  const rosterSignatureRef = useRef("");

  useEffect(() => {
    setLoading(true);
    loadUser();
    loadWager();
  }, [id]);

  useEffect(() => {
    if (!id) return undefined;
    let active = true;
    const refresh = async () => {
      try {
        const [latest, participantRows] = await Promise.all([
          base44.entities.Wager.getFresh(id),
          base44.entities.WagerParticipant.filterFresh({ wager_id: id }, "joined_date", 20).catch(() => []),
        ]);
        if (!active || !latest) return;
        setWager(latest);
        const rosterSignature = (participantRows || [])
          .map((participant) => `${participant.user_id}:${participant.team}:${participant.is_captain ? 1 : 0}`)
          .sort()
          .join("|");
        if (rosterSignature === rosterSignatureRef.current) return;
        const participants = await loadWagerParticipants(base44, latest, { participantRows, fresh: true });
        if (!active) return;
        rosterSignatureRef.current = rosterSignature;
        setTeamAPlayers(participants.teamAPlayers);
        setTeamBPlayers(participants.teamBPlayers);
      } catch (error) {
        console.error("Failed to refresh 8s match:", error);
      }
    };
    const interval = setInterval(refresh, 1000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [id]);

  const loadUser = async () => {
    try {
      const userData = await base44.auth.me();
      if (userData) {
        setUser(userData);
      }
    } catch (error) {
      console.error("Failed to load user:", error);
    }
  };

  useEffect(() => {
    const interval = setInterval(calculateTimeRemaining, 1000);
    return () => clearInterval(interval);
  }, [wager]);

  const loadWager = async () => {
    try {
      const [wagerData, participantRows] = await Promise.all([
        base44.entities.Wager.getFresh(id),
        base44.entities.WagerParticipant.filterFresh({ wager_id: id }, "joined_date", 20).catch(() => []),
      ]);
      setWager(wagerData);

      const { teamAPlayers, teamBPlayers } = await loadWagerParticipants(base44, wagerData, { participantRows, fresh: true });
      rosterSignatureRef.current = (participantRows || [])
        .map((participant) => `${participant.user_id}:${participant.team}:${participant.is_captain ? 1 : 0}`)
        .sort()
        .join("|");
      setTeamAPlayers(teamAPlayers);
      setTeamBPlayers(teamBPlayers);
    } catch (error) {
      console.error("Failed to load wager:", error);
      toast({ 
        title: "Error loading match", 
        description: error.message || "Match not found", 
        variant: "destructive" 
      });
    } finally {
      setLoading(false);
    }
  };

  const calculateTimeRemaining = () => {
    if (!wager?.match_start_deadline) {
      setTimeRemaining(null);
      return;
    }
    const deadline = new Date(wager.match_start_deadline);
    const now = new Date();
    const diff = deadline - now;
    if (diff <= 0) {
      setTimeRemaining("EXPIRED");
      return;
    }
    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    setTimeRemaining(`${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
  };

  const handleReportScore = async () => {
    if (scoreA === scoreB) {
      toast({ title: "Invalid score", description: "Scores cannot be tied", variant: "destructive" });
      return;
    }
    
    const isHost = user?.id === wager.host_id;
    const team = isHost ? 'host' : 'challenger';
    
    setSubmitting(true);
    try {
      const response = await base44.functions.invoke('submitScore', { 
        wager_id: wager.id, 
        team: team, 
        team_alpha_score: scoreA,
        team_bravo_score: scoreB,
        proof_urls: []
      });
      
      if (response.data.success) {
        if (response.data.ready_to_complete) {
          const completeResponse = await base44.functions.invoke('completeWager', {
            wager_id: wager.id,
            winner_id: response.data.winner_id,
            team_alpha_score: scoreA,
            team_bravo_score: scoreB,
            proof_urls: []
          });
          if (!completeResponse.data.success) {
            toast({ title: "Failed", description: completeResponse.data.error || "Failed to complete match", variant: "destructive" });
            return;
          }
          toast({ title: "Match completed!", description: `${response.data.winner_name} won ${response.data.winner_score}-${response.data.loser_score}` });
          setWager(completeResponse.data.wager || { ...wager, status: "completed", winner_id: completeResponse.data.winner_id, winner_name: completeResponse.data.winner_name, xp_changes: completeResponse.data.xp_changes });
        } else if (response.data.status === 'score_conflict') {
          toast({ title: "Score conflict", description: "Dispute opened", variant: "destructive" });
        } else {
          toast({ title: "Score submitted", description: response.data.message });
        }
      } else {
        toast({ title: "Failed", description: response.data.error, variant: "destructive" });
      }
    } catch (error) {
      console.error("Failed to report score:", error);
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSupportTicket = async (reason) => {
    setSupporting(true);
    try {
      const response = await base44.functions.invoke("requestAdminAlert", {
        match_type: wager.match_type || "8s",
        match_id: wager.id,
        subject: `8s match support ${wager.id}`,
        description: `${reason}\n\nMatch: ${wager.id}\nPlayers: ${wager.host_name || "Host unavailable"} vs ${wager.challenger_name || "Opponent pending"}`,
        priority: "high",
      });

      if (response.data?.success) {
        toast({ title: "Admin requested", description: "Staff were notified for this 8s match." });
        await loadWager();
      } else {
        toast({ title: "Request failed", description: response.data?.error || "Could not request admin.", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Request failed", description: error.message || "Could not request admin.", variant: "destructive" });
    } finally {
      setSupporting(false);
    }
  };

  const handleCreateDispute = async () => {
    const evidenceText = typeof window !== "undefined" ? window.prompt("Evidence URLs (comma or line separated):", "") : "";
    if (evidenceText === null) return;
    const evidenceUrls = evidenceText.split(/[\n,]+/).map((url) => url.trim()).filter(Boolean);
    setDisputing(true);
    try {
      const response = await base44.functions.invoke("createDispute", {
        match_type: "8s",
        match_id: wager.id,
        wager_id: wager.id,
        reason: "score_dispute",
        description: `Dispute submitted from 8s match room ${wager.id}. ${wager.host_name || "Host"} vs ${wager.challenger_name || "Opponent"}`,
        reported_against: user?.id === wager.host_id ? wager.challenger_id : wager.host_id,
        reported_against_name: user?.id === wager.host_id ? wager.challenger_name : wager.host_name,
        evidence_urls: evidenceUrls,
        escalated: Boolean(user?.is_premium),
      });

      if (response.data?.success) {
        toast({ title: response.data.escalated ? "Dispute escalated" : "Dispute submitted", description: "A review case was created for staff." });
        await loadWager();
      } else {
        toast({ title: "Dispute failed", description: response.data?.error || "Could not create dispute.", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Dispute failed", description: error.message || "Could not create dispute.", variant: "destructive" });
    } finally {
      setDisputing(false);
    }
  };

  const handleAdminResetDispute = async () => {
    const confirmed = typeof window === "undefined" || window.confirm("Reset this dispute, clear both reports, and let the players continue?");
    if (!confirmed) return;
    setResettingDispute(true);
    try {
      const response = await base44.functions.invoke("adminResetMatchDispute", {
        match_type: "8s",
        match_id: wager.id,
      });
      if (!response.data?.success) {
        toast({ title: "Reset failed", description: response.data?.error || "Could not reset dispute.", variant: "destructive" });
        return;
      }
      setScoreA(0);
      setScoreB(0);
      await loadWager();
      toast({ title: "Dispute reset", description: "The 8s match can continue and both sides can report again." });
    } catch (error) {
      toast({ title: "Reset failed", description: error.message || "Could not reset dispute.", variant: "destructive" });
    } finally {
      setResettingDispute(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-orange/20 border-t-orange rounded-full animate-spin mx-auto mb-4" />
          <p className="text-vapor">Loading 8s match...</p>
        </div>
      </div>
    );
  }

  if (!wager) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">Match Not Found</h2>
          <Link to="/8s" className="text-orange hover:underline">Back to 8s</Link>
        </div>
      </div>
    );
  }

  const isParticipant = user?.id === wager.host_id || user?.id === wager.challenger_id;
  const isStaff = ["ceo", "super_admin", "admin", "moderator"].includes(user?.role);
  const isComplete = wager.status === "completed";
  const canSubmit = isParticipant && Boolean(wager.challenger_id) && !isComplete;
  const predictedWinner = scoreA === scoreB ? null : scoreA > scoreB ? wager.host_name : wager.challenger_name;
  const personalResult = wager.xp_changes?.[user?.id] || null;
  const dismissResult = () => {
    setResultDismissed(true);
    navigate("/8s", { replace: true });
  };

  return (
    <div className="min-h-screen bg-obsidian py-6">
      <div className="max-w-[1400px] mx-auto px-4 lg:px-6">
        {isComplete && personalResult && !resultDismissed && <EightsResultOverlay wager={wager} result={personalResult} onContinue={dismissResult} />}
        <div className="glass rounded-xl border border-orange/20 p-6 mb-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <Swords className="h-5 w-5 text-orange" />
                <span className="text-xs font-mono font-semibold text-orange uppercase tracking-wider">
                  8s Match - {statusLabel(wager.status)}
                </span>
              </div>
              <h1 className="text-2xl font-black">{wager.host_name || "Team Alpha"} vs {wager.challenger_name || "Open slot"}</h1>
              <p className="mt-1 text-sm text-vapor">{wager.team_size} {wager.game_mode_display || wager.game_mode} · Match #{wager.id?.slice(-8)}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {timeRemaining && (
                <div className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2 font-mono text-xs font-bold ${
                  timeRemaining === "EXPIRED" ? "bg-red-500/20 text-red-400" : "bg-orange/10 text-orange"
                }`}>
                  <Clock className="h-4 w-4" /> {timeRemaining}
                </div>
              )}
              <Link to="/8s" className="rounded-lg bg-secondary px-4 py-2 text-xs font-bold text-vapor transition-all hover:bg-white/10">8s Lobbies</Link>
            </div>
          </div>
        </div>

        {isComplete && (
          <div className="glass mb-6 flex items-center gap-3 rounded-xl border border-green/20 bg-green/5 p-5">
            <Trophy className="h-5 w-5 text-green" />
            <p className="font-bold text-green">Winner: {wager.winner_name || "Match completed"}</p>
          </div>
        )}

        {canSubmit && (
          <div className="mb-3 flex items-center gap-3 rounded-lg border border-cyan/20 bg-cyan/5 px-4 py-3 text-xs text-vapor">
            <Flag className="h-4 w-4 shrink-0 text-cyan" />
            <p><span className="font-black uppercase tracking-wider text-cyan">Report final score</span><span className="ml-2">Both teams must submit the same score. Conflicts are sent to staff.</span></p>
          </div>
        )}

        <div className="mb-5 grid gap-5 lg:grid-cols-2">
          <RoomTeamCard label="Team Alpha" tone="cyan" name={wager.host_name} players={teamAPlayers} score={scoreA} setScore={setScoreA} disabled={!canSubmit} host />
          <RoomTeamCard label="Team Bravo" tone="orange" name={wager.challenger_name} players={teamBPlayers} score={scoreB} setScore={setScoreB} disabled={!canSubmit} />
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_420px]">
          <div className="min-w-0 space-y-5">
            <section className="glass rounded-xl border border-cyan/20 p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-wider"><MapIcon className="h-4 w-4 text-cyan" /> Match Map</h2>
                  <p className="mt-1 text-xs text-vapor">{wager.game_mode_display || wager.game_mode}</p>
                </div>
                <span className="rounded-md border border-cyan/20 bg-cyan/10 px-3 py-1 text-[10px] font-black uppercase text-cyan">BO{wager.best_of || 1}</span>
              </div>
              <div className="rounded-xl border border-white/5 bg-secondary/40 p-5">
                <p className="text-[10px] font-black uppercase tracking-wider text-cyan">Selected map</p>
                <h3 className="mt-1 text-2xl font-black">{wager.final_map_name || "Map pending"}</h3>
              </div>
              <div className="mt-4"><MapVetoVertical wager={wager} /></div>
            </section>

            <section className="glass rounded-xl border border-white/5 p-4">
              <div className="flex flex-wrap items-center gap-3">
                {isStaff && ["score_conflict", "disputed"].includes(wager.status) && (
                  <button onClick={handleAdminResetDispute} disabled={resettingDispute} className="w-full rounded-lg border border-cyan/25 bg-cyan/10 px-5 py-3 text-xs font-bold uppercase tracking-wider text-cyan hover:bg-cyan/20 disabled:opacity-50">
                    {resettingDispute ? "Resetting..." : "Reset Dispute & Continue Match"}
                  </button>
                )}
                <button onClick={handleReportScore} disabled={!canSubmit || submitting} className="flex min-w-[220px] flex-1 items-center justify-center gap-2 rounded-lg border border-green/20 bg-green/10 py-3 text-sm font-bold uppercase tracking-wider text-green transition-all hover:bg-green/20 disabled:cursor-not-allowed disabled:opacity-50">
                  <Check className="h-4 w-4" /> {submitting ? "Submitting..." : "Submit Score Report"}
                </button>
                <button onClick={() => handleSupportTicket("I need support for this 8s match.")} disabled={!isParticipant || supporting} className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-5 py-3 text-xs font-bold uppercase tracking-wider text-red-400 disabled:opacity-50">
                  <AlertTriangle className="h-4 w-4" /> {supporting ? "Requesting..." : "Request Admin"}
                </button>
                <button onClick={handleCreateDispute} disabled={!isParticipant || disputing} className="rounded-lg border border-orange/20 bg-orange/10 px-5 py-3 text-xs font-bold uppercase tracking-wider text-orange disabled:opacity-50">
                  {disputing ? "Submitting..." : "Submit Dispute"}
                </button>
                <button onClick={loadWager} className="rounded-lg border border-white/5 bg-secondary/50 p-3 text-vapor hover:bg-secondary" title="Refresh"><RefreshCw className="h-4 w-4" /></button>
              </div>
              {predictedWinner && canSubmit && <p className="mt-3 text-xs text-vapor">Current score would report <span className="font-bold text-cyan">{predictedWinner}</span> as winner.</p>}
            </section>

            <div className="grid gap-5 md:grid-cols-2">
              <section className="glass rounded-xl border border-white/5 p-5">
                <h2 className="mb-3 flex items-center gap-2 text-sm font-bold"><Shield className="h-4 w-4 text-cyan" /> Match State</h2>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between gap-3"><span className="text-vapor">Status</span><span className="capitalize">{statusLabel(wager.status)}</span></div>
                  <div className="flex justify-between gap-3"><span className="text-vapor">Format</span><span>BO{wager.best_of || 1}</span></div>
                  <div className="flex justify-between gap-3"><span className="text-vapor">Requested admin</span><span>{wager.requested_admin ? "Yes" : "No"}</span></div>
                </div>
              </section>
              <section className="glass rounded-xl border border-white/5 p-5">
                <h2 className="mb-3 flex items-center gap-2 text-sm font-bold"><Trophy className="h-4 w-4 text-orange" /> Match Rules</h2>
                <p className="text-xs leading-5 text-vapor">Both teams submit the final score independently. Matching reports complete the match; conflicting reports create a staff review.</p>
              </section>
            </div>
          </div>
          <aside className="min-w-0">
            <MatchChat conversationId={wager.id} matchType="wager" accent="orange" live compact sticky={false} />
          </aside>
        </div>
      </div>
    </div>
  );
}
