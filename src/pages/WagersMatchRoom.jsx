import React, { useRef, useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion, useTransform } from "framer-motion";
import {
  AlertTriangle, Clock, Check,
  AlertCircle, Award, Crown, DollarSign, Medal, RefreshCw, ShieldCheck, Sparkles, Trophy, X
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/use-toast";
import MatchRoomChat from "@/components/match/MatchRoomChat";
import MatchTeamTable from "@/components/match/MatchTeamTable";
import MatchRulesPanel from "@/components/match/MatchRulesPanel";
import MatchMapSeries from "@/components/match/MatchMapSeries";
import { loadWagerParticipants } from "@/lib/wagerParticipants";
import UserBadges from "@/components/ui/UserBadges";
import ActivisionIdLabel from "@/components/competition/ActivisionIdLabel";
import PageLoader from "@/components/ui/PageLoader";
import { wagerPlayRule } from "@/lib/wagerRules";
import { isStaffUser } from "@/lib/roles";

const formatStatus = (value) => String(value || "open").replace(/_/g, " ");
const formatDate = (value) => value ? new Date(value).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "Pending";
const formatMoney = (value) => `$${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const playerName = (player) => player?.full_name || player?.username || player?.user_name || "Open slot";
const wagerMapText = (match, pendingText = "Map pending") => {
  const seriesMaps = Array.isArray(match?.series_maps) ? match.series_maps.filter(Boolean) : [];
  return seriesMaps.length > 0 ? seriesMaps.join(" · ") : (match?.final_map_name || pendingText);
};

const matchPhaseFor = (match) => ({
  open: "Waiting for opponent",
  accepted: "Setup",
  escrow_paid: "Setup",
  map_veto: "Map veto",
  ready: "Ready",
  in_progress: "Live",
  awaiting_team_alpha_report: "Score confirmation",
  awaiting_team_bravo_report: "Score confirmation",
  awaiting_completion: "Score confirmation",
  score_conflict: "Under review",
  disputed: "Under review",
  completed: "Complete",
  cancelled: "Cancelled",
}[match?.status] || "Live");

const buildActivity = (match) => [
  { label: "Match created", date: match.created_date, complete: Boolean(match.created_date) },
  { label: "Teams joined", date: match.accepted_date, complete: Boolean(match.challenger_id || match.accepted_date) },
  { label: "Admin requested", date: match.admin_request_updated_date, complete: Boolean(match.requested_admin || match.admin_request_status) },
  { label: "Match started", date: match.match_started_date, complete: Boolean(match.match_started_date || ["ready", "in_progress", "awaiting_team_alpha_report", "awaiting_team_bravo_report", "awaiting_completion", "score_conflict", "disputed", "completed"].includes(match.status)) },
  { label: "Score submitted", date: match.reported_score_date || match.host_reported_score_date || match.challenger_reported_score_date, complete: Boolean(match.reported_score_by || match.reported_score_date) },
  { label: "Dispute opened", date: match.disputed_date, complete: Boolean(match.dispute_id || ["disputed", "score_conflict"].includes(match.status)) },
  { label: "Admin resolved", date: match.admin_request_resolved_date, complete: match.admin_request_status === "resolved" },
];

function InfoRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/5 py-2 last:border-0">
      <span className="text-[10px] uppercase tracking-wider text-vapor">{label}</span>
      <span className="text-sm font-semibold text-right capitalize">{value || "Pending"}</span>
    </div>
  );
}

function SimpleRoster({ title, name, players, tone = "cyan", score, isComplete = false, isWinner = false }) {
  const color = tone === "cyan" ? "text-cyan border-cyan/20 bg-cyan/5" : "text-orange border-orange/20 bg-orange/5";

  return (
    <section className={`dark-focus dark-media rounded-xl border ${tone === "cyan" ? "border-cyan/20" : "border-orange/20"} overflow-hidden`}>
      <div className={`flex items-center justify-between gap-4 border-b px-5 py-4 ${color}`}>
        <div className="min-w-0">
          <h2 className="text-xs font-black uppercase tracking-[0.16em]">{title}</h2>
          {name && <p className="mt-1 truncate text-xl font-black text-white">{name}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {isWinner ? <span className="inline-flex items-center gap-1 rounded-md border border-green/25 bg-green/10 px-2 py-1 text-[8px] font-black uppercase tracking-wider text-green"><Trophy className="h-3 w-3" /> Winner</span> : null}
          {isComplete && score !== undefined ? <div className={`min-w-16 rounded-xl border bg-black/20 px-3 py-2 text-center ${isWinner ? "border-green/25" : "border-white/10"}`}><p className="text-[7px] font-black uppercase tracking-wider text-vapor">Final score</p><p className={`mt-1 font-mono text-2xl font-black ${isWinner ? "text-green" : tone === "cyan" ? "text-cyan" : "text-orange"}`}>{score}</p></div> : null}
        </div>
      </div>
      <div className="space-y-3 p-3">
        {players.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-vapor">Waiting for roster</div>
        ) : players.map((player, index) => (
          <div key={player.id || player.user_id || index} className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
            <div className="flex items-start gap-3">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg font-mono text-sm font-black text-background ${tone === "cyan" ? "bg-cyan" : "bg-orange"}`}>
                {playerName(player).charAt(0)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-black">{playerName(player)}</p>
                  <UserBadges user={player} size="xs" iconOnly streamerHref="/streamer-tournaments" />
                </div>
                <ActivisionIdLabel user={player} className="mt-1 max-w-full" />
                <p className={`mt-1 text-[10px] uppercase tracking-wider ${player.payment_status === "pending" ? "text-orange" : "text-green"}`}>
                  {player.payment_status === "pending" ? "Payment pending" : "Ready"}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[9px] font-black uppercase tracking-wider text-vapor">W-L</p>
                <p className="font-mono text-sm font-black">{player.wager_wins || 0}-{player.wager_losses || 0}</p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-2">
              <div className="rounded-lg border border-green/15 bg-green/5 px-3 py-2">
                <p className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-vapor"><DollarSign className="h-3 w-3 text-green" /> Lifetime earnings</p>
                <p className="mt-1 font-mono text-sm font-black text-green">{formatMoney(player.lifetime_earnings)}</p>
              </div>
            </div>

            <div className="mt-3">
              <p className="mb-2 text-[9px] font-black uppercase tracking-wider text-vapor">Trophy case</p>
              <div className="grid grid-cols-5 gap-1.5">
                {[
                  ["Gold", player.gold_count, Trophy, "text-yellow-400 border-yellow-400/15 bg-yellow-400/5"],
                  ["Silver", player.silver_count, Medal, "text-slate-300 border-slate-300/15 bg-slate-300/5"],
                  ["Bronze", player.bronze_count, Award, "text-amber-600 border-amber-600/15 bg-amber-600/5"],
                  ["Premium", player.premium_count, Crown, "text-purple-300 border-purple-300/15 bg-purple-300/5"],
                  ["Champion", player.champion_count, Sparkles, "text-cyan border-cyan/15 bg-cyan/5"],
                ].map(([label, count, Icon, classes]) => (
                  <div key={label} title={`${label} trophies`} className={`rounded-lg border px-1 py-2 text-center ${classes}`}>
                    <Icon className="mx-auto h-3.5 w-3.5" />
                    <p className="mt-1 font-mono text-xs font-black">{Number(count || 0)}</p>
                    <p className="mt-0.5 truncate text-[7px] font-bold uppercase tracking-tight">{label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function MatchStatusCard({ match }) {
  return (
    <section className="glass rounded-xl border border-white/5 p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-black uppercase tracking-wider">Match Status</h2>
        <span className="rounded-md border border-cyan/20 bg-cyan/10 px-2 py-1 text-[10px] font-bold uppercase text-cyan">
          {matchPhaseFor(match)}
        </span>
      </div>
      <InfoRow label="Mode" value={match.game_mode_display || match.game_mode} />
      <InfoRow label="Input / platform" value={wagerPlayRule(match.play_rule).shortLabel} />
      <InfoRow label="Map rotation" value={wagerMapText(match)} />
      <InfoRow label="Host" value={match.host_name || "Host pending"} />
      <InfoRow label="Server" value={match.server || match.server_region || match.region || "Platform lobby"} />
      <InfoRow label="Current status" value={formatStatus(match.status)} />
      <InfoRow label="Match phase" value={matchPhaseFor(match)} />
    </section>
  );
}

function ActivityTimeline({ match }) {
  return (
    <section className="glass rounded-xl border border-white/5 p-5">
      <h2 className="mb-4 text-sm font-black uppercase tracking-wider">Recent Activity</h2>
      <div className="space-y-3">
        {buildActivity(match).map((item) => (
          <div key={item.label} className="flex gap-3">
            <div className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${item.complete ? "bg-cyan" : "bg-vapor/30"}`} />
            <div className="min-w-0">
              <p className={`text-sm font-semibold ${item.complete ? "text-foreground" : "text-vapor"}`}>{item.label}</p>
              <p className="text-[10px] uppercase tracking-wider text-vapor">{item.complete ? formatDate(item.date) : "Pending"}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function WagerMoneyResultOverlay({ wager, result, onContinue }) {
  const reduceMotion = useReducedMotion();
  const balance = useMotionValue(Number(result.previous_balance || 0));
  const displayedBalance = useTransform(balance, (value) => formatMoney(value));
  const [showContinue, setShowContinue] = useState(Boolean(reduceMotion));
  const won = Boolean(result.won);
  const delta = Number(result.match_delta || 0);
  const alphaScore = wager.confirmed_score_alpha ?? (wager.winner_id === wager.host_id ? wager.winner_score : wager.loser_score);
  const bravoScore = wager.confirmed_score_bravo ?? (wager.winner_id === wager.challenger_id ? wager.winner_score : wager.loser_score);

  useEffect(() => {
    balance.set(Number(result.previous_balance || 0));
    if (reduceMotion) {
      balance.set(Number(result.new_balance || 0));
      setShowContinue(true);
      return undefined;
    }
    setShowContinue(false);
    const controls = animate(balance, Number(result.new_balance || 0), {
      delay: 0.72,
      duration: 1.55,
      ease: [0.22, 1, 0.36, 1],
      onComplete: () => setShowContinue(true),
    });
    return () => controls.stop();
  }, [balance, reduceMotion, result.new_balance, result.previous_balance]);

  return (
    <motion.div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <motion.div initial={{ opacity: 0, y: 32, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }} className={`relative w-full max-w-md overflow-hidden rounded-3xl border bg-card p-7 text-center shadow-2xl ${won ? "border-green/35" : "border-red-500/35"}`}>
        <motion.div className={`absolute inset-x-0 top-0 h-1 origin-left ${won ? "bg-green" : "bg-red-500"}`} initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ delay: 0.15, duration: 0.7 }} />
        <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-2xl ${won ? "bg-green/15 text-green" : "bg-red-500/15 text-red-400"}`}><DollarSign className="h-8 w-8" /></div>
        <p className={`mt-5 text-xs font-black uppercase tracking-[0.24em] ${won ? "text-green" : "text-red-400"}`}>{won ? "Wager won" : "Wager lost"}</p>
        <h2 className="mt-2 text-4xl font-black">{alphaScore ?? 0} - {bravoScore ?? 0}</h2>

        <div className="mt-6 rounded-2xl border border-white/5 bg-background/45 p-5">
          <p className="text-[10px] font-black uppercase tracking-wider text-vapor">Wallet balance</p>
          <motion.p className={`mt-2 font-mono text-4xl font-black tabular-nums ${won ? "text-green" : "text-red-400"}`}>{displayedBalance}</motion.p>
          <p className={`mt-2 font-mono text-lg font-black ${delta > 0 ? "text-green" : delta < 0 ? "text-red-400" : "text-vapor"}`}>{delta > 0 ? `+${formatMoney(delta)}` : delta < 0 ? `-${formatMoney(Math.abs(delta))}` : formatMoney(0)}</p>
          <p className="mt-1 text-[10px] font-black uppercase tracking-wider text-vapor">{delta > 0 ? "Net profit" : delta < 0 ? "Entry lost" : "No personal balance change"}</p>
          <div className="mt-4 flex justify-between text-xs text-vapor"><span>{formatMoney(result.previous_balance)}</span><span>→</span><span className="font-bold text-white">{formatMoney(result.new_balance)}</span></div>
        </div>

        <AnimatePresence>{showContinue && <motion.button initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} onClick={onContinue} className="mt-6 w-full rounded-xl bg-green px-5 py-3.5 text-sm font-black uppercase tracking-wider text-background">Continue to wagers</motion.button>}</AnimatePresence>
      </motion.div>
    </motion.div>
  );
}

export default function WagersMatchRoom() {
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
  const [submitting, setSubmitting] = useState(false);
  const [requestingAdmin, setRequestingAdmin] = useState(false);
  const [payingEntry, setPayingEntry] = useState(false);
  const [resolvingAdmin, setResolvingAdmin] = useState(false);
  const joinedAdminRooms = useRef(new Set());
  const rosterSignatureRef = useRef("");
  const [resultDismissed, setResultDismissed] = useState(false);
  const [scoreModalOpen, setScoreModalOpen] = useState(false);

  useEffect(() => {
    setLoading(true);
    loadUser();
    loadWager();
  }, [id]);

  useEffect(() => {
    if (!id) return undefined;
    let active = true;
    let refreshing = false;
    const refresh = async () => {
      if (refreshing || document.visibilityState === "hidden") return;
      refreshing = true;
      try {
        const [latest, participantRows] = await Promise.all([
          base44.entities.Wager.getFresh(id),
          base44.entities.WagerParticipant.filterFresh({ wager_id: id }, "joined_date", 20).catch(() => []),
        ]);
        if (!active || !latest) return;
        setWager(latest);
        const signature = (participantRows || []).map((participant) => `${participant.user_id}:${participant.team}:${participant.payment_status}`).sort().join("|");
        if (signature === rosterSignatureRef.current) return;
        const participants = await loadWagerParticipants(base44, latest, { participantRows, fresh: true });
        if (!active) return;
        rosterSignatureRef.current = signature;
        setTeamAPlayers(participants.teamAPlayers);
        setTeamBPlayers(participants.teamBPlayers);
      } catch (error) {
        console.error("Failed to refresh wager match:", error);
      } finally {
        refreshing = false;
      }
    };
    const interval = setInterval(refresh, 3000);
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

  useEffect(() => {
    if (!wager?.id || !user?.id || !isStaffUser(user)) return;
    if (!wager.requested_admin || !wager.admin_request_ticket_id) return;
    if (["admin_joined", "resolved", "closed"].includes(wager.admin_request_status)) return;
    if (joinedAdminRooms.current.has(wager.id)) return;

    joinedAdminRooms.current.add(wager.id);
    base44.functions.invoke("joinMatchRoomAsAdmin", {
      match_type: "wager",
      match_id: wager.id,
      ticket_id: wager.admin_request_ticket_id,
    }).then((response) => {
      if (response.data?.success && response.data?.match) {
        setWager(response.data.match);
      }
    }).catch((error) => {
      console.error("Failed to join wager room as admin:", error);
    });
  }, [wager?.id, wager?.requested_admin, wager?.admin_request_status, wager?.admin_request_ticket_id, user]);

  const loadWager = async () => {
    try {
      const [wagerData, participantRows] = await Promise.all([
        base44.entities.Wager.getFresh(id),
        base44.entities.WagerParticipant.filterFresh({ wager_id: id }, "joined_date", 20).catch(() => []),
      ]);
      setWager(wagerData);

      const { teamAPlayers, teamBPlayers } = await loadWagerParticipants(base44, wagerData, { participantRows, fresh: true });
      rosterSignatureRef.current = (participantRows || []).map((participant) => `${participant.user_id}:${participant.team}:${participant.payment_status}`).sort().join("|");
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
    const submittedScoreA = Number(scoreA || 0);
    const submittedScoreB = Number(scoreB || 0);
    if (submittedScoreA === submittedScoreB) {
      toast({ title: "Invalid score", description: "Scores cannot be tied", variant: "destructive" });
      return;
    }
    
    // Determine which team the current user is on
    const isHost = user?.id === wager.host_id;
    const team = isHost ? 'host' : 'challenger';
    
    setSubmitting(true);
    try {
      const response = await base44.functions.invoke('submitScore', { 
        wager_id: wager.id, 
        team: team, 
        team_alpha_score: submittedScoreA,
        team_bravo_score: submittedScoreB,
        proof_urls: []
      });
      
      if (response.data.success) {
        setScoreModalOpen(false);
        if (response.data.ready_to_complete) {
          const completeResponse = await base44.functions.invoke('completeWager', {
            wager_id: wager.id,
            winner_id: response.data.winner_id,
            team_alpha_score: submittedScoreA,
            team_bravo_score: submittedScoreB,
            proof_urls: []
          });
          if (!completeResponse.data.success) {
            toast({ title: "Failed to complete match", description: completeResponse.data.error || "Unknown error", variant: "destructive" });
            return;
          }
          toast({ 
            title: "Match completed!", 
            description: `${response.data.winner_name} won ${response.data.winner_score}-${response.data.loser_score}` 
          });
          setWager(completeResponse.data.wager || { ...wager, status: "completed", winner_id: completeResponse.data.winner_id, winner_name: completeResponse.data.winner_name, wallet_changes: completeResponse.data.wallet_changes });
        } else if (response.data.status === 'score_conflict') {
          toast({ 
            title: "Score conflict detected", 
            description: "Dispute opened automatically - admin will review", 
            variant: "destructive" 
          });
          await loadWager();
        } else {
          toast({ 
            title: "Score submitted", 
            description: response.data.message 
          });
          await loadWager();
        }
      } else {
        toast({ title: "Failed to report score", description: response.data.error || "Unknown error", variant: "destructive" });
      }
    } catch (error) {
      console.error("Failed to report score:", error);
      toast({ title: "Error", description: error.message || "Failed to report score", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleRequestAdmin = async (reason) => {
    setRequestingAdmin(true);
    try {
      const response = await base44.functions.invoke("requestAdminAlert", {
        match_type: "wager",
        match_id: wager.id,
        subject: `Wager match admin request ${wager.id}`,
        description: `${reason}\n\nMatch: ${wager.id}\nPlayers: ${wager.host_name || "Host unavailable"} vs ${wager.challenger_name || "Opponent pending"}`,
        priority: "high",
      });

      if (response.data?.success) {
        toast({ title: "Admin requested", description: "A staff alert and support ticket were created." });
        await loadWager();
      } else {
        toast({ title: "Request failed", description: response.data?.error || "Could not request admin.", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Request failed", description: error.message || "Could not request admin.", variant: "destructive" });
    } finally {
      setRequestingAdmin(false);
    }
  };

  const handlePayEntry = async () => {
    setPayingEntry(true);
    try {
      const response = await base44.functions.invoke("payWagerEntry", {
        wager_id: wager.id,
      });
      if (response.data?.success) {
        toast({
          title: "Entry paid",
          description: response.data.ready ? "All players are paid. Match is live." : "Waiting for remaining players.",
        });
        await loadWager();
      } else {
        toast({ title: "Payment failed", description: response.data?.error || "Could not pay wager entry.", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Payment failed", description: error.message || "Could not pay wager entry.", variant: "destructive" });
    } finally {
      setPayingEntry(false);
    }
  };

  const handleCreateDispute = async () => {
    const evidenceText = typeof window !== "undefined" ? window.prompt("Evidence URLs (comma or line separated):", "") : "";
    if (evidenceText === null) return;
    const evidenceUrls = evidenceText.split(/[\n,]+/).map((url) => url.trim()).filter(Boolean);
    setRequestingAdmin(true);
    try {
      const response = await base44.functions.invoke("createDispute", {
        match_type: "wager",
        match_id: wager.id,
        wager_id: wager.id,
        reason: "score_dispute",
        description: `Dispute submitted from wager room ${wager.id}. ${wager.host_name || "Host"} vs ${wager.challenger_name || "Opponent"}`,
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
      setRequestingAdmin(false);
    }
  };

  const handleAdminResolve = async (action) => {
    const teamName = action === "approve_team_a"
      ? (wager.host_team_name || wager.host_name || "Team Alpha")
      : (wager.challenger_team_name || wager.challenger_name || "Team Bravo");
    const confirmed = typeof window === "undefined"
      ? true
      : window.confirm(`Grant win to ${teamName} and auto-loss the other team?`);
    if (!confirmed) return;

    setResolvingAdmin(true);
    try {
      const response = await base44.functions.invoke("adminResolveMatchRoom", {
        match_type: "wager",
        match_id: wager.id,
        ticket_id: wager.admin_request_ticket_id,
        action,
        reason: `Admin granted ${teamName} the win.`,
      });

      if (response.data?.success) {
        toast({ title: "Match resolved", description: response.data.message || `${teamName} was granted the win.` });
        await loadWager();
      } else {
        toast({ title: "Resolve failed", description: response.data?.error || "Could not resolve match.", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Resolve failed", description: error.message || "Could not resolve match.", variant: "destructive" });
    } finally {
      setResolvingAdmin(false);
    }
  };

  const handleAdminCancel = async () => {
    const confirmed = typeof window === "undefined"
      ? true
      : window.confirm("Cancel this match and refund all paid wager entries? This cannot be undone.");
    if (!confirmed) return;

    setResolvingAdmin(true);
    try {
      const response = await base44.functions.invoke("refundWager", {
        wager_id: wager.id,
        reason: `Cancelled by staff (${user?.full_name || user?.username || user?.email || "Admin"}).`,
      });
      if (response.data?.success) {
        setWager(response.data.wager || { ...wager, status: "cancelled" });
        toast({ title: "Match cancelled", description: "All paid entries were refunded." });
      } else {
        toast({ title: "Cancel failed", description: response.data?.error || "Could not cancel match.", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Cancel failed", description: error.message || "Could not cancel match.", variant: "destructive" });
    } finally {
      setResolvingAdmin(false);
    }
  };

  const handleAdminResetDispute = async () => {
    const confirmed = typeof window === "undefined" || window.confirm("Reset this dispute, clear both score reports, and let the teams continue playing?");
    if (!confirmed) return;
    setResolvingAdmin(true);
    try {
      const response = await base44.functions.invoke("adminResetMatchDispute", {
        match_type: "wager",
        match_id: wager.id,
      });
      if (!response.data?.success) {
        toast({ title: "Reset failed", description: response.data?.error || "Could not reset dispute.", variant: "destructive" });
        return;
      }
      setScoreA(0);
      setScoreB(0);
      setWager(response.data.match || wager);
      toast({ title: "Dispute reset", description: "Both teams can continue and submit new score reports." });
    } catch (error) {
      toast({ title: "Reset failed", description: error.message || "Could not reset dispute.", variant: "destructive" });
    } finally {
      setResolvingAdmin(false);
    }
  };

  if (loading) {
    return <PageLoader label="Loading wager match" />;
  }

  if (!wager) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">Match Not Found</h2>
          <Link to="/wagers" className="text-green hover:underline">Back to Wagers</Link>
        </div>
      </div>
    );
  }

  const prizePool = Number(wager.total_prize_pool ?? ((wager.entry_fee || 0) * 2));
  const bestOf = wager.best_of || 1;
  const currentParticipant = [...teamAPlayers, ...teamBPlayers].find((player) => player.user_id === user?.id);
  const needsPayment = currentParticipant?.payment_status === "pending";
  const isStaff = isStaffUser(user);
  const canAdminResolve = isStaff && wager.status !== "completed" && wager.status !== "cancelled" && Boolean(wager.challenger_id);
  const isWaitingForOpponent = !wager.challenger_id || wager.status === "open";
  const canUseMatchRoom = Boolean(wager.challenger_id) && wager.status !== "open";
  const isHostCaptain = user?.id === wager.host_id;
  const isChallengerCaptain = user?.id === wager.challenger_id;
  const currentReportPrefix = isHostCaptain ? "host" : isChallengerCaptain ? "challenger" : null;
  const currentTeamHasReported = currentReportPrefix
    ? wager[`${currentReportPrefix}_reported_score_alpha`] !== undefined
      && wager[`${currentReportPrefix}_reported_score_alpha`] !== null
      && wager[`${currentReportPrefix}_reported_score_bravo`] !== undefined
      && wager[`${currentReportPrefix}_reported_score_bravo`] !== null
    : false;
  const scoreReportingOpen = ["in_progress", "awaiting_team_alpha_report", "awaiting_team_bravo_report"].includes(wager.status);
  const canReportScore = canUseMatchRoom
    && scoreReportingOpen
    && Boolean(currentReportPrefix)
    && !currentTeamHasReported;

  if (wager.status === "cancelled") {
    return (
      <div className="min-h-screen bg-obsidian py-8">
        <div className="mx-auto max-w-2xl px-4 lg:px-6">
          <section className="glass overflow-hidden rounded-2xl border border-orange/20">
            <div className="border-b border-white/5 bg-gradient-to-r from-orange/10 via-secondary/60 to-red-500/5 p-7 text-center sm:p-10">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-orange/20 bg-orange/10 text-orange">
                <RefreshCw className="h-6 w-6" />
              </div>
              <p className="mt-5 text-[10px] font-black uppercase tracking-[0.22em] text-orange">Wager cancelled</p>
              <h1 className="mt-2 text-3xl font-black">Entry refunded</h1>
              <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-vapor">
                This wager is no longer active. Any reserved entry funds have been returned to the players' wallets.
              </p>
              {wager.cancel_reason && <p className="mt-3 text-xs text-vapor">Reason: {wager.cancel_reason}</p>}
            </div>
            <div className="flex flex-col gap-3 p-5 sm:flex-row sm:justify-center">
              <Link to="/wallet" className="rounded-lg bg-green px-6 py-3 text-center text-xs font-black uppercase tracking-wider text-background">View Wallet</Link>
              <Link to="/wagers" className="rounded-lg border border-white/10 bg-secondary px-6 py-3 text-center text-xs font-black uppercase tracking-wider text-vapor hover:text-white">Back to Wagers</Link>
            </div>
          </section>
        </div>
      </div>
    );
  }

  if (isWaitingForOpponent) {
    return (
      <div className="min-h-screen bg-obsidian py-8">
        <div className="mx-auto max-w-4xl px-4 lg:px-6">
          <section className="glass overflow-hidden rounded-2xl border border-cyan/20">
            <div className="border-b border-white/5 bg-gradient-to-r from-cyan/10 via-secondary/60 to-green/5 p-6 md:p-8">
              <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan">Open Wager</p>
                  <h1 className="mt-2 text-3xl font-black">Waiting for an opponent</h1>
                  <p className="mt-2 text-sm text-vapor">The match room stays locked until another player accepts this wager from the Wagers page.</p>
                </div>
                <div className="rounded-xl border border-green/20 bg-green/10 px-5 py-3 text-center">
                  <p className="text-[9px] font-black uppercase tracking-wider text-green">Prize pool after acceptance</p>
                  <p className="mt-1 font-mono text-2xl font-black text-green">{formatMoney(prizePool)}</p>
                </div>
              </div>
            </div>

            <div className="grid gap-5 p-6 md:grid-cols-[1fr_auto_1fr] md:p-8">
              <MatchTeamTable label="Team Alpha" name={wager.host_team_name || wager.host_name || "Host"} color="orange" players={teamAPlayers} captainId={wager.host_id} />
              <div className="flex items-center justify-center text-2xl font-black text-vapor">VS</div>
              <MatchTeamTable label="Team Bravo" name="Opponent pending" color="cyan" players={[]} />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/5 bg-background/25 px-6 py-4 md:px-8">
              <div className="text-xs text-vapor">{wager.game_mode_display || wager.game_mode} · Map hidden until acceptance · BO{bestOf} · {wagerPlayRule(wager.play_rule).shortLabel}</div>
              <Link to="/wagers" className="rounded-lg bg-cyan px-5 py-2.5 text-xs font-black uppercase tracking-wider text-background transition-all hover:shadow-lg hover:shadow-cyan/20">
                Back to Wagers
              </Link>
            </div>
          </section>
        </div>
      </div>
    );
  }

  const winsNeeded = Math.floor(Number(bestOf) / 2) + 1;
  const hostDisplayName = wager.host_team_name || wager.host_name || "Team Alpha";
  const challengerDisplayName = wager.challenger_team_name || wager.challenger_name || "Team Bravo";
  const isComplete = wager.status === "completed";
  const hostWinner = isComplete && String(wager.winner_id || "") === String(wager.host_id || "");
  const challengerWinner = isComplete && String(wager.winner_id || "") === String(wager.challenger_id || "");
  const personalMoneyResult = wager.wallet_changes?.[user?.id] || null;
  const dismissResult = () => {
    setResultDismissed(true);
    navigate("/wagers", { replace: true });
  };

  return (
    <div className="min-h-screen bg-obsidian py-6 sm:py-8">
      <div className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8">
        {isComplete && personalMoneyResult && !resultDismissed && <WagerMoneyResultOverlay wager={wager} result={personalMoneyResult} onContinue={dismissResult} />}
        <section className="dark-focus dark-media relative mb-6 overflow-hidden rounded-2xl border border-white/[0.09] bg-[#111821] shadow-[0_24px_70px_-48px_rgba(0,0,0,.95)]">
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-20 top-0 h-px bg-gradient-to-r from-cyan/50 via-white/10 to-orange/50" />
          <div className="p-5 sm:p-6">
          <div className="flex flex-col items-start justify-between gap-5 lg:flex-row lg:items-center">
            <div>
              <div className="mb-2 flex items-center gap-3">
                <DollarSign className="h-5 w-5 text-green" />
                <span className="text-xs font-mono font-semibold uppercase tracking-wider text-green">Wager match · {matchPhaseFor(wager)}</span>
              </div>
              <h1 className="text-2xl font-black">{hostDisplayName} vs {challengerDisplayName}</h1>
              <p className="mt-1 text-sm text-vapor">{wager.game_mode_display || wager.game_mode} · {wagerMapText(wager)} · BO{bestOf} · {wagerPlayRule(wager.play_rule).shortLabel} · ID #{wager.id?.slice(-8)}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {canReportScore ? <button type="button" onClick={() => setScoreModalOpen(true)} className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-primary-foreground hover:bg-primary/90"><Check className="h-4 w-4" /> Submit score</button> : null}
              <div className="rounded-xl border border-green/20 bg-green/10 px-5 py-3 text-center">
                <p className="text-[9px] font-black uppercase tracking-wider text-green">Prize pool</p>
                <p className="mt-1 font-mono text-2xl font-black text-green">{formatMoney(prizePool)}</p>
              </div>
              <Link to="/wagers" className="rounded-lg border border-white/10 bg-white/[0.06] px-4 py-3 text-xs font-bold text-vapor transition-all hover:border-primary/30 hover:text-primary">Back to wagers</Link>
            </div>
          </div>
          </div>
          <div className="grid gap-5 border-t border-white/[0.06] p-4 lg:p-5 xl:grid-cols-[minmax(0,1fr)_410px]">
            <div className="min-w-0 space-y-4">
              <MatchTeamTable label="Team Alpha" name={hostDisplayName} color="orange" players={teamAPlayers} captainId={wager.host_id} finalScore={wager.confirmed_score_alpha ?? scoreA} isComplete={isComplete} isWinner={hostWinner} />
              <div className="flex items-center gap-4 px-2" aria-hidden="true"><span className="h-px flex-1 bg-gradient-to-r from-transparent via-orange/55 to-white/15" /><span className="flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.09] bg-black/25 text-[8px] font-black uppercase tracking-wider text-vapor">VS</span><span className="h-px flex-1 bg-gradient-to-r from-white/15 via-cyan/55 to-transparent" /></div>
              <MatchTeamTable label="Team Bravo" name={challengerDisplayName} color="cyan" players={teamBPlayers} captainId={wager.challenger_id} finalScore={wager.confirmed_score_bravo ?? scoreB} isComplete={isComplete} isWinner={challengerWinner} />
            </div>
            <aside className="min-w-0"><MatchRoomChat conversationId={wager.id} matchType="wager" teamAPlayers={teamAPlayers} teamBPlayers={teamBPlayers} /></aside>
          </div>
        </section>

        {!isComplete && timeRemaining && (
          <div className={`relative mb-6 overflow-hidden rounded-2xl p-[1px] ${timeRemaining === "EXPIRED" ? "bg-gradient-to-r from-orange/45 via-red-400/20 to-orange/45" : "bg-gradient-to-r from-cyan/45 via-white/10 to-cyan/45"}`}>
            <div className="rounded-[15px] bg-card px-5 py-5 sm:px-6">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-4">
                  <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${timeRemaining === "EXPIRED" ? "bg-orange/10 text-orange" : "bg-cyan/10 text-cyan"}`}><Clock className="h-5 w-5" /></span>
                  <div><p className={`text-[10px] font-black uppercase tracking-[0.22em] ${timeRemaining === "EXPIRED" ? "text-orange" : "text-cyan"}`}>Match start window</p><h2 className="mt-1 text-lg font-black">{timeRemaining === "EXPIRED" ? "Admin support is available" : "Your wager is ready — start now"}</h2><p className="mt-1 text-sm text-vapor">Enter the lobby and begin the match before the start window expires.</p></div>
                </div>
                <div className="rounded-xl border border-border bg-secondary px-6 py-4 text-center"><p className="text-[9px] font-black uppercase tracking-wider text-vapor">Time remaining</p><p className={`mt-1 font-mono text-3xl font-black ${timeRemaining === "EXPIRED" ? "text-orange" : "text-cyan"}`}>{timeRemaining}</p></div>
              </div>
            </div>
          </div>
        )}

        {isComplete && (
          <div className="glass mb-6 flex items-center gap-3 rounded-xl border border-green/20 bg-green/5 p-5"><Trophy className="h-5 w-5 text-green" /><div><p className="font-bold text-green">Winner: {wager.winner_name || "Match completed"}</p><p className="text-xs text-vapor">Final score {wager.winner_score ?? scoreA}-{wager.loser_score ?? scoreB}</p></div></div>
        )}

        <div>
          <div className="min-w-0 space-y-6">
            <div className="grid items-stretch gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(285px,0.8fr)]">
              <MatchMapSeries maps={Array.isArray(wager.series_maps) && wager.series_maps.length ? wager.series_maps : (wager.final_map_name ? [wager.final_map_name] : [])} mode={wager.game_mode_display || wager.game_mode} host={wager.host_name || hostDisplayName} bestOf={bestOf} compact />
              <MatchStatusCard match={wager} />
            </div>
            <ActivityTimeline match={wager} />
            <MatchRulesPanel matchType="wager" gameMode={wager.game_mode} playRule={wager.play_rule} collapsible defaultOpen={false} />

        <div className="dark-focus dark-media rounded-xl border border-white/10 p-5 sm:p-6">
          {canAdminResolve && (
            <div className="mb-3 grid gap-3 border-b border-white/5 pb-3 md:grid-cols-3">
              {["score_conflict", "disputed"].includes(wager.status) && (
                <button
                  onClick={handleAdminResetDispute}
                  disabled={resolvingAdmin}
                  className="flex items-center justify-center gap-2 rounded-lg border border-cyan/25 bg-cyan/10 px-5 py-3 text-xs font-bold uppercase tracking-wider text-cyan transition-all hover:bg-cyan/20 disabled:opacity-50 md:col-span-3"
                >
                  <RefreshCw className="h-4 w-4" /> Reset Dispute &amp; Continue Match
                </button>
              )}
              <button
                onClick={() => handleAdminResolve("approve_team_a")}
                disabled={resolvingAdmin}
                className="flex items-center justify-center gap-2 rounded-lg border border-pink-400/20 bg-pink-400/10 px-5 py-3 text-xs font-bold uppercase tracking-wider text-pink-300 transition-all hover:bg-pink-400/20 disabled:opacity-50"
              >
                <ShieldCheck className="h-4 w-4" /> Grant {hostDisplayName} Win
              </button>
              <button
                onClick={() => handleAdminResolve("approve_team_b")}
                disabled={resolvingAdmin}
                className="flex items-center justify-center gap-2 rounded-lg border border-pink-400/20 bg-pink-400/10 px-5 py-3 text-xs font-bold uppercase tracking-wider text-pink-300 transition-all hover:bg-pink-400/20 disabled:opacity-50"
              >
                <ShieldCheck className="h-4 w-4" /> Grant {challengerDisplayName} Win
              </button>
              <button
                onClick={handleAdminCancel}
                disabled={resolvingAdmin}
                className="flex items-center justify-center gap-2 rounded-lg border border-red-400/25 bg-red-500/10 px-5 py-3 text-xs font-bold uppercase tracking-wider text-red-300 transition-all hover:bg-red-500/20 disabled:opacity-50"
              >
                <AlertTriangle className="h-4 w-4" /> Staff Cancel Match
              </button>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            {needsPayment && (
              <button
                onClick={handlePayEntry}
                disabled={payingEntry}
                className="flex items-center justify-center gap-2 rounded-lg border border-cyan/20 bg-cyan/10 px-5 py-3 text-xs font-bold uppercase tracking-wider text-cyan transition-all hover:bg-cyan/20 disabled:opacity-50"
              >
                {payingEntry ? "Paying..." : `Pay Entry ${formatMoney(wager.entry_fee || wager.amount || 0)}`}
              </button>
            )}
            <button
              onClick={() => handleRequestAdmin("A dispute needs staff review.")}
              disabled={!canUseMatchRoom || requestingAdmin}
              className="flex items-center justify-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-5 py-3 text-xs font-bold uppercase tracking-wider text-red-400 transition-all hover:bg-red-500/20 disabled:opacity-50"
            >
              <AlertTriangle className="h-4 w-4" /> {requestingAdmin ? "Requesting..." : "Request Admin"}
            </button>
            <button
              onClick={handleCreateDispute}
              disabled={!canUseMatchRoom || requestingAdmin}
              className="rounded-lg border border-orange/20 bg-orange/10 px-5 py-3 text-xs font-bold uppercase tracking-wider text-orange transition-all hover:bg-orange/20 disabled:opacity-50"
            >
              Submit Dispute
            </button>
            <button
              onClick={() => handleRequestAdmin("Opponent no-show report.")}
              disabled={!canUseMatchRoom || requestingAdmin}
              className="rounded-lg border border-white/5 bg-secondary/50 px-5 py-3 text-xs font-bold uppercase tracking-wider text-vapor transition-all hover:bg-secondary disabled:opacity-50"
            >
              Report No Show
            </button>
          </div>
          {(wager.admin_request_status || wager.requested_admin) && (
            <p className="mt-3 text-xs text-vapor">
              Admin request: {{
                waiting_for_admin: "Waiting for admin",
                admin_joined: wager.assigned_admin_name ? `${wager.assigned_admin_name} joined` : "Admin joined",
                waiting_for_user: "Waiting for user",
                escalated: "Escalated",
                resolved: "Resolved",
                closed: "Closed",
              }[wager.admin_request_status || "waiting_for_admin"] || "Waiting for admin"}
            </p>
          )}
        </div>
            <button onClick={loadWager} className="inline-flex items-center gap-2 rounded-lg border border-white/5 bg-secondary/50 px-4 py-3 text-sm font-bold text-vapor hover:bg-secondary"><RefreshCw className="h-4 w-4" /> Refresh room</button>
          </div>
        </div>
      </div>

      {scoreModalOpen && canReportScore && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" onClick={() => setScoreModalOpen(false)}>
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-card shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between border-b border-white/[0.07] p-6">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan">BO{bestOf} wager match</p>
                <h2 className="mt-2 text-xl font-black">Submit final score</h2>
                <p className="mt-1 text-xs leading-relaxed text-vapor">Your opponent must submit the same result before it is confirmed.</p>
              </div>
              <button type="button" onClick={() => setScoreModalOpen(false)} className="rounded-lg border border-white/10 bg-secondary p-2 text-vapor transition-colors hover:text-white" aria-label="Close score form">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-6">
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-xl border border-white/10 bg-black/20 p-4">
                <label className="text-center">
                  <span className="mb-2 block truncate text-[10px] font-black uppercase tracking-wider text-orange">{hostDisplayName}</span>
                  <input type="number" min="0" max={winsNeeded} value={scoreA} onChange={(event) => setScoreA(Math.max(0, Math.min(winsNeeded, Number(event.target.value) || 0)))} className="w-full rounded-lg border border-orange/20 bg-secondary px-3 py-3 text-center font-mono text-3xl font-black text-orange outline-none focus:border-orange/60" />
                </label>
                <span className="mt-5 rounded-full border border-white/10 bg-card px-2 py-1 text-[10px] font-black uppercase text-vapor">vs</span>
                <label className="text-center">
                  <span className="mb-2 block truncate text-[10px] font-black uppercase tracking-wider text-cyan">{challengerDisplayName}</span>
                  <input type="number" min="0" max={winsNeeded} value={scoreB} onChange={(event) => setScoreB(Math.max(0, Math.min(winsNeeded, Number(event.target.value) || 0)))} className="w-full rounded-lg border border-cyan/20 bg-secondary px-3 py-3 text-center font-mono text-3xl font-black text-cyan outline-none focus:border-cyan/60" />
                </label>
              </div>
              <button type="button" onClick={handleReportScore} disabled={submitting || scoreA === scoreB} className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-cyan px-5 py-3.5 text-sm font-black uppercase tracking-wider text-black transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40">
                <Check className="h-4 w-4" /> {submitting ? "Submitting..." : "Submit result"}
              </button>
              {scoreA === scoreB && <p className="mt-3 text-center text-xs text-orange">A final score cannot be tied.</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
