import React, { useRef, useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  AlertTriangle, Check, ChevronDown, Clock3, Gavel, Unlock,
  AlertCircle, Award, Crown, DollarSign, Medal, RefreshCw, Shield, ShieldCheck, Trophy, X
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/use-toast";
import MatchRoomChat from "@/components/match/MatchRoomChat";
import MatchTeamTable from "@/components/match/MatchTeamTable";
import MatchMapSeries from "@/components/match/MatchMapSeries";
import WagerMoneyResultOverlay from "@/components/match/WagerMoneyResultOverlay";
import { loadWagerParticipants } from "@/lib/wagerParticipants";
import UserBadges from "@/components/ui/UserBadges";
import ActivisionIdLabel from "@/components/competition/ActivisionIdLabel";
import PageLoader from "@/components/ui/PageLoader";
import { wagerPlayRule } from "@/lib/wagerRules";
import { isStaffUser } from "@/lib/roles";

const formatStatus = (value) => String(value || "open").replace(/_/g, " ");
const formatMoney = (value) => `$${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const formatCountdown = (seconds) => {
  const safeSeconds = Math.max(0, Number(seconds || 0));
  const minutes = Math.floor(safeSeconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(safeSeconds % 60).padStart(2, "0")}`;
};
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

function InfoRow({ label, value, valueClass = "" }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/5 py-2 last:border-0">
      <span className="text-[10px] uppercase tracking-wider text-vapor">{label}</span>
      <span className={`text-right text-sm font-semibold capitalize ${valueClass}`}>{value || "Pending"}</span>
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
              <div className="grid grid-cols-4 gap-1.5">
                {[
                  ["Gold", player.gold_count, Trophy, "text-yellow-400 border-yellow-400/15 bg-yellow-400/5"],
                  ["Silver", player.silver_count, Medal, "text-slate-300 border-slate-300/15 bg-slate-300/5"],
                  ["Bronze", player.bronze_count, Award, "text-amber-600 border-amber-600/15 bg-amber-600/5"],
                  ["Premium", player.premium_count, Crown, "text-purple-300 border-purple-300/15 bg-purple-300/5"],
                ].map(([label, count, Icon, classes]) => (
                  <div key={label} aria-label={`${label}: ${Number(count || 0)}`} className={`group/trophy relative rounded-lg border px-1 py-2 text-center transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_20px_-12px_currentColor] ${classes}`}>
                    <Icon className="mx-auto h-3.5 w-3.5" />
                    <p className="mt-1 font-mono text-xs font-black">{Number(count || 0)}</p>
                    <p className="mt-0.5 truncate text-[7px] font-bold uppercase tracking-tight">{label}</p>
                    <span className="pointer-events-none invisible absolute bottom-[calc(100%+8px)] left-1/2 z-[70] -translate-x-1/2 translate-y-1 whitespace-nowrap rounded-lg border border-white/[0.12] bg-[#111821] px-2.5 py-2 text-[10px] font-bold text-white opacity-0 shadow-[0_14px_36px_rgba(0,0,0,.65)] transition-all duration-150 group-hover/trophy:visible group-hover/trophy:translate-y-0 group-hover/trophy:opacity-100">{label}: {Number(count || 0)}</span>
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

function WagerAdminTools({ wager, resolving, onResetDispute, onResolve, onCancel }) {
  const hasDisputeAction = ["score_conflict", "disputed"].includes(wager.status);
  const actionClass = "flex w-full items-center justify-center gap-2 rounded-lg border border-blue-400/20 bg-blue-400/[0.07] px-3 py-2.5 text-[9px] font-black uppercase tracking-wider text-blue-300 transition-colors hover:bg-blue-400/15 disabled:opacity-50";

  return (
    <details className="group mt-4 border-t border-white/[0.06] pt-3">
      <summary className="flex cursor-pointer list-none items-center justify-between rounded-lg border border-blue-400/15 bg-blue-400/[0.05] px-3 py-2.5 text-[10px] font-black uppercase tracking-wider text-blue-300 transition-colors hover:bg-blue-400/10 [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2"><Gavel className="h-3.5 w-3.5" /> Admin tools</span>
        <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
      </summary>
      <div className="mt-2 grid gap-2">
        {hasDisputeAction && (
          <button type="button" onClick={onResetDispute} disabled={resolving} className={actionClass}>
            <RefreshCw className="h-3.5 w-3.5" /> Reset dispute
          </button>
        )}
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => onResolve("approve_team_a")} disabled={resolving} className={actionClass}>
            <ShieldCheck className="h-3.5 w-3.5" /> Grant A win
          </button>
          <button type="button" onClick={() => onResolve("approve_team_b")} disabled={resolving} className={actionClass}>
            <ShieldCheck className="h-3.5 w-3.5" /> Grant B win
          </button>
        </div>
        <button type="button" onClick={onCancel} disabled={resolving} className="flex w-full items-center justify-center gap-2 rounded-lg border border-red-400/25 bg-red-500/10 px-3 py-2.5 text-[9px] font-black uppercase tracking-wider text-red-300 transition-colors hover:bg-red-500/20 disabled:opacity-50">
          <AlertTriangle className="h-3.5 w-3.5" /> Staff cancel match
        </button>
      </div>
    </details>
  );
}

function WagerStartWindow({ startWindowExpired, hasStartDeadline, startSecondsRemaining }) {
  return (
    <div className={`relative mb-6 overflow-hidden rounded-xl border ${startWindowExpired ? "border-orange/35" : "border-border"}`}>
      <div className="relative overflow-hidden bg-card px-5 py-5 sm:px-6">
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${startWindowExpired ? "bg-orange/12 text-orange" : "bg-cyan/12 text-cyan"}`}>
              {startWindowExpired ? <Unlock className="h-5 w-5" /> : <Clock3 className="h-5 w-5" />}
            </span>
            <div>
              {!startWindowExpired && <p className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan">Match start window</p>}
              <h2 className="mt-1 text-lg font-black text-foreground">{startWindowExpired ? "Admin support is now available" : "Your wager is ready — start now"}</h2>
              {!startWindowExpired && <p className="mt-1 max-w-2xl text-sm leading-relaxed text-vapor">You have 15 minutes to enter the lobby and begin. Admin support and disputes unlock only when this timer reaches 00:00.</p>}
            </div>
          </div>
          <div className="shrink-0 rounded-xl border border-border bg-secondary px-6 py-4 text-center">
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-vapor">{hasStartDeadline ? "Time remaining" : "Waiting for schedule"}</p>
            <p className={`mt-1 font-mono text-3xl font-black tabular-nums ${startWindowExpired ? "text-orange" : "text-cyan"}`}>{hasStartDeadline ? formatCountdown(startSecondsRemaining) : "--:--"}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function MatchStatusCard({ match, onRefresh, adminTools = null }) {
  const items = [
    { label: "Status", value: matchPhaseFor(match), valueClass: "capitalize text-cyan" },
    { label: "Mode", value: match.game_mode_display || match.game_mode },
    { label: "Input / platform", value: wagerPlayRule(match.play_rule).shortLabel },
    { label: "Map rotation", value: wagerMapText(match) },
    { label: "Host", value: match.host_name || "Host pending" },
    { label: "Server", value: match.server || match.server_region || match.region || "Platform lobby" },
    { label: "Prize pool", value: formatMoney(match.total_prize_pool ?? ((match.entry_fee || match.amount || 0) * 2)), valueClass: "font-mono text-green" },
    { label: "Current status", value: formatStatus(match.status), valueClass: "capitalize" },
  ];

  return (
    <section className="dark-focus dark-media h-full rounded-xl border border-white/[0.09] p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-white">
          <Shield className="h-4 w-4 text-orange" /> Match State
        </h2>
        <button type="button" onClick={onRefresh} className="inline-flex items-center justify-center rounded-lg border border-white/10 bg-secondary/50 p-2 text-vapor transition-colors hover:bg-secondary hover:text-white" title="Refresh match" aria-label="Refresh match">
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-2">
        {items.map((item) => (
          <div key={item.label} className={`rounded-lg border border-white/[0.06] bg-black/15 px-3 py-2 ${item.label === "Prize pool" || item.label === "Current status" ? "col-span-2" : ""}`}>
            <dt className="text-[8px] font-black uppercase tracking-[0.16em] text-vapor/65">{item.label}</dt>
            <dd className={`mt-1 truncate text-[11px] font-bold ${item.valueClass || "text-white"}`} title={item.value}>{item.value || "Pending"}</dd>
          </div>
        ))}
      </dl>
      {adminTools}
    </section>
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
  const [clockNow, setClockNow] = useState(Date.now());
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
    if (!wager?.match_start_deadline || wager.status === "completed" || wager.status === "cancelled") return undefined;
    setClockNow(Date.now());
    const timer = window.setInterval(() => setClockNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [wager?.match_start_deadline, wager?.status]);

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
        } else if (["score_conflict", "disputed"].includes(response.data.status)) {
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
        priority: user?.is_premium ? "critical" : "high",
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
    if (!startWindowExpired && !isStaffUser(user)) {
      toast({ title: "Disputes are still locked", description: "You can open a dispute after the 15-minute match start timer reaches 00:00." });
      return;
    }
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
        const createdTicket = Boolean(response.data.ticket);
        toast({
          title: response.data.escalated ? (createdTicket ? "Ticket escalated" : "Dispute escalated") : (createdTicket ? "Ticket created" : "Dispute submitted"),
          description: createdTicket ? "You can follow this dispute under My Tickets." : "A review case was created for staff.",
        });
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
  const startDeadlineMs = new Date(wager.match_start_deadline || "").getTime();
  const hasStartDeadline = Number.isFinite(startDeadlineMs);
  const startSecondsRemaining = hasStartDeadline
    ? Math.max(0, Math.ceil((startDeadlineMs - clockNow) / 1000))
    : null;
  const startWindowExpired = hasStartDeadline && startSecondsRemaining === 0;
  const wagerChatActions = (
    <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => handleRequestAdmin("Match room assistance requested.")} disabled={!canUseMatchRoom || requestingAdmin} className="flex items-center justify-center gap-1.5 rounded-lg border border-red-500/20 bg-red-500/10 px-2 py-2.5 text-[9px] font-black uppercase tracking-wider text-red-300 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-45">
          <AlertTriangle className="h-3.5 w-3.5" /> {requestingAdmin ? "Requesting…" : "Request admin"}
        </button>
        <button type="button" onClick={handleCreateDispute} disabled={!canUseMatchRoom || (!startWindowExpired && !isStaff) || requestingAdmin} title={!startWindowExpired ? "Available after the 15-minute match start timer expires" : "Open a dispute with evidence"} className="flex items-center justify-center gap-1.5 rounded-lg border border-orange/25 bg-orange/10 px-2 py-2.5 text-[9px] font-black uppercase tracking-wider text-orange hover:bg-orange/20 disabled:cursor-not-allowed disabled:opacity-45">
          <AlertCircle className="h-3.5 w-3.5" /> Submit dispute
        </button>
        {!startWindowExpired && !isStaff && <p className="col-span-2 text-center text-[9px] leading-4 text-vapor">Admin help is available now. Disputes unlock when the start timer reaches 00:00.</p>}
    </div>
  );

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
    <div className="match-room-theme min-h-screen bg-obsidian py-6 sm:py-8">
      <div className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8">
        {isComplete && personalMoneyResult && !resultDismissed && <WagerMoneyResultOverlay result={{ ...personalMoneyResult, score: `${wager.confirmed_score_alpha ?? (wager.winner_id === wager.host_id ? wager.winner_score : wager.loser_score) ?? 0} - ${wager.confirmed_score_bravo ?? (wager.winner_id === wager.challenger_id ? wager.winner_score : wager.loser_score) ?? 0}` }} onContinue={dismissResult} />}
        {!isComplete && canUseMatchRoom && <WagerStartWindow
          startWindowExpired={startWindowExpired}
          hasStartDeadline={hasStartDeadline}
          startSecondsRemaining={startSecondsRemaining}
        />}

        <section className="dark-focus dark-media relative mb-6 overflow-hidden rounded-2xl border border-white/[0.09] bg-[#111821] shadow-[0_24px_70px_-48px_rgba(0,0,0,.95)]">
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-20 top-0 h-px bg-gradient-to-r from-cyan/50 via-white/10 to-orange/50" />
          <div className="match-room-header p-4 sm:p-5">
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
              <Link to="/wagers" className="rounded-lg border border-white/10 bg-white/[0.06] px-4 py-3 text-xs font-bold text-vapor transition-all hover:border-primary/30 hover:text-primary">Back to wagers</Link>
              <Link to="/rules" className="match-rules-link"><ShieldCheck className="h-4 w-4" /> Match Rules</Link>
            </div>
          </div>
          </div>
          <div className="grid gap-4 border-t border-white/[0.06] p-3 sm:p-4 xl:grid-cols-[minmax(0,1fr)_410px]">
            <div className="min-w-0 space-y-4">
              <MatchTeamTable label="Team Alpha" name={hostDisplayName} color="orange" players={teamAPlayers} captainId={wager.host_id} finalScore={wager.confirmed_score_alpha ?? scoreA} isComplete={isComplete} isWinner={hostWinner} />
              <div className="flex items-center gap-4 px-2" aria-hidden="true"><span className="h-px flex-1 bg-gradient-to-r from-transparent via-orange/55 to-white/15" /><span className="flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.09] bg-black/25 text-[8px] font-black uppercase tracking-wider text-vapor">VS</span><span className="h-px flex-1 bg-gradient-to-r from-white/15 via-cyan/55 to-transparent" /></div>
              <MatchTeamTable label="Team Bravo" name={challengerDisplayName} color="cyan" players={teamBPlayers} captainId={wager.challenger_id} finalScore={wager.confirmed_score_bravo ?? scoreB} isComplete={isComplete} isWinner={challengerWinner} />
            </div>
            <aside className="min-w-0 space-y-4">
              <MatchRoomChat conversationId={wager.id} matchType="wager" teamAPlayers={teamAPlayers} teamBPlayers={teamBPlayers} inputActions={wagerChatActions} />
              <MatchMapSeries maps={Array.isArray(wager.series_maps) && wager.series_maps.length ? wager.series_maps : (wager.final_map_name ? [wager.final_map_name] : [])} mode={wager.game_mode_display || wager.game_mode} host={wager.host_name || hostDisplayName} bestOf={bestOf} compact stacked />
            </aside>
          </div>
        </section>

        {isComplete && (
          <div className="glass mb-6 flex items-center gap-3 rounded-xl border border-green/20 bg-green/5 p-5"><Trophy className="h-5 w-5 text-green" /><div><p className="font-bold text-green">Winner: {wager.winner_name || "Match completed"}</p><p className="text-xs text-vapor">Final score {wager.winner_score ?? scoreA}-{wager.loser_score ?? scoreB}</p></div></div>
        )}

        <div>
          <div className="min-w-0 space-y-6">
            <div className="space-y-4">
              <MatchStatusCard
                match={wager}
                onRefresh={loadWager}
                adminTools={canAdminResolve ? (
                  <WagerAdminTools
                    wager={wager}
                    resolving={resolvingAdmin}
                    onResetDispute={handleAdminResetDispute}
                    onResolve={handleAdminResolve}
                    onCancel={handleAdminCancel}
                  />
                ) : null}
              />
            </div>
        {(needsPayment || wager.admin_request_status || wager.requested_admin) && (
          <div className="dark-focus dark-media rounded-xl border border-white/10 p-5 sm:p-6">
            {needsPayment && (
              <button
                onClick={handlePayEntry}
                disabled={payingEntry}
                className="flex items-center justify-center gap-2 rounded-lg border border-cyan/20 bg-cyan/10 px-5 py-3 text-xs font-bold uppercase tracking-wider text-cyan transition-all hover:bg-cyan/20 disabled:opacity-50"
              >
                {payingEntry ? "Paying..." : `Pay Entry ${formatMoney(wager.entry_fee || wager.amount || 0)}`}
              </button>
            )}
            {(wager.admin_request_status || wager.requested_admin) && (
              <p className={`${needsPayment ? "mt-3" : ""} text-xs text-vapor`}>
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
        )}
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
