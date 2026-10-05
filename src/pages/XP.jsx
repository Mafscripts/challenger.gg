import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Award, ArrowRight, Flame, Medal, Plus, Swords, Trophy } from "lucide-react";
import { base44 } from "@/api/base44Client";
import CreateLobbyModal from "@/components/match/CreateLobbyModal";
import CompetitionLadder from "@/components/competition/CompetitionLadder";
import { CompetitionMatchfinder, CompetitionMatchfinderRow } from "@/components/competition/CompetitionMatchfinder";
import { toast } from "@/components/ui/use-toast";
import ActivisionIdNotice from "@/components/competition/ActivisionIdNotice";
import { activisionIdRequiredMessage, hasActivisionId } from "@/lib/activision";
import {
  RANK_THRESHOLDS,
} from "@/lib/ranks";

const modeLabels = {
  snd: "Search & Destroy",
  overload: "Overload",
  hp: "Hardpoint",
};

const activeRankedStatuses = new Set(["open", "ready_check", "ready", "in_progress", "pending_confirmation", "awaiting_confirmation", "score_conflict", "disputed"]);

const selectActiveRankedMatch = (matches, userId) => {
  const unique = [...new Map((matches || []).map((match) => [match.id, match])).values()];
  return unique
    .filter((match) => activeRankedStatuses.has(match.status) && (
      match.host_id === userId
      || match.challenger_id === userId
      || match.team_alpha_player_ids?.includes(userId)
      || match.team_bravo_player_ids?.includes(userId)
    ))
    .sort((a, b) => new Date(b.created_date || 0) - new Date(a.created_date || 0))[0] || null;
};

const loadCaptainRankedTeams = async (userId) => {
  if (!userId) return [];
  const teams = await base44.entities.Team.filterFresh({ captain_id: userId }, "-created_date", 30).catch(() => []);
  const rankedTeams = (teams || []).filter((team) => team.is_active !== false && team.team_type === "ranked");
  return Promise.all(rankedTeams.map(async (team) => {
    const members = await base44.entities.TeamMember.filterFresh({ team_id: team.id }, "-joined_date", 10).catch(() => []);
    return { ...team, members: (members || []).filter((member) => member.is_active !== false) };
  }));
};

const groupedRanks = RANK_THRESHOLDS.reduce((tiers, rank) => {
  const existing = tiers.find((tier) => tier.tier === rank.tier);
  if (existing) {
    existing.min = Math.min(existing.min, rank.min);
    existing.max = Math.max(existing.max, Number.isFinite(rank.max) ? rank.max : existing.max);
    return tiers;
  }
  return [
    ...tiers,
    {
      tier: rank.tier,
      name: rank.tier.charAt(0).toUpperCase() + rank.tier.slice(1),
      min: rank.min,
      max: Number.isFinite(rank.max) ? rank.max : rank.min,
      color: rank.color,
    },
  ];
}, []);

const rankRangeLabel = (tier) => (
  tier.tier === "champion"
    ? `${tier.min.toLocaleString()}+ ELO`
    : `${tier.min.toLocaleString()}-${tier.max.toLocaleString()} ELO`
);

const rankCardTones = {
  bronze: { border: "border-amber-500/30", wash: "from-amber-500/[0.12] via-card to-card", accent: "bg-amber-500", soft: "border-amber-500/20 bg-amber-500/[0.07]", text: "text-amber-400" },
  silver: { border: "border-slate-300/30", wash: "from-slate-300/[0.12] via-card to-card", accent: "bg-slate-300", soft: "border-slate-300/20 bg-slate-300/[0.07]", text: "text-slate-200" },
  gold: { border: "border-yellow-400/30", wash: "from-yellow-400/[0.12] via-card to-card", accent: "bg-yellow-400", soft: "border-yellow-400/20 bg-yellow-400/[0.07]", text: "text-yellow-400" },
  platinum: { border: "border-teal-300/30", wash: "from-teal-300/[0.12] via-card to-card", accent: "bg-teal-300", soft: "border-teal-300/20 bg-teal-300/[0.07]", text: "text-teal-300" },
  diamond: { border: "border-cyan/30", wash: "from-cyan/[0.12] via-card to-card", accent: "bg-cyan", soft: "border-cyan/20 bg-cyan/[0.07]", text: "text-cyan" },
  master: { border: "border-red-500/35", wash: "from-red-600/[0.16] via-card to-card", accent: "bg-red-500", soft: "border-red-500/25 bg-red-500/[0.09]", text: "text-red-400" },
  pro: { border: "border-fuchsia-400/35", wash: "from-fuchsia-400/[0.16] via-card to-card", accent: "bg-fuchsia-400", soft: "border-fuchsia-400/25 bg-fuchsia-400/[0.09]", text: "text-fuchsia-400" },
  champion: { border: "border-red-900/70", wash: "from-red-950/[0.30] via-white/[0.035] to-card", accent: "bg-gradient-to-r from-white via-slate-200 to-red-800", soft: "border-red-900/45 bg-red-950/[0.18]", text: "text-white" },
};

export default function XP() {
  const navigate = useNavigate();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [currentStats, setCurrentStats] = useState(null);
  const [rankedMatches, setRankedMatches] = useState([]);
  const [activeRankedMatch, setActiveRankedMatch] = useState(null);
  const [leaderboardPosition, setLeaderboardPosition] = useState(null);
  const [loadingMatches, setLoadingMatches] = useState(true);
  const [rankedTeams, setRankedTeams] = useState([]);
  const [selectedPartyByMatch, setSelectedPartyByMatch] = useState({});

  useEffect(() => {
    loadRankedData();
  }, []);

  useEffect(() => {
    let active = true;
    let refreshing = false;
    let leaderboardRefreshTick = 0;

    if (!user?.id) return undefined;

    const refreshOpenMatches = async () => {
      if (refreshing || document.visibilityState === "hidden") return;
      refreshing = true;
      try {
        const [matches, playerMatches, playerStats] = await Promise.all([
          base44.entities.XPMatch.filterFresh({ status: "open" }, "-created_date", 20),
          base44.entities.XPMatch.filterFresh({}, "-created_date", 100),
          base44.entities.XPStats.filterFresh({ user_id: user.id }, "-total_xp", 1),
        ]);
        if (active) {
          setRankedMatches(matches || []);
          setActiveRankedMatch(selectActiveRankedMatch(playerMatches || [], user.id));
          setCurrentStats((playerStats || [])[0] || null);
        }

        leaderboardRefreshTick += 1;
        if (leaderboardRefreshTick >= 5) {
          leaderboardRefreshTick = 0;
          const leaderboard = await base44.entities.XPStats.filterFresh({}, "-total_xp", 500);
          if (active) {
            const position = (leaderboard || []).findIndex((stats) => stats.user_id === user.id);
            setLeaderboardPosition(position >= 0 ? position + 1 : null);
          }
        }
      } catch (error) {
        console.error("Failed to refresh ranked matches:", error);
      } finally {
        refreshing = false;
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") refreshOpenMatches();
    };

    const interval = setInterval(refreshOpenMatches, 5000);
    window.addEventListener("focus", refreshOpenMatches);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      active = false;
      clearInterval(interval);
      window.removeEventListener("focus", refreshOpenMatches);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [user?.id]);

  const loadRankedData = async () => {
    try {
      setLoadingMatches(true);
      const currentUser = await base44.auth.me().catch(() => null);
      setUser(currentUser);

      const [matches, statsRows, captainTeams] = await Promise.all([
        base44.entities.XPMatch.filterFresh({ status: "open" }, "-created_date", 20),
        base44.entities.XPStats.filterFresh({}, "-total_xp", 500),
        loadCaptainRankedTeams(currentUser?.id),
      ]);

      setRankedMatches(matches || []);
      setCurrentStats((statsRows || []).find((stats) => stats.user_id === currentUser?.id) || null);
      setRankedTeams(captainTeams || []);
      const position = (statsRows || []).findIndex((stats) => stats.user_id === currentUser?.id);
      setLeaderboardPosition(position >= 0 ? position + 1 : null);
    } catch (error) {
      console.error("Failed to load ranked data:", error);
      toast({ title: "XP Matches unavailable", description: "Could not load XP match data.", variant: "destructive" });
    } finally {
      setLoadingMatches(false);
    }
  };

  const xp = Number(currentStats?.total_xp || 0);
  const level = Math.max(1, Number(currentStats?.level || Math.floor(xp / 1000) + 1));
  const xpToNext = Math.max(1, Number(currentStats?.xp_to_next_level || 1000));
  const progress = Math.min(100, Math.round((Number(currentStats?.current_xp ?? (xp % xpToNext)) / xpToNext) * 100));
  const rankTone = rankCardTones.diamond;

  const handleAcceptMatch = async (match) => {
    if (!user) {
      toast({ title: "Login required", description: "Please log in to accept XP matches.", variant: "destructive" });
      return;
    }
    if (!hasActivisionId(user)) {
      toast({ title: "Activision ID required", description: activisionIdRequiredMessage, variant: "destructive" });
      return;
    }

    try {
      const response = await base44.functions.invoke("acceptXPMatch", {
        xp_match_id: match.id,
        team_id: selectedPartyByMatch[match.id] || undefined,
      });

      if (response.data?.success) {
        toast({ title: "XP match accepted", description: "Opening match room." });
        navigate(`/xp-match/${match.id}`);
        return;
      }

      toast({ title: "Failed to accept", description: response.data?.error || "Try again.", variant: "destructive" });
    } catch (error) {
      console.error("Failed to accept ranked match:", error);
      toast({ title: "Failed to accept", description: error.message || "Try again.", variant: "destructive" });
    }
  };

  const handleCreate = (result) => {
    setIsCreateModalOpen(false);
    loadRankedData();
    if (result?.xp_match_id) {
      toast({ title: "Posted on Matchfinder", description: "Your XP challenge is live and can be cancelled until an opponent accepts." });
      navigate("/xp#matchfinder");
    }
  };

  return (
    <div className="min-h-screen py-8">
      <div className="max-w-[1600px] mx-auto px-4 lg:px-6">
        <CompetitionLadder
          mode="xp"
          currentUser={user}
          openCount={rankedMatches.length}
          matchfinder={(
            <CompetitionMatchfinder loading={loadingMatches} emptyMessage="No XP matches are open right now.">
              {rankedMatches.map((match) => {
                const slots = Math.max(1, Number.parseInt(String(match.team_size || "1v1").split("v")[0], 10) || 1) * 2;
                const joined = new Set([...(match.team_alpha_player_ids || [match.host_id]), ...(match.team_bravo_player_ids || (match.challenger_id ? [match.challenger_id] : []))].filter(Boolean)).size;
                const belongsToUser = match.host_id === user?.id || match.team_alpha_player_ids?.includes(user?.id) || match.team_bravo_player_ids?.includes(user?.id);
                const partyMatch = Number.parseInt(String(match.team_size || "1v1"), 10) > 1;
                return (
                  <CompetitionMatchfinderRow
                    key={match.id}
                    game={match.game_mode_display || modeLabels[match.game_mode] || match.game_mode}
                    gameDetail={`${match.team_size} · ${joined}/${slots} players`}
                    competition="XP Match"
                    competitionDetail={`${slots - joined} open ${slots - joined === 1 ? "slot" : "slots"}`}
                    playRule={match.play_rule}
                    tone="cyan"
                    action={belongsToUser ? (
                      match.status === "open" && match.host_id === user?.id ? (
                        <div className="min-w-52 space-y-2 text-right">
                          <div className="rounded-lg border border-purple-400/25 bg-purple-400/10 px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-purple-300">Posted on Matchfinder</div>
                          <button onClick={async () => {
                            try {
                              const response = await base44.functions.invoke("cancelXPMatch", { xp_match_id: match.id });
                              if (!response.data?.success) throw new Error(response.data?.error || "Could not cancel XP match.");
                              toast({ title: "XP match cancelled", description: "Your post has been removed from Matchfinder." });
                              loadRankedData();
                            } catch (error) {
                              toast({ title: "Cancel failed", description: error.message || "Could not cancel XP match.", variant: "destructive" });
                            }
                          }} className="w-full rounded-lg border border-red-400/25 bg-red-400/10 px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-red-300">Cancel Post</button>
                        </div>
                      ) : (
                        <Link to={`/xp-match/${match.id}`} className="inline-flex min-w-44 items-center justify-center rounded-lg border border-cyan/25 bg-cyan/10 px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-cyan">Open match room</Link>
                      )
                    ) : user ? (
                      <div className="w-52 space-y-2">
                        {partyMatch && (
                          <select value={selectedPartyByMatch[match.id] || ""} onChange={(event) => setSelectedPartyByMatch((current) => ({ ...current, [match.id]: event.target.value }))} className="w-full rounded-md border border-white/[0.07] bg-secondary px-2.5 py-2 text-xs text-foreground focus:border-cyan/30 focus:outline-none">
                            <option value="">Solo player</option>
                            {rankedTeams.filter((team) => {
                              const partySize = Number(team.roster_size || team.members.length || 0);
                              const matchSize = Number.parseInt(String(match.team_size || "1v1"), 10) || 1;
                              return partySize >= 2 && partySize <= matchSize && team.members.length === partySize;
                            }).map((team) => <option key={team.id} value={team.id}>{team.name} ({team.members.length}-player party)</option>)}
                          </select>
                        )}
                        <button onClick={() => handleAcceptMatch(match)} className="w-full rounded-lg bg-cyan px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-background">Accept This Match</button>
                      </div>
                    ) : null}
                  />
                );
              })}
            </CompetitionMatchfinder>
          )}
          action={
            <div className="flex w-full flex-col gap-3 xl:w-[320px]">
              <Link to="/rules" className="group rounded-xl border border-cyan/35 bg-secondary px-4 py-3 shadow-sm transition-colors hover:border-cyan/55 hover:bg-secondary/90">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan/10 text-cyan"><Trophy className="h-4 w-4" /></div>
                    <div>
                      <div className="flex items-center gap-2"><p className="text-xs font-black uppercase tracking-wider text-cyan">CDL Rules</p><span className="rounded-full border border-cyan/20 px-2 py-0.5 text-[7px] font-black uppercase tracking-wider text-cyan">Required</span></div>
                      <p className="mt-1 text-[10px] text-vapor">Competitive XP match ruleset</p>
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-cyan transition-transform group-hover:translate-x-0.5" />
                </div>
              </Link>
              {activeRankedMatch ? (
                <Link to={`/xp-match/${activeRankedMatch.id}`} className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-cyan/40 bg-secondary px-6 py-3 text-sm font-bold uppercase tracking-wider text-cyan shadow-sm transition-colors hover:border-cyan/60 hover:bg-secondary/90">
                  Return to Active Match <ArrowRight className="h-4 w-4" />
                </Link>
              ) : (
                <button
                  onClick={() => setIsCreateModalOpen(true)}
                  className="create-cta inline-flex w-full items-center justify-center gap-2 rounded-lg px-6 py-3 text-sm font-black uppercase tracking-wider transition-all"
                >
                  <Plus className="w-4 h-4" /> Create XP Match
                </button>
              )}
            </div>
          }
        />
        <ActivisionIdNotice user={user} className="mb-6" />

        {activeRankedMatch && activeRankedMatch.status !== "open" && (
          <div className="mb-6 flex flex-col gap-4 rounded-xl border border-cyan/25 bg-cyan/[0.055] p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-cyan/20 bg-cyan/10 text-cyan"><Swords className="h-5 w-5" /></div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan">Your Active XP Match</p>
                <p className="mt-1 font-black">{activeRankedMatch.team_size} {activeRankedMatch.game_mode_display || modeLabels[activeRankedMatch.game_mode] || activeRankedMatch.game_mode}</p>
                <p className="mt-1 text-xs text-vapor">{activeRankedMatch.status === "open" ? "Waiting for an opponent" : `${activeRankedMatch.host_name} vs ${activeRankedMatch.challenger_name || "Opponent"}`}</p>
              </div>
            </div>
            <Link to={`/xp-match/${activeRankedMatch.id}`} className="inline-flex items-center justify-center gap-2 rounded-lg bg-cyan px-5 py-3 text-xs font-black uppercase tracking-wider text-background">
              Open Match Room <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(320px,.55fr)]">
          <section className="glass overflow-hidden rounded-2xl border border-white/5">
            <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-cyan">Your XP progression</p>
                <h3 className="mt-1 text-lg font-black">Level {level}</h3>
              </div>
              <span className="rounded-lg border border-cyan/20 bg-cyan/10 px-3 py-2 font-mono text-sm font-black text-cyan">{xp.toLocaleString()} XP</span>
            </div>
            <div className="p-5">
              <div className="flex items-end justify-between gap-4">
                <div><p className="text-xs text-vapor">Current level progress</p><p className="mt-1 text-2xl font-black">{Number(currentStats?.current_xp ?? (xp % xpToNext)).toLocaleString()} <span className="text-sm text-vapor">/ {xpToNext.toLocaleString()} XP</span></p></div>
                <p className="font-mono text-sm font-black text-cyan">{progress}%</p>
              </div>
              <div className="mt-4 h-3 overflow-hidden rounded-full border border-white/5 bg-secondary"><div className="h-full rounded-full bg-cyan transition-all" style={{ width: `${progress}%` }} /></div>
              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: "Wins", value: currentStats?.wins || 0, icon: Trophy },
                  { label: "Losses", value: currentStats?.losses || 0, icon: Swords },
                  { label: "Win streak", value: currentStats?.win_streak || 0, icon: Flame },
                  { label: "Global place", value: leaderboardPosition ? `#${leaderboardPosition}` : "Unranked", icon: Medal },
                ].map((stat) => <div key={stat.label} className="rounded-xl border border-white/5 bg-background/30 p-4"><stat.icon className="h-4 w-4 text-cyan" /><p className="mt-3 text-[9px] font-black uppercase tracking-wider text-vapor">{stat.label}</p><p className="mt-1 font-mono text-lg font-black">{stat.value}</p></div>)}
              </div>
            </div>
          </section>

          <aside className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            <Link to="/tournaments" className="group rounded-2xl border border-white/5 bg-card p-5 transition hover:border-orange/30"><Trophy className="h-5 w-5 text-orange" /><p className="mt-4 text-xs font-black uppercase tracking-wider">Tournament card</p><p className="mt-1 text-xs text-vapor">Open tournaments and brackets.</p><span className="mt-4 inline-flex items-center gap-1 text-[10px] font-black uppercase text-orange">View tournaments <ArrowRight className="h-3 w-3" /></span></Link>
            <Link to="/teams" className="group rounded-2xl border border-white/5 bg-card p-5 transition hover:border-cyan/30"><Swords className="h-5 w-5 text-cyan" /><p className="mt-4 text-xs font-black uppercase tracking-wider">Team card</p><p className="mt-1 text-xs text-vapor">Manage your XP party and roster.</p><span className="mt-4 inline-flex items-center gap-1 text-[10px] font-black uppercase text-cyan">View teams <ArrowRight className="h-3 w-3" /></span></Link>
            <Link to="/profile" className="group rounded-2xl border border-white/5 bg-card p-5 transition hover:border-purple-400/30"><Award className="h-5 w-5 text-purple-400" /><p className="mt-4 text-xs font-black uppercase tracking-wider">Profile card</p><p className="mt-1 text-xs text-vapor">Your public profile, stats and trophies.</p><span className="mt-4 inline-flex items-center gap-1 text-[10px] font-black uppercase text-purple-300">View profile <ArrowRight className="h-3 w-3" /></span></Link>
          </aside>
        </div>
        <CreateLobbyModal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          user={user}
          mode="xp"
          onCreate={handleCreate}
        />
      </div>
    </div>
  );
}


