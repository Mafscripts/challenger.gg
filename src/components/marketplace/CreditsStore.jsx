import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Coins, Zap, Loader2, Sparkles, Crown } from "lucide-react";
import { base44 } from "@/api/base44Client";

const creditPacks = [
  { id: "starter", name: "Starter Pack", credits: 5, price: 5.00, popular: false },
  { id: "pro", name: "Pro Pack", credits: 10, price: 10.00, popular: true },
  { id: "mega", name: "Mega Pack", credits: 30, price: 25.00, popular: false, bonus: "+5 Bonus" },
  { id: "ultimate", name: "Ultimate Pack", credits: 60, price: 50.00, popular: false, bonus: "+10 Bonus" },
];

export default function CreditsStore() {
  const [user, setUser] = useState(null);
  const [purchasing, setPurchasing] = useState(null);

  useEffect(() => {
    base44.auth.isAuthenticated().then(async (authed) => {
      if (authed) {
        const me = await base44.auth.me();
        setUser(me);
      }
    });
  }, []);

  const handleBuy = async (pack) => {
    setPurchasing(pack.id);
    try {
      const res = await base44.functions.invoke("create-checkout", { pack_id: pack.id });
      if (res?.data?.checkout_url) {
        window.location.href = res.data.checkout_url;
      }
    } catch (e) {
      console.error("Checkout failed", e);
    }
    setPurchasing(null);
  };

  return (
    <div className="mb-10" id="credits-store">
      <div className="relative glass rounded-2xl border border-green/10 p-6 overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-green/5 rounded-full blur-[100px]" />
        <div className="relative">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-black flex items-center gap-2">
                <Coins className="w-5 h-5 text-green" /> Credits Store
              </h2>
              <p className="text-vapor text-xs mt-1">Purchase credits for tournament entries and username changes</p>
            </div>
            {user && (
              <div className="text-right">
                <p className="text-2xl font-black font-mono text-green">{user.credits || 0}</p>
                <p className="text-[10px] text-vapor uppercase tracking-wider">Balance</p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
            {creditPacks.map((pack) => (
              <motion.div
                key={pack.id}
                whileHover={{ y: -6 }}
                className={`relative glass rounded-xl border p-4 flex flex-col ${
                  pack.popular ? "border-cyan/30 glow-cyan" : "border-white/5 hover:border-white/10"
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
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-green/10 text-green text-sm font-bold rounded-lg border border-green/20 hover:bg-green/20 transition-all disabled:opacity-50"
                >
                  {purchasing === pack.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                  Buy Now
                </button>
              </motion.div>
            ))}
          </div>

          <div className="mt-4 p-3 bg-secondary/50 rounded-lg border border-white/5">
            <p className="text-xs text-vapor flex items-start gap-1.5">
              <Sparkles className="w-3 h-3 mt-0.5 shrink-0" />
              <span>Credits can be used for tournament entry fees and display name changes (5 credits each, free for <Crown className="w-3 h-3 inline" /> Premium members).</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}