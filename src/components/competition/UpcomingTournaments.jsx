import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CalendarDays, Clock3, RefreshCw, ShieldCheck, Sparkles, Swords, Ticket, Trophy, Users } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { tournamentTimeParts, tournamentTimestamp } from "@/lib/tournamentTime";
import { useTournamentTimeZone } from "@/hooks/useTournamentTimeZone";
import "@/styles/upcoming-tournaments.css";

const modeLabels = {
  bo1_snd: "BO1 Search & Destroy", snd_hp_snd: "BO3 SND / HP / SND",
  bo3_hp_overload_snd: "BO3 HP / Overload / SND", bo5_hp_overload_snd_hp_snd: "BO5 HP / Overload / SND / HP / SND",
  snd: "Search & Destroy", hp: "Hardpoint", overload: "Overload",
};
const startTime = tournament => tournamentTimestamp(tournament.start_date);
const isOfficial = tournament => !tournament.is_streamer_tournament
  && !["streamer", "streamer_tournament"].includes(String(tournament.tournament_type || "").toLowerCase())
  && !["streamer", "streamer_tournament"].includes(String(tournament.source || "").toLowerCase());

export function useUpcomingTournaments(enabled) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["play-upcoming-tournaments", user?.id],
    enabled: enabled && Boolean(user?.id),
    staleTime: 30_000,
    refetchInterval: enabled ? 60_000 : false,
    refetchIntervalInBackground: false,
    queryFn: async () => {
      const groups = await Promise.all(["open", "registration"].map(status => base44.entities.Tournament.filterFresh({ status }, "start_date", 100)));
      return [...new Map(groups.flat().map(tournament => [tournament.id, tournament])).values()]
        .filter(tournament => isOfficial(tournament) && (!Number.isFinite(startTime(tournament)) || startTime(tournament) >= Date.now()))
        .sort((a, b) => (Number.isFinite(startTime(a)) ? startTime(a) : Infinity) - (Number.isFinite(startTime(b)) ? startTime(b) : Infinity));
    },
  });
}

function entryLabel(tournament) {
  const fee = Number(tournament.entry_fee || 0);
  const type = String(tournament.entry_type || (tournament.is_premium_only ? "premium" : fee > 0 ? "credits" : "free")).toLowerCase();
  if (type === "invitational" || tournament.invite_only) return "Invite only";
  if (type === "premium") return "Premium entry";
  if (type === "credits_premium") return fee > 0 ? `${fee.toLocaleString()} credits + Premium` : "Premium entry";
  if (type === "credits" && fee > 0) return `${fee.toLocaleString()} credits`;
  return "Free entry";
}

export default function UpcomingTournaments({ query }) {
  const tournaments = query.data || [];
  const { timeZone } = useTournamentTimeZone();
  return <section className="play-upcoming-tournaments" aria-label="Upcoming tournaments" aria-busy={query.isPending || query.isFetching}>
    <header className="play-upcoming-heading">
      <span className="play-upcoming-heading-icon" aria-hidden="true"><CalendarDays size={26} /><span /></span>
      <div className="play-upcoming-heading-copy"><p className="play-upcoming-eyebrow">Next on the schedule</p><h2>Upcoming tournaments<span>.</span></h2><p>Pick your event. Bring your roster. Compete for the win.</p></div>
      <div className="play-upcoming-heading-actions">{!query.isPending && tournaments.length > 0 && <span className="play-upcoming-total"><Trophy size={13} aria-hidden="true" />{tournaments.length} upcoming</span>}<button type="button" disabled={query.isFetching} onClick={() => query.refetch()} aria-label="Refresh upcoming tournaments"><RefreshCw size={15} className={query.isFetching ? "play-upcoming-refreshing" : undefined} aria-hidden="true" /><span>Refresh</span></button></div>
    </header>
    {query.isPending ? <div className="play-upcoming-empty" role="status"><CalendarDays size={28} /><strong>Loading upcoming events…</strong></div>
      : query.isError && !query.data ? <div className="play-upcoming-empty" role="alert"><CalendarDays size={28} /><strong>The schedule is temporarily unavailable.</strong><button type="button" onClick={() => query.refetch()}>Try again</button></div>
        : tournaments.length === 0 ? <div className="play-upcoming-empty"><CalendarDays size={28} /><strong>No upcoming tournaments announced.</strong><p>New events will appear here when registration opens.</p></div>
          : <div className="play-upcoming-events">{tournaments.map((tournament, index) => {
            const date = tournamentTimeParts(tournament.start_date, { timeZone });
            const full = Number(tournament.max_teams) > 0 && Number(tournament.registered_teams || 0) >= Number(tournament.max_teams);
            const entry = entryLabel(tournament);
            const capacity = Number(tournament.max_teams);
            const filled = capacity > 0 ? Math.min(100, Math.max(0, Number(tournament.registered_teams || 0) / capacity * 100)) : 0;
            return <article key={tournament.id} className="play-upcoming-event" data-next={index === 0}>
              <div className="play-upcoming-schedule">
                <span className="play-upcoming-calendar"><small>{date.valid ? date.month : "Date"}</small><strong>{date.valid ? date.day : "—"}</strong><span>{date.valid ? date.weekday : "TBA"}</span></span>
                {date.valid ? <time dateTime={date.iso}><span><Clock3 size={12} aria-hidden="true" />{date.timeLabel}</span><small>{date.year}</small></time> : <span className="play-upcoming-date-tba">Date to be announced</span>}
              </div>
              <div className="play-upcoming-identity">
                <div className="play-upcoming-badges"><span className="play-upcoming-official"><ShieldCheck size={12} aria-hidden="true" />Official event</span>{index === 0 && <span className="play-upcoming-next"><Sparkles size={12} aria-hidden="true" />Up next</span>}<span className="play-upcoming-state" data-full={full}><span />{full ? "Full" : "Registration open"}</span></div>
                <h3>{tournament.name || "Topfragg tournament"}</h3>
                <p><span><Users size={13} aria-hidden="true" />{tournament.team_size || "Team size TBA"}</span><span><Swords size={13} aria-hidden="true" />{modeLabels[tournament.game_mode] || tournament.game_mode || "Format to be announced"}</span></p>
              </div>
              <Link to={`/tournaments/${encodeURIComponent(tournament.id)}`} className="play-upcoming-event-link" aria-label={`View ${tournament.name || "tournament"}`}>View tournament<ArrowRight size={14} /></Link>
              <dl className="play-upcoming-details">
                <div data-tone="gold"><dt><span className="play-upcoming-detail-icon"><Trophy size={20} aria-hidden="true" /></span>Prize pool</dt><dd>${Number(tournament.prize_pool || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}<Trophy className="play-upcoming-detail-watermark" size={55} aria-hidden="true" /></dd></div>
                <div data-tone="cyan"><dt><span className="play-upcoming-detail-icon"><Users size={20} aria-hidden="true" /></span>Registered teams</dt><dd>{tournament.registered_teams || 0}{capacity > 0 && <small> / {tournament.max_teams}</small>}{capacity > 0 && <span className="play-upcoming-capacity" aria-hidden="true"><span style={{ width: `${filled}%` }} /></span>}</dd></div>
                <div data-tone={entry === "Free entry" ? "green" : "purple"}><dt><span className="play-upcoming-detail-icon"><Ticket size={20} aria-hidden="true" /></span>Entry requirement</dt><dd>{entry}</dd></div>
              </dl>
            </article>;
          })}</div>}
    <footer className="play-upcoming-footer"><span>Times are shown in your local time.</span><Link to="/tournaments">Full tournament center<ArrowRight size={12} /></Link></footer>
  </section>;
}
