import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  CalendarDays,
  Crosshair,
  History,
  Info,
  Radio,
  Swords,
  Target,
  Trophy,
  Wallet,
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
  return match.game_mode_display || match.game_mode || "Wager Match";
};

const matchRoute = (match) => {
  if (match.match_type === "ranked" || match.entity_type === "ranked") return `/ranked-match/${match.id}`;
  return `/wagers-match/${match.id}`;
};

const hiddenMatchTypes = new Set(["8s", "eights", "xp"]);

const matchResult = (match, userId) => {
  const status = String(match.status || "").toLowerCase();
  if (status.includes("cancel")) return { label: "Cancelled", className: "border-red-500/20 bg-red-500/10 text-red-300" };
  if (!["completed", "complete", "resolved"].includes(status)) {
    return { label: "In progress", className: "border-primary/20 bg-primary/10 text-primary" };
  }

  const winnerIds = [match.winner_id, match.winning_user_id, match.reported_winner_id, match.winner_team_id]
    .filter(Boolean)
    .map(String);
  if (winnerIds.includes(String(userId))) return { label: "Win", className: "border-green/20 bg-green/10 text-green" };
  if (winnerIds.length > 0) return { label: "Loss", className: "border-red-500/20 bg-red-500/10 text-red-300" };
  return { label: "Completed", className: "border-white/10 bg-white/[0.04] text-vapor" };
};

const activeMatchStatuses = new Set([
  "accepted",
  "escrow_paid",
  "ready",
  "in_progress",
  "awaiting_completion",
  "awaiting_host_report",
  "awaiting_challenger_report",
  "awaiting_team_alpha_report",
  "awaiting_team_bravo_report",
  "score_conflict",
  "disputed",
]);

const dashboardTones = {
  cyan: {
    icon: "border-cyan/15 bg-cyan/[0.06] text-cyan group-hover:border-cyan/30 group-hover:bg-cyan/10",
    border: "hover:border-cyan/25",
    arrow: "group-hover:text-cyan",
    text: "text-cyan",
  },
  green: {
    icon: "border-green/15 bg-green/[0.06] text-green group-hover:border-green/30 group-hover:bg-green/10",
    border: "hover:border-green/25",
    arrow: "group-hover:text-green",
    text: "text-green",
  },
  orange: {
    icon: "border-orange/15 bg-orange/[0.06] text-orange group-hover:border-orange/30 group-hover:bg-orange/10",
    border: "hover:border-orange/25",
    arrow: "group-hover:text-orange",
    text: "text-orange",
  },
  yellow: {
    icon: "border-yellow-400/15 bg-yellow-400/[0.06] text-yellow-400 group-hover:border-yellow-400/30 group-hover:bg-yellow-400/10",
    border: "hover:border-yellow-400/25",
    arrow: "group-hover:text-yellow-400",
    text: "text-yellow-400",
  },
  purple: {
    icon: "border-purple-400/15 bg-purple-400/[0.06] text-purple-300 group-hover:border-purple-400/30 group-hover:bg-purple-400/10",
    border: "hover:border-purple-400/25",
    arrow: "group-hover:text-purple-300",
    text: "text-purple-300",
  },
  red: {
    icon: "border-red-400/15 bg-red-400/[0.06] text-red-300 group-hover:border-red-400/30 group-hover:bg-red-400/10",
    border: "hover:border-red-400/25",
    arrow: "group-hover:text-red-300",
    text: "text-red-300",
  },
};

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [rankedStats, setRankedStats] = useState(null);
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

        const [walletRows, rankedRows] = await Promise.all([
          base44.entities.Wallet.filter({ user_id: userData.id }, "-created_date", 1).catch(() => []),
          base44.entities.RankedStats.filter({ user_id: userData.id }, "-season", 1).catch(() => []),
        ]);

        setWallet(walletRows[0] || null);
        setRankedStats(rankedRows[0] || null);
        setLoading(false);

        await yieldForPagePaint();

        const [hostedWagers, challengedWagers, hostedRanked, challengedRanked, tournaments] = await Promise.all([
          base44.entities.Wager.filter({ host_id: userData.id }, "-created_date", 20).catch(() => []),
          base44.entities.Wager.filter({ challenger_id: userData.id }, "-created_date", 20).catch(() => []),
          base44.entities.RankedMatch.filter({ host_id: userData.id }, "-created_date", 20).catch(() => []),
          base44.entities.RankedMatch.filter({ challenger_id: userData.id }, "-created_date", 20).catch(() => []),
          base44.entities.Tournament.filter({ status: "open" }, "-start_date", 8).catch(() => []),
        ]);

        const combinedMatches = [
          ...hostedWagers.map((match) => ({ ...match, entity_type: match.entity_type || "wager" })),
          ...challengedWagers.map((match) => ({ ...match, entity_type: match.entity_type || "wager" })),
          ...hostedRanked.map((match) => ({ ...match, entity_type: "ranked" })),
          ...challengedRanked.map((match) => ({ ...match, entity_type: "ranked" })),
        ]
          .filter((match) => !hiddenMatchTypes.has(String(match.match_type || "").toLowerCase()))
          .filter((match, index, list) => list.findIndex((item) => `${item.entity_type}:${item.id}` === `${match.entity_type}:${match.id}`) === index)
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
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-primary/15 border-t-primary" />
          <p className="text-vapor">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="premium-panel max-w-md rounded-3xl p-8 text-center">
          <Info className="mx-auto mb-4 h-10 w-10 text-primary" />
          <h1 className="mb-2 text-2xl font-black">Login Required</h1>
          <p className="mb-5 text-sm text-vapor">Log in or create an account to open your dashboard.</p>
          <div className="flex items-center justify-center gap-3">
            <Link to="/login" className="rounded-lg bg-secondary px-4 py-2 text-sm font-semibold text-vapor hover:text-foreground">Login</Link>
            <Link to="/register" className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90">Register</Link>
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
  const walletBalance = Number(wallet?.available_balance ?? 0);
  const tournamentWins = Number(user?.tournament_wins || 0);
  const activeMatches = recentMatches.filter((match) => activeMatchStatuses.has(String(match.status || "").toLowerCase()));

  const gameModes = [
    {
      title: "Ranked",
      description: "Matchmaking, ELO and competitive divisions.",
      meta: `${formatNumber(elo)} ELO`,
      to: "/ranked",
      icon: Crosshair,
      tone: "orange",
    },
    {
      title: "Wagers",
      description: "Create or accept matches with real stakes.",
      meta: `${formatMoney(walletBalance)} balance`,
      to: "/wagers",
      icon: Swords,
      tone: "green",
    },
    {
      title: "Tournaments",
      description: "Enter daily brackets and compete for prizes.",
      meta: `${upcomingTournaments.length} open now`,
      to: "/tournaments",
      icon: Trophy,
      tone: "yellow",
    },
    {
      title: "CDL Live",
      description: "Follow pro matches, maps and live results.",
      meta: "Watch live",
      to: "/cdl",
      icon: Radio,
      tone: "red",
    },
  ];

  return (
    <div className="dashboard-page min-h-screen py-7 lg:py-9">
      <div className="dashboard-container">
        <main className="space-y-7">
          <DashboardHero user={user} />

          <CompetitionNow matches={activeMatches} />

          <StatsOverview
            rank={rank}
            elo={elo}
            wins={wins}
            losses={losses}
            winRate={rankedWinRate}
            totalMatches={totalRanked}
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
    <section className="dark-focus dark-media relative overflow-hidden rounded-[1.25rem] px-5 py-7 sm:px-7 lg:px-8">
      <img src={heroImage} alt="" className="absolute inset-0 h-full w-full object-cover object-right opacity-[0.19]" />
      <div className="absolute inset-0 bg-gradient-to-r from-[#202a35] via-[#202a35]/95 to-[#202a35]/65" />
      <div className="pointer-events-none absolute inset-y-0 left-0 w-1 bg-primary" />
      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-primary">Personal dashboard</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">Welcome back, {shortName(user)}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-vapor">
            Your competitive stats and every way to play, together in one clear starting point.
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <Link to="/ranked" className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.14em] text-primary-foreground transition-colors hover:bg-primary/90">
            Find Match <Crosshair className="h-3.5 w-3.5" />
          </Link>
          <Link to="/tournaments" className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/[0.07] px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.14em] text-white transition-colors hover:border-primary/45 hover:text-primary">
            Browse Tournaments <Trophy className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}

function CompetitionNow({ matches }) {
  const currentMatch = matches[0] || null;

  return (
    <section>
      <SectionHeading eyebrow="Live now" title="Your competition" description="Continue an active match or find your next one." />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(300px,.75fr)]">
        <div className="dark-focus dark-media rounded-xl p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.18em] text-primary">Current / next match</p>
              {currentMatch ? (
                <>
                  <h3 className="mt-2 text-xl font-black">{matchLabel(currentMatch)}</h3>
                  <p className="mt-1 text-sm text-vapor">{currentMatch.game_mode_display || currentMatch.game_mode || currentMatch.map || "Competitive match"}</p>
                </>
              ) : (
                <>
                  <h3 className="mt-2 text-xl font-black">Ready for your next match?</h3>
                  <p className="mt-1 text-sm text-vapor">Queue for ranked play or choose an open competitive mode.</p>
                </>
              )}
            </div>
            <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${currentMatch ? "bg-primary/15 text-primary" : "bg-white/[0.07] text-vapor"}`}>
              {currentMatch ? <Radio className="h-5 w-5" /> : <Swords className="h-5 w-5" />}
            </span>
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            {currentMatch ? (
              <Link to={matchRoute(currentMatch)} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-xs font-black uppercase tracking-wider text-primary-foreground hover:bg-primary/90">
                Open Match <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            ) : (
              <Link to="/ranked" className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-xs font-black uppercase tracking-wider text-primary-foreground hover:bg-primary/90">
                Find Match <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            )}
            <Link to="/wagers" className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/[0.07] px-4 py-2.5 text-xs font-black uppercase tracking-wider text-white hover:border-primary/40 hover:text-primary">
              Browse Wagers
            </Link>
          </div>
        </div>

        <div className="premium-panel rounded-xl p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.18em] text-primary">Live matches</p>
              <h3 className="mt-1 text-base font-black">In progress</h3>
            </div>
            <span className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-[10px] font-black text-primary">{matches.length}</span>
          </div>
          {matches.length ? (
            <div className="mt-4 divide-y divide-border">
              {matches.slice(0, 3).map((match) => (
                <Link key={match.id} to={matchRoute(match)} className="group flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold group-hover:text-primary">{matchLabel(match)}</p>
                    <p className="mt-0.5 truncate text-[10px] text-vapor">{String(match.status || "live").replace(/_/g, " ")}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-vapor group-hover:text-primary" />
                </Link>
              ))}
            </div>
          ) : (
            <p className="mt-4 rounded-lg border border-dashed border-border bg-secondary/50 px-4 py-5 text-sm text-vapor">No active matches right now.</p>
          )}
        </div>
      </div>
    </section>
  );
}

function StatsOverview({ rank, elo, wins, losses, winRate, totalMatches, walletBalance, tournamentWins, bestStreak }) {
  const rankProgress = getRankProgress(elo);
  const stats = [
    { label: "Ranked record", value: `${wins}-${losses}`, detail: `${totalMatches} matches`, icon: Swords, to: "/ranked", tone: "orange" },
    { label: "Win rate", value: `${winRate}%`, detail: "Ranked performance", icon: Target, to: "/ranked", tone: "cyan" },
    { label: "Wallet", value: formatMoney(walletBalance), detail: "Available balance", icon: Wallet, to: "/wallet", tone: "green" },
    { label: "Tournament wins", value: tournamentWins, detail: "Career victories", icon: Trophy, to: "/tournaments", tone: "yellow" },
    { label: "Best streak", value: bestStreak, detail: "Ranked win streak", icon: History, to: "/ranked", tone: "purple" },
  ];

  return (
    <section>
      <SectionHeading eyebrow="Performance" title="Your stats" description="A quick read of where you stand right now." to="/profile" action="Detailed stats" />
      <div className="dashboard-stats-layout premium-panel rounded-[1.75rem] p-4 sm:p-5">
        <Link to="/ranked" className="dark-focus dark-media group relative overflow-hidden rounded-xl border border-primary/20 p-5 transition-colors hover:border-primary/40">
          <div className="flex items-center gap-4">
            <span className="flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl border border-white/[0.06] bg-black/20">
              <RankBadge rank={rank.tier} division={rank.division} elo={elo} size="md" showLabel={false} />
            </span>
            <div className="min-w-0">
              <p className="text-[9px] font-black uppercase tracking-[0.18em] text-vapor">Current rank</p>
              <p className="mt-1 truncate text-xl font-black text-white">{rank.name}</p>
              <p className="mt-1 font-mono text-sm font-black text-primary">{formatNumber(elo)} ELO</p>
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

function StatCard({ label, value, detail, icon: Icon, to, tone = "cyan" }) {
  const colors = dashboardTones[tone] || dashboardTones.cyan;
  return (
    <Link to={to} className={`premium-card group flex min-h-36 flex-col rounded-xl p-4 ${colors.border}`}>
      <span className={`flex h-9 w-9 items-center justify-center rounded-lg border transition-colors ${colors.icon}`}>
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

function GameModeCard({ title, description, meta, to, icon: Icon, tone = "cyan" }) {
  const colors = dashboardTones[tone] || dashboardTones.cyan;
  return (
    <Link to={to} className={`premium-card group relative flex min-h-40 overflow-hidden rounded-xl p-5 ${colors.border}`}>
      <div className="relative flex w-full items-start gap-4">
        <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border transition-colors ${colors.icon}`}>
          <Icon className="h-5 w-5" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col self-stretch">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-base font-black text-white">{title}</h3>
            <ArrowRight className={`mt-0.5 h-4 w-4 shrink-0 text-vapor transition-all group-hover:translate-x-1 ${colors.arrow}`} />
          </div>
          <p className="mt-1.5 text-xs leading-5 text-vapor">{description}</p>
          <p className={`mt-auto pt-4 text-[9px] font-black uppercase tracking-[0.15em] ${colors.text}`}>{meta}</p>
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
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-secondary text-primary">
                  <Swords className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-foreground transition-colors group-hover:text-primary">{matchLabel(match)}</p>
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
                <p className="truncate text-sm font-bold text-foreground transition-colors group-hover:text-primary">{tournament.name || "Tournament"}</p>
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
        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-primary">{eyebrow}</p>
        <h2 className="mt-1 text-xl font-black tracking-tight text-white">{title}</h2>
        <p className="mt-1 text-xs text-vapor">{description}</p>
      </div>
      {to && (
        <Link to={to} className="hidden items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.14em] text-vapor transition-colors hover:text-primary sm:inline-flex">
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
        <Link to={to} className="inline-flex shrink-0 items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.14em] text-vapor transition-colors hover:text-primary">
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
      <div className="h-full rounded-full bg-gradient-to-r from-cyan to-green transition-[width] duration-700" style={{ width: `${width}%` }} />
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
