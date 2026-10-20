import React from "react";
import { LockKeyhole, ShieldCheck } from "lucide-react";
import { commerceUnavailableMessage } from "@/lib/commerce";
import { isNativeApp } from "@/lib/nativeApp";

export default function CommercePausedNotice({ compact = false, className = "" }) {
  if (!isNativeApp) return null;
  return (
    <div role="note" aria-label="Test credits only" className={`rounded-2xl border border-cyan/15 bg-cyan/[0.055] ${compact ? "p-3" : "p-5"} ${className}`}>
      <div className="flex items-start gap-3">
        <div className={`flex shrink-0 items-center justify-center rounded-xl bg-cyan/10 text-cyan ${compact ? "h-8 w-8" : "h-10 w-10"}`}>
          <LockKeyhole className={compact ? "h-4 w-4" : "h-5 w-5"} />
        </div>
        <div className="min-w-0">
          <p className={`${compact ? "text-xs" : "text-sm"} font-black text-foreground`}>
            Test credits only · No cash value
          </p>
          <p className={`mt-1 leading-relaxed text-vapor ${compact ? "text-[11px]" : "text-xs"}`}>
            {commerceUnavailableMessage}
          </p>
          {!compact && (
            <p className="mt-3 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-cyan">
              <ShieldCheck className="h-3.5 w-3.5" />
              Purchases and payouts unavailable
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
