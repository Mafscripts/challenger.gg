import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import { Award, ArrowRight, Flame, Globe, Medal, Plus, Swords, Trophy } from "lucide-react";
import { base44 } from "@/api/base44Client";
import CreateLobbyModal from "@/components/match/CreateLobbyModal";
import CompetitionHero from "@/components/match/CompetitionHero";
import RankBadge from "@/components/ui/RankBadge";
import { toast } from "@/components/ui/use-toast";
import ActivisionIdNotice from "@/components/competition/ActivisionIdNotice";
import { activisionIdRequiredMessage, hasActivisionId } from "@/lib/activision";
import {
  RANK_THRESHOLDS,
  getNextRankForElo,
  getRankForElo,
  getRankProgress,
} from "@/lib/ranks";

const modeLabels = {
  snd: "Search & Destroy",
  overload: "Overload",
  hp: "Hardpoint",
};

const activeRankedStatuses = new Set(["open", "in_progress", "pending_confirmation", "awaiting_confirmation", "score_conflict", "disputed"]);

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

export default function Ranked() {
  const navigate = useNavigate();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [currentStats, setCurrentStats] = useState(null);
  const [rankedMatches, setRankedMatches] = useState([]);
  const [activeRankedMatch, setActiveRankedMatch] = useState(null);
  const [leaderboardPosition, setLeaderboardPosition] = useState(null);
  const [loadingMatches, setLoadingMatches] = useState(true);

  useEffect(() => {
    loadRankedData();
  }, []);

  useEffect(() => {
    let active = true;

    if (!user?.id) return undefined;

    const refreshOpenMatches = async () => {
      try {
        const [matches, playerMatches] = await Promise.all([
          base44.entities.RankedMatch.filterFresh({ status: "open" }, "-created_date", 20),
          base44.entities.RankedMatch.filterFresh({}, "-created_date", 100),
        ]);
        if (active) {
          setRankedMatches(matches || []);
          setActiveRankedMatch(selectActiveRankedMatch(playerMatches || [], user.id));
        }
      } catch (error) {
        console.error("Failed to refresh ranked matches:", error);
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") refreshOpenMatches();
    };

    const interval = setInterval(refreshOpenMatches, 1000);
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

      const [matches, statsRows] = await Promise.all([
        base44.entities.RankedMatch.filterFresh({ status: "open" }, "-created_date", 20),
        base44.entities.RankedStats.filterFresh({}, "-elo", 500),
      ]);

      setRankedMatches(matches || []);
      setCurrentStats((statsRows || []).find((stats) => stats.user_id === currentUser?.id) || null);
      const position = (statsRows || []).findIndex((stats) => stats.user_id === currentUser?.id);
      setLeaderboardPosition(position >= 0 ? position + 1 : null);
    } catch (error) {
      console.error("Failed to load ranked data:", error);
      toast({ title: "Ranked unavailable", description: "Could not load ranked data.", variant: "destructive" });
    } finally {
      setLoadingMatches(false);
    }
  };

  const elo = currentStats?.elo || 0;
  const rank = getRankForElo(elo);
  const nextRank = getNextRankForElo(elo);
  const progress = getRankProgress(elo);

  const handleAcceptMatch = async (match) => {
    if (!user) {
      toast({ title: "Login required", description: "Please log in to accept ranked matches.", variant: "destructive" });
      return;
    }
    if (!hasActivisionId(user)) {
      toast({ title: "Activision ID required", description: activisionIdRequiredMessage, variant: "destructive" });
      return;
    }

    try {
      const response = await base44.functions.invoke("acceptRankedMatch", {
        ranked_match_id: match.id,
      });

      if (response.data?.success) {
        toast({ title: "Ranked match accepted", description: "Opening match room." });
        navigate(`/ranked-match/${match.id}`);
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
    if (result?.ranked_match_id) {
      navigate(`/ranked-match/${result.ranked_match_id}`);
    }
  };

  return (
    <div className="min-h-screen py-8">
      <div className="max-w-[1600px] mx-auto px-4 lg:px-6">
        <CompetitionHero
          eyebrow="Season 1 Competitive Ladder"
          title="Ranked"
          description="Open or accept a ranked lobby, complete the map flow, and report the result from a consistent competitive match room."
          action={
            <div className="flex w-full xl:w-auto">
              {activeRankedMatch ? (
                <Link to={`/ranked-match/${activeRankedMatch.id}`} className="inline-flex items-center justify-center gap-2 rounded-lg bg-cyan px-6 py-3 text-sm font-bold uppercase tracking-wider text-background transition-colors hover:bg-cyan/90">
                  Return to Active Match <ArrowRight className="h-4 w-4" />
                </Link>
              ) : (
                <button
                  onClick={() => setIsCreateModalOpen(true)}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-cyan px-6 py-3 text-sm font-bold uppercase tracking-wider text-background transition-all hover:shadow-lg hover:shadow-cyan/25"
                >
                  <Plus className="w-4 h-4" /> Create Ranked Match
                </button>
              )}
            </div>
          }
          stats={[
            { label: "Open Matches", value: rankedMatches.length, icon: Globe, color: "text-orange" },
            { label: "Season Wins", value: currentStats?.wins || 0, icon: Award, color: "text-yellow-400" },
            { label: "Matches Played", value: currentStats?.matches_played || 0, icon: Trophy, color: "text-cyan" },
          ]}
        />
        <ActivisionIdNotice user={user} className="mb-6" />

        {activeRankedMatch && (
          <div className="mb-6 flex flex-col gap-4 rounded-xl border border-cyan/25 bg-cyan/[0.055] p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-cyan/20 bg-cyan/10 text-cyan"><Swords className="h-5 w-5" /></div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan">Your Active Ranked Match</p>
                <p className="mt-1 font-black">{activeRankedMatch.team_size} {activeRankedMatch.game_mode_display || modeLabels[activeRankedMatch.game_mode] || activeRankedMatch.game_mode}</p>
                <p className="mt-1 text-xs text-vapor">{activeRankedMatch.status === "open" ? "Waiting for an opponent" : `${activeRankedMatch.host_name} vs ${activeRankedMatch.challenger_name || "Opponent"}`}</p>
              </div>
            </div>
            <Link to={`/ranked-match/${activeRankedMatch.id}`} className="inline-flex items-center justify-center gap-2 rounded-lg bg-cyan px-5 py-3 text-xs font-black uppercase tracking-wider text-background">
              Open Match Room <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        )}

        <div className="glass rounded-xl border border-white/5 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-sm flex items-center gap-2">
              <Swords className="w-4 h-4 text-cyan" /> Available Ranked Matches
            </h3>
            <button onClick={loadRankedData} className="text-xs text-cyan hover:underline">Refresh</button>
          </div>
          {loadingMatches ? (
            <div className="text-center py-8">
              <div className="w-8 h-8 border-2 border-cyan/20 border-t-cyan rounded-full animate-spin mx-auto mb-2" />
              <p className="text-vapor text-sm">Loading matches...</p>
            </div>
          ) : rankedMatches.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-vapor text-sm mb-2">No ranked matches available</p>
              <p className="text-xs text-vapor/60">Create one to open the ladder.</p>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {rankedMatches.map((match) => (
                <div key={match.id} className="bg-secondary/50 rounded-lg border border-white/5 p-4 hover:border-cyan/30 transition-all">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-mono text-cyan">{match.team_size}</span>
                    <span className="text-xs text-vapor">{match.game_mode_display || modeLabels[match.game_mode] || match.game_mode}</span>
                  </div>
                  <p className="text-sm font-bold mb-1 text-cyan">
                    {(() => {
                      const slots = Math.max(1, Number.parseInt(String(match.team_size || "1v1").split("v")[0], 10) || 1) * 2;
                      const joined = new Set([...(match.team_alpha_player_ids || [match.host_id]), ...(match.team_bravo_player_ids || (match.challenger_id ? [match.challenger_id] : []))].filter(Boolean)).size;
                      return `${joined}/${slots} players · ${slots - joined} open ${slots - joined === 1 ? "slot" : "slots"}`;
                    })()}
                  </p>
                  <p className="text-xs text-vapor mb-3">Host: {match.host_name || "Host unavailable"}</p>
                  {match.host_id === user?.id || match.team_alpha_player_ids?.includes(user?.id) || match.team_bravo_player_ids?.includes(user?.id) ? (
                    <Link
                      to={`/ranked-match/${match.id}`}
                      className="block w-full py-2 bg-secondary text-center text-foreground font-bold text-xs rounded-lg hover:bg-white/10 transition-all uppercase"
                    >
                      Open Room
                    </Link>
                  ) : (
                    <button
                      onClick={() => handleAcceptMatch(match)}
                      className="w-full py-2 bg-cyan text-background font-bold text-xs rounded-lg hover:bg-cyan/90 transition-all uppercase"
                    >
                      Accept
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="glass rounded-2xl border border-white/5 overflow-hidden">
              <div className="px-5 py-4 border-b border-white/5">
                <h3 className="font-bold text-lg">Rank Tiers</h3>
                <p className="mt-1 text-sm text-vapor">Climb through every rank and earn the Champion crest.</p>
              </div>
              <div className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-4">
                {groupedRanks.map((tier) => (
                  <motion.div key={tier.tier} whileHover={{ y: -4 }} className="relative overflow-hidden rounded-xl border border-white/10 bg-background/40 p-5 text-center transition-colors hover:border-cyan/25">
                    <div className="pointer-events-none absolute inset-x-8 top-3 h-24 rounded-full bg-cyan/5 blur-3xl" />
                    <div className="relative flex justify-center"><RankBadge rank={tier.tier} size="lg" showLabel={false} /></div>
                    <div className="relative mt-2">
                      <p className={`text-lg font-black ${tier.color}`}>{tier.name}</p>
                      <p className="mt-1 text-xs text-vapor">{tier.tier === "champion" ? "Top rank" : "Competitive rank"}</p>
                      <span className="mt-3 inline-flex rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 font-mono text-xs font-bold text-vapor">
                        {rankRangeLabel(tier)}
                      </span>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="relative overflow-hidden rounded-xl border border-cyan/35 bg-gradient-to-br from-cyan/15 via-cyan/[0.06] to-background/50 p-5 shadow-lg shadow-cyan/5">
              <div className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-cyan/20 blur-3xl" />
              <div className="relative">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-wide text-cyan">
                    <Trophy className="h-4 w-4" />
                    CDL Rules
                  </h3>
                  <span className="rounded-full border border-cyan/25 bg-cyan/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-cyan">
                    Ranked Standard
                  </span>
                </div>
                <p className="text-sm font-bold leading-relaxed text-foreground">
                  All Ranked matches are played using the competitive CDL ruleset.
                </p>
                <p className="mt-2 text-xs leading-relaxed text-vapor">
                  CDL modes, maps, settings and restrictions apply. Topfragg hosting, disconnect and dispute rules also remain active.
                </p>
                <Link to="/rules" className="mt-4 inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-wide text-cyan transition-colors hover:text-white">
                  View full rules <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-cyan/20 bg-card">
              <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-[0.2em] text-cyan">Season 1 rating</p>
                  <h3 className="mt-1 text-sm font-black uppercase tracking-wide">Your Rank</h3>
                </div>
                <span className="rounded-full border border-white/10 bg-background/40 px-3 py-1.5 font-mono text-xs font-black text-cyan">
                  {leaderboardPosition ? `#${leaderboardPosition}` : "Unranked"}
                </span>
              </div>
              <div className="p-5">
                <div className="flex items-center gap-4">
                  <RankBadge rank={rank.tier} size="lg" showLabel={false} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-end justify-between gap-3">
                      <div>
                        <p className={`text-2xl font-black ${rank.color}`}>{rank.name}</p>
                        <p className="mt-0.5 font-mono text-sm font-black text-cyan">{elo.toLocaleString()} ELO</p>
                      </div>
                      <p className="text-right text-[10px] font-bold text-vapor">{nextRank ? `${Math.max(0, nextRank.min - elo)} to ${nextRank.name}` : "Top rank reached"}</p>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-secondary">
                      <motion.div initial={{ scaleX: 0 }} animate={{ scaleX: progress / 100 }} transition={{ duration: 0.7, ease: "easeOut" }} className="h-full origin-left rounded-full bg-gradient-to-r from-cyan to-blue-400" />
                    </div>
                    <div className="mt-2 flex justify-between text-[9px] font-bold uppercase tracking-wider text-vapor">
                      <span>{rank.min.toLocaleString()}</span>
                      <span>{Number.isFinite(rank.max) ? rank.max.toLocaleString() : "Champion"}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-2">
                  {[
                    { label: "Record", value: `${currentStats?.wins || 0}W - ${currentStats?.losses || 0}L`, icon: Medal, color: "text-cyan" },
                    { label: "Win rate", value: `${currentStats?.matches_played ? Math.round(((currentStats?.wins || 0) / currentStats.matches_played) * 100) : 0}%`, icon: Trophy, color: "text-yellow-400" },
                    { label: "Win streak", value: currentStats?.win_streak || 0, icon: Flame, color: "text-orange" },
                    { label: "Peak ELO", value: currentStats?.peak_elo || elo, icon: Award, color: "text-purple-400" },
                  ].map((stat) => {
                    const Icon = stat.icon;
                    return <div key={stat.label} className="rounded-xl border border-white/5 bg-background/30 p-3"><div className="flex items-center gap-2"><Icon className={`h-3.5 w-3.5 ${stat.color}`} /><p className="text-[9px] font-black uppercase tracking-wider text-vapor">{stat.label}</p></div><p className="mt-2 font-mono text-sm font-black">{stat.value}</p></div>;
                  })}
                </div>
                <div className="mt-3 flex items-center justify-between rounded-xl border border-white/5 bg-background/20 px-3 py-2.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-vapor">Global leaderboard</span>
                  <span className="font-mono text-sm font-black text-cyan">{leaderboardPosition ? `#${leaderboardPosition}` : "Play to rank"}</span>
                </div>
              </div>
            </div>

            <div className="glass rounded-xl border border-white/5 p-5">
              <h3 className="font-bold text-sm mb-4">Season Stats</h3>
              <div className="space-y-3">
                {[
                  { label: "Matches Played", value: currentStats?.matches_played || 0 },
                  { label: "Wins", value: currentStats?.wins || 0 },
                  { label: "Losses", value: currentStats?.losses || 0 },
                  { label: "Win Streak", value: currentStats?.win_streak || 0 },
                  { label: "Peak ELO", value: currentStats?.peak_elo || elo },
                ].map((stat) => (
                  <div key={stat.label} className="flex items-center justify-between">
                    <span className="text-xs text-vapor">{stat.label}</span>
                    <span className="text-sm font-mono font-bold">{stat.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <CreateLobbyModal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          user={user}
          mode="ranked"
          onCreate={handleCreate}
        />
      </div>
    </div>
  );
}
