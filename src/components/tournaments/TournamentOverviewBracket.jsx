import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check, ChevronRight, Crown, GitBranch, Maximize2, Minus, MoveHorizontal, Plus, Trophy } from "lucide-react";
import { BRACKET_METRICS, buildTournamentBracketLayout } from "@/lib/tournamentBracketLayout";
import "@/styles/tournament-bracket-overview.css";

const complete = match => Boolean(match.completed || match.status === "completed");
const stateFor = match => match.status === "cancelled" ? "cancelled" : match.bye ? "bye" : complete(match) ? "completed" : ["live", "in_progress"].includes(match.status) ? "live" : ["disputed", "score_conflict"].includes(match.status) ? "disputed" : match.team_a_id && match.team_b_id ? "ready" : "pending";
const labels = { bye: "Auto advance", completed: "Completed", live: "Live", disputed: "Disputed", ready: "Ready", pending: "Awaiting teams", cancelled: "Cancelled" };

function MatchNode({ node, incoming, allNodes, final }) {
  const match = node.match, state = stateFor(match);
  const slotName = slot => {
    const key = `team_${slot}`;
    if (match[`${key}_bye`]) return "Bye";
    if (match[`${key}_id`]) return match[`${key}_name`] || "Team name unavailable";
    const route = incoming.get(`${node.id}:${key}`), source = route && allNodes.get(route.from);
    return source ? `${route.outcome === "loser" ? "Loser" : "Winner"} of match ${source.number}` : "To be decided";
  };
  const Card = match.id ? Link : "article";
  return <Card className="tob-node" data-match-id={node.id} data-state={state} data-final={final || undefined} to={match.id ? `/tournament-match/${encodeURIComponent(match.id)}` : undefined} style={{ left: node.x, top: node.y, width: BRACKET_METRICS.cardWidth, height: BRACKET_METRICS.cardHeight }} aria-label={`${match.id ? "Open match" : "Match"} ${node.number}: ${slotName("a")} versus ${slotName("b")}`}>
    <div className="tob-match-meta"><span>{final && <Trophy size={11} />}Match {node.number}</span><span className="tob-match-status" data-status={state}>{state === "bye" && <Check size={10} />}{labels[state]}</span></div>
    {["a", "b"].map(slot => {
      const teamId = match[`team_${slot}_id`], won = complete(match) && teamId && String(match.winner_id) === String(teamId), seed = match[`team_${slot}_seed`];
      const rawScore = match[`team_${slot}_score`], hasScore = rawScore !== null && rawScore !== undefined && rawScore !== "" && Number.isFinite(Number(rawScore));
      const showScore = !match.bye && hasScore && (complete(match) || ["live", "disputed"].includes(state));
      return <div key={slot} className="tob-team" data-winner={Boolean(won)} data-bye={Boolean(match[`team_${slot}_bye`])}><span className="tob-seed" aria-label={seed ? `Seed ${seed}` : undefined}>{seed || ""}</span><span className="tob-team-name" title={slotName(slot)}>{slotName(slot)}</span>{won && <Check size={13} aria-label="Winner" />}<strong className="tob-score">{showScore ? Number(rawScore) : "—"}</strong></div>;
    })}
  </Card>;
}

export default function TournamentOverviewBracket({ matches = [], tournament = {} }) {
  const layout = useMemo(() => buildTournamentBracketLayout(matches, tournament), [matches, tournament]);
  const [zoom, setZoom] = useState(1), boards = useRef(new Map()), previousZoom = useRef(1);
  const markerPrefix = useId().replace(/:/g, "");
  const allNodes = useMemo(() => new Map(layout.lanes.flatMap(lane => lane.nodes).map(node => [node.id, node])), [layout]);
  const routes = useMemo(() => [...layout.lanes.flatMap(lane => lane.edges), ...(layout.externalRoutes || [])], [layout]);
  const incoming = useMemo(() => new Map(routes.filter(route => route.slot).map(route => [`${route.to}:${route.slot}`, route])), [routes]);
  const lastLane = layout.lanes.find(lane => lane.key === "grand_final") || layout.lanes.find(lane => lane.key === "winner");
  const final = lastLane?.nodes.filter(node => node.column === lastLane.rounds.length - 1).at(-1);
  useEffect(() => {
    const ratio = zoom / previousZoom.current;
    for (const board of boards.current.values()) {
      board.scrollLeft = (board.scrollLeft + board.clientWidth / 2) * ratio - board.clientWidth / 2;
      board.scrollTop = (board.scrollTop + board.clientHeight / 2) * ratio - board.clientHeight / 2;
    }
    previousZoom.current = zoom;
  }, [zoom]);
  const reveal = (lane, node) => {
    const board = boards.current.get(lane.key);
    if (!board || !node) return;
    board.scrollIntoView({ block: "nearest", inline: "nearest" });
    board.scrollTo({ left: (node.x + BRACKET_METRICS.cardWidth / 2) * zoom - board.clientWidth / 2, top: (node.y + BRACKET_METRICS.cardHeight / 2) * zoom - board.clientHeight / 2, behavior: "auto" });
    board.focus({ preventScroll: true });
  };
  const reset = () => { setZoom(1); window.requestAnimationFrame(() => { for (const board of boards.current.values()) board.scrollTo({ left: 0, top: 0 }); }); };
  if (!layout.lanes.length) return <div className="overview-panel tob-empty"><GitBranch size={30} /><h3>Bracket not generated yet</h3><p>The bracket appears here as soon as registration is locked.</p></div>;
  return <section className="tob" aria-label="Tournament bracket">
    <div className="tob-heading"><div><h2><GitBranch size={20} />Tournament bracket</h2><p>Follow the winners from left to right. Select a match to open its room.</p></div><div className="tob-controls" aria-label="Bracket view controls"><button type="button" onClick={() => setZoom(value => Math.max(.6, Math.round((value - .1) * 10) / 10))} disabled={zoom <= .6} aria-label="Zoom out bracket"><Minus size={16} /></button><output aria-label="Bracket zoom">{Math.round(zoom * 100)}%</output><button type="button" onClick={() => setZoom(value => Math.min(1.2, Math.round((value + .1) * 10) / 10))} disabled={zoom >= 1.2} aria-label="Zoom in bracket"><Plus size={16} /></button><button type="button" onClick={reset}><Maximize2 size={14} />Reset view</button>{final && <button type="button" onClick={() => reveal(lastLane, final)}><Trophy size={14} />Go to final</button>}</div></div>
    {layout.champion?.name && <div className="tob-champion"><Crown size={23} /><span>Champion<strong>{layout.champion.name}</strong></span></div>}
    <div className="tob-legend"><span><i data-tone="green" />Winning team</span><span><i data-tone="cyan" />Live match</span><span><Check size={12} />Bye = automatic advancement</span><span><MoveHorizontal size={14} />Scroll to explore</span></div>
    {layout.lanes.map(lane => <section key={lane.key} className="tob-lane" data-lane={lane.key}>
      <header className="tob-lane-heading"><h3>{lane.label}</h3><span>{lane.nodes.length} matches</span></header>
      {lane.key === "loser" && <p className="tob-lane-help">Teams enter after their first loss. A second loss eliminates them.</p>}
      <nav className="tob-round-nav" aria-label={`${lane.label} rounds`}>{lane.rounds.map(round => <button type="button" key={round.key} onClick={() => reveal(lane, lane.nodes.find(node => node.column === round.index))}>{round.label}<ChevronRight size={12} /></button>)}</nav>
      <div className="tob-board" ref={element => { if (element) boards.current.set(lane.key, element); else boards.current.delete(lane.key); }} tabIndex={0} role="region" aria-label={`${lane.label} matches. Scroll to explore.`} style={{ "--board-height": `${Math.min(620, Math.ceil(lane.height * zoom))}px` }}>
        <div className="tob-extent" style={{ width: Math.ceil(lane.width * zoom), height: Math.ceil(lane.height * zoom) }}><div className="tob-canvas" style={{ width: lane.width, height: lane.height, transform: `scale(${zoom})` }}>
          <svg className="tob-connections" width={lane.width} height={lane.height} aria-hidden="true"><defs><marker id={`${markerPrefix}-${lane.key}`} markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto"><path d="M0 0 L5 2.5 L0 5" fill="none" stroke="currentColor" strokeWidth="1" /></marker></defs>{lane.edges.map(edge => <path key={edge.id} className="tob-edge" data-from={edge.from} data-to={edge.to} data-outcome={edge.outcome} d={`M ${edge.x1} ${edge.y1} H ${(edge.x1 + edge.x2) / 2} V ${edge.y2} H ${edge.x2}`} fill="none" markerEnd={`url(#${markerPrefix}-${lane.key})`} />)}</svg>
          {lane.rounds.map(round => <div className="tob-round" data-round={round.round} key={round.key} style={{ left: round.x, width: BRACKET_METRICS.cardWidth }}><h4>{round.label}</h4><small>{lane.nodes.filter(node => node.column === round.index).length} {lane.nodes.filter(node => node.column === round.index).length === 1 ? "match" : "matches"}</small></div>)}
          {lane.nodes.map(node => <MatchNode key={node.id} node={node} incoming={incoming} allNodes={allNodes} final={node.id === final?.id} />)}
        </div></div>
      </div>
    </section>)}
    {!!layout.externalRoutes?.length && <details className="tob-route-notes"><summary><GitBranch size={14} />Bracket progression<ChevronRight size={13} /></summary><div>{layout.externalRoutes.map(route => { const source = allNodes.get(route.from), target = allNodes.get(route.to); return source && target ? <p key={route.id}>{route.outcome === "loser" ? "Loser" : "Winner"} of match {source.number}<ArrowRight size={12} />Match {target.number}</p> : null; })}</div></details>}
  </section>;
}
