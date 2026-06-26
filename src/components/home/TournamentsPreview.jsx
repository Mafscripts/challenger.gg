import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Clock, Trophy, Users } from "lucide-react";
import { base44 } from "@/api/base44Client";

const formatMoney = (value) => `$${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const formatDate = (value) => value ? new Date(value).toLocaleString() : "Not scheduled";
const tournamentModeLabels = {
  bo1_snd: "BO1 SND",
  snd_hp_snd: "BO3 SND / HP / SND",
  bo3_hp_overload_snd: "BO3 HP / Overload / SND",
  bo5_hp_overload_snd_hp_snd: "BO5 HP / Overload / SND / HP / SND",
  snd: "BO3 Search & Destroy",
  overload: "BO3 Overload",
  hp: "BO3 Hardpoint",
};

export default function TournamentsPreview() {
  const [tournaments, setTournaments] = useState([]);

  useEffect(() => {
    Promise.all([
      base44.entities.Tournament.filter({ status: "open" }, "-start_date", 4).catch(() => []),
      base44.entities.Tournament.filter({ status: "registration" }, "-start_date", 4).catch(() => []),
      base44.entities.Tournament.filter({ status: "live" }, "-start_date", 4).catch(() => []),
    ]).then((groups) => {
      const rows = groups.flat().filter((row, index, list) => list.findIndex((item) => item.id === row.id) === index);
      setTournaments(rows.slice(0, 4));
    });
  }, []);

  return (
    <section className="py-24 relative">
      <div className="max-w-[1600px] mx-auto px-4 lg:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="flex flex-col sm:flex-row items-start sm:items-end justify-between mb-12 gap-4"
        >
          <div>
            <span className="text-orange text-xs font-mono font-semibold tracking-widest uppercase">Compete & Win</span>
            <h2 className="text-4xl lg:text-5xl font-black mt-3 tracking-tight">Tournaments</h2>
          </div>
          <Link to="/tournaments" className="inline-flex items-center gap-2 text-orange font-semibold text-sm hover:gap-3 transition-all">
            View All Tournaments <ArrowRight className="w-4 h-4" />
          </Link>
        </motion.div>

        {tournaments.length === 0 ? (
          <div className="glass rounded-xl border border-white/5 p-8 text-center text-vapor">No open tournaments yet.</div>
        ) : (
          <div className="grid md:grid-cols-2 gap-5">
            {tournaments.map((tournament, index) => (
              <motion.div
                key={tournament.id}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                whileHover={{ y: -4 }}
                className="glass rounded-xl p-6 border border-white/5 hover:border-orange/20 transition-all group cursor-pointer"
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="font-bold text-lg mb-1">{tournament.name}</h3>
                    <p className="text-sm text-vapor">{tournament.team_size} {tournamentModeLabels[tournament.game_mode] || tournament.game_mode}</p>
                  </div>
                  <span className="text-xs font-mono font-semibold text-cyan">{String(tournament.status || "open").replace(/_/g, " ")}</span>
                </div>
                <div className="flex items-center gap-6 text-sm text-vapor">
                  <div className="flex items-center gap-1.5">
                    <Trophy className="w-3.5 h-3.5 text-green" />
                    <span className="font-mono text-green font-semibold">{formatMoney(tournament.prize_pool)}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5" />
                    <span>{tournament.registered_teams || 0}/{tournament.max_teams}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    <span>{formatDate(tournament.start_date)}</span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
