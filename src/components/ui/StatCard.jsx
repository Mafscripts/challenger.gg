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
      whileHover={{ scale: 1.02, y: -2 }}
      className={`glass rounded-xl p-5 border border-white/5 hover:border-white/10 transition-all ${className}`}
    >
      <div className="flex items-start justify-between mb-3">
        <div className={`p-2 rounded-lg ${cls}`}>
          {Icon && <Icon className="w-4 h-4" />}
        </div>
      </div>
      <p className="text-2xl font-bold font-mono mb-1">{value}</p>
      <p className="text-xs text-vapor uppercase tracking-wider">{label}</p>
    </motion.div>
  );
}