import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  AlertCircle,
  Bell,
  Crown,
  Flame,
  Info,
  MessageSquare,
  Swords,
  Trophy,
  Wallet,
  Zap,
} from "lucide-react";
import RankBadge from "@/components/ui/RankBadge";
import { base44 } from "@/api/base44Client";
import { getRankForElo, getRankProgress } from "@/lib/ranks";
import { bootstrapCurrentUser } from "@/lib/userBootstrap";

const formatMoney = (value) => `$${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const formatDate = (value) => value ? new Date(value).toLocaleString() : "N/A";
const displayName = (user) => user?.display_name || user?.full_name || user?.username || user?.email || "your account";

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [rankedStats, setRankedStats] = useState(null);
  const [xpStats, setXpStats] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [messages, setMessages] = useState([]);
  const [recentMatches, setRecentMatches] = useState([]);
  const [upcomingTournaments, setUpcomingTournaments] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
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
          base44.entities.Notification.filter({ user_id: userData.id }, "-created_date", 20).catch(() => []),
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
  const totalRanked = (rankedStats?.wins || 0) + (rankedStats?.losses || 0);
  const rankedWinRate = totalRanked > 0 ? Math.round(((rankedStats?.wins || 0) / totalRanked) * 100) : 0;

  const quickStats = useMemo(() => ([
    { icon: Wallet, label: "Wallet", value: formatMoney(wallet?.available_balance ?? 0), color: "text-green" },
    { icon: Trophy, label: "Tournament Wins", value: user?.tournament_wins || 0, color: "text-orange" },
    { icon: Swords, label: "Ranked Win Rate", value: `${rankedWinRate}%`, color: "text-cyan" },
    { icon: Flame, label: "Win Streak", value: rankedStats?.win_streak || user?.current_win_streak || 0, color: "text-red-400" },
  ]), [wallet, user, rankedStats, rankedWinRate]);

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
    <div className="min-h-screen py-8">
      <div className="max-w-[1600px] mx-auto px-4 lg:px-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-black tracking-tight">Dashboard</h1>
            <p className="text-vapor text-sm mt-1">Welcome back, {displayName(user)}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative p-2.5 bg-secondary rounded-lg border border-white/5 hover:bg-white/10 transition-all"
              >
                <Bell className="w-4 h-4 text-vapor" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-orange rounded-full text-[9px] font-bold text-background flex items-center justify-center">
                    {unreadCount}
                  </span>
                )}
              </button>
              {showNotifications && (
                <div className="absolute right-0 top-12 w-80 glass rounded-xl border border-white/10 shadow-2xl overflow-hidden z-50">
                  <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
                    <h3 className="font-bold text-sm">Notifications</h3>
                    <Link to="/notifications" className="text-xs text-cyan hover:underline">View All</Link>
                  </div>
                  <NotificationList notifications={notifications.slice(0, 5)} onRead={markNotificationAsRead} />
                </div>
              )}
            </div>
            <Link to="/8s" className="inline-flex items-center gap-2 px-5 py-2.5 bg-cyan text-background font-bold text-xs rounded-lg hover:shadow-lg hover:shadow-cyan/25 transition-all uppercase tracking-wider">
              <Zap className="w-3.5 h-3.5" /> Quick Play
            </Link>
            <Link to="/ranked" className="inline-flex items-center gap-2 px-5 py-2.5 border border-white/10 font-bold text-xs rounded-lg hover:bg-white/5 transition-all uppercase tracking-wider">
              <Swords className="w-3.5 h-3.5" /> Ranked
            </Link>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="grid sm:grid-cols-2 gap-5">
              <motion.div whileHover={{ y: -2 }} className="glass rounded-xl p-6 border border-cyan/10 relative overflow-hidden">
                <div className="relative flex items-center gap-5">
                  <RankBadge rank={rank.tier} division={rank.division} size="lg" />
                  <div>
                    <p className="text-xs text-vapor uppercase tracking-wider mb-1">Current Rank</p>
                    <p className="text-2xl font-black">{rank.name}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-cyan font-mono font-bold text-lg">{Number(rankedStats?.elo || 0).toLocaleString()}</span>
                      <span className="text-xs text-vapor">ELO</span>
                    </div>
                  </div>
                </div>
                <div className="mt-5">
                  <div className="flex justify-between text-xs text-vapor mb-1">
                    <span>{rank.name}</span>
                    <span>{rank.max === Infinity ? "Max Rank" : `${rank.max + 1} ELO`}</span>
                  </div>
                  <div className="h-2 bg-secondary rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-cyan to-blue-400 rounded-full" style={{ width: `${getRankProgress(rankedStats?.elo || 0)}%` }} />
                  </div>
                </div>
              </motion.div>

              <motion.div whileHover={{ y: -2 }} className="glass rounded-xl p-6 border border-white/5">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-xs text-vapor uppercase tracking-wider">XP Level</p>
                  {user?.is_premium && (
                    <span className="flex items-center gap-1 text-xs text-orange font-mono">
                      <Crown className="w-3 h-3" /> Premium
                    </span>
                  )}
                </div>
                <div className="flex items-baseline gap-2 mb-4">
                  <span className="text-4xl font-black font-mono">{xpStats?.level || user?.xp_level || 1}</span>
                  <span className="text-xs text-vapor">Prestige {xpStats?.prestige || 0}</span>
                </div>
                <p className="text-[10px] text-vapor font-mono">{Number(xpStats?.total_xp || 0).toLocaleString()} total XP</p>
              </motion.div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {quickStats.map((stat) => (
                <motion.div key={stat.label} whileHover={{ y: -2 }} className="glass rounded-xl p-4 border border-white/5">
                  <stat.icon className={`w-4 h-4 ${stat.color} mb-2`} />
                  <p className={`text-xl font-bold font-mono ${stat.color}`}>{stat.value}</p>
                  <p className="text-[10px] text-vapor uppercase tracking-wider">{stat.label}</p>
                </motion.div>
              ))}
            </div>

            <div className="glass rounded-xl border border-white/5 overflow-hidden">
              <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
                <h3 className="font-bold text-sm">Recent Matches</h3>
                <Link to="/wagers" className="text-xs text-cyan hover:underline">View Wagers</Link>
              </div>
              <div className="divide-y divide-white/5">
                {recentMatches.length === 0 ? (
                  <div className="px-5 py-8 text-center text-vapor text-sm">No match history yet.</div>
                ) : recentMatches.map((match) => (
                  <div key={match.id} className="px-5 py-3 flex items-center gap-4 hover:bg-white/[0.02] transition-colors">
                    <span className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs font-mono bg-secondary text-cyan">
                      {(match.match_type || "R").charAt(0).toUpperCase()}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{match.game_mode_display || match.game_mode || "Match"}</p>
                      <p className="text-xs text-vapor">{match.final_map_name || "Map pending"} - {match.status || "unknown"}</p>
                    </div>
                    <span className="text-xs text-vapor hidden sm:block">{formatDate(match.match_completed_date || match.completed_date || match.created_date)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <SidePanel title="Notifications" icon={Bell} count={unreadCount}>
              <NotificationList notifications={notifications.slice(0, 5)} onRead={markNotificationAsRead} compact />
            </SidePanel>

            <SidePanel title="Messages" icon={MessageSquare} count={unreadMessages}>
              {messages.length === 0 ? (
                <div className="px-5 py-4 text-center text-xs text-vapor">No messages</div>
              ) : messages.slice(0, 5).map((message) => (
                <div key={message.id} onClick={() => markMessageAsRead(message.id)} className={`px-5 py-3 hover:bg-white/[0.02] cursor-pointer ${!message.is_read ? "bg-cyan/5" : ""}`}>
                  <p className={`text-xs font-semibold truncate ${!message.is_read ? "text-cyan" : "text-foreground"}`}>{message.sender_name || "Unknown sender"}</p>
                  <p className="text-[10px] text-vapor truncate">{message.subject || "No subject"}</p>
                </div>
              ))}
            </SidePanel>

            <SidePanel title="Upcoming Tournaments" icon={Trophy}>
              {upcomingTournaments.length === 0 ? (
                <div className="px-5 py-4 text-center text-xs text-vapor">No open tournaments.</div>
              ) : upcomingTournaments.map((tournament) => (
                <Link key={tournament.id} to="/tournaments" className="block px-5 py-3 border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                  <p className="text-sm font-medium">{tournament.name}</p>
                  <p className="text-xs text-vapor mt-1">{formatDate(tournament.start_date)} - {tournament.registered_teams || 0}/{tournament.max_teams} teams</p>
                </Link>
              ))}
            </SidePanel>
          </div>
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

function NotificationList({ notifications, onRead, compact = false }) {
  if (notifications.length === 0) {
    return <div className="px-4 py-8 text-center text-xs text-vapor">No notifications</div>;
  }

  return (
    <div className={compact ? "" : "max-h-80 overflow-y-auto"}>
      {notifications.map((notification) => (
        <div
          key={notification.id}
          onClick={() => onRead(notification.id)}
          className={`px-4 py-3 border-b border-white/5 hover:bg-white/5 cursor-pointer transition-all ${!notification.is_read ? "bg-cyan/5" : ""}`}
        >
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-secondary">
              {notification.type === "system" ? <Info className="w-4 h-4 text-cyan" /> : <AlertCircle className="w-4 h-4 text-vapor" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold truncate">{notification.title}</p>
              <p className="text-[10px] text-vapor mt-0.5 truncate">{notification.message}</p>
            </div>
            {!notification.is_read && <span className="w-2 h-2 bg-cyan rounded-full shrink-0" />}
          </div>
        </div>
      ))}
    </div>
  );
}

function SidePanel({ title, icon: Icon, count, children }) {
  return (
    <div className="glass rounded-xl border border-white/5 overflow-hidden">
      <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
        <h3 className="font-bold text-sm flex items-center gap-2">
          <Icon className="w-4 h-4 text-cyan" />
          {title}
        </h3>
        {count > 0 && (
          <span className="w-5 h-5 rounded-full bg-cyan flex items-center justify-center text-[10px] font-bold text-white">
            {count}
          </span>
        )}
      </div>
      <div className="divide-y divide-white/5">{children}</div>
    </div>
  );
}
