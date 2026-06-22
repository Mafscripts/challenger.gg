import React from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Swords } from "lucide-react";

const rankTiers = [
  { name: "Bronze", gradient: "from-amber-700 to-amber-900" },
  { name: "Silver", gradient: "from-gray-300 to-gray-500" },
  { name: "Gold", gradient: "from-yellow-400 to-yellow-600" },
  { name: "Platinum", gradient: "from-teal-300 to-teal-500" },
  { name: "Diamond", gradient: "from-cyan to-blue-500" },
  { name: "Master", gradient: "from-purple-400 to-purple-600" },
  { name: "Champion", gradient: "from-orange to-red-500" },
];

export default function RankedPreview() {
  return (
    <section className="py-24 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-cyan/[0.02] to-transparent" />
      <div className="max-w-[1600px] mx-auto px-4 lg:px-6 relative">
        <div className="flex flex-col lg:flex-row items-start gap-16">
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="lg:w-1/2"
          >
            <span className="text-cyan text-xs font-mono font-semibold tracking-widest uppercase">Competitive Ladder</span>
            <h2 className="text-4xl lg:text-5xl font-black mt-3 mb-6 tracking-tight">Climb the Ranks</h2>
            <p className="text-vapor leading-relaxed mb-8 max-w-lg">
              Our precision ELO system tracks your performance across every game mode.
              Complete placement matches, earn your rank, and climb through 7 tiers to reach Champion.
            </p>
            <Link to="/ranked" className="inline-flex items-center gap-2 text-cyan font-semibold text-sm hover:gap-3 transition-all">
              <Swords className="w-4 h-4" />
              Start Ranked Placement
              <ArrowRight className="w-4 h-4" />
            </Link>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="lg:w-1/2 w-full"
          >
            <div className="space-y-3">
              {rankTiers.map((tier, i) => (
                <motion.div
                  key={tier.name}
                  initial={{ opacity: 0, x: 20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.08 }}
                  className="flex items-center gap-4 glass rounded-lg px-5 py-3 border border-white/5 hover:border-white/10 transition-all group"
                >
                  <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${tier.gradient} flex items-center justify-center font-bold font-mono text-sm shrink-0 group-hover:scale-110 transition-transform`}>
                    {tier.name.charAt(0)}
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-sm">{tier.name}</p>
                  </div>
                  <div className="w-24 h-1.5 bg-secondary rounded-full overflow-hidden">
                    <div className={`h-full rounded-full bg-gradient-to-r ${tier.gradient}`} style={{ width: `${100 - i * 12}%` }} />
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
