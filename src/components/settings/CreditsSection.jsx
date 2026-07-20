import React from "react";
import { motion } from "framer-motion";
import { Coins, Sparkles } from "lucide-react";
import CommercePausedNotice from "@/components/commerce/CommercePausedNotice";

export default function CreditsSection({ user }) {
  const credits = user?.credits || 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-xl border border-white/5 p-6 mb-6"
      id="credits"
    >
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-green/20 flex items-center justify-center">
            <Coins className="w-5 h-5 text-green" />
          </div>
          <div>
            <h2 className="font-bold text-lg">Credits</h2>
            <p className="text-vapor text-xs">Credits granted by staff can be used during testing</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-black font-mono text-green">{credits}</p>
          <p className="text-[10px] text-vapor uppercase tracking-wider">Balance</p>
        </div>
      </div>

      <CommercePausedNotice />

      <div className="mt-4 p-3 bg-secondary/50 rounded-lg border border-white/5">
        <p className="text-xs text-vapor flex items-start gap-1.5">
          <Sparkles className="w-3 h-3 mt-0.5 shrink-0" />
          <span>Credits can be used for tournament entry fees and display name changes (5 credits each, free for Premium members).</span>
        </p>
      </div>
    </motion.div>
  );
}
