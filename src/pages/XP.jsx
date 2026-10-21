import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Award, ArrowRight, Flame, Medal, Plus, Swords, Trophy } from "lucide-react";
import { base44 } from "@/api/base44Client";
import CreateLobbyModal from "@/components/match/CreateLobbyModal";
import XPMatchPostAction from "@/components/match/XPMatchPostAction";
import XPTeamSelect from "@/components/match/XPTeamSelect";
import XPFormatSelect from "@/components/competition/XPFormatSelect";
import XPFormatStandings from "@/components/competition/XPFormatStandings";
import useRouteSection from "@/hooks/useRouteSection";
import { xpCategory, xpCategoryForSize } from "@/lib/xpCategories";
import { xpMatchAwaitingAcceptance, xpMatchDestination } from "@/lib/xpMatchAccess";
import useRematchSettings from "@/hooks/useRematchSettings";
import CompetitionLadder from "@/components/competition/CompetitionLadder";
import { CompetitionMatchfinder, CompetitionMatchfinderRow } from "@/components/competition/CompetitionMatchfinder";
import { useMatchfinderPosts } from "@/hooks/useMatchfinderPosts";
import { loadCaptainXPTeams, xpTeamsForMatch } from "@/lib/xpTeams";
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
  const [category, setCategory] = useRouteSection("category", "solo", ["solo", "duos", "teams"]);
  const categoryInfo = xpCategory(category);
  const loadOpenXPMatches = async () => {
    const { data } = await base44.functions.invoke("getXPMatchfinder", { category });
    if (!data?.success) throw new Error(data?.error || "XP matches could not be loaded");
    return data.rows || [];
  };
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const rematchSettings = useRematchSettings("xp", setIsCreateModalOpen, isCreateModalOpen);
  const [user, setUser] = useState(null);
  const [currentStats, setCurrentStats] = useState(null);
  const [openPosts, setRankedMatches] = useState([]);
  const rankedMatches = useMatchfinderPosts(openPosts).filter((match) => xpCategoryForSize(match.team_size) === category);
  const loadRequest = useRef(0);
  const [activeRankedMatch, setActiveRankedMatch] = useState(null);
  const [leaderboardPosition, setLeaderboardPosition] = useState(null);
  const [loadingMatches, setLoadingMatches] = useState(true);
  const [xpTeams, setXPTeams] = useState([]);
  const [selectedPartyByMatch, setSelectedPartyByMatch] = useState({});
  const [joiningMatchId, setJoiningMatchId] = useState("");

  useEffect(() => {
    loadRankedData();
    return () => { loadRequest.current++; };
  }, [category]);

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
          loadOpenXPMatches(),
          base44.functions.invoke("getMyActiveXPMatch", {}).then((response) => response.data?.match || null),
          base44.entities.XPStats.filterFresh({ user_id: user.id }, "-total_xp", 1),
        ]);
        if (active) {
          setRankedMatches(matches || []);
          setActiveRankedMatch(playerMatches);
          setCurrentStats((playerStats || [])[0] || null);
        }

        leaderboardRefreshTick += 1;
        if (leaderboardRefreshTick >= 5) {
          leaderboardRefreshTick = 0;
          const leaderboard = await base44.functions.invoke("getXPStandings", {}).then(response => response.data?.rows || []);
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
  }, [user?.id, category]);

  const loadRankedData = async () => {
    const requestId = ++loadRequest.current;
    try {
      setLoadingMatches(true);
      const currentUser = await base44.auth.me().catch(() => null);
      setUser(currentUser);

      const [matches, statsRows, captainTeams, activeMatch] = await Promise.all([
        loadOpenXPMatches(),
        base44.functions.invoke("getXPStandings", {}).then(response => response.data?.rows || []),
        loadCaptainXPTeams(currentUser?.id),
        currentUser?.id ? base44.functions.invoke("getMyActiveXPMatch", {}).then((response) => response.data?.match || null) : null,
      ]);

      if (requestId !== loadRequest.current) return;
      setRankedMatches(matches || []);
      setCurrentStats((statsRows || []).find((stats) => stats.user_id === currentUser?.id) || null);
      setXPTeams(captainTeams || []);
      setActiveRankedMatch(activeMatch);
      const position = (statsRows || []).findIndex((stats) => stats.user_id === currentUser?.id);
      setLeaderboardPosition(position >= 0 ? position + 1 : null);
    } catch (error) {
      console.error("Failed to load ranked data:", error);
      toast({ title: "XP Matches unavailable", description: "Could not load XP match data.", variant: "destructive" });
    } finally {
      if (requestId === loadRequest.current) setLoadingMatches(false);
    }
  };

  const xp = Number(currentStats?.total_xp || 0);
  const level = Math.max(1, Number(currentStats?.level || Math.floor(xp / 1000) + 1));
  const xpToNext = Math.max(1, Number(currentStats?.xp_to_next_level || 1000));
  const progress = Math.min(100, Math.round((Number(currentStats?.current_xp ?? (xp % xpToNext)) / xpToNext) * 100));
  const rankTone = rankCardTones.diamond;

  const handleAcceptMatch = async (match) => {
    if (joiningMatchId) return;
    if (!user) {
      toast({ title: "Login required", description: "Please log in to accept XP matches.", variant: "destructive" });
      return;
    }
    if (!hasActivisionId(user)) {
      toast({ title: "Activision ID required", description: activisionIdRequiredMessage, variant: "destructive" });
      return;
    }
    const choices = xpTeamsForMatch(xpTeams, match);
    const teamId = selectedPartyByMatch[match.id] || (choices.length === 1 ? choices[0].id : "");
    if (!choices.some((team) => team.id === teamId)) {
      toast({ title: "XP team required", description: "Select your team before joining an XP match.", variant: "destructive" });
      return;
    }

    setJoiningMatchId(match.id);
    try {
      const response = await base44.functions.invoke("acceptXPMatch", {
        xp_match_id: match.id,
        team_id: teamId,
      });

      if (response.data?.success) {
        toast({ title: "XP match accepted", description: "Opening match room." });
        navigate(`/xp-match/${match.id}`);
        return;
      }

      toast({ title: "Failed to accept", description: response.data?.error || "Try again.", variant: "destructive" });
    } catch (error) {
      console.error("Failed to accept XP match:", error);
      toast({ title: "Failed to accept", description: error.message || "Try again.", variant: "destructive" });
    } finally {
      setJoiningMatchId("");
    }
  };

  const handleCreate = (result) => {
    setIsCreateModalOpen(false);
    loadRankedData();
    if (result?.xp_match_id) {
      toast({ title: "XP match posted", description: "We will notify you when an opponent accepts. Until then, you can cancel your post here." });
      navigate(`/xp?category=${category}#matchfinder`);
    }
  };

  return (
    <div className="competition-page min-h-screen py-8">
      <div className="max-w-[1600px] mx-auto px-4 lg:px-6">
        <CompetitionLadder
          mode="xp"
          headerDescription="Choose Solo, Duos or Teams. Every format advances the same global personal XP rank."
          competitionTitle={`XP ${categoryInfo.label}`}
          headerIntro={<div className="xp-format-bar"><XPFormatSelect value={category} onChange={setCategory} /><p>{categoryInfo.detail} · A dedicated XP team is required, including Solo. You may belong to one XP team at a time.</p></div>}
          standingsContent={<XPFormatStandings category={category} />}
          currentUser={user}
          openCount={rankedMatches.length}
          matchfinder={(
            <CompetitionMatchfinder variant="xp" loading={loadingMatches} emptyMessage="No XP matches are open right now.">
              {rankedMatches.map((match) => {
                const slots = Math.max(1, Number.parseInt(String(match.team_size || "1v1").split("v")[0], 10) || 1) * 2;
                const joined = new Set([...(match.team_alpha_player_ids || [match.host_id]), ...(match.team_bravo_player_ids || (match.challenger_id ? [match.challenger_id] : []))].filter(Boolean)).size;
                const belongsToUser = match.host_id === user?.id || match.team_alpha_player_ids?.includes(user?.id) || match.team_bravo_player_ids?.includes(user?.id);
                const matchSize = slots / 2;
                const compatibleTeams = xpTeamsForMatch(xpTeams, match);
                const selectedTeamId = selectedPartyByMatch[match.id] || (compatibleTeams.length === 1 ? compatibleTeams[0].id : "");
                return (
                  <CompetitionMatchfinderRow
                    key={match.id}
                    variant="xp"
                    game={match.game_mode_display || modeLabels[match.game_mode] || match.game_mode}
                    teamSize={match.team_size}
                    bestOf={match.best_of}
                    playRule={match.play_rule}
                    postedAt={match.created_date}
                    tone="cyan"
                    action={belongsToUser ? (
                      <XPMatchPostAction match={match} userId={user?.id} onChanged={loadRankedData} />
                    ) : user ? (
                      <div className="w-48 space-y-2">
                        <XPTeamSelect compact teams={compatibleTeams} value={selectedTeamId} onValueChange={(value) => setSelectedPartyByMatch((current) => ({ ...current, [match.id]: value }))} />
                        {!compatibleTeams.length && <Link to={`/teams?create=xp&roster=${matchSize}`} className="site-hover block rounded px-2 py-1 text-[10px] font-bold text-cyan">Create XP team</Link>}
                        <button disabled={Boolean(activeRankedMatch) || Boolean(joiningMatchId) || joined >= slots || !compatibleTeams.some((team) => team.id === selectedTeamId)} onClick={() => handleAcceptMatch(match)} className="site-hover xp-match-primary w-full px-4 py-2.5 text-[10px] font-black uppercase tracking-wider disabled:cursor-not-allowed disabled:opacity-40">{joiningMatchId === match.id ? "Joining..." : activeRankedMatch ? "Finish active match first" : "Accept match"}</button>
                      </div>
                    ) : null}
                  />
                );
              })}
            </CompetitionMatchfinder>
          )}
          action={
            <div className="competition-actions">
              <Link to="/rules" title="Competitive XP match ruleset — required" className="competition-action-pill">
                <Trophy className="h-4 w-4" /> CDL Rules
                <span className="text-[10px] text-vapor">Required</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
              {activeRankedMatch ? xpMatchAwaitingAcceptance(activeRankedMatch) ? (
                <div className="flex flex-wrap items-center gap-3"><span className="text-xs text-vapor">Waiting for opponent acceptance</span><XPMatchPostAction match={activeRankedMatch} userId={user?.id} onChanged={loadRankedData} /></div>
              ) : (
                <Link to={xpMatchDestination(activeRankedMatch)} className="competition-action-pill">
                  Return to Active Match <ArrowRight className="h-4 w-4" />
                </Link>
              ) : (
                <button
                  onClick={() => setIsCreateModalOpen(true)}
                  className="competition-action-pill"
                >
                  <Plus className="w-4 h-4" /> Create XP Match
                </button>
              )}
            </div>
          }
        />
        <ActivisionIdNotice user={user} className="mb-6" />

        {activeRankedMatch && !xpMatchAwaitingAcceptance(activeRankedMatch) && (
          <div className="mb-6 flex flex-col gap-4 rounded-xl border border-cyan/25 bg-cyan/[0.055] p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-cyan/20 bg-cyan/10 text-cyan"><Swords className="h-5 w-5" /></div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan">Your Active XP Match</p>
                <p className="mt-1 font-black">{activeRankedMatch.team_size} {activeRankedMatch.game_mode_display || modeLabels[activeRankedMatch.game_mode] || activeRankedMatch.game_mode}</p>
                <p className="mt-1 text-xs text-vapor">{activeRankedMatch.status === "open" ? "Opponent accepted · Filling remaining team slots" : `${activeRankedMatch.host_name} vs ${activeRankedMatch.challenger_name || "Opponent"}`}</p>
              </div>
            </div>
            <Link to={xpMatchDestination(activeRankedMatch)} className="inline-flex items-center justify-center gap-2 rounded-lg bg-cyan px-5 py-3 text-xs font-black uppercase tracking-wider text-background">
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
          initialSettings={rematchSettings}
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          user={user}
          mode="xp"
          xpFormat={category}
          onCreate={handleCreate}
        />
      </div>
    </div>
  );
}


