import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CalendarDays, Clock3, RefreshCw, Trophy, Users } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import "@/styles/upcoming-tournaments.css";

const modeLabels = {
  bo1_snd: "BO1 Search & Destroy", snd_hp_snd: "BO3 SND / HP / SND",
  bo3_hp_overload_snd: "BO3 HP / Overload / SND", bo5_hp_overload_snd_hp_snd: "BO5 HP / Overload / SND / HP / SND",
  snd: "Search & Destroy", hp: "Hardpoint", overload: "Overload",
};
const startTime = tournament => Date.parse(tournament.start_date || "");
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
  return <section className="play-upcoming-tournaments leaderboard-surface" aria-label="Upcoming tournaments">
    <header className="play-upcoming-heading"><div><p className="play-upcoming-eyebrow">Next on the schedule</p><h2>Upcoming tournaments</h2><p>Choose an event to view its rules, teams and registration details.</p></div><button type="button" disabled={query.isFetching} onClick={() => query.refetch()} aria-label="Refresh upcoming tournaments"><RefreshCw size={15} /></button></header>
    {query.isPending ? <div className="play-upcoming-empty" role="status"><CalendarDays size={28} /><strong>Loading upcoming events…</strong></div>
      : query.isError && !query.data ? <div className="play-upcoming-empty" role="alert"><CalendarDays size={28} /><strong>The schedule is temporarily unavailable.</strong><button type="button" onClick={() => query.refetch()}>Try again</button></div>
        : tournaments.length === 0 ? <div className="play-upcoming-empty"><CalendarDays size={28} /><strong>No upcoming tournaments announced.</strong><p>New events will appear here when registration opens.</p></div>
          : tournaments.map(tournament => {
            const scheduled = Number.isFinite(startTime(tournament));
            const date = scheduled ? new Date(tournament.start_date) : null;
            const full = Number(tournament.max_teams) > 0 && Number(tournament.registered_teams || 0) >= Number(tournament.max_teams);
            return <article key={tournament.id} className="play-upcoming-event">
              <div className="play-upcoming-schedule"><span className="play-upcoming-calendar"><strong>{date ? date.getDate() : "—"}</strong><small>{date ? date.toLocaleDateString([], { month: "short" }) : "TBA"}</small></span><div>{date ? <time dateTime={tournament.start_date}><strong>{date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false, timeZoneName: "short" })}</strong><small>{date.toLocaleDateString([], { weekday: "short", year: "numeric" })}</small></time> : <strong>Date to be announced</strong>}</div></div>
              <div className="play-upcoming-identity"><span className="play-upcoming-state" data-full={full}>{full ? "Full" : "Registration open"}</span><h3>{tournament.name || "Topfragg tournament"}</h3><p>{tournament.team_size || "Team size TBA"}<span aria-hidden="true"> · </span>{modeLabels[tournament.game_mode] || tournament.game_mode || "Format to be announced"}</p></div>
              <div className="play-upcoming-details"><span><Trophy size={13} /><strong>${Number(tournament.prize_pool || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong><small>Prize pool</small></span><span><Users size={13} /><strong>{tournament.registered_teams || 0}{Number(tournament.max_teams) > 0 ? ` / ${tournament.max_teams}` : ""}</strong><small>Teams</small></span><span><strong>{entryLabel(tournament)}</strong><small>Entry</small></span></div>
              <Link to={`/tournaments/${encodeURIComponent(tournament.id)}`} className="play-upcoming-event-link" aria-label={`View ${tournament.name || "tournament"}`}>View tournament<ArrowRight size={14} /></Link>
            </article>;
          })}
    <footer className="play-upcoming-footer"><span><Clock3 size={12} />Times are shown in your local timezone.</span><Link to="/tournaments">Full tournament center<ArrowRight size={12} /></Link></footer>
  </section>;
}
