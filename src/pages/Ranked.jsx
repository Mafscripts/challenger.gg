import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import { Award, Clock, Globe, Plus, Swords, Trophy } from "lucide-react";
import { base44 } from "@/api/base44Client";
import CreateLobbyModal from "@/components/match/CreateLobbyModal";
import RankBadge from "@/components/ui/RankBadge";
import { toast } from "@/components/ui/use-toast";
import {
  RANK_REWARDS,
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
    existing.divisions.push(rank.division || "Top");
    existing.min = Math.min(existing.min, rank.min);
    existing.max = Math.max(existing.max, Number.isFinite(rank.max) ? rank.max : existing.max);
    return tiers;
  }
  return [
    ...tiers,
    {
      tier: rank.tier,
      name: rank.tier.charAt(0).toUpperCase() + rank.tier.slice(1),
      divisions: [rank.division || "Top"],
      min: rank.min,
      max: Number.isFinite(rank.max) ? rank.max : rank.min,
      color: rank.color,
    },
  ];
}, []);

const playerName = (user) => user?.display_name || user?.full_name || user?.username || user?.email || "Unnamed player";

export default function Ranked() {
  const navigate = useNavigate();
  const [region, setRegion] = useState("Global");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [currentStats, setCurrentStats] = useState(null);
  const [rankedMatches, setRankedMatches] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
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
      setLeaderboard(statsRows || []);
      setCurrentStats((statsRows || []).find((stats) => stats.user_id === currentUser?.id) || null);
    } catch (error) {
      console.error("Failed to load ranked data:", error);
      toast({ title: "Ranked unavailable", description: "Could not load ranked data.", variant: "destructive" });
    } finally {
      setLoadingMatches(false);
    }
  };

  const filteredLeaderboard = useMemo(() => {
    if (region === "Global") return leaderboard.slice(0, 10);
    return leaderboard.filter((row) => row.region?.toLowerCase() === region.toLowerCase()).slice(0, 10);
  }, [leaderboard, region]);

  const elo = currentStats?.elo || 0;
  const rank = getRankForElo(elo);
  const nextRank = getNextRankForElo(elo);
  const progress = getRankProgress(elo);

  const handleAcceptMatch = async (match) => {
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
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-black tracking-tight">Ranked</h1>
            <p className="text-vapor text-sm mt-1">Season 1 competitive ladder</p>
          </div>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="inline-flex items-center gap-2 px-6 py-3 bg-cyan text-background font-bold text-sm rounded-lg hover:shadow-lg hover:shadow-cyan/25 transition-all uppercase tracking-wider"
          >
            <Plus className="w-4 h-4" /> Create Ranked Match
          </button>
        </div>

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
            <motion.div whileHover={{ y: -2 }} className="glass rounded-xl p-8 border border-cyan/10 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-60 h-60 bg-cyan/5 rounded-full blur-[80px]" />
              <div className="relative flex flex-col sm:flex-row items-start sm:items-center gap-6">
                <RankBadge rank={rank.tier} division={rank.division} size="lg" />
                <div>
                  <p className="text-xs text-vapor uppercase tracking-wider mb-1">Your Current Rank</p>
                  <h2 className="text-3xl font-black">{rank.name}</h2>
                  <div className="flex flex-wrap items-center gap-4 mt-2">
                    <span className="text-cyan font-mono font-bold text-xl">{elo.toLocaleString()} ELO</span>
                    <span className="text-xs text-vapor">
                      {nextRank ? `${Math.max(0, nextRank.min - elo)} ELO to ${nextRank.name}` : "Top rank reached"}
                    </span>
                  </div>
                  <div className="mt-3 w-full max-w-xs">
                    <div className="h-2 bg-secondary rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${progress}%` }}
                        transition={{ duration: 1.5 }}
                        className="h-full bg-gradient-to-r from-cyan to-blue-400 rounded-full"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>

            <div className="glass rounded-xl border border-white/5 overflow-hidden">
              <div className="px-5 py-4 border-b border-white/5">
                <h3 className="font-bold text-sm">Rank Tiers</h3>
              </div>
              <div className="divide-y divide-white/5">
                {groupedRanks.map((tier) => (
                  <div key={tier.tier} className="px-5 py-4 flex items-center gap-4 hover:bg-white/[0.02] transition-colors">
                    <RankBadge rank={tier.tier} division={tier.divisions[0]} />
                    <div className="flex-1">
                      <p className={`font-bold ${tier.color}`}>{tier.name}</p>
                      <p className="text-xs text-vapor">Divisions: {tier.divisions.join(", ")}</p>
                    </div>
                    <span className="text-sm font-mono text-vapor">
                      {tier.min.toLocaleString()}-{tier.max.toLocaleString()} ELO
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="glass rounded-xl border border-white/5 overflow-hidden">
              <div className="px-5 py-4 border-b border-white/5">
                <h3 className="font-bold text-sm flex items-center gap-2">
                  <Globe className="w-4 h-4 text-cyan" />
                  Rankings
                </h3>
              </div>
              <div className="p-3 flex gap-2">
                {["Global", "NA", "EU", "APAC"].map((item) => (
                  <button
                    key={item}
                    onClick={() => setRegion(item)}
                    className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
                      region === item ? "bg-cyan text-background" : "bg-secondary text-vapor hover:text-foreground"
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </div>
              <div className="divide-y divide-white/5">
                {filteredLeaderboard.length === 0 ? (
                  <p className="px-5 py-6 text-center text-xs text-vapor">No ranked stats yet.</p>
                ) : filteredLeaderboard.map((player, index) => (
                  <Link key={player.id || player.user_id} to={`/profile/${player.username || player.user_id || player.id || ""}`} className="px-5 py-3 flex items-center gap-3 hover:bg-white/[0.02] transition-colors">
                    <span className={`w-6 text-sm font-bold font-mono ${index < 3 ? "text-orange" : "text-vapor"}`}>#{index + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{player.username || playerName(player)}</p>
                      <p className="text-[10px] text-vapor">{(player.region || "global").toUpperCase()}</p>
                    </div>
                    <span className="text-sm font-mono text-cyan">{(player.elo || 0).toLocaleString()}</span>
                  </Link>
                ))}
              </div>
            </div>

            <div className="glass rounded-xl border border-white/5 overflow-hidden">
              <div className="px-5 py-4 border-b border-white/5">
                <h3 className="font-bold text-sm flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-yellow-400" />
                  Ranked Rewards
                </h3>
              </div>
              <div className="divide-y divide-white/5">
                {RANK_REWARDS.map((reward) => (
                  <div key={reward.key} className="px-5 py-3 flex items-center gap-3">
                    <Award className="w-4 h-4 text-cyan" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{reward.name}</p>
                      <p className="text-[10px] text-vapor">{reward.required_elo.toLocaleString()} ELO</p>
                    </div>
                    <span className="text-[10px] text-vapor uppercase">{reward.rarity}</span>
                  </div>
                ))}
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

            <div className="glass rounded-xl border border-white/5 p-5">
              <h3 className="font-bold text-sm mb-2 flex items-center gap-2">
                <Clock className="w-4 h-4 text-cyan" />
                Match Rules
              </h3>
              <p className="text-xs text-vapor">
                Both players must submit matching scores. Conflicting reports create a support ticket for staff review.
              </p>
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
