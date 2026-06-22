import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Flame } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { getRankForElo } from "@/lib/ranks";

export default function FeaturedPlayers() {
  const [players, setPlayers] = useState([]);

  useEffect(() => {
    base44.entities.RankedStats.filter({}, "-elo", 6)
      .then((rows) => setPlayers(rows || []))
      .catch(() => setPlayers([]));
  }, []);

  return (
    <section className="py-24">
      <div className="max-w-[1600px] mx-auto px-4 lg:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="flex flex-col sm:flex-row items-start sm:items-end justify-between mb-12 gap-4"
        >
          <div>
            <span className="text-yellow-400 text-xs font-mono font-semibold tracking-widest uppercase">Top Competitors</span>
            <h2 className="text-4xl lg:text-5xl font-black mt-3 tracking-tight">Featured Players</h2>
          </div>
          <Link to="/leaderboards" className="inline-flex items-center gap-2 text-cyan font-semibold text-sm hover:gap-3 transition-all">
            Full Leaderboard <ArrowRight className="w-4 h-4" />
          </Link>
        </motion.div>

        {players.length === 0 ? (
          <div className="glass rounded-xl border border-white/5 p-8 text-center text-vapor">No ranked players yet.</div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {players.map((player, index) => {
              const rank = getRankForElo(player.elo);
              return (
                <motion.div
                  key={player.id}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.08 }}
                  whileHover={{ y: -4 }}
                  className="glass rounded-xl p-5 border border-white/5 hover:border-white/10 transition-all group"
                >
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan/30 to-orange/30 flex items-center justify-center font-bold font-mono text-lg group-hover:scale-110 transition-transform">
                      #{index + 1}
                    </div>
                    <div>
                      <Link to={`/profile/${player.username || player.user_id || player.id || ""}`} className="font-bold hover:text-cyan transition-colors">{player.username || player.display_name || player.full_name || "Unnamed player"}</Link>
                      <p className="text-xs text-vapor">{rank.name}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <p className="text-lg font-bold font-mono text-cyan">{Number(player.elo || 0).toLocaleString()}</p>
                      <p className="text-[10px] text-vapor uppercase tracking-wider">ELO</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold font-mono">{player.wins || 0}</p>
                      <p className="text-[10px] text-vapor uppercase tracking-wider">Wins</p>
                    </div>
                    <div className="flex items-start gap-1">
                      <Flame className="w-4 h-4 text-orange mt-0.5" />
                      <div>
                        <p className="text-lg font-bold font-mono text-orange">{player.win_streak || 0}</p>
                        <p className="text-[10px] text-vapor uppercase tracking-wider">Streak</p>
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
