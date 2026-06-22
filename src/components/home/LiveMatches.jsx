import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Radio } from "lucide-react";
import { base44 } from "@/api/base44Client";

export default function LiveMatches() {
  const [matches, setMatches] = useState([]);

  useEffect(() => {
    loadMatches();
  }, []);

  const loadMatches = async () => {
    const [wagers, ranked] = await Promise.all([
      base44.entities.Wager.filter({ status: "in_progress" }, "-accepted_date", 4).catch(() => []),
      base44.entities.RankedMatch.filter({ status: "in_progress" }, "-accepted_date", 4).catch(() => []),
    ]);
    setMatches([
      ...(wagers || []).map((match) => ({ ...match, route: `/wagers-match/${match.id}`, type: "Wager" })),
      ...(ranked || []).map((match) => ({ ...match, route: `/ranked-match/${match.id}`, type: "Ranked" })),
    ].slice(0, 4));
  };

  return (
    <section className="py-24 relative">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-red-500/[0.02] to-transparent" />
      <div className="max-w-[1600px] mx-auto px-4 lg:px-6 relative">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="flex flex-col sm:flex-row items-start sm:items-end justify-between mb-12 gap-4"
        >
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Radio className="w-4 h-4 text-red-500 animate-pulse" />
              <span className="text-red-400 text-xs font-mono font-semibold tracking-widest uppercase">Live Now</span>
            </div>
            <h2 className="text-4xl lg:text-5xl font-black tracking-tight">Live Matches</h2>
          </div>
          <Link to="/8s" className="inline-flex items-center gap-2 text-cyan font-semibold text-sm hover:gap-3 transition-all">
            All Matches <ArrowRight className="w-4 h-4" />
          </Link>
        </motion.div>

        {matches.length === 0 ? (
          <div className="glass rounded-xl border border-white/5 p-8 text-center text-vapor">No live matches right now.</div>
        ) : (
          <div className="grid md:grid-cols-2 gap-5">
            {matches.map((match, index) => (
              <Link to={match.route} key={match.id}>
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 }}
                  whileHover={{ y: -4 }}
                  className="glass rounded-xl p-6 border border-white/5 hover:border-red-500/20 transition-all cursor-pointer group"
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                      <span className="text-xs font-mono font-semibold text-vapor">{match.type}</span>
                    </div>
                    <span className="text-xs text-vapor">{match.game_mode_display || match.game_mode} - {match.final_map_name || "Map pending"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="font-bold text-sm">{match.host_name || "Host unavailable"}</p>
                    <div className="flex items-center gap-3 px-4">
                      <span className="text-2xl font-bold font-mono">{match.team_alpha_score || match.reported_score_alpha || 0}</span>
                      <span className="text-vapor text-xs">VS</span>
                      <span className="text-2xl font-bold font-mono">{match.team_bravo_score || match.reported_score_bravo || 0}</span>
                    </div>
                    <p className="font-bold text-sm text-right">{match.challenger_name || "Opponent pending"}</p>
                  </div>
                </motion.div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
