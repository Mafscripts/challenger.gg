import React from "react";
import { Users } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import "@/styles/xp-match-controls.css";

export default function XPTeamSelect({ teams = [], value, onValueChange, disabled = false, loading = false, required = true, compact = false, className = "", id }) {
  const selected = teams.find((team) => team.id === value);
  return <Select value={selected ? value : ""} onValueChange={onValueChange} required={required} disabled={disabled || loading || !teams.length}>
    <SelectTrigger id={id} aria-label="Select XP team" className={`xp-team-select-trigger ${className}`} data-compact={compact || undefined}>
      <Users size={17} aria-hidden="true" />
      <SelectValue placeholder={loading ? "Loading XP teams…" : !teams.length ? "No XP teams available" : "Select XP team"}>{selected?.name}</SelectValue>
      {selected && <small>{selected.members.length} {selected.members.length === 1 ? "player" : "players"}</small>}
    </SelectTrigger>
    <SelectContent className="xp-team-select-menu" position="popper" sideOffset={5}>
      {teams.map((team) => <SelectItem key={team.id} value={team.id} textValue={team.name} className="xp-team-select-option"><span><strong>{team.name}</strong><small>{team.members.length}-player XP team</small></span></SelectItem>)}
    </SelectContent>
  </Select>;
}
