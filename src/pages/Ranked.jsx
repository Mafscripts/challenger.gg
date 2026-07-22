import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import { Award, Clock, Globe, Plus, Swords, Trophy } from "lucide-react";
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
  const [loadingMatches, setLoadingMatches] = useState(true);

  useEffect(() => {
    loadRankedData();
  }, []);

  const loadRankedData = async () => {
    try {
      setLoadingMatches(true);
      const currentUser = await base44.auth.me().catch(() => null);
      setUser(currentUser);

      const [matches, statsRows] = await Promise.all([
        base44.entities.RankedMatch.filter({ status: "open" }, "-created_date", 20),
        base44.entities.RankedStats.filter({}, "-elo", 100),
      ]);

      setRankedMatches(matches || []);
      setCurrentStats((statsRows || []).find((stats) => stats.user_id === currentUser?.id) || null);
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
            <div className="flex w-full flex-col gap-4 sm:flex-row sm:items-center xl:w-auto">
              <div className="flex min-w-0 items-center gap-4 rounded-2xl border border-cyan/15 bg-background/35 px-4 py-3 shadow-lg shadow-black/10">
                <RankBadge rank={rank.tier} size="md" showLabel={false} />
                <div className="min-w-0 flex-1 sm:w-52">
                  <div className="flex items-baseline justify-between gap-3">
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-[0.2em] text-vapor">Your rank</p>
                      <p className={`text-xl font-black ${rank.color}`}>{rank.name}</p>
                    </div>
                    <span className="whitespace-nowrap font-mono text-sm font-black text-cyan">{elo.toLocaleString()} ELO</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${progress}%` }}
                      transition={{ duration: 1.2 }}
                      className="h-full rounded-full bg-gradient-to-r from-cyan to-blue-400"
                    />
                  </div>
                  <p className="mt-1.5 text-[10px] text-vapor">
                    {nextRank ? `${Math.max(0, nextRank.min - elo)} ELO to ${nextRank.name}` : "Top rank reached"}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-cyan px-6 py-3 text-sm font-bold uppercase tracking-wider text-background transition-all hover:shadow-lg hover:shadow-cyan/25"
              >
                <Plus className="w-4 h-4" /> Create Ranked Match
              </button>
            </div>
          }
          stats={[
            { label: "Open Matches", value: rankedMatches.length, icon: Globe, color: "text-orange" },
            { label: "Season Wins", value: currentStats?.wins || 0, icon: Award, color: "text-yellow-400" },
            { label: "Matches Played", value: currentStats?.matches_played || 0, icon: Trophy, color: "text-cyan" },
          ]}
        />
        <ActivisionIdNotice user={user} className="mb-6" />

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
                  <p className="text-sm font-bold mb-1 text-cyan">{match.final_map_name || "Map pending"}</p>
                  <p className="text-xs text-vapor mb-3">Host: {match.host_name || "Host unavailable"}</p>
                  {match.host_id === user?.id ? (
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
            <div className="glass rounded-xl border border-white/5 p-5">
              <h3 className="font-bold text-sm mb-2 flex items-center gap-2">
                <Clock className="w-4 h-4 text-cyan" />
                Match Rules
              </h3>
              <p className="text-xs text-vapor">
                Both players must submit matching scores. Conflicting reports create a support ticket for staff review.
              </p>
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
