import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, RotateCcw, Trophy } from "lucide-react";
import { confirmedMatchSummary, progressChangeFor, rematchDestination, rematchSettingsFor } from "@/lib/matchSummary";
import PlayerAvatarImage from "@/components/ui/PlayerAvatarImage";

const nameFor = (player) => player.user_name || player.name || player.display_name || player.username || "Player";
const idFor = (player) => player.user_id || player.id;
const finite = (value) => value !== undefined && value !== null && value !== "" && Number.isFinite(Number(value));
const signed = (value) => `${value > 0 ? "+" : ""}${value.toLocaleString()}`;
const modeNames = { xp: "XP Matches", ranked: "Ranked", eights: "Free 8s", money8s: "Money 8s", wagers: "Cash Matches", tournaments: "Tournament", challenge: "Challenge a Team" };

export default function MatchResultSummary({ match, mode, complete, userId, alphaName = "Team Alpha", bravoName = "Team Bravo", alphaPlayers = [], bravoPlayers = [], maps }) {
  if (!complete) return null;
  const result = confirmedMatchSummary(match, mode);
  const me = userId && [...alphaPlayers, ...bravoPlayers].find((player) => idFor(player) === userId);
  const change = progressChangeFor(match, mode, userId);
  const challengeChange = mode === "challenge" && me && Array.isArray(match.xp_changes) && match.xp_changes.find((entry) => (entry.kind === "solo" && entry.subject_id === userId)
    || (entry.kind === "team" && entry.subject_id === me.team_id));
  const personal = change || (challengeChange && finite(challengeChange.delta) && finite(challengeChange.new_xp) && { delta: Number(challengeChange.delta), before: challengeChange.new_xp - challengeChange.delta, after: Number(challengeChange.new_xp), label: challengeChange.kind === "team" ? "Challenge team XP" : "Challenge solo XP" });
  const participant = Boolean(userId && (me || [match.host_id, match.challenger_id].includes(userId)));
  const rematch = rematchSettingsFor(match, mode);
  const sourceMaps = maps || (Array.isArray(match.series_maps) && match.series_maps.length ? match.series_maps : match.final_map_name ? [match.final_map_name] : []);
  const mapList = sourceMaps.filter(Boolean).map((value) => typeof value === "string" ? { name: value } : value);
  const played = result.alpha !== null && result.bravo !== null ? result.alpha + result.bravo : null;
  return <section className="border-b border-cyan/15 bg-cyan/[0.035] p-4 sm:p-5" aria-label="Confirmed match summary">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-cyan"><Trophy className="h-4 w-4" />Match summary · {modeNames[mode]}</h2><span className="text-[10px] font-bold text-vapor">Confirmed result</span></div>
    <div className="mt-4 grid items-center gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
      {["alpha", "score", "bravo"].map((side) => side === "score" ? <div key={side} className="order-first text-center sm:order-none"><strong className="font-mono text-3xl font-black text-white">{result.alpha ?? "—"}<span className="mx-3 text-vapor/50">–</span>{result.bravo ?? "—"}</strong><p className="mt-1 text-[9px] font-bold uppercase tracking-wider text-vapor">Final series score</p></div> : <div key={side} className={`min-w-0 rounded-xl border p-3 ${result.winner === side ? "border-green/25 bg-green/[0.05]" : "border-white/[0.08] bg-black/10"}`}>
        <p className={`text-[9px] font-black uppercase tracking-wider ${result.winner === side ? "text-green" : "text-vapor"}`}>{result.winner === side ? "Winner" : result.winner ? "Runner-up" : side === "alpha" ? "Team Alpha" : "Team Bravo"}</p>
        <h3 className="mt-1 break-words text-sm font-black">{side === "alpha" ? alphaName : bravoName}</h3>
        <div className="mt-2 flex flex-wrap gap-2">{(side === "alpha" ? alphaPlayers : bravoPlayers).map((player, index) => <Link key={idFor(player) || index} to={`/profile/${encodeURIComponent(player.username || idFor(player) || "")}`} className="site-hover inline-flex max-w-full items-center gap-1.5 rounded-md border border-white/[0.07] px-1.5 py-1 text-[10px] text-vapor"><span className="h-5 w-5 shrink-0 overflow-hidden rounded border border-cyan/15"><PlayerAvatarImage user={player} src={player.avatar_url} /></span><span className="truncate">{nameFor(player)}</span></Link>)}</div>
      </div>)}
    </div>
    <div className="mt-3 flex flex-wrap items-center gap-3">{personal && <div className="rounded-lg border border-white/10 bg-black/15 px-3 py-2"><strong className={`font-mono text-sm ${personal.delta >= 0 ? "text-green" : "text-red-400"}`}>{signed(personal.delta)} {personal.label}</strong>{personal.before !== null && personal.after !== null && <span className="ml-3 text-[10px] text-vapor">{personal.before.toLocaleString()} → {personal.after.toLocaleString()}</span>}</div>}{participant && ["xp", "ranked", "eights"].includes(mode) && !personal && <p className="text-[10px] text-vapor">Your progression change was not saved with this historical result.</p>}
      {mode === "tournaments" ? <Link to="/tournaments" className="site-hover ml-auto inline-flex items-center gap-2 rounded-lg border border-cyan/20 px-3 py-2 text-xs font-bold text-cyan">Tournament center<ArrowRight className="h-3.5 w-3.5" /></Link> : participant && <Link to={rematchDestination(mode, match.game_id)} state={{ rematch }} className="site-hover ml-auto inline-flex items-center gap-2 rounded-lg border border-cyan/20 bg-cyan/10 px-3 py-2 text-xs font-bold text-cyan"><RotateCcw className="h-3.5 w-3.5" />Play again · same format</Link>}
    </div>
    {participant && mode !== "tournaments" && <p className="mt-2 text-[10px] text-vapor">Opens a new match setup. Choose your roster and review the entry again; players are not entered automatically.</p>}
    <details className="mt-4 rounded-xl border border-white/[0.07] bg-black/10 p-3"><summary className="cursor-pointer text-xs font-bold text-cyan">Maps & series details{mapList.length ? ` · ${mapList.length} maps in the series` : ""}</summary>
      {!mapList.length ? <p className="mt-3 text-xs text-vapor">Map details were not saved with this match.</p> : <div className="mt-3 space-y-2">{mapList.map((map, index) => {
        const alpha = map.confirmed_score_alpha ?? map.team_a_score ?? map.score?.alpha;
        const bravo = map.confirmed_score_bravo ?? map.team_b_score ?? map.score?.bravo;
        const recorded = finite(alpha) && finite(bravo);
        const unplayed = played !== null && index >= played && !recorded;
        return <div key={index} className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] pt-2 text-xs"><span><strong>{index + 1}. {[map.name, map.map_name, map.map].find((value) => typeof value === "string") || "Map"}</strong><small className="ml-2 text-[10px] text-vapor">{map.mode_name || map.mode || match.game_mode_display}</small></span><span className={recorded ? "font-mono font-bold text-white" : "text-[10px] text-vapor"}>{recorded ? `${alpha} – ${bravo}` : unplayed ? "Not needed for series" : "Map score not recorded"}</span></div>;
      })}<p className="pt-2 text-[10px] leading-5 text-vapor">Scores follow the same left-to-right team order as the series. Only recorded map scores are shown.</p></div>}
    </details>
  </section>;
}
