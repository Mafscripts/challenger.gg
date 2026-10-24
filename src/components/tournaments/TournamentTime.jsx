import React from "react";
import useTournamentTimeZone from "@/hooks/useTournamentTimeZone";
import { formatTournamentTime, tournamentTimeParts } from "@/lib/tournamentTime";

export function TournamentDateTime({ value, full = false, className = "" }) {
  const { timeZone } = useTournamentTimeZone();
  const parts = tournamentTimeParts(value, { timeZone });
  return parts.valid ? <time className={className} dateTime={parts.iso} data-tournament-time data-timezone={parts.zoneName}>{formatTournamentTime(value, { timeZone, full })}</time> : <span className={className}>To be announced</span>;
}
