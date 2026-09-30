import React, { useEffect, useState } from "react";
import { Coins, Crown, Lock, Sparkles } from "lucide-react";
import { base44 } from "@/api/base44Client";
import CommercePausedNotice from "@/components/commerce/CommercePausedNotice";

const creditPackages = [
  { credits: 1, price: 1 },
  { credits: 5, price: 3.75 },
  { credits: 10, price: 7.5 },
  { credits: 20, price: 15 },
  { credits: 50, price: 37.5 },
];

function CreditPackageArtwork({ credits }) {
  return (
    <div className="relative flex h-28 items-center justify-center overflow-hidden rounded-xl border border-yellow-300/10 bg-[radial-gradient(circle_at_50%_35%,rgba(250,204,21,0.18),transparent_62%)]">
      <div className="absolute h-20 w-20 rounded-full bg-yellow-300/10 blur-2xl" />
      <div className="absolute left-[29%] top-[30%] h-12 w-12 -rotate-12 rounded-full border border-yellow-200/15 bg-yellow-400/10" />
      <div className="absolute right-[27%] top-[38%] h-12 w-12 rotate-12 rounded-full border border-yellow-200/15 bg-yellow-400/10" />
      <div className="relative flex h-16 w-16 items-center justify-center rounded-full border-2 border-yellow-200/50 bg-gradient-to-br from-yellow-200 via-yellow-400 to-amber-600 shadow-[0_0_28px_rgba(250,204,21,0.22)]">
        <div className="flex h-12 w-12 items-center justify-center rounded-full border border-black/20 bg-[#15191f] shadow-inner">
          <img src="/topfragg-mark.svg" alt="" className="h-8 w-8 object-contain" />
        </div>
      </div>
      <span className="absolute bottom-2.5 right-3 rounded-full border border-yellow-300/20 bg-black/60 px-2 py-1 font-mono text-[10px] font-black text-yellow-300">
        ×{credits}
      </span>
    </div>
  );
}

export default function CreditsStore() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    base44.auth.isAuthenticated().then(async (authed) => {
      if (authed) {
        const me = await base44.auth.me();
        setUser(me);
      }
    });
  }, []);

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
              <p className="text-vapor text-xs mt-1">Your test balance and credit availability</p>
            </div>
            {user && (
              <div className="text-right">
                <p className="text-2xl font-black font-mono text-green">{user.credits || 0}</p>
                <p className="text-[10px] text-vapor uppercase tracking-wider">Balance</p>
              </div>
            )}
          </div>

          <CommercePausedNotice />

          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
            {creditPackages.map((pack) => (
              <div
                key={pack.credits}
                aria-disabled="true"
                className="group relative cursor-not-allowed rounded-xl border border-white/[0.07] bg-black/20 p-3 opacity-90"
              >
                <CreditPackageArtwork credits={pack.credits} />
                <div className="mt-3 flex items-end justify-between gap-2">
                  <div>
                    <p className="text-sm font-black text-white">{pack.credits} {pack.credits === 1 ? "Credit" : "Credits"}</p>
                    <p className="mt-0.5 text-[9px] font-bold uppercase tracking-wider text-vapor">
                      {pack.credits === 1 ? "$1.00 per credit" : "$0.75 per credit"}
                    </p>
                  </div>
                  <p className="font-mono text-base font-black text-green">${pack.price.toFixed(2)}</p>
                </div>
                <div className="mt-3 flex items-center justify-center gap-1.5 rounded-lg border border-white/[0.06] bg-white/[0.03] py-2 text-[9px] font-black uppercase tracking-[0.14em] text-vapor">
                  <Lock className="h-3 w-3" /> Coming soon
                </div>
              </div>
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
