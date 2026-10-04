import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, Check, ChevronDown, Clock3, Crown, Flag, LogOut, RefreshCw, Shield, ShieldCheck, Shuffle, Sparkles, Swords, Trophy, Users, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import MatchRoomChat from "@/components/match/MatchRoomChat";
import MatchTeamTable from "@/components/match/MatchTeamTable";
import MatchMapSeries from "@/components/match/MatchMapSeries";
import MatchRulesPanel from "@/components/match/MatchRulesPanel";
import ActivisionIdLabel from "@/components/competition/ActivisionIdLabel";
import UserBadges from "@/components/ui/UserBadges";
import { loadWagerParticipants } from "@/lib/wagerParticipants";
import { isStaffUser } from "@/lib/roles";
import PageLoader from "@/components/ui/PageLoader";
import { toast } from "@/components/ui/use-toast";

const closedStatuses = new Set(["completed", "cancelled"]);
const scoreStatuses = new Set(["in_progress", "awaiting_team_alpha_report", "awaiting_team_bravo_report", "awaiting_completion"]);
const displayStatus = (value) => ({ open: "Lobby open", in_progress: "Match live", awaiting_team_alpha_report: "Score confirmation", awaiting_team_bravo_report: "Score confirmation", awaiting_completion: "Completing", score_conflict: "Under review", disputed: "Under review", completed: "Complete", cancelled: "Cancelled" }[value] || String(value || "open").replaceAll("_", " "));
const playerName = (player) => player?.full_name || player?.user_name || player?.username || "Open slot";
const seriesModeName = (mode) => ({ hp: "Hardpoint", snd: "Search & Destroy" }[mode] || mode || "Mode pending");
const formatCountdown = (seconds) => `${Math.floor(Math.max(0, seconds) / 60)}:${String(Math.max(0, seconds) % 60).padStart(2, "0")}`;

function PlayerCard({ player, captain, tone }) {
  const cyan = tone === "cyan";
  return (
    <div className={`rounded-xl border p-3 ${cyan ? "border-cyan/15 bg-cyan/[0.04]" : "border-orange/15 bg-orange/[0.04]"}`}>
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg font-mono text-sm font-black text-background ${cyan ? "bg-cyan" : "bg-orange"}`}>{playerName(player).charAt(0).toUpperCase()}</div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2"><p data-name-effect={player.display_name_color || undefined} style={player.display_name_color ? { "--player-name-color": player.display_name_color } : undefined} className={`truncate text-sm font-black ${player.display_name_color ? "player-name-color" : ""}`}>{playerName(player)}</p>{captain && <Crown className="h-3.5 w-3.5 text-yellow-300" />}<UserBadges user={player} size="xs" iconOnly /></div>
          <ActivisionIdLabel user={player} className="mt-1 max-w-full" />
        </div>
        <div className="text-right"><p className="text-[8px] font-black uppercase tracking-wider text-vapor">Level</p><p className={`font-mono text-lg font-black ${cyan ? "text-cyan" : "text-orange"}`}>{player.xp_level || 1}</p></div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-1.5 text-center">
        <div className="rounded-lg bg-black/20 px-2 py-2"><p className="text-[7px] font-black uppercase text-vapor">8s rating</p><p className="mt-1 font-mono text-xs font-black">{player.eights_rating || 1000}</p></div>
        <div className="rounded-lg bg-black/20 px-2 py-2"><p className="text-[7px] font-black uppercase text-vapor">Wins</p><p className="mt-1 font-mono text-xs font-black text-green">{player.eights_wins || 0}</p></div>
        <div className="rounded-lg bg-black/20 px-2 py-2"><p className="text-[7px] font-black uppercase text-vapor">Monthly</p><p className="mt-1 font-mono text-xs font-black text-yellow-300">{player.monthly_wins || 0}</p></div>
      </div>
    </div>
  );
}

function TeamPanel({ label, players, captainId, tone, score, winner, embedded = false }) {
  const cyan = tone === "cyan";
  return (
    <section className={`min-w-0 overflow-hidden ${embedded ? "bg-transparent" : `rounded-2xl border bg-card ${cyan ? "border-cyan/20" : "border-orange/20"}`}`}>
      <header className={`flex items-center justify-between border-b px-5 py-4 ${cyan ? "border-cyan/15 bg-cyan/[0.06]" : "border-orange/15 bg-orange/[0.06]"}`}>
        <div><p className={`text-[9px] font-black uppercase tracking-[0.18em] ${cyan ? "text-cyan" : "text-orange"}`}>{label}</p><h2 className="mt-1 text-xl font-black">{players.length}/4 players</h2></div>
        {score !== undefined && <div className={`rounded-xl border bg-black/20 px-4 py-2 text-center ${winner ? "border-green/30" : "border-white/10"}`}><p className="text-[7px] font-black uppercase text-vapor">Score</p><p className={`font-mono text-2xl font-black ${winner ? "text-green" : cyan ? "text-cyan" : "text-orange"}`}>{score}</p></div>}
      </header>
      <div className="space-y-2 p-3">
        {Array.from({ length: 4 }).map((_, index) => players[index] ? <PlayerCard key={players[index].user_id || index} player={players[index]} captain={players[index].user_id === captainId} tone={tone} /> : <div key={index} className="flex h-[104px] items-center justify-center rounded-xl border border-dashed border-white/[0.08] text-xs text-vapor">Waiting for player {index + 1}</div>)}
      </div>
    </section>
  );
}

export default function EightsMatchRoom() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [match, setMatch] = useState(null);
  const [user, setUser] = useState(null);
  const [teamAlpha, setTeamAlpha] = useState([]);
  const [teamBravo, setTeamBravo] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [reshuffleBusy, setReshuffleBusy] = useState(false);
  const [requestingAdmin, setRequestingAdmin] = useState(false);
  const [disputing, setDisputing] = useState(false);
  const [adminBusy, setAdminBusy] = useState(false);
  const [scoreOpen, setScoreOpen] = useState(false);
  const [scoreA, setScoreA] = useState("");
  const [scoreB, setScoreB] = useState("");
  const [now, setNow] = useState(Date.now());

  const hydrateProgression = useCallback(async (players) => Promise.all(players.map(async (player) => {
    const [xpRows, statRows] = await Promise.all([
      base44.entities.XPStats.filterFresh({ user_id: player.user_id }, "-created_date", 1).catch(() => []),
      base44.entities.EightsStats.filterFresh({ user_id: player.user_id }, "-created_date", 1).catch(() => []),
    ]);
    const xp = xpRows?.[0];
    const stats = statRows?.[0];
    return { ...player, xp_level: xp?.level || 1, eights_rating: stats?.rating || 1000, eights_wins: stats?.wins || 0, eights_losses: stats?.losses || 0, monthly_wins: stats?.monthly_wins || 0 };
  })), []);

  const loadRoom = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const currentUser = user || await base44.auth.me();
      const sync = await base44.functions.invoke("syncEightsLobby", { wager_id: id }).catch(() => null);
      const latest = sync?.data?.wager || await base44.entities.Wager.getFresh(id);
      if (latest?.match_type !== "8s") throw new Error("This is not an 8s match");
      const rows = await base44.entities.WagerParticipant.filterFresh({ wager_id: id }, "joined_date", 8);
      const rosters = await loadWagerParticipants(base44, latest, { participantRows: rows, fresh: true });
      const [alpha, bravo] = await Promise.all([hydrateProgression(rosters.teamAPlayers), hydrateProgression(rosters.teamBPlayers)]);
      setUser(currentUser);
      setMatch(latest);
      setTeamAlpha(alpha);
      setTeamBravo(bravo);
    } catch (error) {
      if (!quiet) toast({ title: "Match room unavailable", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [hydrateProgression, id, user]);

  useEffect(() => { loadRoom(); }, [loadRoom]);
  useEffect(() => {
    const poll = window.setInterval(() => loadRoom(true), 3500);
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => { window.clearInterval(poll); window.clearInterval(timer); };
  }, [loadRoom]);

  const allPlayers = useMemo(() => [...teamAlpha, ...teamBravo], [teamAlpha, teamBravo]);
  const isParticipant = allPlayers.some((player) => player.user_id === user?.id);
  const isStaff = isStaffUser(user);
  const isAdmin = ["ceo", "super_admin", "admin"].includes(user?.role) || ["ceo", "super_admin", "admin"].includes(user?.admin_role) || user?.is_admin === true;
  const joined = allPlayers.length;
  const countdown = match?.roster_lock_deadline ? Math.max(0, Math.ceil((new Date(match.roster_lock_deadline).getTime() - now) / 1000)) : null;
  const locked = Boolean(match?.roster_locked || match?.status === "in_progress" || countdown === 0);
  const isComplete = match?.status === "completed";
  const alphaWinner = isComplete && match?.winner_id === match?.host_id;
  const bravoWinner = isComplete && match?.winner_id === match?.challenger_id;
  const scoreVoteIds = Array.isArray(match?.eights_score_vote_user_ids) ? match.eights_score_vote_user_ids : [];
  const scoreVoteCount = scoreVoteIds.length || Number(match?.eights_score_vote_count || 0);
  const playersPerTeam = Math.max(1, Number.parseInt(String(match?.team_size || "4v4"), 10) || 4);
  const requiredScoreVotes = Number(match?.eights_score_vote_required || playersPerTeam + 1);
  const hasScoreProposal = match?.eights_score_vote_status === "pending"
    && match?.eights_score_vote_alpha !== undefined
    && match?.eights_score_vote_alpha !== null
    && match?.eights_score_vote_bravo !== undefined
    && match?.eights_score_vote_bravo !== null;
  const currentUserAgreed = Boolean(user?.id && scoreVoteIds.includes(user.id));
  const reshuffleVoteIds = Array.isArray(match?.eights_reshuffle_vote_user_ids) ? match.eights_reshuffle_vote_user_ids : [];
  const reshuffleVoteCount = reshuffleVoteIds.length || Number(match?.eights_reshuffle_vote_count || 0);
  const requiredReshuffleVotes = Number(match?.eights_reshuffle_vote_required || 5);
  const hasReshuffleVote = Boolean(user?.id && reshuffleVoteIds.includes(user.id));
  const reshuffleOpen = joined === 8 && !locked && countdown !== null && countdown > 0 && !closedStatuses.has(match?.status);
  const seriesMaps = (Array.isArray(match?.series_maps) ? match.series_maps : []).map((map, index) => (
    typeof map === "string"
      ? { name: map, mode: seriesModeName(match?.series_modes?.[index]) }
      : map
  ));

  const leave = async () => {
    setBusy(true);
    try {
      const response = await base44.functions.invoke("leaveEightsLobby", { wager_id: id });
      if (!response.data?.success) throw new Error(response.data?.error || "Could not leave lobby");
      navigate("/ranked/8s", { replace: true });
    } catch (error) {
      toast({ title: "Could not leave", description: error.message, variant: "destructive" });
      loadRoom(true);
    } finally { setBusy(false); }
  };

  const submitScore = async () => {
    const submittedScoreA = hasScoreProposal ? Number(match.eights_score_vote_alpha) : Number(scoreA);
    const submittedScoreB = hasScoreProposal ? Number(match.eights_score_vote_bravo) : Number(scoreB);
    const winsNeeded = Math.floor(Number(match.best_of || 3) / 2) + 1;
    if (Math.max(submittedScoreA, submittedScoreB) !== winsNeeded || submittedScoreA === submittedScoreB) {
      toast({ title: "Invalid score", description: `One team must reach ${winsNeeded} map wins.`, variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const report = await base44.functions.invoke("submitScore", { wager_id: id, team_alpha_score: submittedScoreA, team_bravo_score: submittedScoreB });
      if (!report.data?.success) throw new Error(report.data?.error || "Could not submit score");
      if (report.data.ready_to_complete) {
        const complete = await base44.functions.invoke("completeWager", { wager_id: id, winner_id: report.data.winner_id, team_alpha_score: submittedScoreA, team_bravo_score: submittedScoreB });
        if (!complete.data?.success) throw new Error(complete.data?.error || "Could not complete match");
      }
      setScoreOpen(false);
      toast({ title: report.data.ready_to_complete ? "Match complete" : "Agreement recorded", description: report.data.ready_to_complete ? "XP and monthly standings are updated." : (report.data.message || `Waiting for ${requiredScoreVotes} player approvals.`) });
      await loadRoom(true);
    } catch (error) {
      toast({ title: "Score not submitted", description: error.message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  const requestAdmin = async () => {
    setRequestingAdmin(true);
    try {
      const response = await base44.functions.invoke("requestAdminAlert", {
        match_type: "8s",
        match_id: match.id,
        subject: `8s match admin request ${match.id}`,
        description: `A player requested admin support from 8s match room ${match.id}.`,
        priority: "high",
      });
      if (!response.data?.success) throw new Error(response.data?.error || "Could not request admin");
      toast({ title: "Admin requested", description: "Staff were notified for this 8s match." });
      await loadRoom(true);
    } catch (error) {
      toast({ title: "Request failed", description: error.message, variant: "destructive" });
    } finally {
      setRequestingAdmin(false);
    }
  };

  const voteForReshuffle = async () => {
    setReshuffleBusy(true);
    try {
      const response = await base44.functions.invoke("voteEightsReshuffle", { wager_id: id });
      if (!response.data?.success) throw new Error(response.data?.error || "Could not record reshuffle vote");
      setMatch(response.data.wager || match);
      toast({
        title: response.data.reshuffled ? "Teams reshuffled" : response.data.voted ? "Reshuffle vote recorded" : "Reshuffle vote removed",
        description: response.data.reshuffled ? "Teams are random again. The five-minute veto window restarted." : `${response.data.vote_count}/${response.data.required_votes} players agree to reshuffle.`,
      });
      await loadRoom(true);
    } catch (error) {
      toast({ title: "Reshuffle unavailable", description: error.message, variant: "destructive" });
    } finally {
      setReshuffleBusy(false);
    }
  };

  const adminReshuffleTeams = async () => {
    if (typeof window !== "undefined" && !window.confirm("Reshuffle both 8s teams now?")) return;
    setAdminBusy(true);
    try {
      const response = await base44.functions.invoke("adminReshuffleEightsTeams", { wager_id: id });
      if (!response.data?.success) throw new Error(response.data?.error || "Could not reshuffle teams");
      setMatch(response.data.wager || match);
      toast({ title: "Teams reshuffled", description: "The five-minute veto window restarted." });
      await loadRoom(true);
    } catch (error) {
      toast({ title: "Reshuffle failed", description: error.message, variant: "destructive" });
    } finally {
      setAdminBusy(false);
    }
  };

  const createDispute = async () => {
    const evidenceText = typeof window !== "undefined" ? window.prompt("Evidence URLs (comma or line separated):", "") : "";
    if (evidenceText === null) return;
    const evidenceUrls = evidenceText.split(/[\n,]+/).map((url) => url.trim()).filter(Boolean);
    const onAlpha = teamAlpha.some((player) => player.user_id === user?.id);
    setDisputing(true);
    try {
      const response = await base44.functions.invoke("createDispute", {
        match_type: "8s",
        match_id: match.id,
        wager_id: match.id,
        reason: "score_dispute",
        description: `Dispute submitted from 8s match room ${match.id}.`,
        reported_against: onAlpha ? match.challenger_id : match.host_id,
        reported_against_name: onAlpha ? (match.challenger_name || "Team Bravo") : (match.host_name || "Team Alpha"),
        evidence_urls: evidenceUrls,
        escalated: Boolean(user?.is_premium),
      });
      if (!response.data?.success) throw new Error(response.data?.error || "Could not create dispute");
      toast({ title: "Ticket created", description: "You can follow this dispute under My Tickets." });
      await loadRoom(true);
    } catch (error) {
      toast({ title: "Dispute failed", description: error.message, variant: "destructive" });
    } finally {
      setDisputing(false);
    }
  };

  const adminGrantWin = async (action) => {
    const teamName = action === "approve_team_a" ? "Team Alpha" : "Team Bravo";
    if (typeof window !== "undefined" && !window.confirm(`Grant ${teamName} the win and give the other team an automatic loss?`)) return;
    setAdminBusy(true);
    try {
      const response = await base44.functions.invoke("adminResolveMatchRoom", {
        match_type: "8s",
        match_id: match.id,
        ticket_id: match.admin_request_ticket_id,
        action,
        reason: `Admin granted ${teamName} the win.`,
      });
      if (!response.data?.success) throw new Error(response.data?.error || "Could not resolve match");
      toast({ title: "Match resolved", description: `${teamName} was granted the win.` });
      await loadRoom(true);
    } catch (error) {
      toast({ title: "Resolve failed", description: error.message, variant: "destructive" });
    } finally {
      setAdminBusy(false);
    }
  };

  const adminCancelMatch = async () => {
    if (typeof window !== "undefined" && !window.confirm("Cancel this 8s match? This cannot be undone.")) return;
    setAdminBusy(true);
    try {
      const response = await base44.functions.invoke("refundWager", {
        wager_id: match.id,
        reason: `Cancelled by staff (${user?.full_name || user?.username || user?.email || "Admin"}).`,
      });
      if (!response.data?.success) throw new Error(response.data?.error || "Could not cancel match");
      setMatch(response.data.wager || { ...match, status: "cancelled" });
      toast({ title: "Match cancelled" });
    } catch (error) {
      toast({ title: "Cancel failed", description: error.message, variant: "destructive" });
    } finally {
      setAdminBusy(false);
    }
  };

  if (loading && !match) return <PageLoader label="Loading 8s match" />;
  if (!match) return <div className="mx-auto max-w-xl px-4 py-20 text-center"><h1 className="text-2xl font-black">Match not found</h1><Link to="/ranked/8s" className="mt-5 inline-flex text-cyan">Back to Ranked 8s</Link></div>;

  return (
    <div className="min-h-screen py-6">
      <div className="mx-auto max-w-[1600px] px-4 lg:px-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <Link to="/ranked/8s" className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-wider text-vapor hover:text-cyan"><ArrowLeft className="h-4 w-4" /> Ranked 8s</Link>
          <div className="flex items-center gap-2"><span className={`rounded-full border px-3 py-1.5 text-[9px] font-black uppercase tracking-wider ${isComplete ? "border-green/25 bg-green/10 text-green" : "border-cyan/20 bg-cyan/10 text-cyan"}`}>{displayStatus(match.status)}</span><button onClick={() => loadRoom()} className="rounded-lg border border-white/[0.08] p-2 text-vapor hover:text-cyan" aria-label="Refresh"><RefreshCw className="h-4 w-4" /></button></div>
        </div>

        <section className="relative mb-6 overflow-hidden rounded-2xl border border-white/[0.09] bg-card shadow-[0_24px_70px_-48px_rgba(0,0,0,.95)]">
        <header className="relative border-b border-white/[0.06] p-6 lg:p-8">
          <div className="absolute inset-x-20 top-0 h-px bg-gradient-to-r from-cyan/50 via-white/10 to-orange/50" />
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div><p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.22em] text-cyan"><Shield className="h-4 w-4" /> Ranked 8s match room</p><h1 className="mt-3 text-3xl font-black sm:text-4xl">Team Alpha <span className="text-vapor">vs</span> Team Bravo</h1><p className="mt-2 text-sm text-vapor">{match.game_mode_display || match.game_mode} · BO{match.best_of || 3} · Match #{String(match.id).slice(-8).toUpperCase()}</p></div>
            <div className="flex flex-wrap gap-2">
              {!locked && isParticipant && !closedStatuses.has(match.status) && <button onClick={leave} disabled={busy} className="inline-flex items-center gap-2 rounded-xl border border-red-400/20 bg-red-400/[0.07] px-4 py-3 text-[10px] font-black uppercase tracking-wider text-red-300"><LogOut className="h-4 w-4" /> Leave lobby</button>}
              {isParticipant && scoreStatuses.has(match.status) && match.eights_score_vote_status !== "approved" && <button onClick={() => setScoreOpen(true)} className="inline-flex items-center gap-2 rounded-xl bg-cyan px-5 py-3 text-[10px] font-black uppercase tracking-wider text-background"><Check className="h-4 w-4" /> Submit Score</button>}
            </div>
          </div>
        </header>

        {!locked && !closedStatuses.has(match.status) && (
          <section className="m-4 rounded-xl border border-purple-300/20 bg-purple-300/[0.055] p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-purple-300/10 text-purple-300"><Shuffle className="h-5 w-5" /></div><div><p className="text-[9px] font-black uppercase tracking-wider text-purple-300">Automatic team generator</p><p className="mt-1 font-black">{joined < 8 ? `Waiting for ${8 - joined} more ${8 - joined === 1 ? "player" : "players"}` : "Teams shuffled · veto window open"}</p></div></div>
              <div className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-black/20 px-4 py-3"><Users className="h-4 w-4 text-cyan" /><span className="font-mono font-black">{joined}/8</span>{countdown !== null && joined === 8 && <><span className="text-vapor">·</span><Clock3 className="h-4 w-4 text-yellow-300" /><span className="font-mono font-black text-yellow-300">{formatCountdown(countdown)}</span></>}</div>
            </div>
            {reshuffleOpen && (
              <div className="mt-4 flex flex-col gap-3 border-t border-purple-300/15 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <div><p className="text-[10px] font-black uppercase tracking-wider text-white">Team reshuffle veto</p><p className="mt-1 text-xs text-vapor">Five players must agree before the match starts.</p></div>
                <div className="flex items-center gap-3"><span className="rounded-lg border border-purple-300/20 bg-black/20 px-3 py-2 font-mono text-sm font-black text-purple-200">{reshuffleVoteCount}/{requiredReshuffleVotes}</span>{isParticipant && <button type="button" onClick={voteForReshuffle} disabled={reshuffleBusy} className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-[10px] font-black uppercase tracking-wider disabled:opacity-50 ${hasReshuffleVote ? "border-white/15 bg-white/[0.06] text-white" : "border-purple-300/30 bg-purple-300/10 text-purple-200 hover:bg-purple-300/20"}`}><Shuffle className={`h-3.5 w-3.5 ${reshuffleBusy ? "animate-spin" : ""}`} />{hasReshuffleVote ? "Withdraw veto" : "Vote reshuffle"}</button>}</div>
              </div>
            )}
          </section>
        )}

        <div className="grid min-w-0 gap-5 border-t border-white/[0.06] p-4 xl:grid-cols-[minmax(0,1fr)_410px] xl:p-5">
          <div className="min-w-0 space-y-4">
            <MatchTeamTable label="Team Alpha" name="Team Alpha" color="orange" players={teamAlpha} captainId={match.host_id} finalScore={isComplete ? (match.confirmed_score_alpha ?? (alphaWinner ? match.winner_score : match.loser_score)) : 0} isComplete={isComplete} isWinner={alphaWinner} />
            <div className="flex items-center gap-4 px-2" aria-hidden="true"><span className="h-px flex-1 bg-gradient-to-r from-transparent via-orange/55 to-white/15" /><span className="flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.09] bg-black/25 text-[8px] font-black uppercase tracking-wider text-vapor">VS</span><span className="h-px flex-1 bg-gradient-to-r from-white/15 via-cyan/55 to-transparent" /></div>
            <MatchTeamTable label="Team Bravo" name="Team Bravo" color="cyan" players={teamBravo} captainId={match.challenger_id} finalScore={isComplete ? (match.confirmed_score_bravo ?? (bravoWinner ? match.winner_score : match.loser_score)) : 0} isComplete={isComplete} isWinner={bravoWinner} />
          </div>
          <div className="flex min-w-0 flex-col gap-4">
            <div className="rounded-xl border border-white/[0.07] bg-black/15 p-4 text-center">
              <Swords className="mx-auto h-6 w-6 text-cyan" /><p className="mt-3 text-[9px] font-black uppercase tracking-[0.18em] text-vapor">Randomized 4v4</p><p className="mt-2 text-2xl font-black">{match.game_mode_display || match.game_mode}</p><div className="my-4 h-px bg-white/[0.06]" /><p className="text-[9px] font-black uppercase text-vapor">XP rewards</p><div className="mt-2 flex justify-center gap-2"><span className="rounded-lg border border-green/15 bg-green/5 px-3 py-2 font-mono text-xs font-black text-green">+150 WIN</span><span className="rounded-lg border border-white/[0.08] px-3 py-2 font-mono text-xs font-black">+50 PLAY</span></div>{isComplete && <div className="mt-4 rounded-xl border border-yellow-300/20 bg-yellow-300/[0.07] p-3 text-yellow-300"><Trophy className="mx-auto h-5 w-5" /><p className="mt-1 text-xs font-black">{match.winner_name || "Winner"}</p></div>}
            </div>
            <MatchRoomChat
              conversationId={match.id}
              matchType="wager"
              teamAPlayers={teamAlpha}
              teamBPlayers={teamBravo}
              inputActions={(
                <div>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={requestAdmin} disabled={!isParticipant || requestingAdmin || closedStatuses.has(match.status)} className="flex items-center justify-center gap-2 rounded-lg border border-red-400/20 bg-red-400/[0.07] px-2 py-2.5 text-[9px] font-black uppercase tracking-wider text-red-300 hover:bg-red-400/15 disabled:opacity-40">
                      <AlertTriangle className="h-3.5 w-3.5" /> {requestingAdmin ? "Requesting..." : "Request Admin"}
                    </button>
                    <button type="button" onClick={createDispute} disabled={!isParticipant || disputing || closedStatuses.has(match.status)} className="flex items-center justify-center gap-2 rounded-lg border border-orange/25 bg-orange/[0.08] px-2 py-2.5 text-[9px] font-black uppercase tracking-wider text-orange hover:bg-orange/15 disabled:opacity-40">
                      <Flag className="h-3.5 w-3.5" /> {disputing ? "Submitting..." : "Submit ticket"}
                    </button>
                  </div>
                  {(match.admin_request_status || match.requested_admin) && <p className="mt-2 text-center text-[8px] font-bold text-red-300">Admin request: {{ waiting_for_admin: "Waiting for admin", admin_joined: match.assigned_admin_name ? `${match.assigned_admin_name} joined` : "Admin joined", resolved: "Resolved", closed: "Closed" }[match.admin_request_status || "waiting_for_admin"] || "Waiting for admin"}</p>}
                </div>
              )}
            />
          </div>
        </div>
        </section>

        {isStaff && !closedStatuses.has(match.status) && (
          <details className="group mb-5 rounded-xl border border-blue-400/15 bg-card">
            <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-[10px] font-black uppercase tracking-wider text-blue-300 transition-colors hover:bg-blue-400/[0.05] [&::-webkit-details-marker]:hidden">
              <span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Admin tools</span>
              <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
            </summary>
            <div className="grid gap-2 border-t border-white/[0.06] p-3 sm:grid-cols-4">
              <button type="button" onClick={() => adminGrantWin("approve_team_a")} disabled={adminBusy} className="rounded-lg border border-cyan/20 bg-cyan/[0.07] px-3 py-2.5 text-[9px] font-black uppercase tracking-wider text-cyan hover:bg-cyan/15 disabled:opacity-40">Alpha wins</button>
              <button type="button" onClick={() => adminGrantWin("approve_team_b")} disabled={adminBusy} className="rounded-lg border border-orange/20 bg-orange/[0.07] px-3 py-2.5 text-[9px] font-black uppercase tracking-wider text-orange hover:bg-orange/15 disabled:opacity-40">Bravo wins</button>
              {isAdmin && <button type="button" onClick={adminReshuffleTeams} disabled={adminBusy || !reshuffleOpen} className="flex items-center justify-center gap-2 rounded-lg border border-purple-300/25 bg-purple-300/[0.08] px-3 py-2.5 text-[9px] font-black uppercase tracking-wider text-purple-200 hover:bg-purple-300/15 disabled:opacity-40"><Shuffle className="h-3.5 w-3.5" /> Reshuffle teams</button>}
              <button type="button" onClick={adminCancelMatch} disabled={adminBusy} className="flex items-center justify-center gap-2 rounded-lg border border-red-400/20 bg-red-400/[0.07] px-3 py-2.5 text-[9px] font-black uppercase tracking-wider text-red-300 hover:bg-red-400/15 disabled:opacity-40"><AlertTriangle className="h-3.5 w-3.5" /> {adminBusy ? "Updating..." : "Cancel match"}</button>
            </div>
          </details>
        )}

        <div className="space-y-5"><MatchMapSeries maps={seriesMaps} mode={match.game_mode_display || match.game_mode} host="System generated" bestOf={match.best_of || 3} /><MatchRulesPanel matchType="ranked" gameMode={match.game_mode_display || match.game_mode} collapsible defaultOpen={false} /></div>
      </div>

      {scoreOpen && isParticipant && scoreStatuses.has(match.status) && match.eights_score_vote_status !== "approved" && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <button className="absolute inset-0" onClick={() => setScoreOpen(false)} aria-label="Close score dialog" />
          <section className="relative z-10 w-full max-w-md rounded-2xl border border-white/[0.1] bg-card p-6">
            <div className="flex items-start justify-between"><div><p className="text-[9px] font-black uppercase tracking-wider text-cyan">Player agreement</p><h2 className="mt-1 text-xl font-black">Submit final score</h2><p className="mt-1 text-xs text-vapor">The report proceeds when {requiredScoreVotes} players agree.</p></div><button onClick={() => setScoreOpen(false)} className="rounded-lg border border-white/[0.08] p-2 text-vapor"><X className="h-4 w-4" /></button></div>
            <div className="mt-6 grid grid-cols-[1fr_auto_1fr] items-end gap-3"><label className="text-center"><span className="text-[9px] font-black uppercase text-cyan">Alpha</span><input type="number" min="0" max={Math.floor(Number(match.best_of || 3) / 2) + 1} value={hasScoreProposal ? match.eights_score_vote_alpha : scoreA} onChange={(event) => setScoreA(event.target.value)} disabled={hasScoreProposal} className="mt-2 w-full rounded-xl border border-cyan/20 bg-black/20 px-3 py-3 text-center font-mono text-4xl font-black text-cyan outline-none disabled:opacity-70" /></label><span className="mb-5 text-xs font-black text-vapor">VS</span><label className="text-center"><span className="text-[9px] font-black uppercase text-orange">Bravo</span><input type="number" min="0" max={Math.floor(Number(match.best_of || 3) / 2) + 1} value={hasScoreProposal ? match.eights_score_vote_bravo : scoreB} onChange={(event) => setScoreB(event.target.value)} disabled={hasScoreProposal} className="mt-2 w-full rounded-xl border border-orange/20 bg-black/20 px-3 py-3 text-center font-mono text-4xl font-black text-orange outline-none disabled:opacity-70" /></label></div>
            <div className="mt-5 flex items-center justify-between rounded-xl border border-white/[0.08] bg-black/20 px-4 py-3"><span className="text-[9px] font-black uppercase tracking-wider text-vapor">Player approvals</span><span className="font-mono text-sm font-black text-cyan">{scoreVoteCount}/{requiredScoreVotes}</span></div>
            <button onClick={submitScore} disabled={busy || currentUserAgreed} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-cyan px-5 py-3.5 text-xs font-black uppercase tracking-wider text-background disabled:opacity-50"><Sparkles className="h-4 w-4" /> {busy ? "Submitting..." : currentUserAgreed ? "Agreement recorded" : hasScoreProposal ? "Agree with score" : "Submit score"}</button>
          </section>
        </div>
      )}
    </div>
  );
}
