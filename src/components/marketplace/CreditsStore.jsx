import React, { useEffect, useState } from "react";
import { Coins, Crown, Sparkles } from "lucide-react";
import { base44 } from "@/api/base44Client";
import CommercePausedNotice from "@/components/commerce/CommercePausedNotice";

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
