import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  AlertCircle,
  Check,
  Clock,
  Flag,
  HelpCircle,
  RefreshCw,
  Shield,
  Trophy,
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/use-toast";
import MapVetoVertical from "@/components/match/MapVetoVertical";
import MatchChat from "@/components/match/MatchChat";
import RankBadge from "@/components/ui/RankBadge";
import UserBadges from "@/components/ui/UserBadges";
import ActivisionIdLabel from "@/components/competition/ActivisionIdLabel";
import { getRankForElo } from "@/lib/ranks";

const playerName = (user, fallback = "Unnamed player") => (
  user?.display_name || user?.full_name || user?.username || user?.email || fallback
);

const formatStatus = (status) => String(status || "open").replace(/_/g, " ");

function scoreWinner(match, scoreA, scoreB) {
  if (scoreA === scoreB) return null;
  return scoreA > scoreB ? match.host_id : match.challenger_id;
}

const winsNeededFor = (match) => Math.floor(Math.max(1, Number(match?.best_of) || 1) / 2) + 1;
const validSeriesScore = (match, scoreA, scoreB) => {
  const winsNeeded = winsNeededFor(match);
  return Number.isInteger(scoreA)
    && Number.isInteger(scoreB)
    && scoreA >= 0
    && scoreB >= 0
    && scoreA <= winsNeeded
    && scoreB <= winsNeeded
    && ((scoreA === winsNeeded && scoreB < winsNeeded) || (scoreB === winsNeeded && scoreA < winsNeeded));
};

const slotsPerRankedTeam = (match) => Math.max(1, Number.parseInt(String(match?.team_size || "1v1").split("v")[0], 10) || 1);
const roomRosterIds = (match, side) => {
  const stored = match?.[`team_${side}_player_ids`];
  if (Array.isArray(stored) && stored.length > 0) return stored;
  if (side === "alpha") return match?.host_id ? [match.host_id] : [];
  return match?.challenger_id ? [match.challenger_id] : [];
};
const roomRosterNames = (match, side) => {
  const stored = match?.[`team_${side}_player_names`];
  if (Array.isArray(stored) && stored.length > 0) return stored;
  if (side === "alpha") return match?.host_name ? [match.host_name] : [];
  return match?.challenger_name ? [match.challenger_name] : [];
};
const roomRosterSignature = (match) => [...roomRosterIds(match, "alpha"), "|", ...roomRosterIds(match, "bravo")].join(":");
const roomRosterFull = (match) => roomRosterIds(match, "alpha").length >= slotsPerRankedTeam(match) && roomRosterIds(match, "bravo").length >= slotsPerRankedTeam(match);
const arenaHeightClass = (slots) => ({ 1: "h-[300px]", 2: "h-[300px]", 3: "h-[344px]", 4: "h-[388px]" }[slots] || "h-[388px]");

function PlayerPanel({ label, color, players = [], slots = 1 }) {
  const colorClass = color === "cyan" ? "text-cyan border-cyan/20 bg-cyan/5" : "text-orange border-orange/20 bg-orange/5";

  if (slots === 1 && players[0]) {
    const player = players[0];
    const rank = getRankForElo(player.elo || 0);
    return (
      <div className={`glass flex h-[300px] flex-col rounded-xl border p-5 ${colorClass}`}>
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-wider">{label}</p>
          <span className="rounded-full border border-white/10 bg-background/30 px-2.5 py-1 text-[10px] font-black">1/1</span>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <RankBadge rank={rank.tier} size="md" showLabel={false} />
          <div className="mt-3 flex items-center justify-center gap-2">
            <h2 className="max-w-[180px] truncate text-xl font-black">{player.name}</h2>
            <UserBadges user={player} size="xs" iconOnly showMonitorCam />
          </div>
          <ActivisionIdLabel user={player} className="mt-1 max-w-full" />
          <p className="mt-1 text-xs text-vapor">{rank.name} · {(player.elo || 0).toLocaleString()} ELO</p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[{ label: "Wins", value: player.wins || 0 }, { label: "Losses", value: player.losses || 0 }, { label: "Streak", value: player.win_streak || 0 }].map((stat) => <div key={stat.label} className="rounded-lg border border-white/5 bg-background/25 px-2 py-2 text-center"><p className="text-[8px] font-black uppercase tracking-wider text-vapor">{stat.label}</p><p className="mt-1 font-mono text-sm font-black">{stat.value}</p></div>)}
        </div>
      </div>
    );
  }

  return (
    <div className={`glass flex h-full flex-col rounded-xl border p-5 ${colorClass}`}>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-wider">{label}</p>
        <span className="rounded-full border border-white/10 bg-background/30 px-2.5 py-1 text-[10px] font-black">{players.length}/{slots}</span>
      </div>
      <div className="flex flex-1 flex-col gap-2">
        {Array.from({ length: slots }, (_, index) => {
          const player = players[index];
          if (!player) return <div key={`open-${index}`} className="flex min-h-[62px] flex-1 items-center justify-center rounded-lg border border-dashed border-white/10 bg-background/15 text-[10px] font-black uppercase tracking-wider text-vapor/55">Open slot</div>;
          const rank = getRankForElo(player.elo || 0);
          return <div key={player.id} className="flex min-h-[62px] flex-1 min-w-0 items-center gap-3 rounded-lg border border-white/5 bg-background/25 p-2.5"><RankBadge rank={rank.tier} size="sm" showLabel={false} /><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><p className="truncate text-sm font-black">{player.name}</p><UserBadges user={player} size="xs" iconOnly showMonitorCam /></div><ActivisionIdLabel user={player} className="mt-0.5 max-w-full" /><p className="mt-0.5 text-[10px] text-vapor">{rank.name} · {player.elo || 0} ELO · {player.wins || 0}W-{player.losses || 0}L</p></div></div>;
        })}
      </div>
    </div>
  );
}

function RankedResultOverlay({ match, result, onContinue }) {
  const reduceMotion = useReducedMotion();
  const [displayedElo, setDisplayedElo] = useState(Number(result.previous_elo || 0));
  const [showContinue, setShowContinue] = useState(Boolean(reduceMotion));
  const previousElo = Number(result.previous_elo || 0);
  const newElo = Number(result.new_elo || 0);
  const delta = Number(result.delta || 0);

  useEffect(() => {
    if (reduceMotion) {
      setDisplayedElo(newElo);
      setShowContinue(true);
      return undefined;
    }

    let frameId;
    let startTime;
    const startTimer = window.setTimeout(() => {
      const tick = (time) => {
        startTime ??= time;
        const progress = Math.min(1, (time - startTime) / 1350);
        const eased = 1 - ((1 - progress) ** 3);
        setDisplayedElo(Math.round(previousElo + ((newElo - previousElo) * eased)));
        if (progress < 1) frameId = window.requestAnimationFrame(tick);
      };
      frameId = window.requestAnimationFrame(tick);
    }, 900);
    const continueTimer = window.setTimeout(() => setShowContinue(true), 2200);
    return () => {
      window.clearTimeout(startTimer);
      window.clearTimeout(continueTimer);
      if (frameId) window.cancelAnimationFrame(frameId);
    };
  }, [newElo, previousElo, reduceMotion]);

  const accent = result.won ? "text-green" : "text-red-400";
  const progressWidth = Math.max(10, Math.min(100, (displayedElo / Math.max(newElo, previousElo, 1)) * 100));

  return (
    <motion.div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-md" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <motion.div
        initial={{ opacity: 0, y: 34, scale: 0.94 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 210, damping: 20 }}
        className={`relative w-full max-w-md overflow-hidden rounded-3xl border bg-card p-7 text-center shadow-2xl ${result.won ? "border-green/30" : "border-red-500/30"}`}
      >
        <motion.div className={`absolute inset-x-0 top-0 h-1 ${result.won ? "bg-green" : "bg-red-500"}`} initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.75, delay: 0.15 }} />
        <motion.div initial={{ scale: 0, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", delay: 0.2 }} className={`mx-auto flex h-16 w-16 items-center justify-center rounded-2xl ${result.won ? "bg-green/15 text-green" : "bg-red-500/15 text-red-400"}`}>
          <Trophy className="h-8 w-8" />
        </motion.div>
        <motion.p initial={{ opacity: 0, letterSpacing: "0.45em" }} animate={{ opacity: 1, letterSpacing: "0.22em" }} transition={{ delay: 0.4, duration: 0.55 }} className={`mt-5 text-xs font-black uppercase ${accent}`}>{result.won ? "Victory" : "Defeat"}</motion.p>
        <motion.h2 initial={{ opacity: 0, scale: 1.35 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.6, duration: 0.35 }} className="mt-2 text-3xl font-black">{match.confirmed_score_alpha ?? match.winner_score} - {match.confirmed_score_bravo ?? match.loser_score}</motion.h2>
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 }} className="mt-6 rounded-2xl border border-white/5 bg-background/40 p-5">
          <p className="text-[10px] font-black uppercase tracking-wider text-vapor">Your ELO change</p>
          <p className={`mt-2 font-mono text-4xl font-black tabular-nums ${accent}`}>{displayedElo.toLocaleString()} ELO</p>
          <p className={`mt-1 text-sm font-black ${accent}`}>{delta > 0 ? "+" : ""}{delta} ELO</p>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/5"><motion.div className={`h-full rounded-full ${result.won ? "bg-green" : "bg-red-500"}`} animate={{ width: `${progressWidth}%` }} transition={{ duration: 0.16 }} /></div>
          <p className="mt-2 text-xs text-vapor">{previousElo.toLocaleString()} → {newElo.toLocaleString()} ELO</p>
        </motion.div>
        <AnimatePresence>
          {showContinue && <motion.button initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} onClick={onContinue} className="mt-6 w-full rounded-xl bg-cyan px-5 py-3.5 text-sm font-black uppercase tracking-wider text-background">Continue to Ranked</motion.button>}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}

export default function RankedMatchRoom() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [match, setMatch] = useState(null);
  const [user, setUser] = useState(null);
  const [alphaPlayers, setAlphaPlayers] = useState([]);
  const [bravoPlayers, setBravoPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [supporting, setSupporting] = useState(false);
  const [disputing, setDisputing] = useState(false);
  const [cancelVoting, setCancelVoting] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(null);
  const [scoreA, setScoreA] = useState(0);
  const [scoreB, setScoreB] = useState(0);

  useEffect(() => {
    loadRoom();
  }, [id]);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const latest = await base44.entities.RankedMatch.getFresh(id);
        if (!active || !latest) return;
        let refreshedMatch = latest;
        if (roomRosterFull(latest) && !latest.final_map_name) {
          const mapResponse = await base44.functions.invoke("ensureRankedMatchMap", { ranked_match_id: id }).catch(() => null);
          if (mapResponse?.data?.match) refreshedMatch = mapResponse.data.match;
        }
        setMatch(refreshedMatch);
        if (roomRosterSignature(refreshedMatch) !== roomRosterSignature(match)) {
          const rosters = await loadRosterPlayers(refreshedMatch);
          if (active) {
            setAlphaPlayers(rosters.alpha);
            setBravoPlayers(rosters.bravo);
          }
        }
      } catch (error) {
        console.error("Failed to refresh ranked match:", error);
      }
    };
    const interval = setInterval(refresh, 1000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [id, roomRosterSignature(match)]);

  useEffect(() => {
    const interval = setInterval(calculateTimeRemaining, 1000);
    calculateTimeRemaining();
    return () => clearInterval(interval);
  }, [match?.match_start_deadline]);

  useEffect(() => {
    if (match?.status === "cancelled") {
      navigate("/ranked", { replace: true });
    }
  }, [match?.status, navigate]);

  const isParticipant = useMemo(() => (
    user?.id && (roomRosterIds(match, "alpha").includes(user.id) || roomRosterIds(match, "bravo").includes(user.id))
  ), [user?.id, match]);

  const isHost = user?.id === match?.host_id;
  const isOpposingCaptain = user?.id === match?.challenger_id;
  const isStaff = ["ceo", "super_admin", "admin", "moderator"].includes(user?.role);
  const scoreReportOpen = ["in_progress", "awaiting_team_alpha_report", "awaiting_team_bravo_report"].includes(match?.status);
  const ownScoreSubmitted = isHost ? match?.host_reported_score_by === user?.id : isOpposingCaptain ? match?.challenger_reported_score_by === user?.id : false;
  const canSubmitScore = (isHost || isOpposingCaptain || isStaff) && scoreReportOpen && roomRosterFull(match) && !ownScoreSubmitted;
  const scoreIsValid = validSeriesScore(match, scoreA, scoreB);
  const winsNeeded = winsNeededFor(match);
  const joinedOpponentCount = Math.max(0, roomRosterIds(match, "alpha").length + roomRosterIds(match, "bravo").length - 1);
  const cancelVoteLocked = joinedOpponentCount > 0 && timeRemaining !== "EXPIRED";
  const personalResult = match?.elo_changes?.[user?.id] || null;

  const loadPlayer = async (userId, fallbackName) => {
    if (!userId) return null;

    const [userRows, statsRows] = await Promise.all([
      base44.entities.User.get(userId).then((row) => row).catch(() => null),
      base44.entities.RankedStats.filter({ user_id: userId }).catch(() => []),
    ]);
    const stats = statsRows?.[0] || {};

    return {
      id: userId,
      name: playerName(userRows, fallbackName),
      activision_id: userRows?.activision_id || "",
      elo: stats.elo || 0,
      wins: stats.wins || 0,
      losses: stats.losses || 0,
      win_streak: stats.win_streak || 0,
      peak_elo: stats.peak_elo || 0,
      matches_played: stats.matches_played || 0,
      badges: userRows?.badges || [],
      verified_player: userRows?.verified_player || userRows?.is_verified_player || false,
      streamer_badge: userRows?.streamer_badge || userRows?.is_streamer || false,
      force_stream_required: userRows?.force_stream_required || userRows?.stream_override_required || false,
      monitor_cam_required: userRows?.monitor_cam_required || userRows?.required_monitor_cam || userRows?.moni_cam_required || false,
    };
  };

  const loadRosterPlayers = async (matchData) => {
    const alphaIds = roomRosterIds(matchData, "alpha");
    const bravoIds = roomRosterIds(matchData, "bravo");
    const alphaNames = roomRosterNames(matchData, "alpha");
    const bravoNames = roomRosterNames(matchData, "bravo");
    const [alpha, bravo] = await Promise.all([
      Promise.all(alphaIds.map((playerId, index) => loadPlayer(playerId, alphaNames[index]))),
      Promise.all(bravoIds.map((playerId, index) => loadPlayer(playerId, bravoNames[index]))),
    ]);
    return { alpha: alpha.filter(Boolean), bravo: bravo.filter(Boolean) };
  };

  const loadRoom = async () => {
    try {
      setLoading(true);
      const [currentUser, loadedMatch] = await Promise.all([
        base44.auth.me().catch(() => null),
        base44.entities.RankedMatch.get(id),
      ]);
      let matchData = loadedMatch;

      if (!matchData.final_map_name && roomRosterFull(matchData)) {
        const mapResponse = await base44.functions.invoke("ensureRankedMatchMap", { ranked_match_id: id }).catch(() => null);
        if (mapResponse?.data?.match) matchData = mapResponse.data.match;
      }

      setUser(currentUser);
      setMatch(matchData);
      setScoreA(matchData.reported_score_alpha || 0);
      setScoreB(matchData.reported_score_bravo || 0);

      const rosters = await loadRosterPlayers(matchData);
      setAlphaPlayers(rosters.alpha);
      setBravoPlayers(rosters.bravo);
    } catch (error) {
      console.error("Failed to load ranked match:", error);
      toast({ title: "Error loading match", description: error.message || "Match not found", variant: "destructive" });
      setMatch(null);
    } finally {
      setLoading(false);
    }
  };

  const calculateTimeRemaining = () => {
    if (!match?.match_start_deadline) {
      setTimeRemaining(null);
      return;
    }

    const diff = new Date(match.match_start_deadline) - new Date();
    if (diff <= 0) {
      setTimeRemaining("EXPIRED");
      return;
    }

    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    setTimeRemaining(`${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`);
  };

  const handleReportScore = async () => {
    if (!canSubmitScore) return;
    if (!scoreIsValid) {
      toast({ title: "Invalid score", description: `This BO${match.best_of || 1} must end when one team reaches ${winsNeeded} map ${winsNeeded === 1 ? "win" : "wins"}.`, variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      const response = await base44.functions.invoke("completeRankedMatch", {
        ranked_match_id: match.id,
        team_alpha_score: scoreA,
        team_bravo_score: scoreB,
        proof_urls: [],
      });

      if (!response.data?.success) {
        toast({ title: "Score rejected", description: response.data?.error || "Could not submit score.", variant: "destructive" });
        return;
      }

      if (response.data.status === "score_conflict") {
        toast({ title: "Score conflict", description: "A support ticket was opened for staff review.", variant: "destructive" });
        await loadRoom();
        return;
      }

      if (response.data.winner_id) {
        toast({
          title: "Ranked match completed",
          description: `${response.data.winner_name} won. Review your ELO result.`,
        });
        setMatch(response.data.match || { ...match, status: "completed", elo_changes: response.data.elo_changes });
        return;
      }

      toast({ title: "Score submitted", description: response.data.message || "Waiting for opponent confirmation." });
      await loadRoom();
    } catch (error) {
      console.error("Failed to report ranked score:", error);
      toast({ title: "Error", description: error.message || "Failed to report score.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSupportTicket = async (reason) => {
    setSupporting(true);
    try {
      const response = await base44.functions.invoke("requestAdminAlert", {
        match_type: "ranked",
        match_id: match.id,
        subject: `Ranked match support ${match.id}`,
        description: `${reason}\n\nMatch: ${match.id}\nStatus: ${match.status}\nParticipants: ${match.host_name || "Host unavailable"} vs ${match.challenger_name || "Opponent pending"}`,
        priority: "high",
      });

      if (response.data?.success) {
        toast({ title: "Admin requested", description: "Staff were notified for this ranked match." });
        await loadRoom();
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
        match_type: "ranked",
        match_id: match.id,
        ranked_match_id: match.id,
        reason: "score_dispute",
        description: `Dispute submitted from ranked match room ${match.id}. ${match.host_name || "Host"} vs ${match.challenger_name || "Opponent"}`,
        reported_against: user?.id === match.host_id ? match.challenger_id : match.host_id,
        reported_against_name: user?.id === match.host_id ? match.challenger_name : match.host_name,
        evidence_urls: evidenceUrls,
        escalated: Boolean(user?.is_premium),
      });

      if (response.data?.success) {
        toast({ title: response.data.escalated ? "Dispute escalated" : "Dispute submitted", description: "A review case was created for staff." });
        await loadRoom();
      } else {
        toast({ title: "Dispute failed", description: response.data?.error || "Could not create dispute.", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Dispute failed", description: error.message || "Could not create dispute.", variant: "destructive" });
    } finally {
      setDisputing(false);
    }
  };

  const handleCancel = async () => {
    try {
      const response = await base44.functions.invoke("cancelRankedMatch", {
        ranked_match_id: match.id,
        reason: "Cancelled from ranked match room",
      });

      if (response.data?.success) {
        toast({ title: "Ranked match cancelled" });
        navigate("/ranked");
      } else {
        toast({ title: "Cancel failed", description: response.data?.error || "Could not cancel match.", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Cancel failed", description: error.message || "Could not cancel match.", variant: "destructive" });
    }
  };

  const handleCancelVote = async (action) => {
    setCancelVoting(true);
    try {
      const response = await base44.functions.invoke("voteRankedCancellation", {
        ranked_match_id: match.id,
        action,
      });
      if (!response.data?.success) {
        toast({ title: "Cancel vote failed", description: response.data?.error || "Could not update the vote.", variant: "destructive" });
        return;
      }
      setMatch(response.data.match || match);
      toast({
        title: action === "request" ? "Cancel vote requested" : action === "approve" ? "Cancellation approved" : "Cancellation rejected",
        description: action === "request" ? "Waiting for the opposing captain." : undefined,
      });
    } catch (error) {
      toast({ title: "Cancel vote failed", description: error.message || "Could not update the vote.", variant: "destructive" });
    } finally {
      setCancelVoting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-cyan/20 border-t-cyan rounded-full animate-spin mx-auto mb-4" />
          <p className="text-vapor">Loading ranked match...</p>
        </div>

        {match?.status === "completed" && personalResult && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
            <div className={`w-full max-w-md rounded-3xl border p-7 text-center shadow-2xl ${personalResult.won ? "border-green/30 bg-card" : "border-red-500/30 bg-card"}`}>
              <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-2xl ${personalResult.won ? "bg-green/15 text-green" : "bg-red-500/15 text-red-400"}`}>
                <Trophy className="h-8 w-8" />
              </div>
              <p className={`mt-5 text-xs font-black uppercase tracking-[0.22em] ${personalResult.won ? "text-green" : "text-red-400"}`}>{personalResult.won ? "Victory" : "Defeat"}</p>
              <h2 className="mt-2 text-3xl font-black">{match.confirmed_score_alpha ?? match.winner_score} - {match.confirmed_score_bravo ?? match.loser_score}</h2>
              <div className="mt-6 rounded-2xl border border-white/5 bg-background/40 p-5">
                <p className="text-[10px] font-black uppercase tracking-wider text-vapor">Your ELO change</p>
                <p className={`mt-2 font-mono text-4xl font-black ${personalResult.won ? "text-green" : "text-red-400"}`}>{personalResult.delta > 0 ? "+" : ""}{personalResult.delta} ELO</p>
                <p className="mt-2 text-xs text-vapor">{personalResult.previous_elo} → {personalResult.new_elo} ELO</p>
              </div>
              <button onClick={() => navigate("/ranked", { replace: true })} className="mt-6 w-full rounded-xl bg-cyan px-5 py-3.5 text-sm font-black uppercase tracking-wider text-background">Continue to Ranked</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (!match) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">Match Not Found</h2>
          <Link to="/ranked" className="text-cyan hover:underline">Back to Ranked</Link>
        </div>
      </div>
    );
  }

  const predictedWinnerId = scoreWinner(match, scoreA, scoreB);
  const predictedWinnerName = predictedWinnerId === match.host_id ? match.host_name : match.challenger_name;

  return (
    <div className="min-h-screen bg-obsidian py-6">
      <div className="max-w-[1600px] mx-auto px-4 lg:px-6">
        <div className="glass rounded-xl border border-cyan/20 p-6 mb-6">
          <div className="flex flex-col lg:flex-row items-center justify-between gap-6">
            <div className="w-full lg:w-auto">
              <div className="flex items-center gap-3 mb-2">
                <span className={`w-3 h-3 rounded-full ${match.status === "completed" ? "bg-green" : "bg-cyan animate-pulse"}`} />
                <span className="text-xs font-mono font-semibold text-cyan uppercase tracking-wider">
                  Ranked Match - {formatStatus(match.status)}
                </span>
              </div>
              <p className="text-sm text-vapor font-mono">
                {match.team_size} {match.game_mode_display || match.game_mode} - {match.final_map_name || "Map pending"}
              </p>
              <p className="text-[10px] text-vapor font-mono mt-1">Match ID: #{match.id?.slice(-8)}</p>
            </div>

            <div className="flex-1 flex items-center justify-center gap-4 md:gap-6 lg:gap-8">
              <div className="text-center">
                <p className="text-lg md:text-xl lg:text-2xl font-black text-cyan mb-1">TEAM ALPHA</p>
                <p className="text-xs text-vapor">{match.host_name}</p>
              </div>
              <div className="flex items-center gap-2 md:gap-3 lg:gap-4">
                <input
                  type="number"
                  value={scoreA}
                  disabled={!canSubmitScore}
                  min="0"
                  max={winsNeeded}
                  onChange={(event) => setScoreA(Math.min(winsNeeded, Math.max(0, Number(event.target.value))))}
                  className="w-14 md:w-16 lg:w-20 text-center bg-secondary border border-white/5 rounded-lg py-2 md:py-3 lg:py-4 text-3xl md:text-4xl lg:text-5xl font-black font-mono text-cyan focus:outline-none focus:border-cyan/30 disabled:opacity-60"
                />
                <span className="text-2xl md:text-3xl lg:text-4xl text-vapor font-bold">-</span>
                <input
                  type="number"
                  value={scoreB}
                  disabled={!canSubmitScore}
                  min="0"
                  max={winsNeeded}
                  onChange={(event) => setScoreB(Math.min(winsNeeded, Math.max(0, Number(event.target.value))))}
                  className="w-14 md:w-16 lg:w-20 text-center bg-secondary border border-white/5 rounded-lg py-2 md:py-3 lg:py-4 text-3xl md:text-4xl lg:text-5xl font-black font-mono text-orange focus:outline-none focus:border-orange/30 disabled:opacity-60"
                />
              </div>
              <div className="text-center">
                <p className="text-lg md:text-xl lg:text-2xl font-black text-orange mb-1">TEAM BRAVO</p>
                <p className="text-xs text-vapor">{match.challenger_name || "Opponent pending"}</p>
              </div>
            </div>

            {timeRemaining && (
              <div className={`px-3 md:px-4 py-2 md:py-3 rounded-lg font-mono font-bold text-sm flex flex-col items-center ${
                timeRemaining === "EXPIRED" ? "bg-red-500/20 text-red-400" : "bg-cyan/10 text-cyan"
              }`}>
                <Clock className="w-3 h-3 md:w-4 md:h-4 mb-1" />
                <span>{timeRemaining}</span>
                <span className="text-[8px] md:text-[9px] uppercase">Deadline</span>
              </div>
            )}
          </div>
        </div>

        {match.status === "completed" && (
          <div className="glass rounded-xl border border-green/20 bg-green/5 p-5 mb-6 flex items-center gap-3">
            <Trophy className="w-5 h-5 text-green" />
            <div>
              <p className="font-bold text-green">Winner: {match.winner_name}</p>
              <p className="text-xs text-vapor">Final score {match.winner_score}-{match.loser_score}</p>
            </div>
          </div>
        )}

        <div className="mb-4">
          <MapVetoVertical wager={match} ranked compact />
        </div>

        <div className="grid lg:grid-cols-12 gap-6 mb-6">
          <div className={`${arenaHeightClass(slotsPerRankedTeam(match))} lg:col-span-3`}>
            <PlayerPanel label="Team Alpha" color="cyan" players={alphaPlayers} slots={slotsPerRankedTeam(match)} />
          </div>
          <div className="min-w-0 lg:col-span-6">
            <MatchChat
              conversationId={match.id}
              matchType="ranked"
              accent="cyan"
              compact
              sticky={false}
              heightClass={arenaHeightClass(slotsPerRankedTeam(match))}
            />
          </div>
          <div className={`${arenaHeightClass(slotsPerRankedTeam(match))} lg:col-span-3`}>
            <PlayerPanel label="Team Bravo" color="orange" players={bravoPlayers} slots={slotsPerRankedTeam(match)} />
          </div>
        </div>

        <div className="glass rounded-xl border border-white/5 p-4 mb-6">
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleReportScore}
              disabled={!canSubmitScore || !scoreIsValid || submitting}
              className="flex-1 min-w-[200px] py-3 bg-green/10 text-green font-bold text-sm rounded-lg border border-green/20 hover:bg-green/20 transition-all uppercase tracking-wider flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Check className="w-4 h-4" /> {submitting ? "Submitting..." : "Submit Score"}
            </button>
            <button
              onClick={() => handleSupportTicket("I need support for this ranked match.")}
              disabled={supporting}
              className="px-6 py-3 bg-cyan/10 text-cyan font-bold text-sm rounded-lg border border-cyan/20 hover:bg-cyan/20 transition-all uppercase tracking-wider flex items-center gap-2 disabled:opacity-50"
            >
              <HelpCircle className="w-4 h-4" /> {supporting ? "Requesting..." : "Request Admin"}
            </button>
            <button
              onClick={handleCreateDispute}
              disabled={disputing || !isParticipant}
              className="px-6 py-3 bg-orange/10 text-orange font-bold text-sm rounded-lg border border-orange/20 hover:bg-orange/20 transition-all uppercase tracking-wider disabled:opacity-50"
            >
              {disputing ? "Submitting..." : "Submit Dispute"}
            </button>
            <button
              onClick={() => handleSupportTicket("Opponent no-show report.")}
              disabled={supporting || !isParticipant}
              className="px-6 py-3 bg-secondary/50 text-vapor font-bold text-sm rounded-lg border border-white/5 hover:bg-secondary transition-all uppercase tracking-wider flex items-center gap-2 disabled:opacity-50"
            >
              <Flag className="w-4 h-4" /> Report No Show
            </button>
            <button
              onClick={loadRoom}
              className="px-4 py-3 bg-secondary/50 text-vapor font-bold text-sm rounded-lg border border-white/5 hover:bg-secondary transition-all"
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            {isStaff && !["completed", "cancelled"].includes(match.status) && (
              <button
                onClick={handleCancel}
                className="px-6 py-3 bg-red-500/10 text-red-400 font-bold text-sm rounded-lg border border-red-500/20 hover:bg-red-500/20 transition-all uppercase tracking-wider"
              >
                Staff Cancel
              </button>
            )}
            {isHost && !isStaff && joinedOpponentCount === 0 && !["completed", "cancelled"].includes(match.status) && <button onClick={handleCancel} className="rounded-lg border border-red-500/20 bg-red-500/10 px-6 py-3 text-sm font-bold uppercase tracking-wider text-red-400 hover:bg-red-500/20">Cancel Open Match</button>}
            {isHost && !isStaff && joinedOpponentCount > 0 && !["completed", "cancelled"].includes(match.status) && (
              <button
                onClick={() => handleCancelVote("request")}
                disabled={cancelVoting || cancelVoteLocked || ["pending", "rejected", "approved"].includes(match.cancel_vote_status)}
                className="rounded-lg border border-red-500/20 bg-red-500/10 px-6 py-3 text-sm font-bold uppercase tracking-wider text-red-400 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {cancelVoteLocked ? `Vote in ${timeRemaining || "15:00"}` : match.cancel_vote_status === "pending" ? "Waiting for Captain" : match.cancel_vote_status === "rejected" ? "Vote Rejected" : "Request Cancel Vote"}
              </button>
            )}
            {isOpposingCaptain && match.cancel_vote_status === "pending" && !["completed", "cancelled"].includes(match.status) && (
              <div className="flex gap-2">
                <button onClick={() => handleCancelVote("approve")} disabled={cancelVoting} className="rounded-lg border border-green/25 bg-green/10 px-5 py-3 text-xs font-black uppercase tracking-wider text-green disabled:opacity-40">Approve Cancel</button>
                <button onClick={() => handleCancelVote("reject")} disabled={cancelVoting} className="rounded-lg border border-white/10 bg-secondary px-5 py-3 text-xs font-black uppercase tracking-wider text-vapor disabled:opacity-40">Reject</button>
              </div>
            )}
          </div>
          {(match.admin_request_status || match.requested_admin) && (
            <p className="text-xs text-vapor mt-3">
              Admin request: {{
                waiting_for_admin: "Waiting for admin",
                admin_joined: "Admin joined",
                waiting_for_user: "Waiting for user",
                escalated: "Escalated",
                resolved: "Resolved",
                closed: "Closed",
              }[match.admin_request_status || "waiting_for_admin"] || "Waiting for admin"}
            </p>
          )}
          {predictedWinnerName && canSubmitScore && scoreIsValid && (
            <p className="text-xs text-vapor mt-3 flex items-center gap-2">
              <Shield className="w-3.5 h-3.5 text-cyan" />
              Current score would report {predictedWinnerName} as winner.
            </p>
          )}
          {match.reported_score_by && !["completed", "score_conflict"].includes(match.status) && (
            <p className="text-xs text-yellow-400 mt-3">
              A score has already been submitted. The opponent must submit the same score to complete the match.
            </p>
          )}
        </div>
      </div>

      {match.status === "completed" && personalResult && (
        <RankedResultOverlay match={match} result={personalResult} onContinue={() => navigate("/ranked", { replace: true })} />
      )}

      {false && match.status === "completed" && personalResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className={`w-full max-w-md rounded-3xl border p-7 text-center shadow-2xl ${personalResult.won ? "border-green/30 bg-card" : "border-red-500/30 bg-card"}`}>
            <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-2xl ${personalResult.won ? "bg-green/15 text-green" : "bg-red-500/15 text-red-400"}`}>
              <Trophy className="h-8 w-8" />
            </div>
            <p className={`mt-5 text-xs font-black uppercase tracking-[0.22em] ${personalResult.won ? "text-green" : "text-red-400"}`}>{personalResult.won ? "Victory" : "Defeat"}</p>
            <h2 className="mt-2 text-3xl font-black">{match.confirmed_score_alpha ?? match.winner_score} - {match.confirmed_score_bravo ?? match.loser_score}</h2>
            <div className="mt-6 rounded-2xl border border-white/5 bg-background/40 p-5">
              <p className="text-[10px] font-black uppercase tracking-wider text-vapor">Your ELO change</p>
              <p className={`mt-2 font-mono text-4xl font-black ${personalResult.won ? "text-green" : "text-red-400"}`}>{personalResult.delta > 0 ? "+" : ""}{personalResult.delta} ELO</p>
              <p className="mt-2 text-xs text-vapor">{personalResult.previous_elo} → {personalResult.new_elo} ELO</p>
            </div>
            <button onClick={() => navigate("/ranked", { replace: true })} className="mt-6 w-full rounded-xl bg-cyan px-5 py-3.5 text-sm font-black uppercase tracking-wider text-background">Continue to Ranked</button>
          </div>
        </div>
      )}
    </div>
  );
}
