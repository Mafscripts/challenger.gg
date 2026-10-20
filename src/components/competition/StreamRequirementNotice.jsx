import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Radio } from "lucide-react";
import { competitionStreamRequiredMessage, hasCompetitionStream } from "@/lib/competitionStreaming";

export default function StreamRequirementNotice({ user, className = "" }) {
  if (!user) return null;
  const ready = hasCompetitionStream(user);
  return <div className={`rounded-xl border border-cyan/20 bg-cyan/[0.055] p-4 ${className}`}>
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cyan/10 text-cyan"><Radio className="h-4 w-4" /></span>
        <div><p className="text-sm font-black">Streaming required</p><p className="mt-1 text-xs leading-relaxed text-vapor">{competitionStreamRequiredMessage}</p></div>
      </div>
      <Link to={ready ? "/rules" : "/settings#streaming"} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-cyan/25 bg-cyan/10 px-4 py-2.5 text-xs font-bold text-cyan transition-colors hover:bg-cyan/15">{ready ? "Stream rules" : "Add stream channel"} <ArrowRight className="h-3.5 w-3.5" /></Link>
    </div>
  </div>;
}
