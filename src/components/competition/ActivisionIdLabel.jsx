import React from "react";
import { activisionIdFor } from "@/lib/activision";

export default function ActivisionIdLabel({ user, className = "", showMissing = true }) {
  const activisionId = activisionIdFor(user);
  if (!activisionId && !showMissing) return null;

  return (
    <span className={`inline-flex min-w-0 items-center gap-1.5 text-[10px] font-semibold tracking-wide ${activisionId ? "activision-id" : "text-orange/80"} ${className}`}>
      <span aria-hidden="true" className="shrink-0 text-xs font-black italic leading-none">A</span>
      <span className="max-w-full truncate normal-case">{activisionId || "Not set"}</span>
    </span>
  );
}
