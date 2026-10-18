import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ChevronRight, Headphones, Mars, MessageSquare, Play, Send, Trophy, Users, Venus } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { partyMatchLabel } from "@/lib/partyBracket";

const modes = { snd: "Search & Destroy", hardpoint: "Hardpoint", cdl: "CDL mixed modes" };
const teamName = (room, id) => room.teams.find((team) => team.id === id)?.name || "TBD";
const matchUrl = (room, match) => `/coed-switcheroo/${room.id}/match/${match.id}`;
const statusLabel = (match) => ({ ready: "Ready to play", completed: "Completed", bye: "Bye", pending: "Waiting for teams" })[match.status];

export function PartyBracket({ room, manager, disabled, act, onNewRound }) {
  const [format, setFormat] = useState("single_elimination"), [bestOf, setBestOf] = useState("3"), [mode, setMode] = useState("snd");
  const bracket = room.bracket;
  const ready = room.status === "ready" && !disabled;
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
        {!ready && <span className="party-muted">Finish the team draw to start.</span>}
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

export function PartyMatchRoomView({ room, matchId, user, manager, disabled, act, voice, error, notice }) {
  const match = room.bracket?.matches.find((entry) => entry.id === matchId);
  const [scores, setScores] = useState(["", ""]), [message, setMessage] = useState("");
  const end = useRef(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [match?.messages?.length]);
  if (!match) return <div className="party-page"><Link className="party-back" to={`/coed-switcheroo/${room.id}`}>← Back to bracket</Link><p className="party-error">This matchroom is no longer available. The host may have started a new round.</p></div>;
  const own = room.players.find((player) => player.user_id === user?.id);
  const participant = own?.side && match.teams.includes(own.side);
  const canTalk = manager || participant, canScore = canTalk && match.status === "ready";
  const reports = Object.entries(match.reports || {});
  const target = Math.ceil(room.bracket.best_of / 2);
  const next = room.bracket.matches.filter((entry) => entry.slots.some((slot) => slot?.match_id === match.id) || match.lane === "final" && match.round === 1 && entry.lane === "final" && entry.round === 2);
  return <div className="party-page"><Link className="party-back" to={`/coed-switcheroo/${room.id}`}>← Back to bracket</Link>
    <header className="arena-page-header party-room-heading"><div><p className="party-eyebrow">{room.title} · {partyMatchLabel(match)}</p><h1>{teamName(room, match.teams[0])} <span className="party-match-vs">vs</span> {teamName(room, match.teams[1])}</h1><p>{modes[room.bracket.game_mode]} · Best of {room.bracket.best_of} · {statusLabel(match)}</p></div><span className="party-match-final-score">{match.score ? match.score.join(" – ") : "VS"}</span></header>
    {error && <p className="party-error" role="alert">{error}</p>}{notice && <p className="party-notice" role="status">{notice}</p>}
    {room.status === "closed" && <p className="party-notice">The host closed this room. Scores and chat are read-only.</p>}
    {match.winner_id && <div className="party-champion"><Trophy /><div><span>{room.bracket.champion_id === match.winner_id && room.bracket.status === "completed" ? "Champions" : "Match winner"}</span><strong>{teamName(room, match.winner_id)}</strong></div><Link className="party-button" to={`/coed-switcheroo/${room.id}`}>View bracket<ArrowRight /></Link></div>}
    {next.length > 0 && match.status === "completed" && <nav className="party-next-matches" aria-label="Following matches">{next.map((entry) => <Link className="party-button" key={entry.id} to={matchUrl(room, entry)}>{partyMatchLabel(entry)}<ArrowRight /></Link>)}</nav>}
    <div className="party-match-layout"><div>
      <div className="party-match-teams">{match.teams.map((id, side) => <section className="party-panel party-team-card" key={side}><header><h3>{teamName(room, id)}</h3><Users /></header><ol className="party-team-slots">{room.players.filter((player) => id && player.side === id).map((player, index) => <li className="is-filled" key={player.id}><span>{index + 1}</span>{player.gender === "male" ? <Mars className="party-male-icon" /> : player.gender === "female" ? <Venus className="party-female-icon" /> : null}<strong>{player.name}</strong>{player.duo_id && <small className="party-duo-tag">Duo</small>}</li>)}</ol>{!id && <p className="party-empty">Waiting for the previous match.</p>}{voice?.team_urls?.[id] && <a className="party-team-voice" href={voice.team_urls[id]} target="_blank" rel="noopener noreferrer"><Headphones />Team voice<ArrowRight /></a>}</section>)}</div>
      <section className="party-panel party-score-panel"><h2>Match result</h2>
        <p className="party-muted">{match.status === "bye" ? "This team advances automatically with a bye." : match.status === "pending" ? "Both teams must qualify before a score can be entered." : `First to ${target} map ${target === 1 ? "win" : "wins"}. ${manager ? "Confirm the final score to advance the bracket." : "Both teams report the same score to advance. The host can resolve a disagreement."}`}</p>
        {reports.length > 0 && <div className="party-score-reports">{reports.map(([id, report]) => <p key={id}><span>{teamName(room, id)} reported</span><strong>{report.scores.join(" – ")}</strong>{manager && match.status === "ready" && <button className="party-claim" disabled={disabled} onClick={() => setScores(report.scores.map(String))}>Use score</button>}</p>)}{reports.length === 2 && reports[0][1].scores.some((score, i) => score !== reports[1][1].scores[i]) && <p className="party-validation">Scores disagree. Ask the host or an admin to confirm the correct result.</p>}</div>}
        {canScore && <form onSubmit={async (e) => { e.preventDefault(); if (scores.some((value) => value === "")) return; await act(manager ? "match_score" : "report_score", { match_id: match.id, scores: scores.map(Number) }); }}><div className="party-score-inputs">{match.teams.map((id, side) => <label className="party-label" key={id}>{teamName(room, id)}<input className="party-field" type="number" min={0} max={target} step={1} required value={scores[side]} disabled={disabled} onChange={(e) => setScores((previous) => previous.map((value, index) => index === side ? e.target.value : value))} /></label>)}</div><button className="party-button party-primary" disabled={disabled || scores.some((value) => value === "")}><Trophy />{manager ? "Confirm final score" : "Report score"}</button></form>}
        {!canTalk && <p className="party-muted">Viewing as a spectator. Link your own slot in the lobby to report scores and chat with your opponents.</p>}
        {voice?.waiting_room_url && <a className="party-team-voice" href={voice.waiting_room_url} target="_blank" rel="noopener noreferrer"><Headphones />Waiting Room<ArrowRight /></a>}
      </section>
    </div><section className="party-panel party-match-chat"><h2><MessageSquare />Match chat</h2><div className="party-chat-messages" role="log" aria-label="Match chat">{match.messages.length ? match.messages.map((entry) => <div key={entry.id}><header><strong>{entry.name}</strong><time dateTime={entry.created_at}>{new Date(entry.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time></header><p>{entry.message}</p></div>) : <p className="party-muted">No messages yet. Coordinate this match here.</p>}<div ref={end} /></div>{canTalk && room.status !== "closed" && <form onSubmit={async (e) => { e.preventDefault(); if (await act("match_message", { match_id: match.id, message })) setMessage(""); }}><label className="sr-only" htmlFor="party-match-message">Message</label><textarea id="party-match-message" className="party-field" rows={2} maxLength={1000} value={message} placeholder="Message your opponents…" onChange={(e) => setMessage(e.target.value)} disabled={disabled} /><button className="party-button party-primary" disabled={disabled || !message.trim()} aria-label="Send message"><Send /></button></form>}</section></div>
  </div>;
}
