import React, { useState } from "react";
import { motion } from "framer-motion";
import { Coins, Zap, Loader2, Sparkles } from "lucide-react";
import { base44 } from "@/api/base44Client";

const creditPacks = [
  { id: "starter", name: "Starter Pack", credits: 5, price: 5.00, popular: false },
  { id: "pro", name: "Pro Pack", credits: 10, price: 10.00, popular: true },
  { id: "mega", name: "Mega Pack", credits: 30, price: 25.00, popular: false, bonus: "+5 Bonus" },
  { id: "ultimate", name: "Ultimate Pack", credits: 60, price: 50.00, popular: false, bonus: "+10 Bonus" },
];

export default function CreditsSection({ user, onUserUpdate }) {
  const [purchasing, setPurchasing] = useState(null);
  const [purchaseResult, setPurchaseResult] = useState(null);
  const credits = user?.credits || 0;

  const handleBuy = async (pack) => {
    setPurchasing(pack.id);
    setPurchaseResult(null);
    try {
      const res = await base44.functions.invoke("create-checkout", { pack_id: pack.id });
      if (res?.data?.checkout_url) {
        window.location.href = res.data.checkout_url;
      } else {
        setPurchaseResult({ success: false, message: "Failed to start checkout. Please try again." });
      }
    } catch (e) {
      setPurchaseResult({ success: false, message: "Failed to start checkout. Please try again." });
    }
    setPurchasing(null);
  };

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
            <p className="text-vapor text-xs">Use credits for tournament entries and name changes</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-black font-mono text-green">{credits}</p>
          <p className="text-[10px] text-vapor uppercase tracking-wider">Balance</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {creditPacks.map((pack) => (
          <div
            key={pack.id}
            className={`relative glass rounded-xl border p-4 flex flex-col ${
              pack.popular ? "border-cyan/30 glow-cyan" : "border-white/5"
            }`}
          >
            {pack.popular && (
              <span className="absolute -top-2 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded bg-cyan text-background text-[10px] font-mono font-bold uppercase tracking-wider">
                Best Value
              </span>
            )}
            <div className="flex items-center gap-2 mb-3">
              <Coins className="w-5 h-5 text-green" />
              <span className="text-xl font-black font-mono">{pack.credits}</span>
              {pack.bonus && (
                <span className="px-1.5 py-0.5 rounded bg-orange/15 text-orange text-[9px] font-mono font-bold uppercase tracking-wider">{pack.bonus}</span>
              )}
            </div>
            <p className="text-xs text-vapor mb-3 flex-1">{pack.name}</p>
            <div className="mb-3">
              <span className="text-lg font-bold font-mono text-green">${pack.price.toFixed(2)}</span>
            </div>
            <button
              onClick={() => handleBuy(pack)}
              disabled={purchasing === pack.id}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-cyan/10 text-cyan text-sm font-bold rounded-lg border border-cyan/20 hover:bg-cyan/20 transition-all disabled:opacity-50"
            >
              {purchasing === pack.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              Buy Now
            </button>
          </div>
        ))}
      </div>

      {purchaseResult && (
        <div className={`mt-4 p-3 rounded-lg text-xs ${purchaseResult.success ? "bg-green/10 text-green border border-green/20" : "bg-orange/10 text-orange border border-orange/20"}`}>
          {purchaseResult.message}
        </div>
      )}

      <div className="mt-4 p-3 bg-secondary/50 rounded-lg border border-white/5">
        <p className="text-xs text-vapor flex items-start gap-1.5">
          <Sparkles className="w-3 h-3 mt-0.5 shrink-0" />
          <span>Credits can be used for tournament entry fees and display name changes (5 credits each, free for Premium members).</span>
        </p>
      </div>
    </motion.div>
  );
}