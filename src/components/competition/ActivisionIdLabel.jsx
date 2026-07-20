import React from "react";
import { Gamepad2 } from "lucide-react";
import { activisionIdFor } from "@/lib/activision";

export default function ActivisionIdLabel({ user, className = "", showMissing = true }) {
  const activisionId = activisionIdFor(user);
  if (!activisionId && !showMissing) return null;

  return (
    <span className={`inline-flex min-w-0 items-center gap-1 text-[10px] font-semibold tracking-wide ${activisionId ? "text-purple-300" : "text-orange/80"} ${className}`}>
      <Gamepad2 className="h-3 w-3 shrink-0" />
      <span className="shrink-0 uppercase">ACTI</span>
      <span className="truncate normal-case">{activisionId || "Not set"}</span>
    </span>
  );
}
