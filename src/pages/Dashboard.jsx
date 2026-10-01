import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Coins,
  Crosshair,
  Gamepad2,
  Medal,
  Trophy,
  Zap,
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { HalloweenCountdown, HalloweenEventBadge } from "@/components/halloween/HalloweenSeason";
import PageLoader from "@/components/ui/PageLoader";

const SLIDE_DURATION = 10000;
const HOME_REFRESH_INTERVAL = 60000;
const blackOps7Artwork = "/assets/tournaments/black-ops-7.webp";
const homeBulletImpacts = [
  { left: "63%", top: "18%", size: "25px", delay: ".25s", rotate: "-8deg" },
  { left: "74%", top: "28%", size: "34px", delay: ".85s", rotate: "12deg" },
  { left: "88%", top: "20%", size: "22px", delay: "1.45s", rotate: "36deg" },
  { left: "83%", top: "43%", size: "27px", delay: "2.05s", rotate: "-18deg" },
  { left: "68%", top: "57%", size: "20px", delay: "2.65s", rotate: "18deg" },
  { left: "76%", top: "72%", size: "31px", delay: "3.25s", rotate: "29deg" },
  { left: "92%", top: "66%", size: "23px", delay: "3.85s", rotate: "-33deg" },
  { left: "86%", top: "84%", size: "19px", delay: "4.45s", rotate: "7deg" },
];

const slides = [
  {
    image: "/assets/home/halloween-special.png",
    season: "halloween",
    objectPosition: "center center",
    tag: "Halloween special",
    meta: "8 free tournaments",
    title: "HALLOWEEN MAYHEM",
    accent: "EIGHT SHOTS AT GLORY",
    description: "Sign up, squad up, and enter eight free Halloween tournaments. Every bracket is a new chance to sharpen your game, build your reputation, and prove you can compete with the pros.",
    primaryLabel: "Claim your free spot",
    primaryHref: "/tournaments",
    secondaryLabel: "View the leaderboard",
    secondaryHref: "/leaderboards",
  },
  {
    image: "/assets/home/featured-season.png",
    objectPosition: "center 35%",
    tag: "New season",
    meta: "Oct 1, 2026",
    title: "BLACK OPS 7 LADDER",
    accent: "OCTOBER SEASON IS LIVE",
    description: "Climb to the top, become the Topfragger and compete for a $1,000 prize pool. The top 8 teams advance to the season playoffs.",
    primaryLabel: "Enter the ladder",
    primaryHref: "/tournaments",
    secondaryLabel: "View leaderboard",
    secondaryHref: "/leaderboards",
  },
  {
    image: "/assets/home/featured-tournaments.png",
    objectPosition: "center 35%",
    tag: "Tournament ladder",
    meta: "Six-week season",
    title: "BLACK OPS 7 TOURNAMENTS",
    accent: "BECOME OUR TOPFRAGGER",
    description: "Enter free or paid tournaments and prove you are the best. After six weeks, the No. 1 competitor is featured for the first two weeks of the next season.",
    primaryLabel: "Browse tournaments",
    primaryHref: "/tournaments",
    secondaryLabel: "How it works",
    secondaryHref: "/leaderboards",
  },
];

const number = (value) => Number(value || 0);
const formatWholeNumber = (value) => Math.max(0, Math.round(number(value))).toLocaleString();
const formatMoney = (value) => `$${Math.max(0, number(value)).toLocaleString(undefined, {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})}`;

const isCompleted = (row) => ["completed", "complete", "resolved"].includes(String(row?.status || "").toLowerCase());
const isOpen = (row) => ["open", "registration", "waiting", "available"].includes(String(row?.status || "open").toLowerCase());

const tournamentImage = (tournament) => {
  const identity = `${tournament?.name || ""} ${tournament?.game || ""} ${tournament?.game_name || ""}`.toLowerCase();
  if (identity.includes("black ops 7") || identity.includes("test tournament")) return blackOps7Artwork;
  return tournament?.image_url || tournament?.banner_url || tournament?.cover_image_url || blackOps7Artwork;
};

const tournamentEntry = (tournament) => {
  if (tournament?.invite_only || tournament?.entry_type === "invitational") return "Invite only";
  const fee = number(tournament?.entry_fee);
  if (fee > 0) return `${formatWholeNumber(fee)} credits`;
  return "Free entry";
};

const formatStart = (value) => {
  if (!value) return "Date TBA";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Date TBA";
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
};

const timeUntil = (value, now) => {
  const target = new Date(value || "").getTime();
  if (!Number.isFinite(target)) return "TBA";
  const seconds = Math.max(0, Math.floor((target - now) / 1000));
  if (seconds <= 0) return "Starting now";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${Math.max(1, minutes)}m`;
};

const playerName = (user) => user?.display_name || user?.username || user?.full_name || user?.email?.split("@")[0] || "Competitor";

function AnimatedNumber({ value, money = false }) {
  const [shown, setShown] = useState(0);
  const previous = useRef(0);

  useEffect(() => {
    const from = previous.current;
    const to = Math.max(0, number(value));
    const started = performance.now();
    let frame;
    const tick = (timestamp) => {
      const progress = Math.min(1, (timestamp - started) / 1100);
      const eased = 1 - ((1 - progress) ** 3);
      setShown(from + ((to - from) * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
      else previous.current = to;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return money ? formatMoney(shown) : formatWholeNumber(shown);
}

function SectionHeading({ eyebrow, title, action, actionLabel = "View all" }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div>
        <p className="font-mono text-[10px] font-black uppercase tracking-[0.22em] text-cyan">{eyebrow}</p>
        <h2 className="mt-1 font-heading text-xl font-black text-white sm:text-2xl">{title}</h2>
      </div>
      {action && (
        <Link to={action} className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.15em] text-vapor transition-colors hover:text-orange">
          {actionLabel}<ArrowRight className="h-3.5 w-3.5" />
        </Link>
      )}
    </div>
  );
}

function FeaturedNews() {
  const [active, setActive] = useState(0);
  const slide = slides[active];

  useEffect(() => {
    const timer = window.setTimeout(() => setActive((current) => (current + 1) % slides.length), SLIDE_DURATION);
    return () => window.clearTimeout(timer);
  }, [active]);

  const move = (direction) => setActive((current) => (current + direction + slides.length) % slides.length);

  return (
    <section className={`home-featured relative isolate h-[590px] overflow-hidden rounded-2xl border border-white/10 bg-[#090e16] sm:h-[550px] lg:h-[520px] ${slide.season === "halloween" ? "halloween-feature" : ""}`}>
      <div key={`base-${active}`} className="home-featured-image absolute inset-0">
        <img src={slide.image} alt="" className="h-full w-full object-cover" style={{ objectPosition: slide.objectPosition }} loading={active === 0 ? "eager" : "lazy"} />
      </div>
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(5,9,16,.98)_0%,rgba(5,9,16,.88)_34%,rgba(5,9,16,.42)_65%,rgba(5,9,16,.15)_100%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(0deg,rgba(5,9,16,.86)_0%,transparent_45%)]" />
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-cyan via-orange to-transparent" />
      <div key={`bullets-${active}`} className="landing-bullet-field absolute inset-0 z-[5]" aria-hidden="true">
        {homeBulletImpacts.map((impact, index) => (
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

      <div key={`copy-${active}`} className="home-featured-copy relative z-10 flex h-full max-w-3xl flex-col justify-start px-6 pb-28 pt-12 sm:px-10 sm:pt-14 lg:px-14">
        <p className="mb-7 flex items-center gap-2 font-mono text-[10px] font-black uppercase tracking-[0.24em] text-vapor sm:mb-8">
          <span className="h-1.5 w-1.5 bg-orange" /> Featured news
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded border border-orange/40 bg-orange/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-orange">{slide.tag}</span>
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-vapor">{slide.meta}</span>
        </div>
        <h1 className="mt-4 max-w-3xl font-heading text-3xl font-black uppercase leading-[.95] text-white sm:text-4xl lg:text-5xl">
          {slide.title}<br /><span className="text-orange">{slide.accent}</span>
        </h1>
        <p className="mt-5 max-w-xl text-sm leading-6 text-vapor sm:text-base">{slide.description}</p>
        {slide.season === "halloween" && <HalloweenCountdown className="mt-5" />}
        <div className={`${slide.season === "halloween" ? "mt-5" : "mt-7"} flex flex-wrap gap-3`}>
          <Link to={slide.primaryHref} className="inline-flex items-center gap-2 rounded-lg bg-orange px-5 py-3 text-xs font-black uppercase tracking-[0.08em] text-black transition-transform hover:-translate-y-0.5">
            {slide.primaryLabel}<ArrowRight className="h-4 w-4" />
          </Link>
          <Link to={slide.secondaryHref} className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/[0.04] px-5 py-3 text-xs font-black uppercase tracking-[0.08em] text-white transition-colors hover:border-cyan/40 hover:text-cyan">
            <BarChart3 className="h-4 w-4" />{slide.secondaryLabel}
          </Link>
        </div>
      </div>

      <div className="absolute bottom-5 left-6 right-6 z-20 flex items-end justify-between gap-6 sm:left-10 sm:right-10 lg:left-14 lg:right-14">
        <div className="flex flex-1 gap-2 sm:max-w-sm">
          {slides.map((item, index) => (
            <button key={item.title} type="button" onClick={() => setActive(index)} className="group flex-1 py-2 text-left" aria-label={`Show featured story ${index + 1}`}>
              <span className="block h-[2px] overflow-hidden bg-white/15">
                {index === active && <span key={`progress-${active}`} className="home-slide-progress block h-full bg-orange" />}
                {index < active && <span className="block h-full w-full bg-white/40" />}
              </span>
              <span className={`mt-1.5 hidden font-mono text-[9px] font-bold uppercase tracking-[0.12em] sm:block ${index === active ? "text-white" : "text-vapor"}`}>
                0{index + 1} {item.tag}
              </span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="mr-1 font-mono text-[10px] font-bold text-vapor">0{active + 1} / 0{slides.length}</span>
          <button type="button" onClick={() => move(-1)} className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 bg-black/30 text-white transition-colors hover:border-orange/40 hover:text-orange" aria-label="Previous featured story"><ChevronLeft className="h-4 w-4" /></button>
          <button type="button" onClick={() => move(1)} className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 bg-black/30 text-white transition-colors hover:border-orange/40 hover:text-orange" aria-label="Next featured story"><ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>
    </section>
  );
}

function StatsStrip({ stats }) {
  const cards = [
    { label: "Matches played", value: stats.matchesPlayed, icon: Gamepad2, tone: "text-cyan" },
    { label: "Tournaments", value: stats.tournaments, icon: Trophy, tone: "text-orange" },
    { label: "Cash paid out", value: stats.cashPaidOut, icon: Coins, tone: "text-green", money: true },
    { label: "Total XP", value: stats.totalXp, icon: Zap, tone: "text-purple-300" },
  ];
  return (
    <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map(({ label, value, icon: Icon, tone, money }) => (
        <article key={label} className="group relative overflow-hidden rounded-xl border border-white/10 bg-card px-4 py-4 sm:px-5">
          <div className="flex items-center gap-2">
            <span className={`grid h-8 w-8 place-items-center rounded-lg border border-white/10 bg-white/[0.035] ${tone}`}><Icon className="h-4 w-4" /></span>
            <span className="font-mono text-[9px] font-black uppercase tracking-[0.16em] text-vapor">{label}</span>
          </div>
          <p className="mt-3 font-heading text-2xl font-black text-white sm:text-3xl"><AnimatedNumber value={value} money={money} /></p>
          <span className="absolute inset-x-0 bottom-0 h-[2px] origin-left scale-x-50 bg-gradient-to-r from-cyan via-orange to-transparent transition-transform duration-300 group-hover:scale-x-100" />
        </article>
      ))}
    </section>
  );
}

function TournamentRows({ tournaments, now, loading }) {
  return (
    <section>
      <SectionHeading eyebrow="Compete" title="Upcoming tournaments" action="/tournaments" />
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-card">
        {loading && tournaments.length === 0 && [0, 1, 2].map((item) => <div key={item} className="h-[86px] animate-pulse border-b border-white/5 bg-white/[0.025] last:border-0" />)}
        {!loading && tournaments.length === 0 && (
          <div className="px-5 py-12 text-center text-sm text-vapor">No upcoming tournaments are scheduled yet.</div>
        )}
        {tournaments.map((tournament) => {
          const teams = number(tournament.registered_teams ?? tournament.participant_count);
          const maxTeams = number(tournament.max_teams || tournament.team_limit || 0);
          return (
            <Link key={tournament.id} to={`/tournaments/${tournament.id}`} className="group grid min-h-[86px] grid-cols-[56px_1fr_auto] items-center gap-3 border-b border-white/[0.07] px-3 py-3 transition-colors last:border-0 hover:bg-white/[0.035] sm:grid-cols-[62px_minmax(0,1fr)_90px_100px_112px] sm:gap-5 sm:px-5 lg:grid-cols-[62px_minmax(0,1fr)_90px_100px_85px_112px]">
              <img src={tournamentImage(tournament)} alt="" className="h-14 w-14 rounded-lg border border-white/10 object-cover sm:h-[62px] sm:w-[62px]" loading="lazy" />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="truncate font-heading text-sm font-black text-white transition-colors group-hover:text-orange sm:text-base">{tournament.name || "Tournament"}</h3>
                  <span className="hidden rounded bg-cyan/10 px-1.5 py-0.5 font-mono text-[8px] font-black uppercase tracking-wider text-cyan md:inline">{String(tournament.status || "Open").replace("_", " ")}</span>
                  {tournamentEntry(tournament) === "Free entry" && <HalloweenEventBadge className="hidden xl:inline-flex" />}
                </div>
                <p className="mt-1 truncate text-[11px] text-vapor">{tournament.team_size || "Team"} · {tournament.game_mode_display || tournament.game_mode || "Competitive"}</p>
                <p className="mt-1.5 font-mono text-[9px] font-bold uppercase tracking-wider text-cyan sm:hidden">{timeUntil(tournament.start_date, now)}</p>
              </div>
              <div className="hidden border-l border-white/10 pl-5 sm:block">
                <p className="font-mono text-[8px] font-black uppercase tracking-[0.14em] text-vapor">Prize pool</p>
                <p className="mt-1 font-mono text-xs font-black text-green">{formatMoney(tournament.prize_pool)}</p>
              </div>
              <div className="hidden border-l border-white/10 pl-5 sm:block">
                <p className="font-mono text-[8px] font-black uppercase tracking-[0.14em] text-vapor">Entry</p>
                <p className="mt-1 truncate font-mono text-[10px] font-black text-cyan">{tournamentEntry(tournament)}</p>
              </div>
              <div className="hidden border-l border-white/10 pl-5 lg:block">
                <p className="font-mono text-[8px] font-black uppercase tracking-[0.14em] text-vapor">Teams</p>
                <p className="mt-1 font-mono text-xs font-black text-white">{teams} / {maxTeams || "—"}</p>
              </div>
              <div className="hidden min-w-[112px] border-l border-white/10 pl-5 sm:block">
                <p className="font-mono text-[8px] font-black uppercase tracking-[0.14em] text-vapor">Starts in</p>
                <p className="mt-1 font-mono text-xs font-black text-cyan">{timeUntil(tournament.start_date, now)}</p>
                <p className="mt-1 text-[9px] text-vapor">{formatStart(tournament.start_date)}</p>
              </div>
              <div className="col-start-3 row-start-1 flex flex-col items-end gap-2 sm:hidden">
                <span className="font-mono text-xs font-black text-green">{formatMoney(tournament.prize_pool)}</span>
                <ArrowRight className="h-4 w-4 text-vapor transition-colors group-hover:text-orange" />
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function TournamentLadder({ players, loading }) {
  return (
    <section>
      <SectionHeading eyebrow="Season rankings" title="Tournament ladder — Top 16" action="/leaderboards" actionLabel="Full leaderboard" />
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-card">
        <div className="grid grid-cols-[46px_1fr_74px_92px] border-b border-white/10 bg-black/10 px-4 py-3 font-mono text-[8px] font-black uppercase tracking-[0.16em] text-vapor sm:grid-cols-[56px_1fr_110px_120px] sm:px-5">
          <span>Rank</span><span>Competitor</span><span className="text-center">Wins</span><span className="text-right">Earnings</span>
        </div>
        {loading && players.length === 0 && [0, 1, 2, 3].map((item) => <div key={item} className="h-[58px] animate-pulse border-b border-white/5 bg-white/[0.02]" />)}
        {!loading && players.length === 0 && <div className="px-5 py-12 text-center text-sm text-vapor">The tournament ladder is waiting for its first champion.</div>}
        {players.map((player, index) => (
          <Link key={player.id || `${playerName(player)}-${index}`} to={player.id ? `/profile/${player.id}` : "/leaderboards"} className="group grid min-h-[58px] grid-cols-[46px_1fr_74px_92px] items-center border-b border-white/[0.06] px-4 py-2.5 last:border-0 hover:bg-white/[0.035] sm:grid-cols-[56px_1fr_110px_120px] sm:px-5">
            <span className={`font-mono text-sm font-black ${index < 3 ? "text-orange" : "text-vapor"}`}>#{index + 1}</span>
            <div className="flex min-w-0 items-center gap-3">
              <div className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-lg border border-white/10 bg-white/[0.04]">
                {player.avatar_url ? <img src={player.avatar_url} alt="" className="h-full w-full object-cover" loading="lazy" /> : <Medal className={`h-4 w-4 ${index < 3 ? "text-orange" : "text-cyan"}`} />}
              </div>
              <div className="min-w-0"><p className="truncate text-sm font-black text-white transition-colors group-hover:text-orange">{playerName(player)}</p><p className="truncate text-[9px] uppercase tracking-wider text-vapor">Tournament competitor</p></div>
            </div>
            <span className="text-center font-mono text-xs font-black text-cyan">{formatWholeNumber(player.tournament_wins)}</span>
            <span className="text-right font-mono text-xs font-black text-green">{formatMoney(player.total_wager_earnings || player.lifetime_earnings)}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function Matchfinder({ matches, loading }) {
  return (
    <section>
      <SectionHeading eyebrow="Ready to play" title="Matchfinder" action="/wagers" actionLabel="Find all matches" />
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-card">
        {loading && matches.length === 0 && [0, 1].map((item) => <div key={item} className="h-[76px] animate-pulse border-b border-white/5 bg-white/[0.02]" />)}
        {!loading && matches.length === 0 && <div className="px-5 py-12 text-center text-sm text-vapor">No open matches right now. Post a match and be the first.</div>}
        {matches.map((match) => {
          const ranked = match.homeKind === "ranked";
          const href = ranked ? `/ranked-match/${match.id}` : `/wagers-match/${match.id}`;
          const fee = number(match.entry_fee ?? match.amount);
          const players = number(match.player_count ?? match.joined_players ?? match.participant_count);
          return (
            <Link key={`${match.homeKind}-${match.id}`} to={href} className="group grid min-h-[76px] grid-cols-[42px_1fr_auto] items-center gap-3 border-b border-white/[0.07] px-4 py-3 last:border-0 hover:bg-white/[0.035] sm:grid-cols-[42px_1fr_100px_110px_105px] sm:gap-5 sm:px-5">
              <span className={`grid h-10 w-10 place-items-center rounded-lg border ${ranked ? "border-cyan/25 bg-cyan/10 text-cyan" : "border-orange/25 bg-orange/10 text-orange"}`}>{ranked ? <Crosshair className="h-4 w-4" /> : <Coins className="h-4 w-4" />}</span>
              <div className="min-w-0"><p className="truncate text-sm font-black text-white transition-colors group-hover:text-orange">{match.game_mode_display || match.game_mode || (ranked ? "Ranked match" : "Wager match")}</p><p className="mt-1 truncate text-[10px] text-vapor">{match.team_size || "1v1"} · {ranked ? "Ranked" : "Wager"} · Posted by {match.host_name || match.created_by_name || "competitor"}</p></div>
              <div className="hidden sm:block"><p className="font-mono text-[8px] font-black uppercase tracking-wider text-vapor">Entry</p><p className={`mt-1 font-mono text-xs font-black ${fee > 0 ? "text-green" : "text-cyan"}`}>{fee > 0 ? formatMoney(fee) : "Free"}</p></div>
              <div className="hidden sm:block"><p className="font-mono text-[8px] font-black uppercase tracking-wider text-vapor">Players</p><p className="mt-1 font-mono text-xs font-black text-white">{players || "Open slots"}</p></div>
              <span className="inline-flex items-center justify-center gap-1 rounded-lg border border-cyan/25 bg-cyan/10 px-3 py-2 text-[9px] font-black uppercase tracking-wider text-cyan transition-colors group-hover:border-orange/40 group-hover:text-orange">Open <ArrowRight className="h-3.5 w-3.5" /></span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [data, setData] = useState({
    tournaments: [],
    users: [],
    wagers: [],
    rankedMatches: [],
    tournamentMatches: [],
    xpStats: [],
    transactions: [],
  });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const requests = await Promise.allSettled([
        base44.entities.Tournament.filter({}, "-start_date", 500),
        base44.entities.User.filter({}, "-tournament_wins", 100),
        base44.entities.Wager.filter({}, "-created_date", 500),
        base44.entities.RankedMatch.filter({}, "-created_date", 500),
        base44.entities.TournamentMatch.filter({}, "-created_date", 500),
        base44.entities.XPStats.filter({}, "-total_xp", 500),
        base44.entities.WalletTransaction.filter({ status: "completed" }, "-created_date", 500),
      ]);
      if (cancelled) return;
      const rows = requests.map((result) => result.status === "fulfilled" && Array.isArray(result.value) ? result.value : []);
      setData({
        tournaments: rows[0], users: rows[1], wagers: rows[2], rankedMatches: rows[3],
        tournamentMatches: rows[4], xpStats: rows[5], transactions: rows[6],
      });
      setLoading(false);
    };
    load();
    const refresh = window.setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, HOME_REFRESH_INTERVAL);
    return () => { cancelled = true; window.clearInterval(refresh); };
  }, []);

  useEffect(() => {
    const clock = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(clock);
  }, []);

  const upcoming = useMemo(() => data.tournaments
    .filter((tournament) => !["completed", "cancelled", "draft"].includes(String(tournament.status || "").toLowerCase()))
    .sort((a, b) => {
      const aDate = new Date(a.start_date || 8640000000000000).getTime();
      const bDate = new Date(b.start_date || 8640000000000000).getTime();
      return aDate - bDate;
    })
    .slice(0, 6), [data.tournaments]);

  const ladder = useMemo(() => data.users
    .filter((user) => number(user.tournament_wins) > 0)
    .sort((a, b) => number(b.tournament_wins) - number(a.tournament_wins) || number(b.lifetime_earnings) - number(a.lifetime_earnings))
    .slice(0, 16), [data.users]);

  const matches = useMemo(() => [
    ...data.wagers.filter(isOpen).map((match) => ({ ...match, homeKind: "wager" })),
    ...data.rankedMatches.filter(isOpen).map((match) => ({ ...match, homeKind: "ranked" })),
  ].sort((a, b) => new Date(b.created_date || 0).getTime() - new Date(a.created_date || 0).getTime()).slice(0, 8), [data.wagers, data.rankedMatches]);

  const stats = useMemo(() => {
    const paidTypes = new Set(["wager_payout", "tournament_prize", "prize", "payout", "eights_monthly_prize"]);
    const cashPaidOut = data.transactions
      .filter((transaction) => paidTypes.has(String(transaction.type || transaction.transaction_type || "").toLowerCase()))
      .reduce((sum, transaction) => sum + Math.abs(number(transaction.amount)), 0);
    return {
      matchesPlayed: data.wagers.filter(isCompleted).length + data.rankedMatches.filter(isCompleted).length + data.tournamentMatches.filter(isCompleted).length,
      tournaments: data.tournaments.filter((tournament) => String(tournament.status || "").toLowerCase() !== "draft").length,
      cashPaidOut,
      totalXp: data.xpStats.reduce((sum, row) => sum + number(row.total_xp ?? row.xp), 0),
    };
  }, [data]);

  if (loading) {
    return <PageLoader label="Loading dashboard" />;
  }

  return (
    <main className="mx-auto w-full max-w-[1540px] space-y-8 px-3 pb-12 pt-4 sm:px-5 lg:space-y-10 lg:px-7">
      <FeaturedNews />
      <StatsStrip stats={stats} />
      <TournamentRows tournaments={upcoming} now={now} loading={loading} />
      <TournamentLadder players={ladder} loading={loading} />
      <Matchfinder matches={matches} loading={loading} />
    </main>
  );
}
