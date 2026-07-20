import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { DollarSign, Flame, Star, Trophy, TrendingUp } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { getRankForElo } from "@/lib/ranks";

const tabs = [
  { key: "elo", label: "ELO Rankings", icon: TrendingUp },
  { key: "xp", label: "XP Level", icon: Star },
  { key: "tournaments", label: "Tournament Wins", icon: Trophy },
  { key: "wagers", label: "Wager Earnings", icon: DollarSign },
];

const regions = ["Global", "NA", "EU", "APAC", "SA", "OCE"];

const playerName = (row) => row.username || row.display_name || row.full_name || row.email || "Unnamed player";
const playerSlug = (row) => row.username || row.user_id || row.id || "";

export default function Leaderboards() {
  const [activeTab, setActiveTab] = useState("elo");
  const [region, setRegion] = useState("Global");
  const [rankedStats, setRankedStats] = useState([]);
  const [xpStats, setXpStats] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [rankedRows, xpRows, userRows] = await Promise.all([
        base44.entities.RankedStats.filter({}, "-elo", 100).catch(() => []),
        base44.entities.XPStats.filter({}, "-total_xp", 100).catch(() => []),
        base44.entities.User.filter({}, "-total_wager_earnings", 100).catch(() => []),
      ]);
      setRankedStats(rankedRows || []);
      setXpStats(xpRows || []);
      setUsers(userRows || []);
    } finally {
      setLoading(false);
    }
  };

  const rows = useMemo(() => {
    const selectedRegion = region.toLowerCase();
    const regionFilter = (row) => region === "Global" || String(row.region || "").toLowerCase() === selectedRegion;

    if (activeTab === "elo") {
      return rankedStats
        .filter(regionFilter)
        .map((row) => ({
          id: row.id,
          name: playerName(row),
          slug: playerSlug(row),
          tier: getRankForElo(row.elo).name,
          region: (row.region || "na").toUpperCase(),
          streak: row.win_streak || 0,
          value: Number(row.elo || 0),
          display: Number(row.elo || 0).toLocaleString(),
        }));
    }

    if (activeTab === "xp") {
      return xpStats
        .filter(regionFilter)
        .map((row) => ({
          id: row.id,
          name: playerName(row),
          slug: playerSlug(row),
          tier: `Prestige ${row.prestige || 0}`,
          region: (row.region || "na").toUpperCase(),
          streak: row.win_streak || 0,
          value: Number(row.level || 1),
          display: `Lv. ${row.level || 1}`,
        }));
    }

    const userRows = users.filter(regionFilter);
    if (activeTab === "tournaments") {
      return userRows.map((row) => ({
        id: row.id,
        name: playerName(row),
        slug: playerSlug(row),
        tier: row.rank || "unranked",
        region: (row.region || "na").toUpperCase(),
        streak: row.current_win_streak || 0,
        value: Number(row.tournament_wins || 0),
        display: Number(row.tournament_wins || 0).toLocaleString(),
      })).sort((a, b) => b.value - a.value);
    }

    return userRows.map((row) => ({
      id: row.id,
      name: playerName(row),
      slug: playerSlug(row),
      tier: row.rank || "unranked",
      region: (row.region || "na").toUpperCase(),
      streak: row.current_win_streak || 0,
      value: Number(row.total_wager_earnings || 0),
      display: `$${Number(row.total_wager_earnings || 0).toLocaleString()}`,
    })).sort((a, b) => b.value - a.value);
  }, [activeTab, region, rankedStats, xpStats, users]);

  const rankedRows = rows.map((row, index) => ({ ...row, rank: index + 1 }));
  const podium = [rankedRows[1], rankedRows[0], rankedRows[2]].filter(Boolean);

  return (
    <div className="min-h-screen py-8">
      <div className="max-w-[1600px] mx-auto px-4 lg:px-6">
        <h1 className="text-3xl font-black tracking-tight mb-2">Leaderboards</h1>
        <p className="text-vapor text-sm mb-8">Live rankings from ranked, XP, tournament, and wager records.</p>

        <div className="flex flex-wrap items-center gap-3 mb-6">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                activeTab === tab.key ? "bg-cyan/10 text-cyan border border-cyan/20" : "bg-secondary text-vapor hover:text-foreground"
              }`}
            >
              <tab.icon className="w-3.5 h-3.5" /> {tab.label}
            </button>
          ))}
          <div className="ml-auto flex gap-2">
            {regions.map((item) => (
              <button
                key={item}
                onClick={() => setRegion(item)}
                className={`px-3 py-1.5 rounded text-xs font-semibold transition-all ${
                  region === item ? "bg-white/10 text-foreground" : "text-vapor hover:text-foreground"
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="glass rounded-xl border border-white/5 p-10 text-center text-vapor">Loading leaderboards...</div>
        ) : rankedRows.length === 0 ? (
          <div className="glass rounded-xl border border-white/5 p-10 text-center text-vapor">No leaderboard records yet.</div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-4 mb-8 max-w-2xl mx-auto">
              {podium.map((row, index) => {
                const place = row.rank;
                const gradients = { 1: "from-yellow-400 to-orange", 2: "from-gray-300 to-gray-400", 3: "from-amber-600 to-amber-800" };
                return (
                  <motion.div
                    key={row.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.15 }}
                    className="flex flex-col items-center"
                  >
                    <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${gradients[place]} flex items-center justify-center text-xl font-black mb-3`}>
                      #{place}
                    </div>
                    <Link to={`/profile/${row.slug}`} className="font-bold text-sm hover:text-cyan transition-colors mb-1">{row.name}</Link>
                    <p className="text-xs text-vapor mb-1 capitalize">{row.tier}</p>
                    <p className="text-lg font-bold font-mono text-cyan">{row.display}</p>
                  </motion.div>
                );
              })}
            </div>

            <div className="glass rounded-xl border border-white/5 overflow-hidden">
              <div className="hidden md:grid grid-cols-7 gap-4 px-5 py-3 border-b border-white/5 text-xs text-vapor uppercase tracking-wider font-semibold">
                <span>Rank</span>
                <span className="col-span-2">Player</span>
                <span>Tier</span>
                <span>Region</span>
                <span>Streak</span>
                <span>{activeTab === "elo" ? "ELO" : activeTab === "xp" ? "Level" : activeTab === "tournaments" ? "Wins" : "Earnings"}</span>
              </div>
              <div className="divide-y divide-white/5">
                {rankedRows.map((row, index) => (
                  <motion.div
                    key={row.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: index * 0.03 }}
                    whileHover={{ backgroundColor: "rgba(255,255,255,0.02)", transition: { duration: 0.1, ease: "easeOut" } }}
                    className="grid grid-cols-3 md:grid-cols-7 gap-2 md:gap-4 px-5 py-4 items-center"
                  >
                    <span className={`text-sm font-bold font-mono ${row.rank <= 3 ? "text-orange" : "text-vapor"}`}>#{row.rank}</span>
                    <Link to={`/profile/${row.slug}`} className="col-span-2 font-semibold text-sm hover:text-cyan transition-colors">{row.name}</Link>
                    <span className="text-sm text-vapor hidden md:block capitalize">{row.tier}</span>
                    <span className="text-xs text-vapor hidden md:block">{row.region}</span>
                    <span className="text-sm font-mono hidden md:flex items-center gap-1">
                      <Flame className={`w-3 h-3 ${row.streak >= 5 ? "text-orange" : "text-vapor"}`} /> {row.streak}
                    </span>
                    <span className="text-sm font-mono font-bold text-cyan">{row.display}</span>
                  </motion.div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
