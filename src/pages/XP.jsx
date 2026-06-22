import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Award, Crown, Flame, ShoppingBag, Swords, Target, Trophy, Zap } from "lucide-react";
import { base44 } from "@/api/base44Client";

const xpSources = [
  { action: "Match Win", xp: "+150", icon: Swords, color: "text-green" },
  { action: "Match Loss", xp: "+50", icon: Swords, color: "text-vapor" },
  { action: "Tournament Win", xp: "+2,000", icon: Trophy, color: "text-yellow-400" },
  { action: "Wager Win", xp: "+300", icon: Zap, color: "text-orange" },
  { action: "8s Win", xp: "+100", icon: Target, color: "text-cyan" },
  { action: "Daily Mission", xp: "+500", icon: Award, color: "text-purple-400" },
];

const xpMilestones = [
  { level: 10, reward: "Bronze XP Badge", rarity: "common" },
  { level: 20, reward: "Silver XP Frame", rarity: "uncommon" },
  { level: 30, reward: "Gold Calling Card", rarity: "rare" },
  { level: 40, reward: "Platinum Weapon Skin", rarity: "epic" },
  { level: 50, reward: "Diamond Avatar", rarity: "legendary" },
  { level: 75, reward: "Master Emblem", rarity: "mythic" },
  { level: 100, reward: "Prestige Crown", rarity: "exclusive" },
];

const rarityStyles = {
  common: { color: "text-gray-400", border: "border-gray-400/20", bg: "bg-gray-400/10" },
  uncommon: { color: "text-green", border: "border-green/20", bg: "bg-green/10" },
  rare: { color: "text-blue-400", border: "border-blue-400/20", bg: "bg-blue-400/10" },
  epic: { color: "text-purple-400", border: "border-purple-400/20", bg: "bg-purple-400/10" },
  legendary: { color: "text-yellow-400", border: "border-yellow-400/20", bg: "bg-yellow-400/10" },
  mythic: { color: "text-fuchsia-400", border: "border-fuchsia-400/20", bg: "bg-fuchsia-400/10" },
  exclusive: { color: "text-cyan", border: "border-cyan/20", bg: "bg-cyan/10" },
};

const regions = ["Global", "NA", "EU", "APAC", "SA", "OCE"];

export default function XP() {
  const [region, setRegion] = useState("Global");
  const [currentUser, setCurrentUser] = useState(null);
  const [currentStats, setCurrentStats] = useState(null);
  const [stats, setStats] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [me, xpRows] = await Promise.all([
        base44.auth.me().catch(() => null),
        base44.entities.XPStats.filter({}, "-total_xp", 100).catch(() => []),
      ]);
      setCurrentUser(me);
      setStats(xpRows || []);
      if (me?.id) {
        const ownRows = await base44.entities.XPStats.filter({ user_id: me.id }, "-season", 1).catch(() => []);
        setCurrentStats(ownRows[0] || null);
      }
    } finally {
      setLoading(false);
    }
  };

  const leaderboard = useMemo(() => {
    const selectedRegion = region.toLowerCase();
    return stats
      .filter((row) => region === "Global" || String(row.region || "").toLowerCase() === selectedRegion)
      .map((row, index) => ({ ...row, rank: index + 1 }));
  }, [stats, region]);

  const level = currentStats?.level || currentUser?.xp_level || 1;
  const totalXp = currentStats?.total_xp || 0;
  const currentXp = currentStats?.current_xp || 0;
  const xpToNext = currentStats?.xp_to_next_level || 1000;
  const progress = Math.min(100, Math.round((currentXp / Math.max(1, currentXp + xpToNext)) * 100));

  return (
    <div className="min-h-screen py-8">
      <div className="max-w-[1600px] mx-auto px-4 lg:px-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-black tracking-tight flex items-center gap-2">
              <Zap className="w-7 h-7 text-cyan" /> XP Ladder
            </h1>
            <p className="text-vapor text-sm mt-1">Live XP progression across competitive modes.</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {regions.map((item) => (
              <button
                key={item}
                onClick={() => setRegion(item)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  region === item ? "bg-cyan/10 text-cyan border border-cyan/20" : "bg-secondary text-vapor hover:text-foreground"
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass rounded-xl p-8 border border-cyan/10 relative overflow-hidden mb-8"
        >
          <div className="absolute top-0 right-0 w-80 h-80 bg-cyan/5 rounded-full blur-[100px]" />
          <div className="relative flex flex-col lg:flex-row items-start lg:items-center gap-6">
            <div className="relative w-28 h-28 shrink-0">
              <div className="relative w-full h-full rounded-2xl overflow-hidden border border-cyan/20 bg-gradient-to-br from-cyan/20 to-blue-500/20 flex flex-col items-center justify-center">
                <span className="text-[10px] text-cyan font-mono font-bold uppercase tracking-wider">Level</span>
                <span className="text-4xl font-black text-cyan font-mono">{level}</span>
              </div>
            </div>

            <div className="flex-1 w-full">
              <div className="flex items-center gap-3 mb-1">
                <h2 className="text-2xl font-black">{currentUser?.display_name || currentUser?.username || "Your XP"}</h2>
                <span className="px-2 py-0.5 rounded bg-orange/10 text-orange text-[10px] font-mono font-bold flex items-center gap-1">
                  <Crown className="w-3 h-3" /> PRESTIGE {currentStats?.prestige || 0}
                </span>
              </div>
              <p className="text-vapor text-sm mb-4">{Number(totalXp).toLocaleString()} total XP</p>
              <div className="mb-2 flex items-center justify-between text-xs">
                <span className="text-vapor">Progress to Level {level + 1}</span>
                <span className="font-mono text-cyan font-bold">{Number(currentXp).toLocaleString()} XP</span>
              </div>
              <div className="h-3 bg-secondary rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-cyan to-blue-400 rounded-full" style={{ width: `${progress}%` }} />
              </div>
              <p className="text-xs text-vapor mt-2">{Number(xpToNext).toLocaleString()} XP to next level</p>
            </div>

            <div className="grid grid-cols-2 gap-3 w-full lg:w-auto">
              <div className="glass rounded-lg p-3 border border-white/5 text-center min-w-[100px]">
                <p className="text-xl font-bold font-mono text-cyan">+{Number(currentStats?.weekly_xp || 0).toLocaleString()}</p>
                <p className="text-[10px] text-vapor uppercase tracking-wider mt-1">Weekly XP</p>
              </div>
              <div className="glass rounded-lg p-3 border border-white/5 text-center min-w-[100px]">
                <p className="text-xl font-bold font-mono text-orange flex items-center justify-center gap-1">
                  <Flame className="w-4 h-4" /> {currentStats?.win_streak || 0}
                </p>
                <p className="text-[10px] text-vapor uppercase tracking-wider mt-1">Win Streak</p>
              </div>
            </div>
          </div>
        </motion.div>

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="glass rounded-xl border border-white/5 overflow-hidden">
              <div className="px-5 py-4 border-b border-white/5">
                <h2 className="font-bold text-sm">XP Leaderboard</h2>
              </div>
              <div className="divide-y divide-white/5">
                {loading ? (
                  <div className="px-5 py-8 text-center text-vapor">Loading XP records...</div>
                ) : leaderboard.length === 0 ? (
                  <div className="px-5 py-8 text-center text-vapor">No XP records yet.</div>
                ) : leaderboard.map((player, index) => (
                  <motion.div
                    key={player.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: index * 0.04 }}
                    className="grid grid-cols-5 gap-4 px-5 py-4 items-center hover:bg-white/[0.02]"
                  >
                    <span className={`font-mono font-bold ${player.rank <= 3 ? "text-orange" : "text-vapor"}`}>#{player.rank}</span>
                    <Link to={`/profile/${player.username || player.user_id || player.id || ""}`} className="col-span-2 font-semibold text-sm hover:text-cyan">{player.username || player.display_name || player.full_name || "Unnamed player"}</Link>
                    <span className="text-sm text-vapor hidden md:block">{String(player.region || "na").toUpperCase()}</span>
                    <span className="text-sm font-mono text-cyan">Lv. {player.level || 1}</span>
                  </motion.div>
                ))}
              </div>
            </div>

            <div className="glass rounded-xl border border-white/5 p-6">
              <h3 className="font-bold text-sm mb-4">XP Sources</h3>
              <div className="grid sm:grid-cols-2 gap-3">
                {xpSources.map((source) => (
                  <div key={source.action} className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50 border border-white/5">
                    <source.icon className={`w-4 h-4 ${source.color}`} />
                    <span className="flex-1 text-sm">{source.action}</span>
                    <span className="text-xs font-mono text-yellow-400">{source.xp} XP</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="glass rounded-xl border border-white/5 p-6">
              <h3 className="font-bold text-sm mb-4">Level Rewards</h3>
              <div className="space-y-3">
                {xpMilestones.map((reward) => {
                  const style = rarityStyles[reward.rarity];
                  const unlocked = level >= reward.level;
                  return (
                    <div key={reward.level} className={`p-3 rounded-lg border ${unlocked ? style.border : "border-white/5"} ${unlocked ? style.bg : "bg-secondary/40"}`}>
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className={`text-sm font-semibold ${unlocked ? style.color : "text-vapor"}`}>{reward.reward}</p>
                          <p className="text-[10px] text-vapor">Level {reward.level}</p>
                        </div>
                        <span className="text-[10px] uppercase font-bold text-vapor">{unlocked ? "Unlocked" : "Locked"}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <Link to="/marketplace" className="glass rounded-xl border border-orange/20 p-5 flex items-center gap-3 hover:bg-orange/5 transition-all">
              <ShoppingBag className="w-5 h-5 text-orange" />
              <div>
                <p className="font-bold text-sm">Spend Credits</p>
                <p className="text-xs text-vapor">Browse real marketplace rewards.</p>
              </div>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
