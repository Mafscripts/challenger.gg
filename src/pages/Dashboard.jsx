import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  Bell,
  Info,
  MessageSquare,
  Swords,
  Target,
  Trophy,
  Users,
  Wallet,
  Zap,
} from "lucide-react";
import TopfraggLogo from "@/components/brand/TopfraggLogo";
import RankBadge from "@/components/ui/RankBadge";
import { base44 } from "@/api/base44Client";
import { getRankForElo, getRankProgress } from "@/lib/ranks";
import { bootstrapCurrentUser } from "@/lib/userBootstrap";

const heroImage = "https://media.base44.com/images/public/6a38e7860fd3c41494b9c695/902c6e4df_generated_5b6cee19.png";

const formatMoney = (value) => `$${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
  if (!value) return "TBD";
  return new Date(value).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
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
  if (match.match_type === "8s") return "8s Scrim";
  if (match.match_type === "xp") return "XP Match";
  return match.game_mode_display || match.game_mode || "Wager Match";
};

const matchResult = (match, userId) => {
  const status = String(match.status || "").toLowerCase();
  if (status.includes("cancel")) return { label: "R", tone: "text-red-300 bg-red-500/10 border-red-500/20", text: "Cancelled" };
  if (!["completed", "complete", "resolved"].includes(status)) return { label: "S", tone: "text-orange bg-orange/10 border-orange/20", text: "Awaiting report" };

  const winnerIds = [match.winner_id, match.winning_user_id, match.reported_winner_id, match.winner_team_id].filter(Boolean).map(String);
  if (winnerIds.includes(String(userId))) return { label: "W", tone: "text-green bg-green/10 border-green/20", text: "Win" };
  if (winnerIds.length > 0) return { label: "L", tone: "text-red-300 bg-red-500/10 border-red-500/20", text: "Loss" };
  return { label: "D", tone: "text-cyan bg-cyan/10 border-cyan/20", text: "Done" };
};

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [rankedStats, setRankedStats] = useState(null);
  const [xpStats, setXpStats] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [messages, setMessages] = useState([]);
  const [recentMatches, setRecentMatches] = useState([]);
  const [upcomingTournaments, setUpcomingTournaments] = useState([]);
  const [loading, setLoading] = useState(true);
  const dataLoadInFlight = useRef(false);

  useEffect(() => {
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

  const loadData = async () => {
    if (dataLoadInFlight.current) return;
    dataLoadInFlight.current = true;

    try {
      const userData = await bootstrapCurrentUser();
      setUser(userData);

      if (userData?.id) {
        const [walletRows, rankedRows, xpRows] = await Promise.all([
          base44.entities.Wallet.filter({ user_id: userData.id }, "-created_date", 1).catch(() => []),
          base44.entities.RankedStats.filter({ user_id: userData.id }, "-season", 1).catch(() => []),
          base44.entities.XPStats.filter({ user_id: userData.id }, "-season", 1).catch(() => []),
        ]);

        setWallet(walletRows[0] || null);
        setRankedStats(rankedRows[0] || null);
        setXpStats(xpRows[0] || null);
        setLoading(false);

        // Let the rank, XP, and wallet paint before loading below-the-fold feeds.
        await yieldForPagePaint();

        const [
          notificationsData,
          messagesData,
          hostedWagers,
          challengedWagers,
          hostedRanked,
          challengedRanked,
          tournaments,
        ] = await Promise.all([
          base44.entities.Notification.filter({ user_id: userData.id }, "-created_date", 20).catch(() => []),
          base44.entities.Message.filter({ recipient_id: userData.id }, "-created_date", 20).catch(() => []),
          base44.entities.Wager.filter({ host_id: userData.id }, "-created_date", 20).catch(() => []),
          base44.entities.Wager.filter({ challenger_id: userData.id }, "-created_date", 20).catch(() => []),
          base44.entities.RankedMatch.filter({ host_id: userData.id }, "-created_date", 20).catch(() => []),
          base44.entities.RankedMatch.filter({ challenger_id: userData.id }, "-created_date", 20).catch(() => []),
          base44.entities.Tournament.filter({ status: "open" }, "-start_date", 5).catch(() => []),
        ]);

        setNotifications(notificationsData || []);
        setMessages(messagesData || []);
        setUpcomingTournaments(tournaments || []);

        const combined = [...hostedWagers, ...challengedWagers, ...hostedRanked, ...challengedRanked]
          .filter((match, index, list) => list.findIndex((item) => item.id === match.id) === index)
          .sort((a, b) => new Date(b.match_completed_date || b.completed_date || b.accepted_date || b.created_date || 0) - new Date(a.match_completed_date || a.completed_date || a.accepted_date || a.created_date || 0))
          .slice(0, 8);
        setRecentMatches(combined);
      }
    } catch (error) {
      console.error("Failed to load dashboard data:", error);
    } finally {
      dataLoadInFlight.current = false;
      setLoading(false);
    }
  };

  const markNotificationAsRead = async (notificationId) => {
    try {
      await base44.entities.Notification.update(notificationId, { is_read: true });
      setNotifications((prev) => prev.map((item) => item.id === notificationId ? { ...item, is_read: true } : item));
    } catch (error) {
      console.error("Failed to mark notification as read:", error);
    }
  };

  const markMessageAsRead = async (messageId) => {
    try {
      await base44.entities.Message.update(messageId, { is_read: true });
      setMessages((prev) => prev.map((item) => item.id === messageId ? { ...item, is_read: true } : item));
    } catch (error) {
      console.error("Failed to mark message as read:", error);
    }
  };

  const unreadCount = notifications.filter((item) => !item.is_read).length;
  const unreadMessages = messages.filter((item) => !item.is_read).length;
  const rank = getRankForElo(rankedStats?.elo || 0);
  const elo = Number(rankedStats?.elo || 0);
  const totalRanked = (rankedStats?.wins || 0) + (rankedStats?.losses || 0);
  const rankedWinRate = totalRanked > 0 ? Math.round(((rankedStats?.wins || 0) / totalRanked) * 100) : 0;
  const xpLevel = Number(xpStats?.level || user?.xp_level || 1);
  const currentXp = Number(xpStats?.current_xp ?? user?.current_xp ?? 0);
  const xpToNext = Number(xpStats?.xp_to_next_level || 1000);
  const totalXp = Number(xpStats?.total_xp || user?.total_xp || currentXp);
  const xpProgress = Math.min(100, Math.round((currentXp / Math.max(1, currentXp + xpToNext)) * 100));
  const walletBalance = Number(wallet?.available_balance ?? 0);

  const activityItems = useMemo(() => {
    const notificationItems = notifications.slice(0, 3).map((item) => ({
      id: `notification-${item.id}`,
      icon: Bell,
      title: item.title || "Notification",
      detail: item.message || "Account update",
      time: formatTimeAgo(item.created_date),
      color: "text-cyan",
    }));
    const matchItems = recentMatches.slice(0, 3).map((match) => ({
      id: `match-${match.id}`,
      icon: Swords,
      title: matchLabel(match),
      detail: match.status || "Match activity",
      time: formatTimeAgo(match.match_completed_date || match.completed_date || match.created_date),
      color: "text-orange",
    }));
    return [...notificationItems, ...matchItems].slice(0, 5);
  }, [notifications, recentMatches]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-cyan/20 border-t-cyan rounded-full animate-spin mx-auto mb-4" />
          <p className="text-vapor">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="premium-panel max-w-md rounded-3xl p-8 text-center">
          <ShieldPrompt />
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-page min-h-screen py-8 lg:py-10">
      <div className="dashboard-container">
        <div className="dashboard-shell">
          <main className="dashboard-main">
            <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan">Your control center</p>
                <h1 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">
                  Welcome back, {shortName(user)}
                </h1>
                <p className="mt-2 max-w-xl text-sm text-vapor">
                  Track your progress, jump into competition, and stay on top of every update.
                </p>
              </div>
              <Link
                to="/profile"
                className="group inline-flex w-fit items-center gap-2 rounded-xl bg-white/[0.045] px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.14em] text-white shadow-[inset_0_1px_0_rgba(255,255,255,.04)] hover:bg-cyan/10 hover:text-cyan"
              >
                View Profile <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>

            <TopPanel
              rank={rank}
              elo={elo}
              xpLevel={xpLevel}
              currentXp={currentXp}
              xpToNext={xpToNext}
              totalXp={totalXp}
              xpProgress={xpProgress}
              walletBalance={walletBalance}
            />

            <ModeGrid />

            <div className="dashboard-panel-grid mt-7">
              <ProgressPanel elo={elo} xpLevel={xpLevel} xpToNext={xpToNext} xpProgress={xpProgress} />
              <TrophyCasePanel user={user} rankedWinRate={rankedWinRate} />
              <DailyChallengesPanel />
            </div>

            <div className="dashboard-panel-grid mt-7">
              <RecentMatchesPanel matches={recentMatches} userId={user.id} />
              <UpcomingPanel tournaments={upcomingTournaments} />
              <ActivityPanel items={activityItems} />
            </div>
          </main>

          <aside className="dashboard-rail">
            <QuickActions />

            <SidePanel title="Notifications" icon={Bell} count={unreadCount} to="/notifications">
              <NotificationList notifications={notifications.slice(0, 5)} onRead={markNotificationAsRead} compact />
            </SidePanel>

            <SidePanel title="Messages" icon={MessageSquare} count={unreadMessages} to="/messages">
              {messages.length === 0 ? (
                <div className="py-5 text-center text-xs text-vapor">No messages</div>
              ) : messages.slice(0, 5).map((message) => (
                <button
                  key={message.id}
                  type="button"
                  onClick={() => markMessageAsRead(message.id)}
                  className={`premium-card block w-full rounded-2xl p-3 text-left ${!message.is_read ? "border-cyan/15 bg-cyan/[0.06]" : ""}`}
                >
                  <p className={`truncate text-xs font-semibold ${!message.is_read ? "text-cyan" : "text-foreground"}`}>{message.sender_name || "Unknown sender"}</p>
                  <p className="mt-0.5 truncate text-[10px] text-vapor">{message.subject || "No subject"}</p>
                </button>
              ))}
            </SidePanel>

            <TopfraggSeasonCard xpLevel={xpLevel} currentXp={currentXp} xpToNext={xpToNext} progress={xpProgress} />
          </aside>
        </div>
      </div>
    </div>
  );
}

function ShieldPrompt() {
  return (
    <>
      <Info className="w-10 h-10 text-cyan mx-auto mb-4" />
      <h1 className="text-2xl font-black mb-2">Login Required</h1>
      <p className="text-sm text-vapor mb-5">Log in or create an account to open your dashboard.</p>
      <div className="flex items-center justify-center gap-3">
        <Link to="/login" className="px-4 py-2 bg-secondary text-vapor rounded-lg hover:text-foreground text-sm font-semibold">Login</Link>
        <Link to="/register" className="px-4 py-2 bg-cyan text-background rounded-lg text-sm font-bold">Register</Link>
      </div>
    </>
  );
}

function QuickActions() {
  return (
    <section className="premium-panel relative overflow-hidden rounded-3xl p-4">
      <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      <div className="relative">
        <p className="mb-3 px-1 text-[9px] font-black uppercase tracking-[0.18em] text-vapor">Quick actions</p>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
          <Link to="/8s" className="group inline-flex items-center justify-center gap-2 rounded-xl bg-cyan px-4 py-3 text-[10px] font-black uppercase tracking-[0.14em] text-background hover:-translate-y-0.5 hover:bg-white">
            <Zap className="h-4 w-4 transition-transform group-hover:scale-110" /> Quick Play
          </Link>
          <Link to="/ranked" className="group inline-flex items-center justify-center gap-2 rounded-xl bg-white/[0.045] px-4 py-3 text-[10px] font-black uppercase tracking-[0.14em] text-white shadow-[inset_0_1px_0_rgba(255,255,255,.04)] hover:-translate-y-0.5 hover:bg-cyan/10 hover:text-cyan">
            <Swords className="h-4 w-4 transition-transform group-hover:scale-110" /> Ranked
          </Link>
        </div>
      </div>
    </section>
  );
}

function TopPanel({ rank, elo, xpLevel, currentXp, xpToNext, totalXp, xpProgress, walletBalance }) {
  return (
    <section className="premium-panel relative overflow-hidden rounded-[1.75rem] p-5 sm:p-7">
      <img src={heroImage} alt="" className="absolute inset-0 h-full w-full object-cover object-right opacity-25" />
      <div className="absolute inset-0 bg-gradient-to-r from-background/95 via-background/80 to-background/50" />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent to-background/55" />
      <div className="pointer-events-none absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />

      <div className="dashboard-top-grid relative">
        <RankSummaryCard rank={rank} elo={elo} />
        <XpSummaryCard xpLevel={xpLevel} currentXp={currentXp} xpToNext={xpToNext} totalXp={totalXp} progress={xpProgress} />
        <WalletSummaryCard balance={walletBalance} />
      </div>
    </section>
  );
}

function ModeGrid() {
  return (
    <section className="mt-8">
      <h2 className="mb-4 text-sm font-black uppercase tracking-[0.16em] text-white">Play</h2>
      <div className="dashboard-mode-grid">
        <ModeCard icon={Zap} title="Quick Play" text="Jump into a match" to="/8s" color="cyan" action="Play Now" />
        <ModeCard icon={Wallet} title="Wagers" text="Compete for cash" to="/wagers" color="green" action="Play Now" />
        <ModeCard icon={Users} title="8s Scrims" text="8v8 Competitive" to="/8s" color="purple" action="Find Match" />
        <ModeCard icon={Swords} title="Ranked" text="Climb the ladder" to="/ranked" color="orange" action="Play Now" />
        <ModeCard icon={Target} title="Ranked 8s" text="Ranked team queue" to="/ranked" color="red" action="Play Now" />
        <ModeCard icon={Trophy} title="Tournaments" text="Compete for prizes" to="/tournaments" color="yellow" action="View All" />
      </div>
    </section>
  );
}

function RankSummaryCard({ rank, elo }) {
  const progress = getRankProgress(elo);
  return (
    <div className="premium-card group relative min-h-48 overflow-hidden rounded-2xl p-5">
      <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-orange/10 blur-3xl" />
      <div className="relative flex h-full flex-col">
        <div className="flex items-center gap-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/[0.04] shadow-[inset_0_1px_0_rgba(255,255,255,.05)]">
            <RankBadge rank={rank.tier} division={rank.division} elo={elo} size="lg" />
          </span>
          <div className="min-w-0">
            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-vapor">Current Rank</p>
            <p className="mt-1 truncate text-lg font-black tracking-tight text-white">{rank.name}</p>
            <p className="mt-0.5 font-mono text-sm font-black text-cyan">{formatNumber(elo)} ELO</p>
          </div>
        </div>
        <div className="mt-auto pt-5">
          <div className="mb-2 flex justify-between text-[9px] font-semibold uppercase tracking-[0.12em] text-vapor">
            <span>{rank.min} ELO</span>
            <span>{rank.max === Infinity ? "Max Rank" : `${rank.max + 1} ELO`}</span>
          </div>
          <ProgressBar value={progress} tone="from-orange to-yellow-400" />
        </div>
      </div>
    </div>
  );
}

function XpSummaryCard({ xpLevel, currentXp, xpToNext, totalXp, progress }) {
  return (
    <div className="premium-card group relative min-h-48 overflow-hidden rounded-2xl p-5">
      <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-cyan/10 blur-3xl" />
      <div className="relative flex h-full flex-col">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-vapor">XP Level</p>
            <p className="mt-2 font-mono text-4xl font-black leading-none tracking-tight text-white">{xpLevel}</p>
            <p className="mt-2 text-[10px] font-medium text-vapor">Prestige 0</p>
          </div>
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/[0.04] shadow-[inset_0_1px_0_rgba(255,255,255,.05)]">
            <Zap className="h-5 w-5 text-cyan transition-transform group-hover:scale-110" />
          </div>
        </div>
        <div className="mt-auto pt-5">
          <div className="mb-2 flex justify-between text-[9px] font-semibold uppercase tracking-[0.12em] text-vapor">
            <span>{formatNumber(currentXp)} XP</span>
            <span>{formatNumber(totalXp)} total</span>
          </div>
          <ProgressBar value={progress} />
          <p className="mt-2 text-[10px] text-vapor">{formatNumber(xpToNext)} XP to next level</p>
        </div>
      </div>
    </div>
  );
}

function WalletSummaryCard({ balance }) {
  return (
    <div className="premium-card group relative min-h-48 overflow-hidden rounded-2xl p-5">
      <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-green/10 blur-3xl" />
      <div className="relative flex h-full flex-col">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-vapor">Wallet Balance</p>
            <p className="mt-3 font-mono text-3xl font-black tracking-tight text-green">{formatMoney(balance)}</p>
            <p className="mt-2 text-[10px] font-medium text-vapor">Available to play</p>
          </div>
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/[0.04] shadow-[inset_0_1px_0_rgba(255,255,255,.05)]">
            <Wallet className="h-5 w-5 text-green transition-transform group-hover:scale-110" />
          </div>
        </div>
        <Link
          to="/wallet"
          className="mt-auto inline-flex w-fit items-center gap-2 rounded-xl bg-white/[0.045] px-3.5 py-2.5 text-[10px] font-black uppercase tracking-[0.14em] text-white hover:bg-green/10 hover:text-green"
        >
          View Wallet <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>
    </div>
  );
}

const modeTone = {
  cyan: {
    icon: "text-cyan",
    glow: "bg-cyan/10",
    hover: "group-hover:bg-cyan/10",
    button: "border-cyan/25 text-cyan group-hover:border-cyan/45 group-hover:bg-cyan/10",
  },
  green: {
    icon: "text-green",
    glow: "bg-green/10",
    hover: "group-hover:bg-green/10",
    button: "border-green/25 text-green group-hover:border-green/45 group-hover:bg-green/10",
  },
  purple: {
    icon: "text-purple-300",
    glow: "bg-purple-400/10",
    hover: "group-hover:bg-purple-400/10",
    button: "border-purple-400/25 text-purple-300 group-hover:border-purple-400/45 group-hover:bg-purple-400/10",
  },
  orange: {
    icon: "text-orange",
    glow: "bg-orange/10",
    hover: "group-hover:bg-orange/10",
    button: "border-orange/25 text-orange group-hover:border-orange/45 group-hover:bg-orange/10",
  },
  red: {
    icon: "text-red-300",
    glow: "bg-red-500/10",
    hover: "group-hover:bg-red-500/10",
    button: "border-red-500/25 text-red-300 group-hover:border-red-500/45 group-hover:bg-red-500/10",
  },
  yellow: {
    icon: "text-yellow-300",
    glow: "bg-yellow-400/10",
    hover: "group-hover:bg-yellow-400/10",
    button: "border-yellow-400/25 text-yellow-300 group-hover:border-yellow-400/45 group-hover:bg-yellow-400/10",
  },
};

function ModeCard({ icon: Icon, title, text, to, color, action }) {
  const tone = modeTone[color];

  return (
    <Link to={to} className="premium-card group relative flex min-h-44 min-w-0 flex-col overflow-hidden rounded-2xl p-4 sm:p-5">
      <div className={`pointer-events-none absolute -right-9 -top-9 h-24 w-24 rounded-full opacity-70 blur-3xl ${tone.glow}`} />
      <span className={`relative mb-5 flex h-10 w-10 items-center justify-center rounded-2xl bg-white/[0.04] shadow-[inset_0_1px_0_rgba(255,255,255,.05)] ${tone.hover}`}>
        <Icon className={`h-6 w-6 transition-transform duration-300 group-hover:scale-110 ${tone.icon}`} />
      </span>
      <div className="relative flex flex-1 flex-col">
        <h3 className="truncate text-sm font-black uppercase tracking-[0.04em] text-white">{title}</h3>
        <p className="mt-1 flex-1 text-xs leading-relaxed text-vapor">{text}</p>
        <span className={`mt-4 inline-flex w-fit max-w-full items-center justify-center rounded-lg border px-3 py-2 text-[9px] font-black uppercase tracking-[0.12em] transition-colors ${tone.button}`}>
          <span className="truncate">{action}</span>
        </span>
      </div>
    </Link>
  );
}

function ProgressBar({ value, tone = "from-cyan to-green", className = "" }) {
  const width = Math.min(100, Math.max(0, Number(value) || 0));
  return (
    <div className={`h-2.5 overflow-hidden rounded-full bg-black/25 shadow-[inset_0_1px_3px_rgba(0,0,0,.35)] ${className}`}>
      <div
        className={`h-full rounded-full bg-gradient-to-r shadow-[0_0_16px_rgba(20,216,255,.18)] transition-[width] duration-700 ease-out ${tone}`}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

function ProgressPanel({ elo, xpLevel, xpToNext, xpProgress }) {
  const rankProgress = getRankProgress(elo);
  return (
    <Panel title="Progress" action="Season 1" dense>
      <div className="space-y-5">
        <ProgressRow icon={Trophy} label="Current Season" value="Season 1" />
        <ProgressRow icon={Zap} label="Season Progress" value={`${xpProgress}%`} bar={xpProgress} />
        <ProgressRow icon={Target} label="Rank Progress" value={`${rankProgress}%`} bar={rankProgress} />
        <div className="premium-card rounded-2xl p-4">
          <p className="text-[9px] font-black uppercase tracking-[0.16em] text-vapor">Next Reward</p>
          <p className="mt-1.5 text-sm font-black text-cyan">Level {xpLevel + 1} Drop</p>
          <p className="mt-1 text-[10px] leading-relaxed text-vapor">{formatNumber(xpToNext)} XP needed from level {xpLevel}</p>
        </div>
      </div>
    </Panel>
  );
}

function ProgressRow({ icon: Icon, label, value, bar = undefined }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.04] shadow-[inset_0_1px_0_rgba(255,255,255,.04)]">
        <Icon className="h-4 w-4 text-cyan" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-medium text-vapor">{label}</p>
        {bar !== undefined ? (
          <ProgressBar value={bar} className="mt-2 h-1.5" />
        ) : (
          <p className="mt-0.5 text-xs font-bold text-cyan">{value}</p>
        )}
      </div>
      {bar !== undefined && <span className="text-xs font-bold text-vapor">{value}</span>}
    </div>
  );
}

function TrophyCasePanel({ user, rankedWinRate }) {
  const trophies = [
    { label: "Gold", value: user?.tournament_wins || 0, color: "text-yellow-400" },
    { label: "Silver", value: user?.silver_trophies || 0, color: "text-slate-200" },
    { label: "Bronze", value: user?.bronze_trophies || 0, color: "text-orange" },
    { label: "Diamond", value: user?.diamond_trophies || 0, color: "text-cyan" },
    { label: "Master", value: user?.master_trophies || 0, color: "text-purple-300" },
    { label: "Top Fragger", value: user?.topfragg_count || user?.topfrag_count || 0, color: "text-white" },
    { label: "Hosted", value: user?.hosted_tournaments || user?.hosted_count || 0, color: "text-green" },
    { label: "Win Rate", value: `${rankedWinRate}%`, color: "text-purple-300" },
  ];

  return (
    <Panel title="Trophy Case" action="View All" to="/profile" dense>
      <div className="grid grid-cols-4 gap-2.5">
        {trophies.map((item) => (
          <div key={item.label} className="premium-card rounded-2xl p-3 text-center">
            <Trophy className={`mx-auto mb-2 h-5 w-5 ${item.color}`} />
            <p className={`font-mono text-base font-black ${item.color}`}>{item.value}</p>
            <p className="mt-1 truncate text-[8px] font-black uppercase tracking-[0.12em] text-vapor">{item.label}</p>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function DailyChallengesPanel() {
  const rows = [
    { title: "Play 3 Ranked Matches", xp: "250 XP", progress: 60 },
    { title: "Win 2 Wager Matches", xp: "500 XP", progress: 30 },
    { title: "Join a Tournament", xp: "750 XP", progress: 10 },
  ];

  return (
    <Panel title="Daily Challenges" action="View All" to="/xp" dense>
      <div className="space-y-3">
        {rows.map((row) => (
          <div key={row.title} className="premium-card rounded-2xl p-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="truncate text-xs font-bold">{row.title}</p>
              <span className="text-[10px] font-black text-cyan">{row.xp}</span>
            </div>
            <ProgressBar value={row.progress} className="h-1.5" />
          </div>
        ))}
      </div>
    </Panel>
  );
}

function RecentMatchesPanel({ matches, userId }) {
  return (
    <Panel title="Recent Matches" action="View All" to="/wagers" dense>
      {matches.length === 0 ? (
        <EmptyState icon={Swords} text="No match history yet." />
      ) : (
        <div className="space-y-2.5">
          {matches.slice(0, 5).map((match) => {
            const result = matchResult(match, userId);
            return (
              <div key={match.id} className="premium-card flex items-center gap-3 rounded-2xl p-3">
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border text-[10px] font-black uppercase ${result.tone}`}>{result.label}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold">{matchLabel(match)}</p>
                  <p className="mt-0.5 truncate text-[10px] text-vapor">{match.final_map_name || match.map || "Map pending"}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[10px] font-black text-cyan">{match.score || "--"}</p>
                  <p className="mt-0.5 text-[10px] text-vapor">{result.text}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

function UpcomingPanel({ tournaments }) {
  return (
    <Panel title="Upcoming" action="View All" to="/tournaments" dense>
      {tournaments.length === 0 ? (
        <EmptyState icon={Trophy} text="No open tournaments." />
      ) : (
        <div className="space-y-2.5">
          {tournaments.slice(0, 5).map((tournament) => (
            <Link key={tournament.id} to="/tournaments" className="premium-card flex items-center gap-3 rounded-2xl p-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-yellow-400/10">
                <Trophy className="h-4 w-4 text-yellow-400" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold">{tournament.name}</p>
                <p className="mt-0.5 truncate text-[10px] text-vapor">{tournament.registered_teams || 0}/{tournament.max_teams || 0} teams</p>
              </div>
              <span className="shrink-0 text-right text-[9px] font-semibold text-cyan">{formatDate(tournament.start_date)}</span>
            </Link>
          ))}
        </div>
      )}
    </Panel>
  );
}

function ActivityPanel({ items }) {
  return (
    <Panel title="Activity Feed" action="Full Feed" to="/notifications" dense>
      {items.length === 0 ? (
        <EmptyState icon={Activity} text="No activity yet." />
      ) : (
        <div className="space-y-2.5">
          {items.map(({ id, icon: Icon, title, detail, time, color }) => (
            <div key={id} className="premium-card flex items-center gap-3 rounded-2xl p-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.04]">
                <Icon className={`h-4 w-4 ${color}`} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold">{title}</p>
                <p className="mt-0.5 truncate text-[10px] text-vapor">{detail}</p>
              </div>
              <span className="shrink-0 text-[9px] text-vapor">{time}</span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

function TopfraggSeasonCard({ xpLevel, currentXp, xpToNext, progress }) {
  return (
    <section className="premium-panel relative min-h-52 overflow-hidden rounded-3xl p-5">
      <img src={heroImage} alt="" className="absolute inset-0 h-full w-full object-cover object-right opacity-25" />
      <div className="absolute inset-0 bg-gradient-to-r from-background/95 via-background/80 to-background/50" />
      <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-cyan/30 to-transparent" />
      <div className="relative">
        <TopfraggLogo wordmarkClassName="text-sm" markClassName="h-6 w-6" />
        <p className="mt-5 text-[9px] font-black uppercase tracking-[0.2em] text-cyan">Season 1</p>
        <div className="mt-3 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/[0.05] shadow-[inset_0_1px_0_rgba(255,255,255,.05)]">
            <span className="font-mono text-lg font-black text-cyan">{xpLevel}</span>
          </div>
          <div>
            <p className="text-sm font-black tracking-tight text-white">XP Level</p>
            <p className="mt-1 text-[10px] text-vapor">{formatNumber(currentXp)} / {formatNumber(currentXp + xpToNext)} XP</p>
          </div>
        </div>
        <ProgressBar value={progress} className="mt-5" />
      </div>
    </section>
  );
}

function NotificationList({ notifications, onRead, compact = false }) {
  if (notifications.length === 0) {
    return <div className="py-5 text-center text-xs text-vapor">No notifications</div>;
  }

  return (
    <div className={`space-y-2 ${compact ? "" : "max-h-80 overflow-y-auto"}`}>
      {notifications.map((notification) => (
        <button
          key={notification.id}
          type="button"
          onClick={() => onRead(notification.id)}
          className={`premium-card block w-full rounded-2xl p-3 text-left ${!notification.is_read ? "border-cyan/15 bg-cyan/[0.06]" : ""}`}
        >
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/[0.04]">
              {notification.type === "system" ? <Info className="h-4 w-4 text-cyan" /> : <AlertCircle className="h-4 w-4 text-vapor" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold">{notification.title}</p>
              <p className="mt-0.5 truncate text-[10px] text-vapor">{notification.message}</p>
            </div>
            {!notification.is_read && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-cyan" />}
          </div>
        </button>
      ))}
    </div>
  );
}

function SidePanel({ title, icon: Icon, count, to, children }) {
  return (
    <section className="premium-panel relative overflow-hidden rounded-3xl p-5">
      <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      <div className="relative mb-5 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-base font-black tracking-tight text-white">
          <Icon className="h-4 w-4 text-cyan" />
          {title}
        </h3>
        <div className="flex items-center gap-2">
          {count > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-cyan px-1.5 text-[10px] font-black text-background">
              {count}
            </span>
          )}
          {to && (
            <Link to={to} className="group inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-[0.14em] text-cyan hover:text-white">
              View <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
            </Link>
          )}
        </div>
      </div>
      <div className="relative space-y-2">{children}</div>
    </section>
  );
}

function Panel({ title, action, to = null, children, dense = false }) {
  return (
    <section className={`premium-panel relative h-full overflow-hidden rounded-3xl ${dense ? "p-5" : "p-5 sm:p-6"}`}>
      <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      <div className="relative mb-5 flex items-center justify-between gap-3">
        <h3 className="text-base font-black tracking-tight text-white">{title}</h3>
        {to ? (
          <Link to={to} className="group inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-[0.14em] text-cyan hover:text-white">
            {action} <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
          </Link>
        ) : (
          <span className="text-[9px] font-black uppercase tracking-[0.14em] text-cyan">{action}</span>
        )}
      </div>
      <div className="relative">{children}</div>
    </section>
  );
}

function EmptyState({ icon: Icon, text }) {
  return (
    <div className="rounded-2xl bg-white/[0.025] px-4 py-8 text-center shadow-[inset_0_1px_0_rgba(255,255,255,.025)]">
      <Icon className="mx-auto mb-3 h-8 w-8 text-vapor/25" />
      <p className="text-xs text-vapor">{text}</p>
    </div>
  );
}
