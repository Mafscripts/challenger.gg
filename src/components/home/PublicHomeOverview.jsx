import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Clock3,
  Coins,
  Crosshair,
  Gamepad2,
  LockKeyhole,
  Medal,
  Trophy,
  Users,
  Zap,
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";

const number = (value) => Number(value || 0);
const formatNumber = (value) => Math.round(Math.max(0, number(value))).toLocaleString();
const formatMoney = (value) => `$${Math.max(0, number(value)).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const blackOps7Artwork = "/assets/tournaments/black-ops-7.webp";
const bulletImpacts = [
  { left: "72%", top: "24%", size: "34px", delay: "1.4s", rotate: "12deg" },
  { left: "84%", top: "42%", size: "27px", delay: "2.3s", rotate: "-18deg" },
  { left: "66%", top: "67%", size: "31px", delay: "3.2s", rotate: "29deg" },
  { left: "91%", top: "73%", size: "23px", delay: "4.1s", rotate: "-33deg" },
];

const tournamentImage = (tournament) => {
  const identity = String(tournament?.name || "").toLowerCase();
  return identity.includes("black ops 7") || identity.includes("test tournament") ? blackOps7Artwork : (tournament?.image_url || blackOps7Artwork);
};

const formatDate = (value) => {
  const date = new Date(value || "");
  return Number.isFinite(date.getTime()) ? date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "Date TBA";
};

function AnimatedTotal({ value, money = false }) {
  const [shown, setShown] = useState(0);
  const previous = useRef(0);
  useEffect(() => {
    const from = previous.current;
    const to = Math.max(0, number(value));
    const started = performance.now();
    let frame;
    const tick = (timestamp) => {
      const progress = Math.min(1, (timestamp - started) / 1100);
      setShown(from + ((to - from) * (1 - ((1 - progress) ** 3))));
      if (progress < 1) frame = requestAnimationFrame(tick);
      else previous.current = to;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return money ? formatMoney(shown) : formatNumber(shown);
}

function PublicSectionTitle({ eyebrow, title, target, isAuthenticated }) {
  const href = isAuthenticated ? target : `/login?returnTo=${encodeURIComponent(target)}`;
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div><p className="font-mono text-[9px] font-black uppercase tracking-[0.22em] text-cyan">{eyebrow}</p><h2 className="mt-1 font-heading text-2xl font-black text-white sm:text-3xl">{title}</h2></div>
      <Link to={href} className="inline-flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.14em] text-vapor transition-colors hover:text-orange">
        {!isAuthenticated && <LockKeyhole className="h-3 w-3" />} View all <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}

export default function PublicHomeOverview() {
  const { isAuthenticated } = useAuth();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({ stats: {}, tournaments: [], ladder: [], matches: [] });

  useEffect(() => {
    let mounted = true;
    base44.public.homeOverview()
      .then((result) => { if (mounted) setData(result || { stats: {}, tournaments: [], ladder: [], matches: [] }); })
      .catch(() => {})
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  const protectedHref = (path) => isAuthenticated ? path : `/login?returnTo=${encodeURIComponent(path)}`;
  const statCards = [
    { label: "Matches played", value: data.stats?.matches_played, icon: Gamepad2, tone: "text-cyan" },
    { label: "Tournaments", value: data.stats?.tournaments, icon: Trophy, tone: "text-orange" },
    { label: "Cash paid out", value: data.stats?.cash_paid_out, icon: Coins, tone: "text-green", money: true },
    { label: "Total XP", value: data.stats?.total_xp, icon: Zap, tone: "text-purple-300" },
  ];
  const visibleLadder = useMemo(() => (data.ladder || []).slice(0, 16), [data.ladder]);

  return (
    <div className="landing-arena relative overflow-hidden py-20 sm:py-24">
      <div className="landing-arena-glow landing-arena-glow-cyan" aria-hidden="true" />
      <div className="landing-arena-glow landing-arena-glow-orange" aria-hidden="true" />
      <div className="relative mx-auto max-w-[1540px] space-y-16 px-4 sm:px-6 lg:px-8">
        <section className="landing-season-card relative min-h-[360px] overflow-hidden rounded-2xl border border-white/10 bg-card sm:min-h-[410px]">
          <img src="/assets/home/featured-tournaments.png" alt="" className="absolute inset-0 h-full w-full object-cover object-center opacity-65" />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(5,10,17,.98)_0%,rgba(5,10,17,.9)_38%,rgba(5,10,17,.25)_78%)]" />
          <div className="absolute inset-0 bg-[linear-gradient(0deg,rgba(5,10,17,.84),transparent_60%)]" />
          <div className="landing-bullet-field absolute inset-0 z-[2]" aria-hidden="true">
            {bulletImpacts.map((impact, index) => (
              <span
                key={`${impact.left}-${impact.top}`}
                className="landing-bullet-hole"
                style={{
                  left: impact.left,
                  top: impact.top,
                  width: impact.size,
                  height: impact.size,
                  "--impact-delay": impact.delay,
                  "--impact-rotation": impact.rotate,
                  "--impact-index": index,
                }}
              />
            ))}
          </div>
          <div className="relative z-10 flex min-h-[360px] max-w-2xl flex-col justify-center px-6 py-12 sm:min-h-[410px] sm:px-10 lg:px-14">
            <span className="landing-copy-reveal landing-copy-delay-1 inline-flex w-fit items-center gap-2 rounded-md border border-orange/30 bg-orange/10 px-2.5 py-1 font-mono text-[9px] font-black uppercase tracking-[0.16em] text-orange"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-orange" /> October season live</span>
            <h2 className="mt-5 font-heading text-4xl font-black uppercase leading-[.95] text-white sm:text-5xl">
              <span className="landing-title-reveal landing-copy-delay-2 block">Black Ops 7 ladder</span>
              <span className="landing-title-reveal landing-copy-delay-3 block text-orange">Become the Topfragger</span>
            </h2>
            <p className="landing-copy-reveal landing-copy-delay-4 mt-5 max-w-xl text-sm leading-6 text-vapor sm:text-base">Compete throughout the six-week season for a $1,000 prize pool. The top 8 teams reach the playoffs, and the No. 1 competitor is featured in the next season.</p>
            <div className="landing-copy-reveal landing-copy-delay-5 mt-7 flex flex-wrap gap-3">
              <Link to={protectedHref("/tournaments")} className="inline-flex items-center gap-2 rounded-lg bg-orange px-5 py-3 text-[10px] font-black uppercase tracking-wider text-black"><Trophy className="h-4 w-4" /> View tournaments <ArrowRight className="h-4 w-4" /></Link>
              {!isAuthenticated && <Link to="/register" className="inline-flex items-center gap-2 rounded-lg bg-orange px-5 py-3 text-[10px] font-black uppercase tracking-wider text-black shadow-[0_0_24px_rgba(255,108,0,.16)] transition-colors hover:bg-orange/90">Create free account</Link>}
            </div>
          </div>
        </section>

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {statCards.map(({ label, value, icon: Icon, tone, money }) => (
            <article key={label} className="landing-stat-card relative overflow-hidden rounded-xl border border-white/10 bg-card px-4 py-4 sm:px-5">
              <div className="flex items-center gap-2"><span className={`grid h-8 w-8 place-items-center rounded-lg border border-white/10 bg-white/[0.035] ${tone}`}><Icon className="h-4 w-4" /></span><span className="font-mono text-[8px] font-black uppercase tracking-[0.16em] text-vapor">{label}</span></div>
              <p className="mt-3 font-heading text-2xl font-black text-white sm:text-3xl">{loading ? "—" : <AnimatedTotal value={value} money={money} />}</p>
            </article>
          ))}
        </section>

        <section>
          <PublicSectionTitle eyebrow="Compete" title="Upcoming tournaments" target="/tournaments" isAuthenticated={isAuthenticated} />
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-card">
            {loading && [0, 1, 2].map((item) => <div key={item} className="h-[78px] animate-pulse border-b border-white/5 bg-white/[0.02]" />)}
            {!loading && data.tournaments.length === 0 && <div className="p-8 text-center text-sm text-vapor">No upcoming tournaments are scheduled yet.</div>}
            {data.tournaments.map((tournament) => (
              <Link key={tournament.id} to={protectedHref(`/tournaments/${tournament.id}`)} className="group grid min-h-[78px] grid-cols-[52px_1fr_auto] items-center gap-3 border-b border-white/[0.07] px-3 py-3 last:border-0 hover:bg-white/[0.035] sm:grid-cols-[56px_minmax(0,1fr)_100px_90px_140px] sm:px-5">
                <img src={tournamentImage(tournament)} alt="" className="h-[52px] w-[52px] rounded-lg border border-white/10 object-cover" loading="lazy" />
                <div className="min-w-0"><h3 className="truncate text-sm font-black text-white transition-colors group-hover:text-orange">{tournament.name}</h3><p className="mt-1 truncate text-[10px] text-vapor">{tournament.team_size || "Team"} · {tournament.game_mode_display || tournament.game_mode || "Competitive"}</p></div>
                <PreviewMetric label="Prize" value={formatMoney(tournament.prize_pool)} tone="text-green" />
                <PreviewMetric label="Teams" value={`${tournament.registered_teams} / ${tournament.max_teams || "—"}`} extra="hidden sm:block" />
                <div className="hidden border-l border-white/10 pl-5 sm:block"><p className="font-mono text-[8px] font-black uppercase tracking-wider text-vapor">Starts</p><p className="mt-1 font-mono text-[10px] font-black text-cyan">{formatDate(tournament.start_date)}</p></div>
                {!isAuthenticated && <LockKeyhole className="h-4 w-4 text-vapor sm:hidden" />}
              </Link>
            ))}
          </div>
        </section>

        <section>
          <PublicSectionTitle eyebrow="October 2026" title="Tournament ladder — Top 16" target="/leaderboards" isAuthenticated={isAuthenticated} />
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-card">
            <div className="grid grid-cols-[48px_1fr_80px_100px] border-b border-white/10 bg-white/[0.025] px-4 py-3 font-mono text-[8px] font-black uppercase tracking-wider text-vapor sm:px-5"><span>Rank</span><span>Competitor</span><span className="text-center">Wins</span><span className="text-right">Earnings</span></div>
            {loading && [0, 1, 2, 3].map((item) => <div key={item} className="h-14 animate-pulse border-b border-white/5 bg-white/[0.02]" />)}
            {!loading && visibleLadder.length === 0 && <div className="p-8 text-center text-sm text-vapor">The October ladder is waiting for its first champion.</div>}
            {visibleLadder.map((player, index) => (
              <Link key={player.id} to={protectedHref(`/profile/${player.username || player.id}`)} className="group grid min-h-14 grid-cols-[48px_1fr_80px_100px] items-center border-b border-white/[0.06] px-4 last:border-0 hover:bg-white/[0.035] sm:px-5">
                <span className={`font-mono text-xs font-black ${index < 3 ? "text-orange" : "text-vapor"}`}>#{index + 1}</span>
                <div className="flex min-w-0 items-center gap-3"><span className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-lg border border-white/10 bg-white/[0.04]">{player.avatar_url ? <img src={player.avatar_url} alt="" className="h-full w-full object-cover" /> : <Medal className="h-4 w-4 text-cyan" />}</span><span className="truncate text-sm font-black text-white group-hover:text-orange">{player.display_name}</span></div>
                <span className="text-center font-mono text-xs font-black text-cyan">{player.tournament_wins}</span>
                <span className="text-right font-mono text-xs font-black text-green">{formatMoney(player.lifetime_earnings)}</span>
              </Link>
            ))}
          </div>
        </section>

        <section>
          <PublicSectionTitle eyebrow="Ready to play" title="Matchfinder" target="/wagers" isAuthenticated={isAuthenticated} />
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-card">
            {loading && [0, 1].map((item) => <div key={item} className="h-[68px] animate-pulse border-b border-white/5 bg-white/[0.02]" />)}
            {!loading && data.matches.length === 0 && <div className="p-8 text-center text-sm text-vapor">No open matches right now.</div>}
            {data.matches.map((match) => {
              const target = match.kind === "ranked" ? `/ranked-match/${match.id}` : `/wagers-match/${match.id}`;
              return (
                <Link key={`${match.kind}-${match.id}`} to={protectedHref(target)} className="group grid min-h-[68px] grid-cols-[38px_1fr_auto] items-center gap-3 border-b border-white/[0.07] px-4 py-3 last:border-0 hover:bg-white/[0.035] sm:grid-cols-[38px_1fr_110px_110px_90px] sm:px-5">
                  <span className={`grid h-9 w-9 place-items-center rounded-lg border ${match.kind === "ranked" ? "border-cyan/25 bg-cyan/10 text-cyan" : "border-orange/25 bg-orange/10 text-orange"}`}>{match.kind === "ranked" ? <Crosshair className="h-4 w-4" /> : <Coins className="h-4 w-4" />}</span>
                  <div className="min-w-0"><p className="truncate text-sm font-black text-white group-hover:text-orange">{match.game_mode_display || match.game_mode || "Competitive match"}</p><p className="mt-1 truncate text-[9px] text-vapor">{match.team_size || "1v1"} · Posted by {match.host_name}</p></div>
                  <PreviewMetric label="Entry" value={match.entry_fee > 0 ? formatMoney(match.entry_fee) : "Free"} tone={match.entry_fee > 0 ? "text-green" : "text-cyan"} extra="hidden sm:block" />
                  <PreviewMetric label="Type" value={match.kind === "ranked" ? "Ranked" : "Wager"} extra="hidden sm:block" />
                  <span className="inline-flex items-center justify-center gap-1 rounded-lg border border-cyan/25 bg-cyan/10 px-2.5 py-2 font-mono text-[8px] font-black uppercase tracking-wider text-cyan">{!isAuthenticated && <LockKeyhole className="h-3 w-3" />} Open</span>
                </Link>
              );
            })}
          </div>
        </section>

        {!isAuthenticated && (
          <section className="landing-final-cta relative overflow-hidden rounded-2xl border border-cyan/20 bg-card px-6 py-12 text-center sm:px-10">
            <div className="relative z-10"><p className="font-mono text-[9px] font-black uppercase tracking-[0.22em] text-orange">Your season starts here</p><h2 className="mt-3 font-heading text-3xl font-black text-white sm:text-4xl">Ready to compete?</h2><p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-vapor">Create an account to open tournaments, join matches, build your team and compete on the October ladder.</p><div className="mt-6 flex flex-wrap justify-center gap-3"><Link to="/register" className="rounded-lg bg-orange px-6 py-3 text-[10px] font-black uppercase tracking-wider text-black shadow-[0_0_26px_rgba(255,108,0,.18)] transition-colors hover:bg-orange/90">Register free</Link><Link to="/login" className="rounded-lg border border-white/10 bg-white/[0.035] px-6 py-3 text-[10px] font-black uppercase tracking-wider text-white">Login</Link></div></div>
          </section>
        )}
      </div>
    </div>
  );
}

function PreviewMetric({ label, value, tone = "text-white", extra = "" }) {
  return <div className={`border-l border-white/10 pl-4 ${extra}`}><p className="font-mono text-[8px] font-black uppercase tracking-wider text-vapor">{label}</p><p className={`mt-1 truncate font-mono text-[10px] font-black ${tone}`}>{value}</p></div>;
}
