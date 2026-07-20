import React from "react";
import { Gamepad2, Settings } from "lucide-react";
import { Link } from "react-router-dom";
import { activisionIdRequiredMessage, hasActivisionId } from "@/lib/activision";

export default function ActivisionIdNotice({ user, className = "" }) {
  if (!user || hasActivisionId(user)) return null;

  return (
    <div className={`rounded-2xl border border-orange/20 bg-orange/[0.07] p-4 ${className}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange/10 text-orange">
            <Gamepad2 className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-black text-foreground">Activision ID required</p>
            <p className="mt-1 text-xs leading-relaxed text-vapor">{activisionIdRequiredMessage}</p>
          </div>
        </div>
        <Link
          to="/settings#gaming-ids"
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-orange/25 bg-orange/10 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-orange hover:bg-orange/15"
        >
          <Settings className="h-3.5 w-3.5" />
          Open Settings
        </Link>
      </div>
    </div>
  );
}
