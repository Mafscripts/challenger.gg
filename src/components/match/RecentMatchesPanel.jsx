import React, { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, Gamepad2, Swords } from "lucide-react";
import { competitionLabelFor, competitionToneFor, matchDateMs, matchOpponentFor, matchResultFor, matchRewardsFor, matchRouteFor, matchScoreFor } from "@/lib/matchPresentation";

const formatDate = (value) => value ? new Date(value).toLocaleDateString() : "N/A";
function ProfileSectionTitle({ title, count }) {
  return <div className="mb-3 flex flex-wrap items-center gap-3"><span className="h-1.5 w-1.5 bg-orange" /><h2 className="text-sm font-black text-white">{title}</h2><span className="h-px flex-1 bg-white/10" /><span className="text-[10px] font-bold uppercase tracking-wider text-vapor">{count}</span></div>;
}
function EmptyPanel({ icon: Icon, text }) {
  return <div className="flex items-center gap-3 text-sm text-vapor"><Icon className="h-5 w-5 shrink-0 text-cyan" /><p>{text}</p></div>;
}
export default function RecentMatchesPanel({ matches, userId, className = "", expanded = false, loading = false, onViewAll, title, activityLimit = 50 }) {
  const [competition, setCompetition] = useState("All");
  const [page, setPage] = useState(0);
  const categories = ["All", "Challenge a Team", "Free 8s", "Money 8s", "Ranked", "XP Match", "Tournament", "Wager"];
  const filtered = competition === "All" ? matches : matches.filter((match) => competitionLabelFor(match) === competition);
  const pageCount = Math.max(1, Math.ceil(filtered.length / activityLimit));
  const currentPage = Math.min(page, pageCount - 1);
  const visible = expanded ? filtered.slice(currentPage * activityLimit, (currentPage + 1) * activityLimit) : filtered.slice(0, 6);
  const completed = filtered.filter((match) => ["win", "loss"].includes(match.profile_result));
  const recentWins = completed.filter((match) => match.profile_result === "win").length;
  return (
    <section className={className}>
      <ProfileSectionTitle title={title || (expanded ? "Match history" : "Recent matches")} count={loading ? "Loading" : expanded && visible.length ? `${currentPage * activityLimit + 1}–${currentPage * activityLimit + visible.length} of ${filtered.length} recent matches` : `${visible.length} of ${filtered.length} recent matches`} />
      <div className="profile-mode-filters mb-4 flex flex-wrap gap-2" aria-label="Filter matches by competition">
        {categories.map((category) => <button key={category} type="button" aria-pressed={competition === category} onClick={() => { setCompetition(category); setPage(0); }} className="competition-action-pill profile-mode-pill">
          {category === "All" ? "All modes" : category === "XP Match" ? "XP" : category === "Tournament" ? "Tournaments" : category === "Wager" ? "Wagers" : category}
          <span className="profile-mode-count">{category === "All" ? matches.length : matches.filter((match) => competitionLabelFor(match) === category).length}</span>
        </button>)}
      </div>
      {!loading && completed.length > 0 && <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-xs text-vapor"><p>Recent form <span className="ml-2 font-bold text-green">{recentWins}W</span><span className="ml-2 font-bold text-red-300">{completed.length - recentWins}L</span></p><span>Recent activity · up to {activityLimit} shown</span></div>}
      {loading ? (
        <div role="status" className="rounded-xl border border-white/10 bg-card p-5 text-sm text-vapor">Loading matches...</div>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-card p-5"><EmptyPanel icon={Gamepad2} text={competition === "All" ? "No matches found." : "No matches for this mode in your recent activity."} /></div>
      ) : (
        <div className="space-y-2.5">
          {visible.map((match) => {
            const [result, resultColor, resultClass] = matchResultFor(match, userId);
            const competitionLabel = competitionLabelFor(match);
            const score = matchScoreFor(match, userId);
            const rewards = matchRewardsFor(match, userId);
            const opponent = matchOpponentFor(match, userId);
            return (
              <Link
                key={`${competitionLabel}:${match.id}`}
                to={matchRouteFor(match)}
                aria-label={`${competitionLabel}: ${match.game_mode_display || match.game_mode || "Match"}, ${opponent}, ${result}, ${score.text}`}
                className={`profile-match-row group grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-white/10 bg-card px-4 py-4 sm:grid-cols-[40px_minmax(0,1fr)_110px_95px_24px] ${result === "Win" ? "border-l-green" : result === "Loss" ? "border-l-red-400" : "border-l-cyan"} border-l-2`}
              >
                <span className={`grid h-9 w-9 place-items-center rounded-xl border ${resultClass}`}><Swords className={`h-4 w-4 ${resultColor}`} /></span>
                <div className="min-w-0">
                  <div className="flex min-w-0 flex-wrap items-center gap-2"><p className="truncate text-sm font-black text-white transition-colors group-hover:text-cyan">{match.game_mode_display || match.game_mode || "Match"}</p><span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-bold ${competitionToneFor(competitionLabel)}`}>{competitionLabel}</span></div>
                  <p className="mt-1 truncate text-xs font-semibold text-white/80">{opponent}</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-vapor"><time dateTime={new Date(matchDateMs(match)).toISOString()}>{formatDate(match.match_completed_date || match.completed_date || match.created_date)}</time><span className="mx-1.5">·</span>{match.final_map_name || match.map_name || "Map unavailable"}</p>
                  {rewards && <p className="mt-1 text-[11px] font-bold text-cyan">{rewards}</p>}
                </div>
                <div className="text-right sm:text-center"><p className="text-base font-black tabular-nums text-white">{score.text}</p><p className="mt-1 max-w-24 text-[10px] text-vapor sm:max-w-none">{score.label}</p><span className={`mt-2 inline-block rounded-full border px-2 py-0.5 text-[10px] font-black uppercase sm:hidden ${resultClass} ${resultColor}`}>{result}</span></div>
                <span className={`hidden rounded-full border px-3 py-1.5 text-center text-[10px] font-black uppercase sm:block ${resultClass} ${resultColor}`}>{result}</span>
                <ChevronRight aria-hidden="true" className="hidden h-4 w-4 text-cyan sm:block" />
              </Link>
            );
          })}
        </div>
      )}
      {expanded && !loading && pageCount > 1 && <nav className="mt-4 flex flex-wrap items-center justify-between gap-3" aria-label="Match list pages"><button type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)} className="team-summary-action disabled:opacity-40">Previous {activityLimit}</button><span className="text-xs text-vapor">Page {currentPage + 1} of {pageCount}</span><button type="button" disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)} className="team-summary-action disabled:opacity-40">Next {activityLimit}</button></nav>}
      {!expanded && !loading && matches.length > 0 && <button type="button" onClick={onViewAll} className="mt-4 inline-flex items-center gap-2 text-xs font-bold text-cyan hover:underline">View match history<ChevronRight className="h-3.5 w-3.5" /></button>}
    </section>
  );
}

