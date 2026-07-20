import React from "react";
import { LockKeyhole } from "lucide-react";

export default function BuyWithCreditsButton({ size = "sm" }) {
  const sizeClasses = size === "sm" ? "px-2 py-1 text-[10px]" : "px-3 py-1.5 text-xs";

  return (
    <button
      type="button"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      disabled
      title="Purchases are paused during public testing"
      className={`flex w-full cursor-not-allowed items-center justify-center gap-1 rounded border border-white/10 bg-white/[0.035] font-bold text-vapor opacity-75 ${sizeClasses}`}
    >
      <LockKeyhole className="w-3 h-3" />
      Purchases Paused
    </button>
  );
}
