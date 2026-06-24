import React, { useRef, useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  AlertTriangle, Clock, Check,
  AlertCircle, ShieldCheck
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/use-toast";
import MatchChat from "@/components/match/MatchChat";
import { loadWagerParticipants } from "@/lib/wagerParticipants";

const formatStatus = (value) => String(value || "open").replace(/_/g, " ");
const formatDate = (value) => value ? new Date(value).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "Pending";
const formatMoney = (value) => `$${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const playerName = (player) => player?.full_name || player?.username || player?.user_name || "Open slot";
const staffRoles = new Set(["ceo", "super_admin", "admin", "moderator"]);

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

function SimpleRoster({ title, players, tone = "cyan" }) {
  const color = tone === "cyan" ? "text-cyan border-cyan/20 bg-cyan/5" : "text-orange border-orange/20 bg-orange/5";

  return (
    <section className={`glass rounded-xl border ${tone === "cyan" ? "border-cyan/20" : "border-orange/20"} overflow-hidden`}>
      <div className={`border-b px-4 py-3 ${color}`}>
        <h2 className="text-sm font-black uppercase tracking-wider">{title}</h2>
      </div>
      <div className="divide-y divide-white/5">
        {players.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-vapor">Waiting for roster</div>
        ) : players.map((player, index) => (
          <div key={player.id || player.user_id || index} className="flex items-center gap-3 px-4 py-3">
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg font-mono text-sm font-black text-background ${tone === "cyan" ? "bg-cyan" : "bg-orange"}`}>
              {playerName(player).charAt(0)}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold">{playerName(player)}</p>
              <p className={`text-[10px] uppercase tracking-wider ${player.payment_status === "pending" ? "text-orange" : "text-vapor"}`}>
                {player.payment_status === "pending" ? "Payment pending" : "Ready"}
              </p>
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
      <InfoRow label="Map" value={match.final_map_name || "Map pending"} />
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

  useEffect(() => {
    setLoading(true);
    loadUser();
    loadWager();
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
    if (!wager?.id || !user?.id || !staffRoles.has(user.role)) return;
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
  }, [wager?.id, wager?.requested_admin, wager?.admin_request_status, wager?.admin_request_ticket_id, user?.id, user?.role]);

  const loadWager = async () => {
    try {
      const wagerData = await base44.entities.Wager.get(id);
      setWager(wagerData);

      const { teamAPlayers, teamBPlayers } = await loadWagerParticipants(base44, wagerData);
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
    
    // Determine which team the current user is on
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
            toast({ title: "Failed to complete match", description: completeResponse.data.error || "Unknown error", variant: "destructive" });
            return;
          }
          toast({ 
            title: "Match completed!", 
            description: `${response.data.winner_name} won ${response.data.winner_score}-${response.data.loser_score}` 
          });
          navigate('/wagers');
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
      ? (wager.host_name || "Team Alpha")
      : (wager.challenger_name || "Team Bravo");
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-green/20 border-t-green rounded-full animate-spin mx-auto mb-4" />
          <p className="text-vapor">Loading wager match...</p>
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
          <Link to="/wagers" className="text-green hover:underline">Back to Wagers</Link>
        </div>
      </div>
    );
  }

  const prizePool = Number(wager.total_prize_pool ?? ((wager.entry_fee || 0) * 2));
  const bestOf = wager.best_of || 1;
  const currentParticipant = [...teamAPlayers, ...teamBPlayers].find((player) => player.user_id === user?.id);
  const needsPayment = currentParticipant?.payment_status === "pending";
  const isStaff = staffRoles.has(user?.role);
  const canAdminResolve = isStaff && wager.status !== "completed" && wager.status !== "cancelled" && Boolean(wager.challenger_id);

  return (
    <div className="min-h-screen bg-obsidian py-5">
      <div className="mx-auto max-w-[1500px] px-4 lg:px-6">
        <header className="glass mb-5 rounded-xl border border-cyan/20 p-5">
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${wager.status === "completed" ? "bg-green" : "bg-cyan animate-pulse"}`} />
                <span className="text-[10px] font-bold uppercase tracking-wider text-cyan">Wager Match</span>
              </div>
              <h1 className="text-2xl font-black tracking-tight">Team Alpha vs Team Bravo</h1>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs md:flex md:flex-wrap md:justify-end">
              <span className="rounded-md border border-white/5 bg-secondary/60 px-3 py-2 font-mono">{wager.game_mode_display || wager.game_mode || "Mode pending"}</span>
              <span className="rounded-md border border-white/5 bg-secondary/60 px-3 py-2 font-mono">{wager.final_map_name || "Map pending"}</span>
              <span className="rounded-md border border-white/5 bg-secondary/60 px-3 py-2 font-mono">BO{bestOf}</span>
              <span className="rounded-md border border-white/5 bg-secondary/60 px-3 py-2 font-mono">#{wager.id?.slice(-8)}</span>
            </div>
          </div>

          <div className="grid items-center gap-4 lg:grid-cols-[1fr_auto_1fr_auto]">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-cyan">Team Alpha</p>
              <p className="truncate text-xl font-black">{wager.host_name || "Host pending"}</p>
            </div>
            <div className="flex items-center justify-center gap-3">
              <input
                type="number"
                min="0"
                value={scoreA}
                onChange={(event) => setScoreA(Number(event.target.value))}
                className="h-20 w-20 rounded-lg border border-cyan/20 bg-secondary text-center font-mono text-5xl font-black text-cyan focus:border-cyan/40 focus:outline-none"
              />
              <span className="text-3xl font-black text-vapor">:</span>
              <input
                type="number"
                min="0"
                value={scoreB}
                onChange={(event) => setScoreB(Number(event.target.value))}
                className="h-20 w-20 rounded-lg border border-orange/20 bg-secondary text-center font-mono text-5xl font-black text-orange focus:border-orange/40 focus:outline-none"
              />
            </div>
            <div className="min-w-0 text-left lg:text-right">
              <p className="text-[10px] font-bold uppercase tracking-wider text-orange">Team Bravo</p>
              <p className="truncate text-xl font-black">{wager.challenger_name || "Opponent pending"}</p>
            </div>
            <div className="rounded-lg border border-green/20 bg-green/10 px-4 py-3 text-center">
              <p className="text-[10px] font-bold uppercase tracking-wider text-green">Prize Pool</p>
              <p className="font-mono text-2xl font-black text-green">{formatMoney(prizePool)}</p>
            </div>
          </div>
        </header>

        <main className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(340px,1fr)_minmax(0,0.9fr)]">
          <SimpleRoster title="Team Alpha Roster" players={teamAPlayers} tone="cyan" />

          <div className="space-y-5">
            <MatchStatusCard match={wager} />
            {timeRemaining && (
              <div className={`glass rounded-xl border p-4 ${timeRemaining === "EXPIRED" ? "border-red-500/20 bg-red-500/5 text-red-400" : "border-cyan/20 bg-cyan/5 text-cyan"}`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    <span className="text-sm font-bold uppercase tracking-wider">Start Deadline</span>
                  </div>
                  <span className="font-mono text-lg font-black">{timeRemaining}</span>
                </div>
              </div>
            )}
            <ActivityTimeline match={wager} />
          </div>

          <div className="space-y-5">
            <SimpleRoster title="Team Bravo Roster" players={teamBPlayers} tone="orange" />
            <MatchChat conversationId={wager.id} matchType="wager" accent="cyan" live />
          </div>
        </main>

        <div className="glass mt-5 rounded-xl border border-white/5 p-4">
          {canAdminResolve && (
            <div className="mb-3 grid gap-3 border-b border-white/5 pb-3 md:grid-cols-2">
              <button
                onClick={() => handleAdminResolve("approve_team_a")}
                disabled={resolvingAdmin}
                className="flex items-center justify-center gap-2 rounded-lg border border-pink-400/20 bg-pink-400/10 px-5 py-3 text-xs font-bold uppercase tracking-wider text-pink-300 transition-all hover:bg-pink-400/20 disabled:opacity-50"
              >
                <ShieldCheck className="h-4 w-4" /> Grant Team Alpha Win
              </button>
              <button
                onClick={() => handleAdminResolve("approve_team_b")}
                disabled={resolvingAdmin}
                className="flex items-center justify-center gap-2 rounded-lg border border-pink-400/20 bg-pink-400/10 px-5 py-3 text-xs font-bold uppercase tracking-wider text-pink-300 transition-all hover:bg-pink-400/20 disabled:opacity-50"
              >
                <ShieldCheck className="h-4 w-4" /> Grant Team Bravo Win
              </button>
            </div>
          )}
          <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto_auto]">
            <button
              onClick={handleReportScore}
              disabled={submitting || wager.status !== "in_progress"}
              className="flex items-center justify-center gap-2 rounded-lg border border-green/20 bg-green/10 px-6 py-4 text-sm font-black uppercase tracking-wider text-green transition-all hover:bg-green/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Check className="h-4 w-4" /> {submitting ? "Submitting..." : "Submit Score"}
            </button>
            {needsPayment && (
              <button
                onClick={handlePayEntry}
                disabled={payingEntry}
                className="flex items-center justify-center gap-2 rounded-lg border border-cyan/20 bg-cyan/10 px-5 py-4 text-xs font-bold uppercase tracking-wider text-cyan transition-all hover:bg-cyan/20 disabled:opacity-50"
              >
                {payingEntry ? "Paying..." : `Pay Entry ${formatMoney(wager.entry_fee || wager.amount || 0)}`}
              </button>
            )}
            <button
              onClick={() => handleRequestAdmin("A dispute needs staff review.")}
              disabled={requestingAdmin}
              className="flex items-center justify-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-5 py-4 text-xs font-bold uppercase tracking-wider text-red-400 transition-all hover:bg-red-500/20 disabled:opacity-50"
            >
              <AlertTriangle className="h-4 w-4" /> {requestingAdmin ? "Requesting..." : "Request Admin"}
            </button>
            <button
              onClick={handleCreateDispute}
              disabled={requestingAdmin}
              className="rounded-lg border border-orange/20 bg-orange/10 px-5 py-4 text-xs font-bold uppercase tracking-wider text-orange transition-all hover:bg-orange/20 disabled:opacity-50"
            >
              Submit Dispute
            </button>
            <button
              onClick={() => handleRequestAdmin("Opponent no-show report.")}
              disabled={requestingAdmin}
              className="rounded-lg border border-white/5 bg-secondary/50 px-5 py-4 text-xs font-bold uppercase tracking-wider text-vapor transition-all hover:bg-secondary disabled:opacity-50"
            >
              Report No Show
            </button>
          </div>
          {(wager.admin_request_status || wager.requested_admin) && (
            <p className="mt-3 text-xs text-vapor">
              Admin request: {{
                waiting_for_admin: "Waiting for admin",
                admin_joined: "Admin joined",
                waiting_for_user: "Waiting for user",
                escalated: "Escalated",
                resolved: "Resolved",
                closed: "Closed",
              }[wager.admin_request_status || "waiting_for_admin"] || "Waiting for admin"}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
