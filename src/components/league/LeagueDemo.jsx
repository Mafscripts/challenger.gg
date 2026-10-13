import React, { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ChevronDown, Clock3, FlaskConical, Users } from "lucide-react";
import { LEAGUE_DEMO_TEAMS, LEAGUE_DEMO_MATCHES, leagueDemoTeam, leagueDemoMatchUrl, leagueDemoSchedule } from "@/lib/leagueDemo";
import { leagueDivisionUrl } from "@/lib/topfraggLeague";
import LeagueTeamLogo from "@/components/league/LeagueTeamLogo";

export function LeagueDemoLabel() {
  return <span className="league-demo-label"><FlaskConical className="h-3 w-3" aria-hidden="true" />Demo</span>;
}

export function LeagueDemoNotice() {
  return <div className="league-demo-notice"><FlaskConical className="h-4 w-4 shrink-0" /><p><strong>Explore a sample season.</strong> All teams, players, scores and fixtures below are fictional examples. Dates, rules and formats are illustrative; no real matches or signups are open.</p></div>;
}

export function LeagueDemoTeamIdentity({ team }) {
  return <span className="league-demo-team"><LeagueTeamLogo team={team} /><span>{team.name}</span></span>;
}

export function LeagueDemoStandings() {
  return <table className="league-preview-table league-demo-table league-demo-standings">
    <caption className="sr-only">Fictional example team standings. Not actual league results.</caption>
    <thead><tr><th scope="col">Pos.</th><th scope="col">Team</th><th scope="col">P</th><th scope="col">W</th><th scope="col">L</th><th scope="col" className="league-demo-form">Last 5</th></tr></thead>
    <tbody>{LEAGUE_DEMO_TEAMS.map((team) => <tr key={team.id} className={team.id === "topfragg" ? "league-demo-featured" : ""}><td><span className={`league-demo-position ${team.position <= 3 ? "league-demo-podium" : ""}`}>{team.position}</span></td><td><LeagueDemoTeamIdentity team={team} /></td><td>{team.played}</td><td className="text-green">{team.wins}</td><td className="text-red-400">{team.losses}</td><td className="league-demo-form"><span className="league-demo-form-dots">{team.form.split("").map((result, index) => <span key={index} data-result={result} aria-label={result === "W" ? "Win" : "Loss"}>{result}</span>)}</span></td></tr>)}</tbody>
  </table>;
}

export function LeagueDemoTeams() {
  const [expandedTeam, setExpandedTeam] = useState(null);
  return <div className="league-demo-team-directory">{LEAGUE_DEMO_TEAMS.map((team) => <div key={team.id}>
    <button type="button" className="league-demo-roster-toggle" aria-expanded={expandedTeam === team.id} aria-controls={`demo-roster-${team.id}`} onClick={() => setExpandedTeam(expandedTeam === team.id ? null : team.id)}><LeagueDemoTeamIdentity team={team} /><span className="league-demo-manager"><small>Manager</small>{team.manager}</span><span className="league-demo-roster-count"><Users className="h-3.5 w-3.5" />4 + 2</span><ChevronDown className="h-4 w-4 text-cyan" /></button>
    {expandedTeam === team.id && <div id={`demo-roster-${team.id}`} className="league-demo-expanded-roster">{team.players.map((player) => <div key={player.name}><span>{player.name}</span><small>{player.role}</small></div>)}<p>Fictional roster — these are not website accounts.</p></div>}
  </div>)}</div>;
}

export function LeagueDemoMatches({ division, upcomingOnly = false }) {
  const matches = upcomingOnly ? LEAGUE_DEMO_MATCHES.filter((match) => match.status === "scheduled").slice(0, 3) : LEAGUE_DEMO_MATCHES;
  return <div className="league-demo-fixtures">{matches.map((match) => {
    const a = leagueDemoTeam(match.teamA);
    const b = leagueDemoTeam(match.teamB);
    const schedule = leagueDemoSchedule(match);
    return <Link key={match.id} to={leagueDemoMatchUrl(division, match)} className="league-demo-fixture">
      <time dateTime={match.scheduledAt} className="league-demo-fixture-date" aria-label={`Example fixture: ${schedule.weekday}, ${schedule.fullDate}, ${schedule.time} UTC`}>
        <span className="league-fixture-calendar"><strong>{schedule.day}</strong><span>{schedule.month}</span></span>
        <span className="league-fixture-time-details"><span className="league-fixture-time"><strong>{schedule.time}</strong><span>{schedule.timezone}</span></span><small>{schedule.weekday} · {schedule.year}</small><span className="league-fixture-round">{match.round}<span aria-hidden="true"> · </span><span className={match.status === "completed" ? "text-green" : "text-vapor"}>{match.status === "completed" ? "Completed" : "Scheduled"}</span></span></span>
      </time>
      <span className="league-demo-fixture-teams"><span className="league-demo-fixture-identity"><LeagueTeamLogo team={a} size={28} /><span>{a.name}</span></span><span className="league-demo-fixture-score">{match.status === "completed" ? `${match.scoreA} – ${match.scoreB}` : "vs"}</span><span className="league-demo-fixture-identity"><LeagueTeamLogo team={b} size={28} /><span>{b.name}</span></span></span><span className="league-demo-fixture-action">View demo<ArrowRight className="h-3.5 w-3.5" /></span>
    </Link>;
  })}</div>;
}

export function LeagueDemoUpcoming({ division }) {
  return <section className="league-panel league-demo-upcoming"><div className="league-division-section-heading"><div><h2 className="flex items-center gap-2"><Clock3 className="h-4 w-4 text-cyan" />Upcoming matches</h2><p>Example week 4 · Sample times, not a live schedule</p></div><LeagueDemoLabel /></div><LeagueDemoMatches division={division} upcomingOnly /><Link to={`${leagueDivisionUrl(division)}?view=matches`} className="league-demo-all-matches">All example matches<ArrowRight className="h-3.5 w-3.5" /></Link></section>;
}
