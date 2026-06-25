import React, { useEffect, useMemo, useState } from "react";
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

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    try {
      const userData = await bootstrapCurrentUser();
      setUser(userData);

      if (userData?.id) {
        const [
          walletRows,
          rankedRows,
          xpRows,
          notificationsData,
          messagesData,
          hostedWagers,
          challengedWagers,
          hostedRanked,
          challengedRanked,
          tournaments,
        ] = await Promise.all([
          base44.entities.Wallet.filter({ user_id: userData.id }, "-created_date", 1).catch(() => []),
          base44.entities.RankedStats.filter({ user_id: userData.id }, "-season", 1).catch(() => []),
          base44.entities.XPStats.filter({ user_id: userData.id }, "-season", 1).catch(() => []),
          base44.entities.Notification.filterFresh({ user_id: userData.id }, "-created_date", 20).catch(() => []),
          base44.entities.Message.filter({ recipient_id: userData.id }, "-created_date", 20).catch(() => []),
          base44.entities.Wager.filter({ host_id: userData.id }, "-created_date", 20).catch(() => []),
          base44.entities.Wager.filter({ challenger_id: userData.id }, "-created_date", 20).catch(() => []),
          base44.entities.RankedMatch.filter({ host_id: userData.id }, "-created_date", 20).catch(() => []),
          base44.entities.RankedMatch.filter({ challenger_id: userData.id }, "-created_date", 20).catch(() => []),
          base44.entities.Tournament.filter({ status: "open" }, "-start_date", 5).catch(() => []),
        ]);

        setWallet(walletRows[0] || null);
        setRankedStats(rankedRows[0] || null);
        setXpStats(xpRows[0] || null);
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
        <div className="glass rounded-xl border border-white/5 p-8 max-w-md text-center">
          <ShieldPrompt />
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-page min-h-screen py-8">
      <div className="dashboard-container">
        <div className="dashboard-shell">
          <main className="dashboard-main">
            <div className="mb-5">
              <p className="text-[11px] font-medium text-vapor">Welcome back,</p>
              <h1 className="mt-0.5 text-3xl font-black tracking-tight">{shortName(user)}</h1>
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

            <div className="dashboard-panel-grid mt-5">
              <ProgressPanel rank={rank} elo={elo} xpLevel={xpLevel} currentXp={currentXp} xpToNext={xpToNext} xpProgress={xpProgress} />
              <TrophyCasePanel user={user} rankedWinRate={rankedWinRate} />
              <DailyChallengesPanel />
            </div>

            <div className="dashboard-panel-grid mt-5">
              <RecentMatchesPanel matches={recentMatches} userId={user.id} />
              <UpcomingPanel tournaments={upcomingTournaments} />
              <ActivityPanel items={activityItems} />
            </div>
          </main>

          <aside className="dashboard-rail">
            <div className="grid gap-2">
              <Link to="/8s" className="inline-flex items-center justify-center gap-2 rounded-lg bg-cyan px-4 py-3 text-xs font-black uppercase tracking-wider text-background transition-all hover:shadow-lg hover:shadow-cyan/25">
                <Zap className="h-4 w-4" /> Quick Play
              </Link>
              <Link to="/ranked" className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-secondary px-4 py-3 text-xs font-black uppercase tracking-wider transition-all hover:border-cyan/30 hover:text-cyan">
                <Swords className="h-4 w-4" /> Ranked
              </Link>
            </div>

            <SidePanel title="Notifications" icon={Bell} count={unreadCount} to="/notifications">
              <NotificationList notifications={notifications.slice(0, 5)} onRead={markNotificationAsRead} compact />
            </SidePanel>

            <SidePanel title="Messages" icon={MessageSquare} count={unreadMessages} to="/messages">
              {messages.length === 0 ? (
                <div className="px-3 py-4 text-center text-xs text-vapor">No messages</div>
              ) : messages.slice(0, 5).map((message) => (
                <button
                  key={message.id}
                  type="button"
                  onClick={() => markMessageAsRead(message.id)}
                  className={`block w-full px-3 py-2.5 text-left transition-colors hover:bg-white/[0.03] ${!message.is_read ? "bg-cyan/5" : ""}`}
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

function TopPanel({ rank, elo, xpLevel, currentXp, xpToNext, totalXp, xpProgress, walletBalance }) {
  return (
    <section className="glass relative overflow-hidden rounded-xl border border-white/5 p-5 sm:p-6">
      <img src={heroImage} alt="" className="absolute inset-0 h-full w-full object-cover object-right opacity-32" />
      <div className="absolute inset-0 bg-gradient-to-r from-background via-background/80 to-background/35" />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent to-background/45" />

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
    <section className="mt-5">
      <p className="mb-3 text-sm font-black uppercase tracking-wider">Play</p>
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
    <div className="min-h-36 rounded-lg border border-white/5 bg-background/70 p-5 backdrop-blur-md">
      <div className="flex items-center gap-4">
        <RankBadge rank={rank.tier} division={rank.division} size="lg" />
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-wider text-vapor">Current Rank</p>
          <p className="mt-1 truncate text-base font-black">{rank.name}</p>
          <p className="mt-0.5 font-mono text-sm font-black text-cyan">{formatNumber(elo)} ELO</p>
        </div>
      </div>
      <div className="mt-4">
        <div className="mb-1 flex justify-between text-[10px] font-semibold uppercase tracking-wider text-vapor">
          <span>{rank.min} ELO</span>
          <span>{rank.max === Infinity ? "Max Rank" : `${rank.max + 1} ELO`}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-secondary">
          <div className="h-full rounded-full bg-gradient-to-r from-orange to-yellow-400" style={{ width: `${progress}%` }} />
        </div>
      </div>
    </div>
  );
}

function XpSummaryCard({ xpLevel, currentXp, xpToNext, totalXp, progress }) {
  return (
    <div className="min-h-36 rounded-lg border border-white/5 bg-background/70 p-5 backdrop-blur-md">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-wider text-vapor">XP Level</p>
          <p className="mt-1 font-mono text-3xl font-black text-white">{xpLevel}</p>
          <p className="text-[10px] text-vapor">Prestige 0</p>
        </div>
        <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-cyan/30 bg-cyan/10 shadow-[0_0_24px_rgba(20,216,255,0.18)]">
          <span className="font-mono text-xl font-black text-cyan">{xpLevel}</span>
        </div>
      </div>
      <div className="mb-1 flex justify-between text-[10px] font-semibold uppercase tracking-wider text-vapor">
        <span>{formatNumber(currentXp)} XP</span>
        <span>{formatNumber(totalXp)} total</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-secondary">
        <div className="h-full rounded-full bg-gradient-to-r from-cyan to-blue-400" style={{ width: `${progress}%` }} />
      </div>
      <p className="mt-2 text-[10px] text-vapor">{formatNumber(xpToNext)} XP to next level</p>
    </div>
  );
}

function WalletSummaryCard({ balance }) {
  return (
    <div className="min-h-36 rounded-lg border border-white/5 bg-background/70 p-5 backdrop-blur-md">
      <div className="mb-4 flex items-center gap-4">
        <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-green/20 bg-green/10">
          <Wallet className="h-5 w-5 text-green" />
        </div>
        <div>
          <p className="text-[10px] font-black uppercase tracking-wider text-vapor">Wallet Balance</p>
          <p className="font-mono text-2xl font-black text-green">{formatMoney(balance)}</p>
        </div>
      </div>
      <Link to="/wallet" className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-secondary px-3 py-2 text-[10px] font-black uppercase tracking-wider text-white transition-colors hover:border-green/30 hover:text-green">
        Add Funds <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}

const modeTone = {
  cyan: {
    icon: "text-cyan",
    border: "hover:border-cyan/35",
    button: "border-cyan/25 text-cyan group-hover:bg-cyan group-hover:text-background",
  },
  green: {
    icon: "text-green",
    border: "hover:border-green/35",
    button: "border-green/25 text-green group-hover:bg-green group-hover:text-background",
  },
  purple: {
    icon: "text-purple-300",
    border: "hover:border-purple-400/35",
    button: "border-purple-400/25 text-purple-300 group-hover:bg-purple-400 group-hover:text-background",
  },
  orange: {
    icon: "text-orange",
    border: "hover:border-orange/35",
    button: "border-orange/25 text-orange group-hover:bg-orange group-hover:text-background",
  },
  red: {
    icon: "text-red-300",
    border: "hover:border-red-500/35",
    button: "border-red-500/25 text-red-300 group-hover:bg-red-500 group-hover:text-white",
  },
  yellow: {
    icon: "text-yellow-300",
    border: "hover:border-yellow-400/35",
    button: "border-yellow-400/25 text-yellow-300 group-hover:bg-yellow-400 group-hover:text-background",
  },
};

function ModeCard({ icon: Icon, title, text, to, color, action }) {
  const tone = modeTone[color];

  return (
    <Link to={to} className={`glass group flex min-h-36 flex-col rounded-lg border border-white/5 p-5 transition-all hover:-translate-y-1 ${tone.border}`}>
      <Icon className={`mb-4 h-7 w-7 transition-transform group-hover:scale-110 ${tone.icon}`} />
      <h3 className="text-sm font-black uppercase tracking-wider text-white">{title}</h3>
      <p className="mt-1 flex-1 text-xs text-vapor">{text}</p>
      <span className={`mt-4 inline-flex w-fit rounded border px-3 py-2 text-[10px] font-black uppercase tracking-wider transition-all ${tone.button}`}>
        {action}
      </span>
    </Link>
  );
}

function ProgressPanel({ rank, elo, xpLevel, currentXp, xpToNext, xpProgress }) {
  const rankProgress = getRankProgress(elo);
  return (
    <Panel title="Progress" action="Season 1" dense>
      <div className="space-y-4 p-5">
        <ProgressRow icon={Trophy} label="Current Season" value="Season 1" />
        <ProgressRow icon={Zap} label="Season Progress" value={`${xpProgress}%`} bar={xpProgress} />
        <ProgressRow icon={Target} label="Rank Progress" value={`${rankProgress}%`} bar={rankProgress} />
        <div className="rounded-lg border border-cyan/10 bg-cyan/5 p-3">
          <p className="text-[10px] font-black uppercase tracking-wider text-vapor">Next Reward</p>
          <p className="mt-1 text-sm font-black text-cyan">Level {xpLevel + 1} Drop</p>
          <p className="mt-1 text-[10px] text-vapor">{formatNumber(xpToNext)} XP needed from level {xpLevel}</p>
        </div>
      </div>
    </Panel>
  );
}

function ProgressRow({ icon: Icon, label, value, bar }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-secondary">
        <Icon className="h-4 w-4 text-cyan" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] text-vapor">{label}</p>
        {bar !== undefined ? (
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-secondary">
            <div className="h-full rounded-full bg-cyan" style={{ width: `${bar}%` }} />
          </div>
        ) : (
          <p className="text-xs font-bold text-cyan">{value}</p>
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
      <div className="grid grid-cols-4 gap-3 p-5">
        {trophies.map((item) => (
          <div key={item.label} className="rounded-lg border border-white/5 bg-background/45 p-3 text-center">
            <Trophy className={`mx-auto mb-2 h-6 w-6 ${item.color}`} />
            <p className={`font-mono text-base font-black ${item.color}`}>{item.value}</p>
            <p className="mt-1 truncate text-[8px] uppercase tracking-wider text-vapor">{item.label}</p>
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
      <div className="divide-y divide-white/5">
        {rows.map((row) => (
          <div key={row.title} className="px-5 py-3.5">
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="truncate text-xs font-bold">{row.title}</p>
              <span className="text-[10px] font-black text-cyan">{row.xp}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
              <div className="h-full rounded-full bg-cyan" style={{ width: `${row.progress}%` }} />
            </div>
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
      ) : matches.slice(0, 5).map((match) => {
        const result = matchResult(match, userId);
        return (
          <div key={match.id} className="flex items-center gap-3 border-b border-white/5 px-5 py-3.5 last:border-0">
            <span className={`flex h-7 w-7 items-center justify-center rounded border text-[10px] font-black uppercase ${result.tone}`}>{result.label}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-bold">{matchLabel(match)}</p>
              <p className="truncate text-xs text-vapor">{match.final_map_name || match.map || "Map pending"}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-[10px] font-black text-cyan">{match.score || "--"}</p>
              <p className="text-[10px] text-vapor">{result.text}</p>
            </div>
          </div>
        );
      })}
    </Panel>
  );
}

function UpcomingPanel({ tournaments }) {
  return (
    <Panel title="Upcoming" action="View All" to="/tournaments" dense>
      {tournaments.length === 0 ? (
        <EmptyState icon={Trophy} text="No open tournaments." />
      ) : tournaments.slice(0, 5).map((tournament) => (
        <Link key={tournament.id} to="/tournaments" className="flex items-center gap-3 border-b border-white/5 px-5 py-3.5 transition-colors last:border-0 hover:bg-white/[0.03]">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-yellow-400/20 bg-yellow-400/10">
            <Trophy className="h-4 w-4 text-yellow-400" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-bold">{tournament.name}</p>
            <p className="truncate text-xs text-vapor">{tournament.registered_teams || 0}/{tournament.max_teams || 0} teams</p>
          </div>
          <span className="shrink-0 text-right text-[10px] text-cyan">{formatDate(tournament.start_date)}</span>
        </Link>
      ))}
    </Panel>
  );
}

function ActivityPanel({ items }) {
  return (
    <Panel title="Activity Feed" action="Full Feed" to="/notifications" dense>
      {items.length === 0 ? (
        <EmptyState icon={Activity} text="No activity yet." />
      ) : items.map(({ id, icon: Icon, title, detail, time, color }) => (
        <div key={id} className="flex items-center gap-3 border-b border-white/5 px-5 py-3.5 last:border-0">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-secondary">
            <Icon className={`h-4 w-4 ${color}`} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-bold">{title}</p>
            <p className="truncate text-[10px] text-vapor">{detail}</p>
          </div>
          <span className="shrink-0 text-[10px] text-vapor">{time}</span>
        </div>
      ))}
    </Panel>
  );
}

function TopfraggSeasonCard({ xpLevel, currentXp, xpToNext, progress }) {
  return (
    <section className="glass relative min-h-48 overflow-hidden rounded-xl border border-cyan/15 p-5">
      <img src={heroImage} alt="" className="absolute inset-0 h-full w-full object-cover object-right opacity-38" />
      <div className="absolute inset-0 bg-gradient-to-r from-background via-background/80 to-background/40" />
      <div className="relative">
        <TopfraggLogo wordmarkClassName="text-sm" markClassName="h-6 w-6" />
        <p className="mt-4 text-[10px] font-black uppercase tracking-wider text-cyan">Season 1</p>
        <div className="mt-2 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-cyan/30 bg-cyan/10">
            <span className="font-mono text-lg font-black text-cyan">{xpLevel}</span>
          </div>
          <div>
            <p className="text-xs font-black uppercase tracking-wider">XP Level</p>
            <p className="mt-1 text-xs text-vapor">{formatNumber(currentXp)} / {formatNumber(currentXp + xpToNext)} XP</p>
          </div>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-secondary">
          <div className="h-full rounded-full bg-gradient-to-r from-cyan to-green" style={{ width: `${progress}%` }} />
        </div>
      </div>
    </section>
  );
}

function NotificationList({ notifications, onRead, compact = false }) {
  if (notifications.length === 0) {
    return <div className="px-5 py-8 text-center text-xs text-vapor">No notifications</div>;
  }

  return (
    <div className={compact ? "" : "max-h-80 overflow-y-auto"}>
      {notifications.map((notification) => (
        <button
          key={notification.id}
          type="button"
          onClick={() => onRead(notification.id)}
          className={`block w-full border-b border-white/5 px-5 py-3.5 text-left transition-all last:border-0 hover:bg-white/5 ${!notification.is_read ? "bg-cyan/5" : ""}`}
        >
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary">
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
    <section className="glass overflow-hidden rounded-xl border border-white/5">
      <div className="flex items-center justify-between border-b border-white/5 px-5 py-3.5">
        <h3 className="flex items-center gap-2 text-sm font-black">
          <Icon className="h-4 w-4 text-cyan" />
          {title}
        </h3>
        <div className="flex items-center gap-2">
          {count > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-cyan px-1.5 text-[10px] font-black text-background">
              {count}
            </span>
          )}
          {to && <Link to={to} className="text-[10px] font-black uppercase tracking-wider text-cyan">View</Link>}
        </div>
      </div>
      <div className="divide-y divide-white/5">{children}</div>
    </section>
  );
}

function Panel({ title, action, to, children }) {
  return (
    <section className="glass h-full overflow-hidden rounded-xl border border-white/5">
      <div className="flex items-center justify-between border-b border-white/5 px-5 py-3.5">
        <h3 className="text-sm font-black uppercase tracking-wider">{title}</h3>
        {to ? (
          <Link to={to} className="text-[10px] font-black uppercase tracking-wider text-cyan">{action}</Link>
        ) : (
          <span className="text-[10px] font-black uppercase tracking-wider text-cyan">{action}</span>
        )}
      </div>
      <div>{children}</div>
    </section>
  );
}

function EmptyState({ icon: Icon, text }) {
  return (
    <div className="px-4 py-8 text-center">
      <Icon className="mx-auto mb-3 h-8 w-8 text-vapor/30" />
      <p className="text-xs text-vapor">{text}</p>
    </div>
  );
}
