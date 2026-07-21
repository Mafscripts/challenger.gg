import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Clock3, Crown, GitBranch, Trophy, Zap } from "lucide-react";

const bracketOrder = { winner: 1, loser: 2, grand_final: 3 };
const normalizedBracket = (match) => match?.bracket || "winner";
const isCompleteMatch = (match) => Boolean(match?.winner_id && (match?.completed || match?.status === "completed"));
const cleanStatus = (value) => String(value || "pending").replace(/_/g, " ");

function statusStyle(match, isCurrent) {
  if (isCurrent) return "border-green/35 bg-green/[0.07] shadow-[0_0_0_1px_rgba(0,255,128,.08),0_18px_45px_-30px_rgba(0,255,128,.55)]";
  if (isCompleteMatch(match)) return "border-white/[0.07] bg-background/55";
  if (["ready", "in_progress"].includes(match.status)) return "border-cyan/25 bg-cyan/[0.045] shadow-[0_18px_45px_-34px_rgba(20,216,255,.55)]";
  if (["disputed", "score_conflict"].includes(match.status)) return "border-orange/30 bg-orange/[0.045]";
  return "border-white/[0.06] bg-background/40";
}

function stageName(group, maxWinnerRound, isDoubleElimination) {
  if (group.bracket === "grand_final") return group.round > 1 ? "Grand Final Reset" : "Grand Final";
  if (group.bracket === "loser") return `Lower Bracket · Round ${group.round}`;
  const matches = group.matches.length;
  if (matches >= 8) return "Round of 16";
  if (matches === 4) return "Quarterfinals";
  if (matches === 2) return "Semifinals";
  if (matches === 1 && group.round === maxWinnerRound) return isDoubleElimination ? "Winners Final" : "Final";
  return `Winner Bracket · Round ${group.round}`;
}

function sourceForSlot(match, slot, matches) {
  const explicitId = match?.[`team_${slot}_source_match_id`];
  if (explicitId) {
    const explicit = matches.find((row) => String(row.id) === String(explicitId));
    if (explicit) return explicit;
  }

  const slotName = `team_${slot}`;
  const linkedMatches = matches
    .filter((row) => String(row.next_match_id || "") === String(match.id || ""))
    .sort((a, b) => Number(a.match_number || 0) - Number(b.match_number || 0));
  const explicitlyLinked = linkedMatches.find((row) => row.slot_in_next === slotName);
  if (explicitlyLinked) return explicitlyLinked;
  if (linkedMatches.length > 0) return linkedMatches[slot === "a" ? 0 : 1] || null;

  const routed = matches.find((row) => (
    Number(row.next_match_round || 0) === Number(match.round || 0)
    && Number(row.next_match_number || 0) === Number(match.match_number || 0)
    && row.slot_in_next === slotName
  ));
  if (routed) return routed;

  if (normalizedBracket(match) === "winner" && Number(match.round || 0) > 1) {
    const expectedNumber = ((Number(match.match_number || 1) - 1) * 2) + (slot === "a" ? 1 : 2);
    return matches.find((row) => (
      normalizedBracket(row) === "winner"
      && Number(row.round || 0) === Number(match.round || 0) - 1
      && Number(row.match_number || 0) === expectedNumber
    )) || null;
  }
  return null;
}

function targetForMatch(match, matches, outcome = "winner") {
  const loserRoute = outcome === "loser";
  const targetId = loserRoute ? match.loser_match_id : match.next_match_id;
  const targetRound = loserRoute ? match.loser_match_round : match.next_match_round;
  const targetNumber = loserRoute ? match.loser_match_number : match.next_match_number;
  const targetBracket = loserRoute ? match.loser_match_bracket : match.next_match_bracket;
  if (targetId) {
    const target = matches.find((row) => String(row.id) === String(targetId));
    if (target) return target;
  }
  if (targetRound && targetNumber) {
    return matches.find((row) => (
      Number(row.round || 0) === Number(targetRound)
      && Number(row.match_number || 0) === Number(targetNumber)
      && (!targetBracket || normalizedBracket(row) === targetBracket)
    )) || null;
  }
  return null;
}

function compactStageName(match) {
  if (!match) return "next stage";
  if (normalizedBracket(match) === "grand_final") return Number(match.round || 1) > 1 ? "Grand Final Reset" : "Grand Final";
  if (normalizedBracket(match) === "loser") return `Lower R${match.round || 1}`;
  return `Winners R${match.round || 1}`;
}

function sourceMatchup(source) {
  if (!source) return "Waiting for bracket result";
  const teamA = source.team_a_name ? `#${source.team_a_seed || "-"} ${source.team_a_name}` : "TBD";
  const teamB = source.team_b_name ? `#${source.team_b_seed || "-"} ${source.team_b_name}` : "TBD";
  return `${teamA} vs ${teamB}`;
}

function startWindowLabel(match, now) {
  if (isCompleteMatch(match)) return null;
  const deadline = new Date(match?.start_deadline || "").getTime();
  if (!Number.isFinite(deadline)) return null;
  const seconds = Math.max(0, Math.ceil((deadline - now) / 1000));
  if (seconds === 0) return { expired: true, label: "Admin support available" };
  return {
    expired: false,
    label: `Starts in ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`,
  };
}

function TeamSlot({ match, slot, source }) {
  const isA = slot === "a";
  const teamId = isA ? match.team_a_id : match.team_b_id;
  const teamName = isA ? match.team_a_name : match.team_b_name;
  const seed = isA ? match.team_a_seed : match.team_b_seed;
  const score = Number(isA ? match.team_a_score : match.team_b_score) || 0;
  const completed = isCompleteMatch(match);
  const won = completed && (
    String(match.winner_id || "") === String(teamId || "")
    || (!match.winner_id && score > Number(isA ? match.team_b_score : match.team_a_score || 0))
  );
  const sourceResolved = source && isCompleteMatch(source);
  const sourceOutcome = match?.[`team_${slot}_source_outcome`] === "loser" ? "Loser" : "Winner";
  const sourceText = source
    ? `${sourceResolved ? sourceOutcome : `${sourceOutcome} of`} ${compactStageName(source)} · M${source.match_number}`
    : "Open bracket slot";

  return (
    <div className={`rounded-xl border px-3 py-2.5 ${
      won
        ? "border-green/25 bg-green/10"
        : completed
          ? "border-red-400/10 bg-red-500/[0.035]"
          : teamId
            ? "border-white/[0.07] bg-white/[0.025]"
            : "border-dashed border-cyan/15 bg-cyan/[0.025]"
    }`}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className={`truncate text-xs font-black ${won ? "text-green" : teamId ? "text-white" : "text-cyan/85"}`}>
            {teamId ? `#${seed || "-"} ${teamName}` : sourceText}
          </p>
          {source && (
            <p className="mt-1 truncate text-[9px] font-bold uppercase tracking-wide text-vapor">
              {teamId ? sourceText : sourceMatchup(source)}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {completed && <span className={`text-[8px] font-black uppercase tracking-wider ${won ? "text-green" : "text-red-300"}`}>{won ? "Win" : "Loss"}</span>}
          <span className={`min-w-7 rounded-md px-2 py-1 text-center font-mono text-xs font-black ${won ? "bg-green/15 text-green" : "bg-black/25 text-vapor"}`}>
            {completed ? score : "—"}
          </span>
        </div>
      </div>
    </div>
  );
}

function MatchCard({ match, matches, currentId, now, groupNames }) {
  const current = String(match.id) === String(currentId || "");
  const completed = isCompleteMatch(match);
  const sourceA = sourceForSlot(match, "a", matches);
  const sourceB = sourceForSlot(match, "b", matches);
  const target = targetForMatch(match, matches, "winner");
  const loserTarget = targetForMatch(match, matches, "loser");
  const timer = startWindowLabel(match, now);
  const targetGroupKey = target ? `${normalizedBracket(target)}-${target.round || 1}` : null;
  const targetStage = targetGroupKey ? groupNames[targetGroupKey] : null;

  return (
    <Link
      to={`/tournament-match/${match.id}`}
      className={`group relative block rounded-2xl border p-3 transition-[border-color,background-color,box-shadow] duration-150 hover:border-cyan/35 hover:bg-cyan/[0.055] ${statusStyle(match, current)}`}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white">Match {match.match_number || "-"}</p>
            {current && <span className="rounded bg-green/15 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider text-green">You are here</span>}
          </div>
          {timer && (
            <p className={`mt-1 flex items-center gap-1 text-[9px] font-black uppercase tracking-wide ${timer.expired ? "text-orange" : "text-cyan"}`}>
              <Clock3 className="h-3 w-3" /> {timer.label}
            </p>
          )}
        </div>
        <span className={`rounded-lg border px-2 py-1 text-[8px] font-black uppercase tracking-wider ${
          completed
            ? "border-green/20 bg-green/10 text-green"
            : ["ready", "in_progress"].includes(match.status)
              ? "border-cyan/20 bg-cyan/10 text-cyan"
              : "border-white/[0.06] bg-white/[0.03] text-vapor"
        }`}>
          {cleanStatus(match.status)}
        </span>
      </div>

      <div className="space-y-2">
        <TeamSlot match={match} slot="a" source={sourceA} />
        <TeamSlot match={match} slot="b" source={sourceB} />
      </div>

      <div className={`mt-3 flex items-center justify-between gap-3 rounded-lg border px-2.5 py-2 text-[9px] font-black uppercase tracking-wide ${
        target ? "border-cyan/10 bg-cyan/[0.035] text-cyan" : "border-yellow-400/10 bg-yellow-400/[0.04] text-yellow-300"
      }`}>
        <span className="min-w-0 truncate">
          {target ? `Winner → ${targetStage || "Next round"} · M${target.match_number}` : "Winner → Tournament champion"}
        </span>
        {target ? <ArrowRight className="h-3.5 w-3.5 shrink-0 transition-transform duration-150 group-hover:translate-x-0.5" /> : <Crown className="h-3.5 w-3.5 shrink-0" />}
      </div>
      {loserTarget && (
        <div className="mt-2 flex items-center justify-between gap-3 rounded-lg border border-orange/15 bg-orange/[0.045] px-2.5 py-2 text-[9px] font-black uppercase tracking-wide text-orange">
          <span className="min-w-0 truncate">Loser → {compactStageName(loserTarget)} · M{loserTarget.match_number}</span>
          <ArrowRight className="h-3.5 w-3.5 shrink-0 transition-transform duration-150 group-hover:translate-x-0.5" />
        </div>
      )}
    </Link>
  );
}

export default function TournamentBracket({ matches = [], currentId = null, tournament = null, now = Date.now(), showHeader = true }) {
  const groups = useMemo(() => {
    const grouped = matches
      .slice()
      .sort((a, b) => (
        (bracketOrder[normalizedBracket(a)] || 9) - (bracketOrder[normalizedBracket(b)] || 9)
        || Number(a.round || 0) - Number(b.round || 0)
        || Number(a.match_number || 0) - Number(b.match_number || 0)
      ))
      .reduce((result, match) => {
        const key = `${normalizedBracket(match)}-${match.round || 1}`;
        if (!result[key]) result[key] = { key, bracket: normalizedBracket(match), round: Number(match.round || 1), matches: [] };
        result[key].matches.push(match);
        return result;
      }, {});
    return Object.values(grouped);
  }, [matches]);

  if (matches.length === 0) return null;

  const isDoubleElimination = (tournament?.bracket_type || tournament?.format) === "double_elimination"
    || groups.some((group) => group.bracket === "loser");
  const maxWinnerRound = Math.max(1, ...groups.filter((group) => group.bracket === "winner").map((group) => group.round));
  const groupNames = Object.fromEntries(groups.map((group) => [group.key, stageName(group, maxWinnerRound, isDoubleElimination)]));
  const champion = tournament?.winner_name || matches.find((match) => (
    isCompleteMatch(match)
    && match.winner_name
    && !match.next_match_id
    && !match.next_match_round
  ))?.winner_name;

  const lanes = isDoubleElimination
    ? [
        { key: "winner", label: "Winners Bracket", accent: "text-cyan", groups: groups.filter((group) => group.bracket === "winner") },
        { key: "loser", label: "Lower Bracket", accent: "text-orange", groups: groups.filter((group) => group.bracket === "loser") },
        { key: "grand_final", label: "Championship", accent: "text-green", groups: groups.filter((group) => group.bracket === "grand_final") },
      ].filter((lane) => lane.groups.length > 0)
    : [{ key: "winner", label: "Bracket", accent: "text-cyan", groups }];

  return (
    <section className={showHeader ? "rounded-2xl border border-white/[0.07] bg-card/80 p-4 sm:p-5" : ""}>
      {showHeader && (
        <div className="mb-5 flex flex-col gap-4 border-b border-white/[0.06] pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange/10 text-orange"><Trophy className="h-4 w-4" /></span>
              <div><p className="text-[9px] font-black uppercase tracking-[0.2em] text-orange">Tournament flow</p><h2 className="text-lg font-black">Bracket path</h2></div>
            </div>
            <p className="mt-2 text-xs text-vapor">
              {isDoubleElimination
                ? "A first loss drops a team into the Lower Bracket. A second loss eliminates them. Every source and destination is shown on the match cards."
                : "Follow each winner from left to right. Empty slots show exactly which match feeds into them."}
            </p>
          </div>
          {champion ? (
            <div className="inline-flex items-center gap-2 rounded-xl border border-green/20 bg-green/10 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-green"><Crown className="h-4 w-4" /> Champion: {champion}</div>
          ) : (
            <div className="flex flex-wrap gap-2 text-[9px] font-black uppercase tracking-wider">
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-cyan/15 bg-cyan/[0.05] px-2.5 py-1.5 text-cyan"><GitBranch className="h-3 w-3" /> Win advances right</span>
              {isDoubleElimination && <span className="inline-flex items-center gap-1.5 rounded-lg border border-orange/15 bg-orange/[0.05] px-2.5 py-1.5 text-orange"><GitBranch className="h-3 w-3" /> Loss drops to lower</span>}
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.07] bg-white/[0.03] px-2.5 py-1.5 text-vapor"><Zap className="h-3 w-3" /> # is tournament seed</span>
            </div>
          )}
        </div>
      )}

      <div className="space-y-7">
        {lanes.map((lane) => {
          const laneMaxMatches = Math.max(1, ...lane.groups.map((group) => group.matches.length));
          return (
          <section key={lane.key} className={`rounded-2xl border p-4 ${lane.key === "loser" ? "border-orange/15 bg-orange/[0.025]" : lane.key === "grand_final" ? "border-green/15 bg-green/[0.025]" : "border-cyan/15 bg-cyan/[0.02]"}`}>
            {isDoubleElimination && (
              <div className="mb-4 flex items-center gap-2 border-b border-white/[0.06] pb-3">
                <GitBranch className={`h-4 w-4 ${lane.accent}`} />
                <h3 className={`text-xs font-black uppercase tracking-[0.18em] ${lane.accent}`}>{lane.label}</h3>
              </div>
            )}
            <div className="overflow-x-auto pb-3 [scrollbar-color:rgba(20,216,255,.25)_transparent]">
              <div className="grid min-w-max gap-8 pr-3" style={{ gridTemplateColumns: `repeat(${lane.groups.length}, minmax(292px, 318px))` }}>
          {lane.groups.map((group, groupIndex) => {
            const completedCount = group.matches.filter(isCompleteMatch).length;
            return (
              <div key={group.key} className="relative flex min-w-0 flex-col">
                {groupIndex < lane.groups.length - 1 && (
                  <span className="pointer-events-none absolute -right-6 top-5 hidden h-8 w-4 items-center justify-center rounded-full border border-cyan/15 bg-card text-cyan xl:flex"><ArrowRight className="h-3 w-3" /></span>
                )}
                <div className="mb-3 flex items-end justify-between gap-3 border-b border-white/[0.06] px-1 pb-3">
                  <div><p className="text-[9px] font-black uppercase tracking-[0.18em] text-cyan">Round {groupIndex + 1}</p><h3 className="mt-1 text-sm font-black text-white">{groupNames[group.key]}</h3></div>
                  <p className="text-[9px] font-bold uppercase text-vapor">{completedCount}/{group.matches.length} complete</p>
                </div>
                <div className="flex flex-1 flex-col justify-around gap-4" style={{ minHeight: `${Math.max(190, laneMaxMatches * 180)}px` }}>
                  {group.matches.map((match) => (
                    <MatchCard key={match.id} match={match} matches={matches} currentId={currentId} now={now} groupNames={groupNames} />
                  ))}
                </div>
              </div>
            );
          })}
              </div>
            </div>
          </section>
          );
        })}
        </div>
    </section>
  );
}
