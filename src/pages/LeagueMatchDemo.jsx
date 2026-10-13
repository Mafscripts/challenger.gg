import React, { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Check, Clock3, FlaskConical, LockKeyhole, Map as MapIcon, MessageSquare, ShieldCheck, Swords, Trophy, Users } from "lucide-react";
import MatchRoomShell from "@/components/match/MatchRoomShell";
import MatchTeamTable from "@/components/match/MatchTeamTable";
import { LEAGUE_DIVISIONS, leagueDivisionUrl } from "@/lib/topfraggLeague";
import { LEAGUE_DEMO_MATCHES, leagueDemoTeam, leagueDemoSchedule } from "@/lib/leagueDemo";
import { LeagueDemoLabel, LeagueDemoNotice } from "@/components/league/LeagueDemo";
import LeagueTeamLogo from "@/components/league/LeagueTeamLogo";
import "@/styles/league.css";

// Only names and display statistics: fictional players have no profile links or account IDs.
const matchPlayers = (team, selectedNames) => selectedNames.map((name, index) => ({
  name,
  role: index === 0 ? "captain" : "member",
  activision_id: `${name}#${1000001 + team.players.findIndex((player) => player.name === name)}`,
  wins: team.wins,
  losses: team.losses,
  earnings: 0,
  trophies: { gold: index === 0 ? 1 : 0, silver: 0, bronze: 0, premium: 0 },
}));

function DemoLineupPicker({ team, selected, onConfirm, disabled }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(selected);
  const open = () => { setDraft([...selected]); setEditing(true); };
  const toggle = (name) => {
    setDraft((current) => current.includes(name) ? current.filter((value) => value !== name) : current.length < 4 ? [...current, name] : current);
  };
  return <section className="league-demo-lineup-picker" aria-label={`Choose ${team.name} match lineup`}>
    <div className="league-demo-lineup-heading">
      <div><p>Manager: <strong>{team.manager}</strong></p><small>Choose any four team members for this match · Demo only</small></div>
      <button type="button" disabled={disabled} aria-expanded={editing && !disabled} onClick={() => editing ? setEditing(false) : open()} className="league-button"><Users className="h-3.5 w-3.5" />{editing && !disabled ? "Close selection" : "Choose match lineup"}</button>
    </div>
    {editing && !disabled && <div className="league-demo-lineup-options">
      <fieldset><legend>Selected: {draft.length}/4 players</legend>
        <div>{team.players.map((player) => <label key={player.name}><input type="checkbox" checked={draft.includes(player.name)} disabled={!draft.includes(player.name) && draft.length === 4} onChange={() => toggle(player.name)} /><span>{player.name}</span></label>)}</div>
      </fieldset>
      <div className="league-demo-lineup-actions"><p>Uncheck a player to choose someone else. Only the selected four appear in the match room.</p><button type="button" className="league-button league-button-primary" disabled={draft.length !== 4} onClick={() => { onConfirm([...draft]); setEditing(false); }}><Check className="h-3.5 w-3.5" />Confirm four players</button></div>
    </div>}
  </section>;
}

export default function LeagueMatchDemo() {
  const { divisionId, matchId } = useParams();
  const division = LEAGUE_DIVISIONS.find((row) => row.id === divisionId);
  const match = LEAGUE_DEMO_MATCHES.find((row) => row.id === matchId);
  if (!division || !match) return <div className="topfragg-league"><div className="league-container"><section className="league-panel league-empty"><h1>Demo match not found</h1><Link to="/league" className="league-button">Back to Topfragg League</Link></section></div></div>;
  return <LeagueMatchDemoView key={`${division.id}:${match.id}`} division={division} match={match} />;
}

function LeagueMatchDemoView({ division, match }) {
  const [showResult, setShowResult] = useState(match.status === "completed");
  const teamA = leagueDemoTeam(match.teamA);
  const teamB = leagueDemoTeam(match.teamB);
  const [selectedA, setSelectedA] = useState(() => teamA.players.slice(0, 4).map((player) => player.name));
  const [selectedB, setSelectedB] = useState(() => teamB.players.slice(0, 4).map((player) => player.name));
  const scoreA = match.scoreA ?? 2;
  const scoreB = match.scoreB ?? 1;
  const winner = scoreA > scoreB ? teamA : teamB;
  const schedule = leagueDemoSchedule(match);
  const maps = [
    { name: "Sample map A", mode: "Hardpoint", host: teamA.name, score: "250 – 183", winner: teamA.name },
    { name: "Sample map B", mode: "Search & Destroy", host: teamB.name, score: "4 – 6", winner: teamB.name },
    { name: "Sample map C", mode: "Hardpoint", host: "Agreed by teams", score: "250 – 221", winner: teamA.name },
  ];
  return <div className="topfragg-league match-room-theme league-demo-match-room"><div className="league-container">
    <div className="league-topline"><Link to={`${leagueDivisionUrl(division)}?view=matches`} className="league-back"><ArrowLeft className="h-4 w-4" />{division.name} matches</Link><LeagueDemoLabel /></div>
    <LeagueDemoNotice />
    <MatchRoomShell className="tournament-room-shell league-demo-match-shell" header={<>
      <div className="league-demo-room-header">
        <div><p className="league-eyebrow">Topfragg League · {division.name} · Demo match room</p><h1>{teamA.name}<span>vs</span>{teamB.name}</h1><p>Example BO3 · {match.round} · Modern Warfare <span className="text-yellow-300">4</span></p></div>
        <div className="league-demo-room-view"><span className="league-small-label">Preview match state</span><div><button type="button" aria-pressed={!showResult} onClick={() => setShowResult(false)}><Clock3 className="h-3.5 w-3.5" />Pre-match</button><button type="button" aria-pressed={showResult} onClick={() => setShowResult(true)}><Trophy className="h-3.5 w-3.5" />Result example</button></div></div>
      </div>
      <section className="league-demo-room-score" aria-label="Example match score">
        <div className="text-orange"><LeagueTeamLogo team={teamA} size={44} /><strong>{teamA.name}</strong></div>
        <div className="league-demo-score-center"><span>{showResult ? "Example final score" : "Scheduled · Demo"}</span><strong>{showResult ? `${scoreA} – ${scoreB}` : "VS"}</strong><small>{showResult ? `${winner.name} wins` : <time dateTime={match.scheduledAt}>{schedule.fullDate} · {schedule.time} UTC</time>}</small></div>
        <div className="text-cyan"><LeagueTeamLogo team={teamB} size={44} /><strong>{teamB.name}</strong></div>
      </section>
    </>} teams={<>
      <div className="league-demo-selected-team"><DemoLineupPicker team={teamA} selected={selectedA} onConfirm={setSelectedA} disabled={showResult} />
        <MatchTeamTable label="Team Alpha" name={teamA.name} teamIcon={<LeagueTeamLogo team={teamA} size={42} />} color="orange" compact players={matchPlayers(teamA, selectedA)} isFirstHost isComplete={showResult} isWinner={showResult && winner.id === teamA.id} finalScore={scoreA} />
      </div>
      <div className="flex items-center gap-4 px-2" aria-hidden="true">
        <span className="h-px flex-1 bg-gradient-to-r from-transparent via-orange/55 to-white/15" />
        <span className="flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.09] bg-black/25 text-[8px] font-black uppercase tracking-wider text-vapor">VS</span>
        <span className="h-px flex-1 bg-gradient-to-r from-white/15 via-cyan/55 to-transparent" />
      </div>
      <div className="league-demo-selected-team"><DemoLineupPicker team={teamB} selected={selectedB} onConfirm={setSelectedB} disabled={showResult} />
        <MatchTeamTable label="Team Bravo" name={teamB.name} teamIcon={<LeagueTeamLogo team={teamB} size={42} />} color="cyan" compact players={matchPlayers(teamB, selectedB)} isComplete={showResult} isWinner={showResult && winner.id === teamB.id} finalScore={scoreB} />
      </div>
      <section className="league-panel league-demo-room-maps">
        <div className="league-division-section-heading"><div><h2 className="flex items-center gap-2"><MapIcon className="h-4 w-4 text-cyan" />Example map series</h2><p>Fictional map labels. Final MW4 modes, maps and rules are not set.</p></div><LeagueDemoLabel /></div>
        {maps.map((map, index) => <div className="league-demo-room-map" key={map.name}><span className="league-demo-map-number">0{index + 1}</span><div><strong>{map.name}</strong><small>{map.mode} · Example host: {map.host}</small></div><span className="league-demo-map-result">{showResult ? <><strong>{map.score}</strong><small>{map.winner}</small></> : <small>Awaiting play</small>}</span></div>)}
      </section>
    </>} sidebar={<>
      <section className="match-chat-panel glass league-demo-room-chat">
        <header><h2><MessageSquare className="h-4 w-4 text-cyan" />Match chat</h2><LeagueDemoLabel /></header>
        <div className="league-demo-chat-messages"><p className="league-demo-chat-system">Example conversation · Not live</p><article><strong className="text-orange">{teamA.manager}<small>{teamA.name} manager</small></strong><p>Our selected four are ready. Let's get the lobby set up.</p></article><article><strong>{teamB.manager}<small>{teamB.name} manager</small></strong><p>Ready on our side too. Good luck!</p></article>{showResult && <p className="league-demo-chat-system"><Check className="inline h-3.5 w-3.5 text-green" />Example result confirmed: {winner.name} wins {scoreA}–{scoreB}.</p>}</div>
        <div className="league-demo-chat-input"><LockKeyhole className="h-3.5 w-3.5" /><span>Chat is read-only in this demo.</span></div>
      </section>
      <section className="league-panel league-demo-room-info"><h2>Match details</h2><dl><div><dt>Division</dt><dd>{division.name}</dd></div><div><dt>Fixture</dt><dd>{match.round} · Example</dd></div><div><dt>Example date</dt><dd>{schedule.fullDate}</dd></div><div><dt>Match time</dt><dd>{schedule.time} UTC</dd></div><div><dt>Format</dt><dd>BO3 · Example</dd></div><div><dt>Match lineup</dt><dd>4 chosen players per team</dd></div><div><dt>Access at launch</dt><dd>Assigned teams only</dd></div></dl><p><ShieldCheck className="h-4 w-4 text-cyan" />Managers select who plays each match. The rest of the team roster stays outside the match lineup.</p><button type="button" disabled className="league-button league-button-primary"><LockKeyhole className="h-3.5 w-3.5" />Join match — coming soon</button><button type="button" disabled className="league-button"><Swords className="h-3.5 w-3.5" />Score reporting — demo only</button></section>
    </>} />
    <p className="league-footer-note"><FlaskConical className="inline h-3.5 w-3.5" />Fictional players and example statistics. Lineup selections only change this demo and are not saved to an account or league.</p>
  </div></div>;
}
