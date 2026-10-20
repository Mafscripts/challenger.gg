import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Twitch } from "lucide-react";
import { competitionTwitchRequiredMessage, hasCompetitionTwitch } from "@/lib/competitionTwitch";

export default function TwitchRequirementNotice({ user, className = "" }) {
  if (!user || hasCompetitionTwitch(user)) return null;
  return <div className={`rounded-xl border border-cyan/20 bg-cyan/[0.055] p-4 ${className}`}>
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cyan/10 text-cyan"><Twitch className="h-4 w-4" /></span>
        <div><p className="text-sm font-black">Twitch connection required</p><p className="mt-1 text-xs leading-relaxed text-vapor">{competitionTwitchRequiredMessage}</p></div>
      </div>
      <Link to="/settings#twitch" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-cyan/25 bg-cyan/10 px-4 py-2.5 text-xs font-bold text-cyan transition-colors hover:bg-cyan/15">Connect Twitch <ArrowRight className="h-3.5 w-3.5" /></Link>
    </div>
  </div>;
}
