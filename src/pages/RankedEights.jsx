import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, CalendarDays, Crown, Flame, Plus, RefreshCw, Sparkles, Trophy, Users } from "lucide-react";
import { base44 } from "@/api/base44Client";
import CompetitionHero from "@/components/match/CompetitionHero";
import CreateLobbyModal from "@/components/match/CreateLobbyModal";
import ActivisionIdNotice from "@/components/competition/ActivisionIdNotice";
import RankedModeTabs from "@/components/ranked/RankedModeTabs";
import { activisionIdRequiredMessage, hasActivisionId } from "@/lib/activision";
import { toast } from "@/components/ui/use-toast";

const activeStatuses = new Set(["open", "in_progress", "awaiting_team_alpha_report", "awaiting_team_bravo_report", "awaiting_completion", "score_conflict", "disputed"]);
const EIGHTS_PRIZE_START_MONTH = "2026-10";
const EIGHTS_PRIZE_START_DATE = new Date("2026-10-01T00:00:00Z");
const monthKey = () => new Date().toISOString().slice(0, 7);
const daysLeftInMonth = () => {
  const now = new Date();
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return Math.max(0, last.getDate() - now.getDate());
};
const daysUntilPrizeStarts = () => Math.max(0, Math.ceil((EIGHTS_PRIZE_START_DATE.getTime() - Date.now()) / 86400000));

export default function RankedEights() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [lobbies, setLobbies] = useState([]);
  const [counts, setCounts] = useState({});
  const [xpStats, setXpStats] = useState(null);
  const [eightsStats, setEightsStats] = useState([]);
  const [activeLobby, setActiveLobby] = useState(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const currentUser = await base44.auth.me();
      const [openRows, statsRows, xpRows, memberships] = await Promise.all([
        base44.entities.Wager.filterFresh({ match_type: "8s", status: "open" }, "-created_date", 30),
        base44.entities.EightsStats.filterFresh({}, "-monthly_wins", 100),
        base44.entities.XPStats.filterFresh({ user_id: currentUser.id }, "-created_date", 1),
        base44.entities.WagerParticipant.filterFresh({ user_id: currentUser.id }, "-joined_date", 50),
      ]);
      const relevantStats = (statsRows || []).filter((row) => !row.monthly_key || row.monthly_key === monthKey());
      const activeMemberships = (memberships || []).filter(Boolean);
      const activeMatches = await Promise.all(activeMemberships.map((row) => base44.entities.Wager.getFresh(row.wager_id).catch(() => null)));
      const current = activeMatches.filter((row) => row?.match_type === "8s" && activeStatuses.has(row.status)).sort((a, b) => new Date(b.created_date || 0) - new Date(a.created_date || 0))[0] || null;
      const participantLists = await Promise.all((openRows || []).map((row) => base44.entities.WagerParticipant.filterFresh({ wager_id: row.id }, "joined_date", 8).catch(() => [])));
      setUser(currentUser);
      setLobbies(openRows || []);
      setEightsStats(relevantStats);
      setXpStats((xpRows || [])[0] || null);
      setActiveLobby(current);
      setCounts(Object.fromEntries((openRows || []).map((row, index) => [row.id, participantLists[index]?.length || 0])));
    } catch (error) {
      console.error("Failed to load 8s:", error);
      toast({ title: "8s unavailable", description: error.message || "Please try again.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (monthKey() > EIGHTS_PRIZE_START_MONTH) {
      base44.functions.invoke("settleEightsMonthlyPrize", {}).catch(() => null);
    }
    load();
    const interval = window.setInterval(() => load(true), 6000);
    return () => window.clearInterval(interval);
  }, [load]);

  const sortedLeaders = useMemo(() => [...eightsStats].sort((a, b) => (
    Number(b.monthly_wins || 0) - Number(a.monthly_wins || 0)
    || Number(b.monthly_xp || 0) - Number(a.monthly_xp || 0)
    || Number(b.rating || 1000) - Number(a.rating || 1000)
  )).slice(0, 8), [eightsStats]);
  const myStats = eightsStats.find((row) => row.user_id === user?.id);
  const level = Number(xpStats?.level || user?.xp_level || 1);
  const currentXp = Number(xpStats?.current_xp || 0);
  const xpTarget = Number(xpStats?.xp_to_next_level || 1000);
  const xpProgress = Math.min(100, Math.round((currentXp / Math.max(1, xpTarget)) * 100));
  const prizeActive = monthKey() >= EIGHTS_PRIZE_START_MONTH;

  const joinLobby = async (lobby) => {
    if (!hasActivisionId(user)) {
      toast({ title: "Activision ID required", description: activisionIdRequiredMessage, variant: "destructive" });
      return;
    }
    setJoining(lobby.id);
    try {
      const response = await base44.functions.invoke("acceptWager", { wager_id: lobby.id });
      if (!response.data?.success) throw new Error(response.data?.error || "Could not join this lobby");
      navigate(`/8s-match/${lobby.id}`);
    } catch (error) {
      toast({ title: "Could not join", description: error.message, variant: "destructive" });
      await load(true);
    } finally {
      setJoining("");
    }
  };

  const handleCreated = (result) => {
    setCreateOpen(false);
    if (result?.wager_id) navigate(`/8s-match/${result.wager_id}`);
    else load();
  };

  return (
    <div className="min-h-screen py-8">
      <div className="mx-auto max-w-[1600px] px-4 lg:px-6">
        <RankedModeTabs />
        <CompetitionHero
          eyebrow="8-player competitive queue"
          title="Ranked 8s"
          description="Join solo. At 8 players the system shuffles everyone into two random teams, picks the map rotation and locks the match room."
          action={activeLobby ? (
            <Link to={`/8s-match/${activeLobby.id}`} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-cyan px-6 py-3.5 text-xs font-black uppercase tracking-wider text-background">
              Return to your 8s <ArrowRight className="h-4 w-4" />
            </Link>
          ) : (
            <button onClick={() => setCreateOpen(true)} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-cyan px-6 py-3.5 text-xs font-black uppercase tracking-wider text-background hover:bg-cyan/90">
              <Plus className="h-4 w-4" /> Create 8s lobby
            </button>
          )}
          stats={[
            { label: "Open lobbies", value: lobbies.length, icon: Users, color: "text-cyan" },
            { label: "Your 8s wins", value: myStats?.wins || 0, icon: Trophy, color: "text-yellow-400" },
            { label: "XP level", value: level, icon: Sparkles, color: "text-purple-300" },
          ]}
        />
        <ActivisionIdNotice user={user} className="mb-6" />

        <section className="mb-6 overflow-hidden rounded-2xl border border-yellow-400/25 bg-gradient-to-r from-yellow-400/[0.11] via-card to-card">
          <div className="grid gap-6 p-6 lg:grid-cols-[1fr_auto] lg:items-center">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-yellow-400/25 bg-yellow-400/10 text-yellow-300"><Crown className="h-6 w-6" /></div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-yellow-300">{prizeActive ? "Monthly 8s race" : "8s prize announcement"}</p>
                <h2 className="mt-1 text-2xl font-black">{prizeActive ? "#1 wins $100" : "$100 monthly prize starts October 1"}</h2>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-vapor">{prizeActive ? "Play at least one completed 8s match this month. Most wins takes the prize; monthly XP and rating break ties." : "Matches played before October 1 do not count toward the $100 prize. Starting in October, the player with the most monthly 8s wins takes the prize."}</p>
              </div>
            </div>
            <div className="rounded-xl border border-white/[0.08] bg-black/20 px-5 py-4 text-center">
              <CalendarDays className="mx-auto h-5 w-5 text-cyan" />
              <p className="mt-2 font-mono text-2xl font-black">{prizeActive ? daysLeftInMonth() : daysUntilPrizeStarts()}</p>
              <p className="text-[9px] font-black uppercase tracking-wider text-vapor">{prizeActive ? "days remaining" : "days until launch"}</p>
            </div>
          </div>
        </section>

        <div className="mb-6 grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,.75fr)]">
          <section className="glass overflow-hidden rounded-2xl border border-white/[0.07]">
            <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
              <div><h2 className="font-black">Open 8s lobbies</h2><p className="mt-1 text-xs text-vapor">Every lobby is fixed at 4v4 / 8 players.</p></div>
              <button onClick={() => load()} className="rounded-lg border border-white/[0.08] p-2 text-vapor hover:text-cyan" aria-label="Refresh lobbies"><RefreshCw className="h-4 w-4" /></button>
            </div>
            <div className="p-4">
              {loading ? <div className="py-12 text-center text-sm text-vapor">Loading 8s lobbies...</div> : lobbies.length === 0 ? (
                <div className="rounded-xl border border-dashed border-white/10 px-6 py-12 text-center"><Users className="mx-auto h-7 w-7 text-vapor" /><p className="mt-3 font-bold">No open lobby yet</p><p className="mt-1 text-xs text-vapor">Create the first lobby and wait for seven rivals.</p></div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {lobbies.map((lobby) => {
                    const joined = counts[lobby.id] || 0;
                    const alreadyIn = activeLobby?.id === lobby.id;
                    return (
                      <article key={lobby.id} className="rounded-xl border border-white/[0.08] bg-secondary/45 p-4 transition-colors hover:border-cyan/25">
                        <div className="flex items-start justify-between gap-4"><div><p className="text-[9px] font-black uppercase tracking-wider text-cyan">{lobby.game_mode_display || lobby.game_mode}</p><h3 className="mt-1 font-black">Random 4v4</h3></div><span className="rounded-full border border-cyan/20 bg-cyan/10 px-2.5 py-1 font-mono text-xs font-black text-cyan">{joined}/8</span></div>
                        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full rounded-full bg-cyan transition-all" style={{ width: `${(joined / 8) * 100}%` }} /></div>
                        <p className="mt-3 text-xs text-vapor">Hosted by {lobby.host_name || "Player"} · BO{lobby.best_of || 3}</p>
                        <button disabled={joining === lobby.id || (activeLobby && !alreadyIn) || joined >= 8} onClick={() => alreadyIn ? navigate(`/8s-match/${lobby.id}`) : joinLobby(lobby)} className="mt-4 w-full rounded-lg bg-cyan px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-background disabled:cursor-not-allowed disabled:opacity-45">
                          {joining === lobby.id ? "Joining..." : alreadyIn ? "Open match room" : activeLobby ? "Finish active 8s first" : "Join solo"}
                        </button>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          <section className="glass rounded-2xl border border-purple-300/15 p-5">
            <div className="flex items-center justify-between"><div><p className="text-[9px] font-black uppercase tracking-[0.18em] text-purple-300">Your progression</p><h2 className="mt-1 text-xl font-black">Level {level}</h2></div><div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-300/10 text-purple-300"><Sparkles className="h-6 w-6" /></div></div>
            <div className="mt-6 flex items-end justify-between"><p className="font-mono text-2xl font-black">{currentXp.toLocaleString()} <span className="text-sm text-vapor">XP</span></p><p className="text-xs text-vapor">{xpTarget.toLocaleString()} needed</p></div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full rounded-full bg-gradient-to-r from-purple-400 to-cyan" style={{ width: `${xpProgress}%` }} /></div>
            <div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-xl border border-green/15 bg-green/5 p-3"><p className="text-[9px] font-black uppercase text-vapor">Win</p><p className="mt-1 font-mono font-black text-green">+150 XP</p></div><div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3"><p className="text-[9px] font-black uppercase text-vapor">Played</p><p className="mt-1 font-mono font-black">+50 XP</p></div></div>
          </section>
        </div>

        <section className="glass overflow-hidden rounded-2xl border border-white/[0.07]">
          <div className="border-b border-white/[0.06] px-5 py-4"><h2 className="flex items-center gap-2 font-black"><Flame className="h-4 w-4 text-orange" /> Monthly leaderboard</h2><p className="mt-1 text-xs text-vapor">{prizeActive ? "Only players with a completed match are eligible for the $100 prize." : "The $100 prize race begins October 1; results before then are not prize-eligible."}</p></div>
          <div className="divide-y divide-white/[0.05]">
            {sortedLeaders.length === 0 ? <p className="px-5 py-10 text-center text-sm text-vapor">The race starts with the first completed 8s match.</p> : sortedLeaders.map((entry, index) => (
              <div key={entry.id || entry.user_id} className="grid grid-cols-[40px_minmax(0,1fr)_70px_80px] items-center gap-3 px-5 py-3.5 text-sm">
                <span className={`font-mono font-black ${index === 0 ? "text-yellow-300" : "text-vapor"}`}>#{index + 1}</span><span className="truncate font-bold">{entry.username || "Player"}</span><span className="text-right font-mono font-black text-cyan">{entry.monthly_wins || 0} W</span><span className="text-right font-mono text-xs text-vapor">{entry.monthly_xp || 0} XP</span>
              </div>
            ))}
          </div>
        </section>
      </div>
      <CreateLobbyModal isOpen={createOpen} onClose={() => setCreateOpen(false)} onCreate={handleCreated} user={user} mode="eights" />
    </div>
  );
}
