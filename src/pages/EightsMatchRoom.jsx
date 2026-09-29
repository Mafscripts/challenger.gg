import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Check, Clock3, Crown, LogOut, RefreshCw, Shield, Shuffle, Sparkles, Swords, Trophy, Users, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import MatchChat from "@/components/match/MatchChat";
import MatchMapSeries from "@/components/match/MatchMapSeries";
import MatchRulesPanel from "@/components/match/MatchRulesPanel";
import ActivisionIdLabel from "@/components/competition/ActivisionIdLabel";
import UserBadges from "@/components/ui/UserBadges";
import { loadWagerParticipants } from "@/lib/wagerParticipants";
import { toast } from "@/components/ui/use-toast";

const closedStatuses = new Set(["completed", "cancelled"]);
const scoreStatuses = new Set(["in_progress", "awaiting_team_alpha_report", "awaiting_team_bravo_report", "awaiting_completion"]);
const displayStatus = (value) => ({ open: "Lobby open", in_progress: "Match live", awaiting_team_alpha_report: "Score confirmation", awaiting_team_bravo_report: "Score confirmation", awaiting_completion: "Completing", score_conflict: "Under review", disputed: "Under review", completed: "Complete", cancelled: "Cancelled" }[value] || String(value || "open").replaceAll("_", " "));
const playerName = (player) => player?.full_name || player?.user_name || player?.username || "Open slot";

function PlayerCard({ player, captain, tone }) {
  const cyan = tone === "cyan";
  return (
    <div className={`rounded-xl border p-3 ${cyan ? "border-cyan/15 bg-cyan/[0.04]" : "border-orange/15 bg-orange/[0.04]"}`}>
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg font-mono text-sm font-black text-background ${cyan ? "bg-cyan" : "bg-orange"}`}>{playerName(player).charAt(0).toUpperCase()}</div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2"><p className="truncate text-sm font-black">{playerName(player)}</p>{captain && <Crown className="h-3.5 w-3.5 text-yellow-300" />}<UserBadges user={player} size="xs" iconOnly /></div>
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

function TeamPanel({ label, players, captainId, tone, score, winner }) {
  const cyan = tone === "cyan";
  return (
    <section className={`overflow-hidden rounded-2xl border bg-card ${cyan ? "border-cyan/20" : "border-orange/20"}`}>
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
  const [scoreOpen, setScoreOpen] = useState(false);
  const [scoreA, setScoreA] = useState(0);
  const [scoreB, setScoreB] = useState(0);
  const [now, setNow] = useState(Date.now());

  const hydrateProgression = useCallback(async (players) => Promise.all(players.map(async (player) => {
    const [xpRows, statRows] = await Promise.all([
      base44.entities.XPStats.filterFresh({ user_id: player.user_id }, "-created_date", 1).catch(() => []),
      base44.entities.EightsStats.filterFresh({ user_id: player.user_id }, "-created_date", 1).catch(() => []),
    ]);
    const xp = xpRows?.[0];
    const stats = statRows?.[0];
    return { ...player, xp_level: xp?.level || 1, eights_rating: stats?.rating || 1000, eights_wins: stats?.wins || 0, monthly_wins: stats?.monthly_wins || 0 };
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
  const isCaptain = [match?.host_id, match?.challenger_id].includes(user?.id);
  const joined = allPlayers.length;
  const countdown = match?.roster_lock_deadline ? Math.max(0, Math.ceil((new Date(match.roster_lock_deadline).getTime() - now) / 1000)) : null;
  const locked = Boolean(match?.roster_locked || match?.status === "in_progress" || countdown === 0);
  const isComplete = match?.status === "completed";
  const alphaWinner = isComplete && match?.winner_id === match?.host_id;
  const bravoWinner = isComplete && match?.winner_id === match?.challenger_id;

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
    const winsNeeded = Math.floor(Number(match.best_of || 3) / 2) + 1;
    if (Math.max(Number(scoreA), Number(scoreB)) !== winsNeeded || Number(scoreA) === Number(scoreB)) {
      toast({ title: "Invalid score", description: `One team must reach ${winsNeeded} map wins.`, variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const report = await base44.functions.invoke("submitScore", { wager_id: id, team_alpha_score: Number(scoreA), team_bravo_score: Number(scoreB) });
      if (!report.data?.success) throw new Error(report.data?.error || "Could not submit score");
      if (report.data.ready_to_complete) {
        const complete = await base44.functions.invoke("completeWager", { wager_id: id, winner_id: report.data.winner_id, team_alpha_score: Number(scoreA), team_bravo_score: Number(scoreB) });
        if (!complete.data?.success) throw new Error(complete.data?.error || "Could not complete match");
      }
      setScoreOpen(false);
      toast({ title: report.data.ready_to_complete ? "Match complete" : "Score submitted", description: report.data.ready_to_complete ? "XP and monthly standings are updated." : "Waiting for the other captain to confirm." });
      await loadRoom(true);
    } catch (error) {
      toast({ title: "Score not submitted", description: error.message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  if (loading && !match) return <div className="flex min-h-[70vh] items-center justify-center text-sm text-vapor">Opening 8s match room...</div>;
  if (!match) return <div className="mx-auto max-w-xl px-4 py-20 text-center"><h1 className="text-2xl font-black">Match not found</h1><Link to="/ranked/8s" className="mt-5 inline-flex text-cyan">Back to Ranked 8s</Link></div>;

  return (
    <div className="min-h-screen py-6">
      <div className="mx-auto max-w-[1600px] px-4 lg:px-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <Link to="/ranked/8s" className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-wider text-vapor hover:text-cyan"><ArrowLeft className="h-4 w-4" /> Ranked 8s</Link>
          <div className="flex items-center gap-2"><span className={`rounded-full border px-3 py-1.5 text-[9px] font-black uppercase tracking-wider ${isComplete ? "border-green/25 bg-green/10 text-green" : "border-cyan/20 bg-cyan/10 text-cyan"}`}>{displayStatus(match.status)}</span><button onClick={() => loadRoom()} className="rounded-lg border border-white/[0.08] p-2 text-vapor hover:text-cyan" aria-label="Refresh"><RefreshCw className="h-4 w-4" /></button></div>
        </div>

        <header className="relative mb-6 overflow-hidden rounded-2xl border border-white/[0.08] bg-card p-6 lg:p-8">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan/80 to-transparent" />
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div><p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.22em] text-cyan"><Shield className="h-4 w-4" /> Ranked 8s match room</p><h1 className="mt-3 text-3xl font-black sm:text-4xl">Team Alpha <span className="text-vapor">vs</span> Team Bravo</h1><p className="mt-2 text-sm text-vapor">{match.game_mode_display || match.game_mode} · BO{match.best_of || 3} · Match #{String(match.id).slice(-8).toUpperCase()}</p></div>
            <div className="flex flex-wrap gap-2">
              {!locked && isParticipant && !closedStatuses.has(match.status) && <button onClick={leave} disabled={busy} className="inline-flex items-center gap-2 rounded-xl border border-red-400/20 bg-red-400/[0.07] px-4 py-3 text-[10px] font-black uppercase tracking-wider text-red-300"><LogOut className="h-4 w-4" /> Leave lobby</button>}
              {isCaptain && scoreStatuses.has(match.status) && <button onClick={() => setScoreOpen(true)} className="inline-flex items-center gap-2 rounded-xl bg-cyan px-5 py-3 text-[10px] font-black uppercase tracking-wider text-background"><Check className="h-4 w-4" /> Submit score</button>}
            </div>
          </div>
        </header>

        {!locked && !closedStatuses.has(match.status) && (
          <section className="mb-6 rounded-2xl border border-purple-300/20 bg-purple-300/[0.055] p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-purple-300/10 text-purple-300"><Shuffle className="h-5 w-5" /></div><div><p className="text-[9px] font-black uppercase tracking-wider text-purple-300">Automatic team generator</p><p className="mt-1 font-black">{joined < 8 ? `Waiting for ${8 - joined} more ${8 - joined === 1 ? "player" : "players"}` : "Teams shuffled · roster lock pending"}</p></div></div><div className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-black/20 px-4 py-3"><Users className="h-4 w-4 text-cyan" /><span className="font-mono font-black">{joined}/8</span>{countdown !== null && joined === 8 && <><span className="text-vapor">·</span><Clock3 className="h-4 w-4 text-yellow-300" /><span className="font-mono font-black text-yellow-300">{countdown}s</span></>}</div></div>
          </section>
        )}

        <section className="mb-6 grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_260px_minmax(0,1fr)]">
          <TeamPanel label="Team Alpha" players={teamAlpha} captainId={match.host_id} tone="cyan" score={isComplete ? (match.confirmed_score_alpha ?? (alphaWinner ? match.winner_score : match.loser_score)) : undefined} winner={alphaWinner} />
          <div className="order-first rounded-2xl border border-white/[0.08] bg-card p-5 text-center xl:order-none xl:sticky xl:top-24">
            <Swords className="mx-auto h-6 w-6 text-cyan" /><p className="mt-3 text-[9px] font-black uppercase tracking-[0.18em] text-vapor">Randomized 4v4</p><p className="mt-2 text-2xl font-black">{match.game_mode_display || match.game_mode}</p><div className="my-4 h-px bg-white/[0.06]" /><p className="text-[9px] font-black uppercase text-vapor">XP rewards</p><div className="mt-2 flex justify-center gap-2"><span className="rounded-lg border border-green/15 bg-green/5 px-3 py-2 font-mono text-xs font-black text-green">+150 WIN</span><span className="rounded-lg border border-white/[0.08] px-3 py-2 font-mono text-xs font-black">+50 PLAY</span></div>{isComplete && <div className="mt-4 rounded-xl border border-yellow-300/20 bg-yellow-300/[0.07] p-3 text-yellow-300"><Trophy className="mx-auto h-5 w-5" /><p className="mt-1 text-xs font-black">{match.winner_name || "Winner"}</p></div>}</div>
          <TeamPanel label="Team Bravo" players={teamBravo} captainId={match.challenger_id} tone="orange" score={isComplete ? (match.confirmed_score_bravo ?? (bravoWinner ? match.winner_score : match.loser_score)) : undefined} winner={bravoWinner} />
        </section>

        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,.65fr)]">
          <div className="space-y-5"><MatchMapSeries maps={Array.isArray(match.series_maps) ? match.series_maps : []} mode={match.game_mode_display || match.game_mode} host="System generated" bestOf={match.best_of || 3} /><MatchRulesPanel matchType="ranked" gameMode={match.game_mode_display || match.game_mode} collapsible defaultOpen={false} /></div>
          <MatchChat conversationId={match.id} matchType="wager" accent="cyan" teamAPlayerIds={teamAlpha.map((p) => p.user_id)} teamBPlayerIds={teamBravo.map((p) => p.user_id)} live compact sticky={false} heightClass="h-[520px]" />
        </div>
      </div>

      {scoreOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <button className="absolute inset-0" onClick={() => setScoreOpen(false)} aria-label="Close score dialog" />
          <section className="relative z-10 w-full max-w-md rounded-2xl border border-white/[0.1] bg-card p-6">
            <div className="flex items-start justify-between"><div><p className="text-[9px] font-black uppercase tracking-wider text-cyan">Captain confirmation</p><h2 className="mt-1 text-xl font-black">Submit final score</h2><p className="mt-1 text-xs text-vapor">Both captains must enter the same result.</p></div><button onClick={() => setScoreOpen(false)} className="rounded-lg border border-white/[0.08] p-2 text-vapor"><X className="h-4 w-4" /></button></div>
            <div className="mt-6 grid grid-cols-[1fr_auto_1fr] items-end gap-3"><label className="text-center"><span className="text-[9px] font-black uppercase text-cyan">Alpha</span><input type="number" min="0" max="2" value={scoreA} onChange={(event) => setScoreA(Number(event.target.value))} className="mt-2 w-full rounded-xl border border-cyan/20 bg-black/20 px-3 py-3 text-center font-mono text-4xl font-black text-cyan outline-none" /></label><span className="mb-5 text-xs font-black text-vapor">VS</span><label className="text-center"><span className="text-[9px] font-black uppercase text-orange">Bravo</span><input type="number" min="0" max="2" value={scoreB} onChange={(event) => setScoreB(Number(event.target.value))} className="mt-2 w-full rounded-xl border border-orange/20 bg-black/20 px-3 py-3 text-center font-mono text-4xl font-black text-orange outline-none" /></label></div>
            <button onClick={submitScore} disabled={busy} className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-cyan px-5 py-3.5 text-xs font-black uppercase tracking-wider text-background disabled:opacity-50"><Sparkles className="h-4 w-4" /> {busy ? "Submitting..." : "Confirm result"}</button>
          </section>
        </div>
      )}
    </div>
  );
}
