import React from "react";
import { motion } from "framer-motion";
import { Shield, Zap, Trophy, Users, Target, Crown } from "lucide-react";

const features = [
  { icon: Shield, title: "Anti-Cheat Protection", desc: "Enterprise-grade anti-cheat powered by AI detection and manual review to keep competition fair.", color: "text-cyan" },
  { icon: Zap, title: "Fast Matchmaking", desc: "Skill-based queues help you get into 8s, ranked, or wagers without waiting around.", color: "text-orange" },
  { icon: Trophy, title: "Prize Pool Tournaments", desc: "Scheduled events with transparent brackets, real payouts, and seasonal championship paths.", color: "text-green" },
  { icon: Users, title: "Competitive Community", desc: "Find teammates, rivals, and lifelong gaming friends across the Call of Duty scene.", color: "text-purple-400" },
  { icon: Target, title: "ELO Ranked System", desc: "Precision-calibrated ELO system with seasonal resets, placement matches, and visible progression.", color: "text-cyan" },
  { icon: Crown, title: "Premium Marketplace", desc: "Collect rare cosmetics, trade with players, and showcase your collection on your profile.", color: "text-yellow-400" },
];

export default function WhySection() {
  return (
    <section className="py-24 relative">
      <div className="max-w-[1600px] mx-auto px-4 lg:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <span className="text-cyan text-xs font-mono font-semibold tracking-widest uppercase">Why Compete Here</span>
          <h2 className="text-4xl lg:text-5xl font-black mt-3 tracking-tight">Built for Champions</h2>
          <p className="text-vapor mt-4 max-w-2xl mx-auto">Every feature designed from the ground up for competitive Call of Duty players who demand the best.</p>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map((f, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              whileHover={{ y: -4 }}
              className="glass rounded-xl p-6 border border-white/5 hover:border-white/10 transition-all group"
            >
              <div className={`inline-flex p-3 rounded-lg bg-secondary mb-4 ${f.color} group-hover:scale-110 transition-transform`}>
                <f.icon className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-lg mb-2">{f.title}</h3>
              <p className="text-vapor text-sm leading-relaxed">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
