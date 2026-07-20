import React from "react";
import { motion } from "framer-motion";

export default function StatCard({ icon: Icon, label, value, accent = "cyan", className = "" }) {
  const accentClasses = {
    cyan: "text-cyan border-cyan/20 bg-cyan/5",
    orange: "text-orange border-orange/20 bg-orange/5",
    green: "text-green border-green/20 bg-green/5",
    purple: "text-purple-400 border-purple-400/20 bg-purple-400/5",
  };
  const cls = accentClasses[accent] || accentClasses.cyan;

  return (
    <motion.div
      whileHover={{ y: -4, transition: { duration: 0.1, ease: "easeOut" } }}
      transition={{ duration: 0.1, ease: "easeOut" }}
      className={`premium-card group relative overflow-hidden rounded-2xl p-5 ${className}`}
    >
      <div className={`pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full blur-3xl ${cls}`} />
      <div className="flex items-start justify-between mb-3">
        <div className={`relative rounded-xl p-2.5 transition-transform duration-300 group-hover:scale-110 ${cls}`}>
          {Icon && <Icon className="w-4 h-4" />}
        </div>
      </div>
      <p className="relative mb-1 font-mono text-3xl font-black tracking-tight text-white">{value}</p>
      <p className="relative text-[10px] font-bold uppercase tracking-[0.16em] text-vapor">{label}</p>
    </motion.div>
  );
}
