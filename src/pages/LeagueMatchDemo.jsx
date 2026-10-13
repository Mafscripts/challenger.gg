import React, { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Check, Clock3, FlaskConical, LockKeyhole, Map as MapIcon, MessageSquare, ShieldCheck, Swords, Trophy } from "lucide-react";
import { LEAGUE_DIVISIONS, leagueDivisionUrl } from "@/lib/topfraggLeague";
import { LEAGUE_DEMO_MATCHES, leagueDemoTeam } from "@/lib/leagueDemo";
import { LeagueDemoLabel, LeagueDemoNotice } from "@/components/league/LeagueDemo";
import "@/styles/league.css";

function DemoRoster({ team, label, isWinner, completed }) {
  return <section className="league-panel league-demo-room-roster"><header><span className="league-demo-team-tag">{team.tag}</span><div><p className="league-eyebrow">{label}</p><h2>{team.name}{isWinner && <span className="league-demo-winner"><Trophy className="h-3 w-3" />Winner</span>}</h2><p>Manager: {team.manager} · 4 starters + 2 reserves</p></div></header><div className="league-demo-room-players">{team.players.map((player, index) => <div key={player.name} className={index >= 4 ? "league-demo-reserve" : ""}><span className="league-demo-player-avatar">{player.name.slice(0, 1)}</span><span><strong>{player.name}</strong><small>{player.role}</small></span><span className="league-demo-player-state">{index >= 4 ? "Reserve" : completed ? "Played" : "Ready"}</span></div>)}</div><p className="league-demo-roster-note">Example roster · Fictional players</p></section>;
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
  const scoreA = match.scoreA ?? 2;
  const scoreB = match.scoreB ?? 1;
  const winner = scoreA > scoreB ? teamA : teamB;
  const maps = [
    { name: "Sample map A", mode: "Hardpoint", host: teamA.name, score: "250 – 183", winner: teamA.name },
    { name: "Sample map B", mode: "Search & Destroy", host: teamB.name, score: "4 – 6", winner: teamB.name },
    { name: "Sample map C", mode: "Hardpoint", host: "Agreed by teams", score: "250 – 221", winner: teamA.name },
  ];
  return <div className="topfragg-league"><div className="league-container">
    <div className="league-topline"><Link to={`${leagueDivisionUrl(division)}?view=matches`} className="league-back"><ArrowLeft className="h-4 w-4" />{division.name} matches</Link><LeagueDemoLabel /></div>
    <LeagueDemoNotice />
    <header className="league-panel league-demo-room-header"><div><p className="league-eyebrow">Topfragg League · {division.name} · Demo match room</p><h1>{teamA.name}<span>vs</span>{teamB.name}</h1><p>Example BO3 · {match.round} · Modern Warfare <span className="text-yellow-300">4</span></p></div><div className="league-demo-room-view"><span className="league-small-label">Preview match state</span><div><button type="button" aria-pressed={!showResult} onClick={() => setShowResult(false)}><Clock3 className="h-3.5 w-3.5" />Pre-match</button><button type="button" aria-pressed={showResult} onClick={() => setShowResult(true)}><Trophy className="h-3.5 w-3.5" />Result example</button></div></div></header>
    <section className="league-panel league-demo-room-score" aria-label="Example match score"><div><span className="league-demo-team-tag">{teamA.tag}</span><strong>{teamA.name}</strong></div><div className="league-demo-score-center"><span>{showResult ? "Example final score" : "Scheduled · Demo"}</span><strong>{showResult ? `${scoreA} – ${scoreB}` : "VS"}</strong><small>{showResult ? `${winner.name} wins` : `${match.day === "Example result" ? "Example Friday" : match.day} · ${match.time === "Completed" ? "19:00 UTC" : match.time}`}</small></div><div><span className="league-demo-team-tag">{teamB.tag}</span><strong>{teamB.name}</strong></div></section>
    <div className="league-demo-room-layout"><div className="league-main-column">
      <DemoRoster team={teamA} label="Team Alpha" isWinner={showResult && winner.id === teamA.id} completed={showResult} />
      <DemoRoster team={teamB} label="Team Bravo" isWinner={showResult && winner.id === teamB.id} completed={showResult} />
      <section className="league-panel league-demo-room-maps"><div className="league-division-section-heading"><div><h2 className="flex items-center gap-2"><MapIcon className="h-4 w-4 text-cyan" />Example map series</h2><p>Fictional map labels. Final MW4 modes, maps and rules are not set.</p></div><LeagueDemoLabel /></div>{maps.map((map, index) => <div className="league-demo-room-map" key={map.name}><span className="league-demo-map-number">0{index + 1}</span><div><strong>{map.name}</strong><small>{map.mode} · Example host: {map.host}</small></div><span className="league-demo-map-result">{showResult ? <><strong>{map.score}</strong><small>{map.winner}</small></> : <small>Awaiting play</small>}</span></div>)}</section>
    </div><aside className="league-demo-room-sidebar">
      <section className="league-panel league-demo-room-chat"><header><h2><MessageSquare className="h-4 w-4 text-cyan" />Match chat</h2><LeagueDemoLabel /></header><div className="league-demo-chat-messages"><p className="league-demo-chat-system">Example conversation · Not live</p><article><strong>{teamA.manager}<small>{teamA.name} manager</small></strong><p>Our starting four are ready. Let's get the lobby set up.</p></article><article><strong>{teamB.manager}<small>{teamB.name} manager</small></strong><p>Ready on our side too. Good luck!</p></article>{showResult && <p className="league-demo-chat-system"><Check className="inline h-3.5 w-3.5 text-green" />Example result confirmed: {winner.name} wins {scoreA}–{scoreB}.</p>}</div><div className="league-demo-chat-input"><LockKeyhole className="h-3.5 w-3.5" /><span>Chat is read-only in this demo.</span></div></section>
      <section className="league-panel league-demo-room-info"><h2>Match details</h2><dl><div><dt>Division</dt><dd>{division.name}</dd></div><div><dt>Fixture</dt><dd>{match.round} · Example</dd></div><div><dt>Format</dt><dd>BO3 · Example</dd></div><div><dt>Roster</dt><dd>4 players + 2 reserves</dd></div><div><dt>Access at launch</dt><dd>Assigned teams only</dd></div></dl><p><ShieldCheck className="h-4 w-4 text-cyan" />Players from another division will not be able to join a real match.</p><button type="button" disabled className="league-button league-button-primary"><LockKeyhole className="h-3.5 w-3.5" />Join match — coming soon</button><button type="button" disabled className="league-button"><Swords className="h-3.5 w-3.5" />Score reporting — demo only</button></section>
    </aside></div>
    <p className="league-footer-note"><FlaskConical className="inline h-3.5 w-3.5" />This example does not affect accounts, standings, wallets or league membership.</p>
  </div></div>;
}
