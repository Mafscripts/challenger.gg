import React, { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ChevronRight, Play, Trophy } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { partyMatchLabel } from "@/lib/partyBracket";

const modes = { snd: "Search & Destroy", hardpoint: "Hardpoint", cdl: "CDL mixed modes" };
const teamName = (room, id) => room.teams.find((team) => team.id === id)?.name || "TBD";
const matchUrl = (room, match) => `/coed-switcheroo/${room.id}/match/${match.id}`;
const statusLabel = (match) => ({ ready: "Ready to play", completed: "Completed", bye: "Bye", pending: "Waiting for teams" })[match.status];

export function PartyBracket({ room, manager, disabled, act, onNewRound }) {
  const [format, setFormat] = useState("single_elimination"), [bestOf, setBestOf] = useState("3"), [mode, setMode] = useState("snd");
  const bracket = room.bracket;
  const ready = room.status === "ready" && room.teams.length >= 2 && !disabled;
  return <section id="party-bracket" className="party-panel party-bracket-panel">
    <div className="party-section-heading"><h2><Trophy />{bracket ? "Tournament bracket" : "Start your bracket"}</h2>{bracket && <span className="party-count">{bracket.status === "completed" ? "Completed" : "Live"}</span>}</div>
    {!bracket ? <>
      <p className="party-muted">Draw your teams, choose a format and start. Every match gets its own room with rosters, scores, chat and team voice links.</p>
      {manager ? <form className="party-bracket-setup" onSubmit={(e) => { e.preventDefault(); void act("start_bracket", { format, best_of: Number(bestOf), game_mode: mode }); }}>
        <label className="party-label">Bracket format<Select value={format} onValueChange={setFormat} disabled={disabled}><SelectTrigger className="party-select"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="single_elimination">Single elimination · no losers bracket</SelectItem><SelectItem value="double_elimination">Double elimination · with losers bracket</SelectItem></SelectContent></Select></label>
        <label className="party-label">Game mode<Select value={mode} onValueChange={setMode} disabled={disabled}><SelectTrigger className="party-select"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(modes).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></label>
        <label className="party-label">Series format<Select value={bestOf} onValueChange={setBestOf} disabled={disabled}><SelectTrigger className="party-select"><SelectValue /></SelectTrigger><SelectContent>{[1, 3, 5].map((value) => <SelectItem key={value} value={String(value)}>Best of {value}</SelectItem>)}</SelectContent></Select></label>
        <p className="party-muted">{format === "single_elimination" ? "Lose once and you are out. Winners advance to the final." : "Lose twice and you are out. The Grand Final resets if the losers finalist wins the first series."} Byes advance automatically.</p>
        <button className="party-button party-primary" disabled={!ready}><Play />Start bracket</button>
        {!ready && <span className="party-muted">{room.teams.length < 2 ? "At least 2 teams are needed for a bracket." : "Finish the team draw to start."}</span>}
      </form> : <p className="party-muted">The host can start the bracket once all teams are drawn.</p>}
    </> : <>
      <p className="party-muted">{bracket.format === "single_elimination" ? "Single elimination · no losers bracket" : "Double elimination · with losers bracket"} · {modes[bracket.game_mode]} · Best of {bracket.best_of}</p>
      {bracket.champion_id && <div className="party-champion"><Trophy /><div><span>Champions</span><strong>{teamName(room, bracket.champion_id)}</strong></div>{manager && room.status !== "closed" && <button className="party-button" disabled={disabled} onClick={onNewRound}>Start a new round<ArrowRight /></button>}</div>}
      {["upper", "lower", "final"].map((lane) => {
        const matches = bracket.matches.filter((match) => match.lane === lane);
        if (!matches.length) return null;
        const rounds = [...new Set(matches.map((match) => match.round))];
        return <div className="party-bracket-lane" key={lane}><h3>{lane === "upper" ? bracket.format === "single_elimination" ? "Bracket" : "Winners bracket" : lane === "lower" ? "Losers bracket" : "Grand Final"}</h3><div className="party-bracket-scroll" role="region" aria-label={`${lane} bracket`} tabIndex={0}>{rounds.map((round) => <section className="party-bracket-round" key={round}><h4>{lane === "final" ? round === 2 ? "Final reset" : "Grand Final" : lane === "upper" && round === rounds.at(-1) ? "Final" : `Round ${round}`}</h4><div>{matches.filter((match) => match.round === round).map((match) => <Link key={match.id} className={`party-bracket-match is-${match.status}`} to={matchUrl(room, match)}>
          <header><span>Match {match.number}</span><small>{statusLabel(match)}</small></header>
          {match.teams.map((team, side) => <div key={side} className={team && match.winner_id === team ? "is-winner" : ""}><span>{team ? teamName(room, team) : match.status === "bye" ? "Bye" : match.slots[side]?.outcome === "loser" ? "Loser of previous match" : "Winner of previous match"}</span><b>{match.score?.[side] ?? "—"}</b></div>)}
          <footer>Open matchroom<ChevronRight /></footer>
        </Link>)}</div></section>)}</div></div>;
      })}
    </>}
  </section>;
}

export { default as PartyMatchRoomView } from "./PartyMatchRoom";
