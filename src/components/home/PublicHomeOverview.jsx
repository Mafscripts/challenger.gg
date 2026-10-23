import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Crown,
  ShieldCheck,
  Users,
  Coins,
  Crosshair,
  Gamepad2,
  LockKeyhole,
  Trophy,
  Zap,
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import PlayerAvatarImage from "@/components/ui/PlayerAvatarImage";
import "@/styles/home-refresh.css";
import { useAuth } from "@/lib/AuthContext";
import HomeModeNavigation from "@/components/home/HomeModeNavigation";
import PlayPreparation from "@/components/competition/PlayPreparation";

const number = (value) => Number(value || 0);
const formatNumber = (value) => Math.round(Math.max(0, number(value))).toLocaleString();
const formatMoney = (value) => `$${Math.max(0, number(value)).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const blackOps7Artwork = "/assets/tournaments/black-ops-7.webp";

const tournamentImage = (tournament) => {
  if (tournament?.image_url) return tournament.image_url;
  if (tournament?.game_id === "mw4") return "/assets/mw4/hero.webp";
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
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      previous.current = to;
      setShown(to);
      return undefined;
    }
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
    <div className="home-section-heading mb-4 flex items-end justify-between gap-4">
      <div><p className="font-mono text-[9px] font-black uppercase tracking-[0.22em] text-cyan">{eyebrow}</p><h2 className="mt-1 font-heading text-2xl font-black text-white sm:text-3xl">{title}</h2></div>
      <Link to={href} className="home-section-link inline-flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.14em] text-vapor transition-colors hover:text-cyan">
        {!isAuthenticated && <LockKeyhole className="h-3 w-3" />} View all <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}

export default function PublicHomeOverview() {
  const { isAuthenticated, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [data, setData] = useState({ stats: {}, tournaments: [], ladder: [], matches: [] });

  useEffect(() => {
    let mounted = true;
    base44.public.homeOverview()
      .then((result) => { if (mounted) setData(result || { stats: {}, tournaments: [], ladder: [], matches: [] }); })
      .catch(() => { if (mounted) setLoadError(true); })
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
  const visibleLadder = useMemo(() => (data.ladder || []).slice(0, 5), [data.ladder]);

  return (
    <div className="home-hub landing-arena home-refresh relative overflow-hidden">
      <div className="home-hub-container relative">
        <section className="home-hero home-arena-hero">
          <img src="/assets/mw4/hero.webp" alt="" fetchPriority="high" decoding="async" className="home-arena-art" />
          <div className="home-arena-copy">
            <p className="home-kicker"><span className="home-live-dot" />MW4 is live <span className="home-kicker-divider">/</span> Your competitive home</p>
            <h1>{isAuthenticated ? <>Your next match.<br /><span>Your next win.</span></> : <>Built for the<br /><span>way you compete.</span></>}</h1>
            <p className="home-arena-description">{isAuthenticated ? "Choose your game, bring your roster and get back in the arena. Free 8s, XP Matches, Ranked and tournaments — all in one place." : "Find your squad. Play your game. Build your name. Start with Free 8s or climb the XP ladder across MW4, MW3, Black Ops 6 and Black Ops 7."}</p>
            <div className="home-arena-actions"><Link to={isAuthenticated ? "/xp?game=mw4" : "/register"} className="home-primary-cta"><Gamepad2 size={17} />{isAuthenticated ? "Find a match" : "Create your free account"}<ArrowRight size={16} /></Link><Link to={isAuthenticated ? "/my-matches" : protectedHref("/ranked/8s?game=mw4")} className="home-secondary-cta">{isAuthenticated ? "My matches" : "Explore Free 8s"}<ArrowRight size={15} /></Link></div>
            <div className="home-game-line"><strong>MW4</strong><span>MW3</span><span>Black Ops 6</span><span>Black Ops 7</span></div>
          </div>
          <aside className="home-arena-aside">
            <div className="home-aside-heading">{isAuthenticated ? <><span className="home-welcome-avatar"><PlayerAvatarImage user={user} /></span><div><p>Welcome back</p><h2>{user?.display_name || user?.username || "Competitor"}</h2></div></> : <><ShieldCheck size={24} /><div><p>Your first step</p><h2>A place to prove it.</h2></div></>}</div>
            {isAuthenticated ? <div className="home-aside-links">{[["Free 8s", "Jump in and play", "/ranked/8s?game=mw4", Users], ["XP Matches", "Build your player and team XP", "/xp?game=mw4", Zap], ["Tournaments", "Bring your best roster", "/tournaments", Trophy]].map(([title, detail, path, Icon]) => <Link key={path} to={path}><Icon size={18} /><span><strong>{title}</strong><small>{detail}</small></span><ArrowRight size={15} /></Link>)}</div> : <ol className="home-start-steps"><li><span>01</span><div><strong>Make it yours</strong><p>Create an account and add your gaming ID.</p></div></li><li><span>02</span><div><strong>Find your competition</strong><p>Choose your game and the way you want to play.</p></div></li><li><span>03</span><div><strong>Make your mark</strong><p>Compete, earn results and climb your ladder.</p></div></li></ol>}
            <p className="home-aside-foot">{isAuthenticated ? "Your game. Your roster. Your progression." : "Already a competitor?"}{!isAuthenticated && <Link to="/login">Sign in <ArrowRight size={13} /></Link>}</p>
          </aside>
        </section>
        <HomeModeNavigation resolveHref={protectedHref} />
        <section className="home-champions" aria-labelledby="home-champions-title">
          <div className="home-section-heading"><div><p className="home-kicker">The ones to chase</p><h2 id="home-champions-title">Leading the arena<span className="text-cyan">.</span></h2></div><Link to={protectedHref("/leaderboards")} className="home-section-link">All rankings <ArrowRight size={14} /></Link></div>
          <div className="home-champion-grid">{[
            { id: "xp", title: "XP player", scope: "MW4 · Personal XP", unit: "XP", icon: Zap, tone: "purple", path: "/leaderboards?tab=xp" },
            { id: "wagers", title: "Cash Match player", scope: "All games · All-time earnings", unit: "earned", icon: Coins, tone: "green", path: "/leaderboards?tab=wagers" },
            { id: "tournaments", title: "Tournament player", scope: "All games · All-time tournament wins", unit: "wins", icon: Trophy, tone: "gold", path: "/tournaments" },
          ].map(({ id, title, scope, unit, icon: Icon, tone, path }) => {
            const player = data.champions?.[id];
            return <article key={id} className="home-champion-card" data-tone={tone}>
              <div className="home-champion-top"><span><Icon size={15} />#1 {title}</span><Crown size={22} /></div>
              {loading ? <div className="home-champion-loading" role="status">Loading leader…</div> : player ? <Link to={protectedHref(`/profile/${encodeURIComponent(player.username || player.id)}`)} className="home-champion-player"><span className="home-champion-avatar"><PlayerAvatarImage user={player} src={player.avatar_url} /></span><div><strong>{player.display_name}</strong><span>{id === "wagers" ? formatMoney(player.score) : formatNumber(player.score)} <small>{unit}</small></span></div><ArrowRight size={16} /></Link> : <div className="home-champion-empty"><strong>{loadError || data.champions_available === false ? "Rankings unavailable" : "The top spot is open"}</strong><p>{loadError || data.champions_available === false ? "Check the leaderboard for the latest results." : "The first results will put a name here."}</p></div>}
              <div className="home-champion-bottom"><span>{scope}</span><Link to={protectedHref(path)}>View ladder <ArrowRight size={12} /></Link></div>
            </article>;
          })}</div>
        </section>
        {isAuthenticated && <details className="home-setup-panel"><summary><span><ShieldCheck size={17} />Ready for your next match?</span><span>Check your setup</span></summary><PlayPreparation /></details>}
        {loadError && <p className="home-data-error" role="alert">Live results could not be loaded. <button type="button" onClick={() => window.location.reload()}>Try again</button></p>}

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {statCards.map(({ label, value, icon: Icon, tone, money }) => (
            <article key={label} className="home-stat-card landing-stat-card relative overflow-hidden rounded-xl border border-white/10 bg-card px-4 py-4 sm:px-5">
              <div className="flex items-center gap-2"><span className={`grid h-8 w-8 place-items-center rounded-lg border border-white/10 bg-white/[0.035] ${tone}`}><Icon className="h-4 w-4" /></span><span className="font-mono text-[8px] font-black uppercase tracking-[0.16em] text-vapor">{label}</span></div>
              <p className="mt-3 font-heading text-2xl font-black text-white sm:text-3xl">{loading ? "—" : <AnimatedTotal value={value} money={money} />}</p>
            </article>
          ))}
        </section>

        <section>
          <PublicSectionTitle eyebrow="Compete" title="Upcoming tournaments" target="/tournaments" isAuthenticated={isAuthenticated} />
          <div className="home-panel overflow-hidden rounded-2xl border border-white/10 bg-card">
            {loading && [0, 1, 2].map((item) => <div key={item} className="h-[78px] animate-pulse border-b border-white/5 bg-white/[0.02]" />)}
            {!loading && data.tournaments.length === 0 && <div className="p-8 text-center text-sm text-vapor">No upcoming tournaments are scheduled yet.</div>}
            {data.tournaments.map((tournament) => (
              <Link key={tournament.id} to={protectedHref(`/tournaments/${tournament.id}`)} className="group grid min-h-[78px] grid-cols-[52px_1fr_auto] items-center gap-3 border-b border-white/[0.07] px-3 py-3 last:border-0 sm:grid-cols-[56px_minmax(0,1fr)_100px_90px_140px] sm:px-5">
                <img src={tournamentImage(tournament)} alt="" className="h-[52px] w-[52px] shrink-0 rounded-lg border border-white/10 bg-background object-contain object-center" loading="lazy" />
                <div className="min-w-0"><div className="flex min-w-0 items-center gap-2"><h3 className="truncate text-sm font-black text-white transition-colors group-hover:text-orange">{tournament.name}</h3></div><p className="mt-1 truncate text-[10px] text-vapor">{tournament.team_size || "Team"} · {tournament.game_mode_display || tournament.game_mode || "Competitive"}</p></div>
                <PreviewMetric label="Prize" value={formatMoney(tournament.prize_pool)} tone="text-green" />
                <PreviewMetric label="Teams" value={`${tournament.registered_teams} / ${tournament.max_teams || "—"}`} extra="hidden sm:block" />
                <div className="hidden border-l border-white/10 pl-5 sm:block"><p className="font-mono text-[8px] font-black uppercase tracking-wider text-vapor">Starts</p><p className="mt-1 font-mono text-[10px] font-black text-cyan">{formatDate(tournament.start_date)}</p></div>
                {!isAuthenticated && <LockKeyhole className="h-4 w-4 text-vapor sm:hidden" />}
              </Link>
            ))}
          </div>
        </section>

        <section>
          <PublicSectionTitle eyebrow="All-time results" title="Tournament standouts" target="/leaderboards" isAuthenticated={isAuthenticated} />
          <div className="home-panel home-preview-ladder overflow-hidden rounded-2xl border border-white/10 bg-card">
            <div className="grid grid-cols-[48px_1fr_80px_100px] border-b border-white/10 bg-white/[0.025] px-4 py-3 font-mono text-[8px] font-black uppercase tracking-wider text-vapor sm:px-5"><span>Rank</span><span>Competitor</span><span className="text-center">Wins</span><span className="text-right">Earnings</span></div>
            {loading && [0, 1, 2, 3].map((item) => <div key={item} className="h-14 animate-pulse border-b border-white/5 bg-white/[0.02]" />)}
            {!loading && visibleLadder.length === 0 && <div className="p-8 text-center text-sm text-vapor">Tournament results will appear here after the first wins.</div>}
            {visibleLadder.map((player, index) => (
              <Link key={player.id} to={protectedHref(`/profile/${player.username || player.id}`)} className="group grid min-h-14 grid-cols-[48px_1fr_80px_100px] items-center border-b border-white/[0.06] px-4 last:border-0 sm:px-5">
                <span className={`font-mono text-xs font-black ${index < 3 ? "text-orange" : "text-vapor"}`}>#{index + 1}</span>
                <div className="flex min-w-0 items-center gap-3"><span className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-lg border border-white/10 bg-white/[0.04]" ><PlayerAvatarImage user={player} src={player.avatar_url} /></span><span data-name-effect={player.display_name_color || undefined} style={player.display_name_color ? { "--player-name-color": player.display_name_color } : undefined} className={`player-name-wrap text-sm font-black text-white group-hover:text-orange ${player.display_name_color ? "player-name-color" : ""}`}>{player.display_name}</span></div>
                <span className="text-center font-mono text-xs font-black text-cyan">{player.tournament_wins}</span>
                <span className="text-right font-mono text-xs font-black text-green">{formatMoney(player.lifetime_earnings)}</span>
              </Link>
            ))}
          </div>
        </section>

        <section>
          <PublicSectionTitle eyebrow="Ready to play" title="Matchfinder" target="/matchfinder" isAuthenticated={isAuthenticated} />
          <div className="home-panel overflow-hidden rounded-2xl border border-white/10 bg-card">
            {loading && [0, 1].map((item) => <div key={item} className="h-[68px] animate-pulse border-b border-white/5 bg-white/[0.02]" />)}
            {!loading && data.matches.length === 0 && <div className="p-8 text-center text-sm text-vapor">No open matches right now.</div>}
            {data.matches.map((match) => {
              const target = match.kind === "ranked" ? `/ranked-match/${match.id}` : ["8s", "money8s"].includes(match.match_type) ? `/8s-match/${match.id}` : `/wagers-match/${match.id}`;
              return (
                <Link key={`${match.kind}-${match.id}`} to={protectedHref(target)} className="group grid min-h-[68px] grid-cols-[38px_1fr_auto] items-center gap-3 border-b border-white/[0.07] px-4 py-3 last:border-0 sm:grid-cols-[38px_1fr_110px_110px_90px] sm:px-5">
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
          <section className="home-final-cta landing-final-cta relative overflow-hidden rounded-2xl border border-cyan/20 bg-card px-6 text-center sm:px-10">
            <div className="relative z-10"><p className="font-mono text-[9px] font-black uppercase tracking-[0.22em] text-cyan">Your season starts here</p><h2 className="mt-3 font-heading text-3xl font-black text-white sm:text-4xl">Ready to compete?</h2><p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-vapor">Create an account to open tournaments, join matches, build your team and start building your competitive record.</p><div className="mt-6 flex flex-wrap justify-center gap-3"><Link to="/register" className="home-primary-cta">Register free</Link><Link to="/login" className="home-secondary-cta">Login</Link></div></div>
          </section>
        )}
      </div>
    </div>
  );
}

function PreviewMetric({ label, value, tone = "text-white", extra = "" }) {
  return <div className={`border-l border-white/10 pl-4 ${extra}`}><p className="font-mono text-[8px] font-black uppercase tracking-wider text-vapor">{label}</p><p className={`mt-1 truncate font-mono text-[10px] font-black ${tone}`}>{value}</p></div>;
}
