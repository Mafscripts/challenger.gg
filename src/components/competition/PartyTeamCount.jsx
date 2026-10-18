import React, { useEffect, useId, useState } from "react";
import { Check } from "lucide-react";
import { PARTY_MAX_TEAMS } from "@/lib/partyWheel";

export default function PartyTeamCount({ room, disabled, act }) {
  const id = useId();
  const [count, setCount] = useState(String(room.teams.length));
  useEffect(() => setCount(String(room.teams.length)), [room.teams.length]);
  const value = Number(count), valid = Number.isInteger(value) && value >= 1 && value <= PARTY_MAX_TEAMS;
  return <form className="party-team-count-form" onSubmit={async (event) => {
    event.preventDefault();
    if (!disabled && valid && value !== room.teams.length) await act("set_team_count", { team_count: value });
  }}>
    <label className="party-label" htmlFor={id}>Number of teams</label>
    <div className="party-team-count-input"><input id={id} name="team_count" className="party-field" type="number" inputMode="numeric" min={1} max={PARTY_MAX_TEAMS} step={1} required value={count} disabled={disabled} onChange={(event) => setCount(event.target.value)} aria-describedby={`${id}-help`} /><button type="submit" className="party-button party-primary" disabled={disabled || !valid || value === room.teams.length}><Check />Apply</button></div>
    <p id={`${id}-help`} className="party-muted">1–{PARTY_MAX_TEAMS} teams · {valid ? value * room.team_size : "—"} player slots</p>
  </form>;
}
