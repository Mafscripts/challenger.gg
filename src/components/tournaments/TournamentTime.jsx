import React from "react";
import { Clock3 } from "lucide-react";
import useTournamentTimeZone from "@/hooks/useTournamentTimeZone";
import { formatTournamentTime, tournamentTimeParts, TOURNAMENT_TIME_ZONES } from "@/lib/tournamentTime";
import "@/styles/tournament-time.css";

export function TournamentDateTime({ value, full = false, className = "" }) {
  const { timeZone } = useTournamentTimeZone();
  const parts = tournamentTimeParts(value, { timeZone });
  return parts.valid ? <time className={className} dateTime={parts.iso} data-tournament-time data-timezone={parts.zoneName} title={parts.zoneName}>{formatTournamentTime(value, { timeZone, full })}</time> : <span className={className}>To be announced</span>;
}

export function TournamentTimeZonePicker({ className = "" }) {
  const { selection, setSelection, automaticZone } = useTournamentTimeZone();
  const groups = new Map();
  for (const zone of TOURNAMENT_TIME_ZONES) {
    if (["local", "UTC"].includes(zone.value)) continue;
    const area = zone.value.split("/")[0];
    if (!groups.has(area)) groups.set(area, []);
    groups.get(area).push(zone);
  }
  const extra = selection !== "local" && !TOURNAMENT_TIME_ZONES.some(zone => zone.value === selection);
  return <label className={`tournament-timezone-picker ${className}`}><Clock3 size={15} aria-hidden="true" /><span>Time zone</span><select aria-label="Tournament time zone" value={selection} onChange={event => setSelection(event.target.value)}><option value="local">Automatic · {automaticZone.replaceAll("_", " ")}</option><option value="UTC">UTC</option>{extra && <option value={selection}>{selection.replaceAll("_", " ")}</option>}{[...groups].map(([area, zones]) => <optgroup key={area} label={area}>{zones.map(zone => <option key={zone.value} value={zone.value}>{zone.label}</option>)}</optgroup>)}</select></label>;
}
