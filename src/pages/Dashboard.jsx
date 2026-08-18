import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  CalendarDays,
  Crosshair,
  Gamepad2,
  History,
  Info,
  Radio,
  Swords,
  Target,
  Trophy,
  Wallet,
  Zap,
} from "lucide-react";
import RankBadge from "@/components/ui/RankBadge";
import { base44 } from "@/api/base44Client";
import { getRankForElo, getRankProgress } from "@/lib/ranks";
import { bootstrapCurrentUser } from "@/lib/userBootstrap";

const heroImage = "https://media.base44.com/images/public/6a38e7860fd3c41494b9c695/902c6e4df_generated_5b6cee19.png";

const formatMoney = (value) => `$${Number(value || 0).toLocaleString(undefined, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})}`;
const formatNumber = (value) => Number(value || 0).toLocaleString();
const displayName = (user) => user?.display_name || user?.full_name || user?.username || user?.email || "your account";
const shortName = (user) => displayName(user).split("@")[0];

const yieldForPagePaint = () => new Promise((resolve) => {
  if (typeof window === "undefined") {
    resolve();
    return;
  }
  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(resolve, { timeout: 600 });
    return;
  }
  window.setTimeout(resolve, 0);
});

const formatDate = (value) => {
  if (!value) return "Start time TBD";
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const formatTimeAgo = (value) => {
  if (!value) return "";
  const diff = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(diff)) return "";
  const minutes = Math.max(0, Math.floor(diff / 60000));
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
};

const matchLabel = (match) => {
  if (match.match_type === "ranked" || match.entity_type === "ranked") return "Ranked Match";
  if (match.match_type === "8s") return "8s Lobby";
  if (match.match_type === "xp") return "XP Match";
  return match.game_mode_display || match.game_mode || "Wager Match";
};

const matchRoute = (match) => {
  if (match.match_type === "ranked" || match.entity_type === "ranked") return `/ranked-match/${match.id}`;
  if (match.match_type === "8s") return `/8s-match/${match.id}`;
  if (match.match_type === "xp") return `/xp-match/${match.id}`;
  return `/wagers-match/${match.id}`;
};

const matchResult = (match, userId) => {
  const status = String(match.status || "").toLowerCase();
  if (status.includes("cancel")) return { label: "Cancelled", className: "border-red-500/20 bg-red-500/10 text-red-300" };
  if (!["completed", "complete", "resolved"].includes(status)) {
    return { label: "In progress", className: "border-blue-400/20 bg-blue-400/10 text-blue-300" };
  }

  const winnerIds = [match.winner_id, match.winning_user_id, match.reported_winner_id, match.winner_team_id]
    .filter(Boolean)
    .map(String);
  if (winnerIds.includes(String(userId))) return { label: "Win", className: "border-green/20 bg-green/10 text-green" };
  if (winnerIds.length > 0) return { label: "Loss", className: "border-red-500/20 bg-red-500/10 text-red-300" };
  return { label: "Completed", className: "border-white/10 bg-white/[0.04] text-vapor" };
};

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [rankedStats, setRankedStats] = useState(null);
  const [xpStats, setXpStats] = useState(null);
  const [recentMatches, setRecentMatches] = useState([]);
  const [upcomingTournaments, setUpcomingTournaments] = useState([]);
  const [loading, setLoading] = useState(true);
  const dataLoadInFlight = useRef(false);

  useEffect(() => {
    const loadData = async () => {
      if (dataLoadInFlight.current) return;
      dataLoadInFlight.current = true;

      try {
        const userData = await bootstrapCurrentUser();
        setUser(userData);

        if (!userData?.id) return;

        const [walletRows, rankedRows, xpRows] = await Promise.all([
          base44.entities.Wallet.filter({ user_id: userData.id }, "-created_date", 1).catch(() => []),
          base44.entities.RankedStats.filter({ user_id: userData.id }, "-season", 1).catch(() => []),
          base44.entities.XPStats.filter({ user_id: userData.id }, "-season", 1).catch(() => []),
        ]);

        setWallet(walletRows[0] || null);
        setRankedStats(rankedRows[0] || null);
        setXpStats(xpRows[0] || null);
        setLoading(false);

        await yieldForPagePaint();

        const [hostedWagers, challengedWagers, hostedRanked, challengedRanked, tournaments] = await Promise.all([
          base44.entities.Wager.filter({ host_id: userData.id }, "-created_date", 20).catch(() => []),
          base44.entities.Wager.filter({ challenger_id: userData.id }, "-created_date", 20).catch(() => []),
          base44.entities.RankedMatch.filter({ host_id: userData.id }, "-created_date", 20).catch(() => []),
          base44.entities.RankedMatch.filter({ challenger_id: userData.id }, "-created_date", 20).catch(() => []),
          base44.entities.Tournament.filter({ status: "open" }, "-start_date", 8).catch(() => []),
        ]);

        const combinedMatches = [...hostedWagers, ...challengedWagers, ...hostedRanked, ...challengedRanked]
          .filter((match, index, list) => list.findIndex((item) => item.id === match.id) === index)
          .sort((a, b) => new Date(b.match_completed_date || b.completed_date || b.accepted_date || b.created_date || 0)
            - new Date(a.match_completed_date || a.completed_date || a.accepted_date || a.created_date || 0))
          .slice(0, 8);

        setRecentMatches(combinedMatches);
        setUpcomingTournaments(tournaments || []);
      } catch (error) {
        console.error("Failed to load dashboard data:", error);
      } finally {
        dataLoadInFlight.current = false;
        setLoading(false);
      }
    };

    loadData();
    const refreshVisibleDashboard = () => {
      if (document.visibilityState === "visible") loadData();
    };
    const interval = window.setInterval(refreshVisibleDashboard, 60000);
    document.addEventListener("visibilitychange", refreshVisibleDashboard);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshVisibleDashboard);
    };
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-blue-400/15 border-t-blue-400" />
          <p className="text-vapor">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="premium-panel max-w-md rounded-3xl p-8 text-center">
          <Info className="mx-auto mb-4 h-10 w-10 text-blue-400" />
          <h1 className="mb-2 text-2xl font-black">Login Required</h1>
          <p className="mb-5 text-sm text-vapor">Log in or create an account to open your dashboard.</p>
          <div className="flex items-center justify-center gap-3">
            <Link to="/login" className="rounded-lg bg-secondary px-4 py-2 text-sm font-semibold text-vapor hover:text-foreground">Login</Link>
            <Link to="/register" className="rounded-lg bg-blue-500 px-4 py-2 text-sm font-bold text-white">Register</Link>
          </div>
        </div>
      </div>
    );
  }

  const elo = Number(rankedStats?.elo || 0);
  const rank = getRankForElo(elo);
  const wins = Number(rankedStats?.wins || 0);
  const losses = Number(rankedStats?.losses || 0);
  const totalRanked = wins + losses;
  const rankedWinRate = totalRanked > 0 ? Math.round((wins / totalRanked) * 100) : 0;
  const bestStreak = Number(rankedStats?.best_streak || rankedStats?.win_streak || 0);
  const xpLevel = Number(xpStats?.level || user?.xp_level || 1);
  const currentXp = Number(xpStats?.current_xp ?? user?.current_xp ?? 0);
  const xpToNext = Number(xpStats?.xp_to_next_level || 1000);
  const xpProgress = Math.min(100, Math.round((currentXp / Math.max(1, currentXp + xpToNext)) * 100));
  const walletBalance = Number(wallet?.available_balance ?? 0);
  const tournamentWins = Number(user?.tournament_wins || 0);

  const gameModes = [
    {
      title: "Ranked",
      description: "Matchmaking, ELO and competitive divisions.",
      meta: `${formatNumber(elo)} ELO`,
      to: "/ranked",
      icon: Crosshair,
    },
    {
      title: "Wagers",
      description: "Create or accept matches with real stakes.",
      meta: `${formatMoney(walletBalance)} balance`,
      to: "/wagers",
      icon: Swords,
    },
    {
      title: "Tournaments",
      description: "Enter daily brackets and compete for prizes.",
      meta: `${upcomingTournaments.length} open now`,
      to: "/tournaments",
      icon: Trophy,
    },
    {
      title: "8s Lobbies",
      description: "Fast competitive lobbies with custom teams.",
      meta: "Find a lobby",
      to: "/8s",
      icon: Gamepad2,
    },
    {
      title: "XP Ladder",
      description: "Play, gain XP and climb the account ladder.",
      meta: `Level ${xpLevel}`,
      to: "/xp",
      icon: Zap,
    },
    {
      title: "CDL Live",
      description: "Follow pro matches, maps and live results.",
      meta: "Watch live",
      to: "/cdl",
      icon: Radio,
    },
  ];

  return (
    <div className="dashboard-page min-h-screen py-7 lg:py-9">
      <div className="dashboard-container">
        <main className="space-y-7">
          <DashboardHero user={user} />

          <StatsOverview
            rank={rank}
            elo={elo}
            wins={wins}
            losses={losses}
            winRate={rankedWinRate}
            totalMatches={totalRanked}
            xpLevel={xpLevel}
            xpProgress={xpProgress}
            walletBalance={walletBalance}
            tournamentWins={tournamentWins}
            bestStreak={bestStreak}
          />

          <GameHub modes={gameModes} />

          <div className="dashboard-lower-grid">
            <RecentCompetition matches={recentMatches} userId={user.id} />
            <OpenTournaments tournaments={upcomingTournaments} />
          </div>
        </main>
      </div>
    </div>
  );
}

function DashboardHero({ user }) {
  return (
    <section className="premium-panel relative overflow-hidden rounded-[1.75rem] px-5 py-6 sm:px-7 lg:px-8">
      <img src={heroImage} alt="" className="absolute inset-0 h-full w-full object-cover object-right opacity-[0.13]" />
      <div className="absolute inset-0 bg-gradient-to-r from-background/95 via-background/85 to-background/55" />
      <div className="pointer-events-none absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-blue-400/40 to-transparent" />
      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-blue-300">Personal dashboard</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">Welcome back, {shortName(user)}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-vapor">
            Your competitive stats and every way to play, together in one clear starting point.
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <Link to="/profile" className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.14em] text-vapor transition-colors hover:border-blue-400/25 hover:bg-blue-400/[0.08] hover:text-blue-300">
            Full profile <ArrowRight className="h-3.5 w-3.5" />
          </Link>
          <Link to="/leaderboards" className="inline-flex items-center gap-2 rounded-xl bg-blue-500 px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.14em] text-white transition-colors hover:bg-blue-400">
            Leaderboards <Trophy className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}

function StatsOverview({ rank, elo, wins, losses, winRate, totalMatches, xpLevel, xpProgress, walletBalance, tournamentWins, bestStreak }) {
  const rankProgress = getRankProgress(elo);
  const stats = [
    { label: "Ranked record", value: `${wins}-${losses}`, detail: `${totalMatches} matches`, icon: Swords, to: "/ranked" },
    { label: "Win rate", value: `${winRate}%`, detail: "Ranked performance", icon: Target, to: "/ranked" },
    { label: "XP level", value: xpLevel, detail: `${xpProgress}% to next level`, icon: Zap, to: "/xp" },
    { label: "Wallet", value: formatMoney(walletBalance), detail: "Available balance", icon: Wallet, to: "/wallet" },
    { label: "Tournament wins", value: tournamentWins, detail: "Career victories", icon: Trophy, to: "/tournaments" },
    { label: "Best streak", value: bestStreak, detail: "Ranked win streak", icon: History, to: "/ranked" },
  ];

  return (
    <section>
      <SectionHeading eyebrow="Performance" title="Your stats" description="A quick read of where you stand right now." to="/profile" action="Detailed stats" />
      <div className="dashboard-stats-layout premium-panel rounded-[1.75rem] p-4 sm:p-5">
        <Link to="/ranked" className="group relative overflow-hidden rounded-2xl border border-blue-400/15 bg-blue-400/[0.045] p-5 transition-colors hover:border-blue-400/30 hover:bg-blue-400/[0.075]">
          <div className="flex items-center gap-4">
            <span className="flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl border border-white/[0.06] bg-black/20">
              <RankBadge rank={rank.tier} division={rank.division} elo={elo} size="md" showLabel={false} />
            </span>
            <div className="min-w-0">
              <p className="text-[9px] font-black uppercase tracking-[0.18em] text-vapor">Current rank</p>
              <p className="mt-1 truncate text-xl font-black text-white">{rank.name}</p>
              <p className="mt-1 font-mono text-sm font-black text-blue-300">{formatNumber(elo)} ELO</p>
            </div>
          </div>
          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between text-[9px] font-bold uppercase tracking-wider text-vapor">
              <span>Division progress</span>
              <span>{rankProgress}%</span>
            </div>
            <ProgressBar value={rankProgress} />
          </div>
        </Link>

        <div className="dashboard-stat-card-grid">
          {stats.map((stat) => <StatCard key={stat.label} {...stat} />)}
        </div>
      </div>
    </section>
  );
}

function StatCard({ label, value, detail, icon: Icon, to }) {
  return (
    <Link to={to} className="premium-card group flex min-h-36 flex-col rounded-2xl p-4 hover:border-blue-400/20">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.06] bg-white/[0.035] text-blue-300 transition-colors group-hover:border-blue-400/20 group-hover:bg-blue-400/10">
        <Icon className="h-4 w-4" />
      </span>
      <div className="mt-auto pt-4">
        <p className="text-[9px] font-black uppercase tracking-[0.16em] text-vapor">{label}</p>
        <p className="mt-1 truncate font-mono text-xl font-black text-white">{value}</p>
        <p className="mt-1 truncate text-[10px] text-vapor">{detail}</p>
      </div>
    </Link>
  );
}

function GameHub({ modes }) {
  return (
    <section>
      <SectionHeading eyebrow="Play" title="Game Hub" description="Choose a mode and go straight to the action." />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {modes.map((mode) => <GameModeCard key={mode.title} {...mode} />)}
      </div>
    </section>
  );
}

function GameModeCard({ title, description, meta, to, icon: Icon }) {
  return (
    <Link to={to} className="premium-card group relative flex min-h-40 overflow-hidden rounded-2xl p-5 hover:border-blue-400/25">
      <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-blue-500/10 opacity-0 blur-3xl transition-opacity group-hover:opacity-100" />
      <div className="relative flex w-full items-start gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-blue-400/15 bg-blue-400/[0.065] text-blue-300 transition-colors group-hover:border-blue-400/30 group-hover:bg-blue-400/10">
          <Icon className="h-5 w-5" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col self-stretch">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-base font-black text-white">{title}</h3>
            <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-vapor transition-all group-hover:translate-x-1 group-hover:text-blue-300" />
          </div>
          <p className="mt-1.5 text-xs leading-5 text-vapor">{description}</p>
          <p className="mt-auto pt-4 text-[9px] font-black uppercase tracking-[0.15em] text-blue-300">{meta}</p>
        </div>
      </div>
    </Link>
  );
}

function RecentCompetition({ matches, userId }) {
  return (
    <DashboardPanel title="Recent competition" description="Your latest ranked and wager activity." to="/profile" action="Full history">
      {matches.length === 0 ? (
        <EmptyState icon={History} text="Your recent matches will appear here." />
      ) : (
        <div className="divide-y divide-white/[0.055]">
          {matches.slice(0, 6).map((match) => {
            const result = matchResult(match, userId);
            return (
              <Link key={match.id} to={matchRoute(match)} className="group flex items-center gap-3 px-1 py-3.5 first:pt-0 last:pb-0">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/[0.06] bg-white/[0.035] text-blue-300">
                  <Swords className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-white transition-colors group-hover:text-blue-300">{matchLabel(match)}</p>
                  <p className="mt-0.5 truncate text-[10px] text-vapor">{match.final_map_name || match.map || match.game_mode || "Match details"}</p>
                </div>
                <div className="shrink-0 text-right">
                  <span className={`inline-flex rounded-md border px-2 py-1 text-[8px] font-black uppercase tracking-wider ${result.className}`}>{result.label}</span>
                  <p className="mt-1 text-[9px] text-vapor">{formatTimeAgo(match.match_completed_date || match.completed_date || match.created_date)}</p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </DashboardPanel>
  );
}

function OpenTournaments({ tournaments }) {
  return (
    <DashboardPanel title="Open tournaments" description="Daily competitions that are accepting entries." to="/tournaments" action="View all">
      {tournaments.length === 0 ? (
        <EmptyState icon={Trophy} text="No tournaments are open right now." />
      ) : (
        <div className="divide-y divide-white/[0.055]">
          {tournaments.slice(0, 5).map((tournament) => (
            <Link key={tournament.id} to={`/tournaments?tournament=${encodeURIComponent(tournament.id)}`} className="group flex items-center gap-3 px-1 py-3.5 first:pt-0 last:pb-0">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-yellow-400/15 bg-yellow-400/[0.06] text-yellow-400">
                <Trophy className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-white transition-colors group-hover:text-blue-300">{tournament.name || "Tournament"}</p>
                <p className="mt-0.5 flex items-center gap-1.5 truncate text-[10px] text-vapor">
                  <CalendarDays className="h-3 w-3 shrink-0" /> {formatDate(tournament.start_date)}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-mono text-xs font-black text-white">{formatMoney(tournament.prize_pool || tournament.prize || 0)}</p>
                <p className="mt-1 text-[8px] font-black uppercase tracking-wider text-vapor">Prize pool</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </DashboardPanel>
  );
}

function SectionHeading({ eyebrow, title, description, to = null, action = "" }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4 px-1">
      <div>
        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-blue-300">{eyebrow}</p>
        <h2 className="mt-1 text-xl font-black tracking-tight text-white">{title}</h2>
        <p className="mt-1 text-xs text-vapor">{description}</p>
      </div>
      {to && (
        <Link to={to} className="hidden items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.14em] text-vapor transition-colors hover:text-blue-300 sm:inline-flex">
          {action} <ArrowRight className="h-3 w-3" />
        </Link>
      )}
    </div>
  );
}

function DashboardPanel({ title, description, to, action, children }) {
  return (
    <section className="premium-panel h-full rounded-[1.5rem] p-5 sm:p-6">
      <div className="relative mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-black text-white">{title}</h2>
          <p className="mt-1 text-[11px] text-vapor">{description}</p>
        </div>
        <Link to={to} className="inline-flex shrink-0 items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.14em] text-vapor transition-colors hover:text-blue-300">
          {action} <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <div className="relative">{children}</div>
    </section>
  );
}

function ProgressBar({ value }) {
  const width = Math.min(100, Math.max(0, Number(value) || 0));
  return (
    <div className="h-2 overflow-hidden rounded-full bg-black/30 shadow-[inset_0_1px_3px_rgba(0,0,0,.35)]">
      <div className="h-full rounded-full bg-blue-500 shadow-[0_0_16px_rgba(59,130,246,.2)] transition-[width] duration-700" style={{ width: `${width}%` }} />
    </div>
  );
}

function EmptyState({ icon: Icon, text }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/[0.07] bg-white/[0.02] px-4 py-10 text-center">
      <Icon className="mx-auto mb-3 h-8 w-8 text-vapor/25" />
      <p className="text-xs text-vapor">{text}</p>
    </div>
  );
}
