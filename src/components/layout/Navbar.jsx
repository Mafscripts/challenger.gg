import React, { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Wallet, Bell, MessageSquare, ChevronDown, User, Crown,
  Menu, X, Gamepad2, Swords, Trophy, ShoppingBag,
  BarChart3, Users, Newspaper, BookOpen, Zap, Target, Flame,
  Info, AlertCircle, Star, ExternalLink, LogIn, UserPlus,
  Activity, History, Settings, Package, Coins, LogOut, ShieldCheck
} from "lucide-react";
import TopfraggLogo from "@/components/brand/TopfraggLogo";
import ForgeModal from "@/components/navbar/ForgeModal";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";

const navGroups = [
  {
    label: "Compete",
    icon: Swords,
    items: [
      { label: "8s", path: "/8s", icon: Target },
      { label: "Ranked", path: "/ranked", icon: Swords },
      { label: "Wagers", path: "/wagers", icon: Zap },
      { label: "Tournaments", path: "/tournaments", icon: Trophy },
    ],
  },
  {
    label: "Rankings",
    icon: BarChart3,
    items: [
      { label: "XP Ladder", path: "/xp", icon: Zap },
      { label: "Leaderboards", path: "/leaderboards", icon: BarChart3 },
    ],
  },
  {
    label: "Armory",
    icon: ShoppingBag,
    items: [
      { label: "Marketplace", path: "/marketplace", icon: ShoppingBag },
      { label: "Premium", path: "/premium", icon: Crown },
    ],
  },
  {
    label: "Community",
    icon: Users,
    items: [
      { label: "Teams", path: "/teams", icon: Users },
      { label: "News", path: "/news", icon: Newspaper },
      { label: "Rules", path: "/rules", icon: BookOpen },
    ],
  },
];

const mobileNavSections = [
  {
    label: "Compete",
    items: navGroups[0].items,
  },
  {
    label: "Rankings",
    items: navGroups[1].items,
  },
  {
    label: "Armory",
    items: navGroups[2].items,
  },
  {
    label: "Community",
    items: navGroups[3].items,
  },
];

const staffRoles = new Set(["ceo", "super_admin", "admin", "moderator"]);
const isStaffUser = (candidate) => (
  staffRoles.has(candidate?.role)
  || staffRoles.has(candidate?.admin_role)
  || candidate?.is_admin === true
);

const activeMatchStatuses = new Set([
  "in_progress",
  "awaiting_team_alpha_report",
  "awaiting_team_bravo_report",
  "awaiting_host_report",
  "awaiting_challenger_report",
  "score_conflict",
]);
const activeTournamentStatuses = new Set(["ready", "in_progress", "awaiting_report", "disputed"]);

const dropdownMotion = {
  initial: { opacity: 0, y: 8, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: 8, scale: 0.98 },
  transition: { duration: 0.16, ease: "easeOut" },
};

const navButtonClass = "relative inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold transition-all duration-200";

const participantBelongsToUser = (participant, userId) => (
  participant?.captain_id === userId
  || participant?.user_id === userId
  || (participant?.members || []).some((member) => member?.user_id === userId)
);

const participantKeys = (participant) => [
  participant?.id,
  participant?.team_id,
  participant?.user_id,
  participant?.captain_id,
].filter(Boolean).map(String);

const tournamentMatchSideFor = (match, keys) => {
  const keySet = keys instanceof Set ? keys : new Set(keys || []);
  if ([match?.team_a_participant_id, match?.team_a_id].some((value) => value && keySet.has(String(value)))) return "team_a";
  if ([match?.team_b_participant_id, match?.team_b_id].some((value) => value && keySet.has(String(value)))) return "team_b";
  return null;
};

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [navMenuOpen, setNavMenuOpen] = useState(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [forgeOpen, setForgeOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [messagesOpen, setMessagesOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [messages, setMessages] = useState([]);
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);
  const [walletBalance, setWalletBalance] = useState(0);
  const [matchesOpen, setMatchesOpen] = useState(false);
  const [activeMatches, setActiveMatches] = useState([]);
  const location = useLocation();
  const { isAuthenticated, user: authUser } = useAuth();
  const profilePath = user ? `/profile/${user.username || user.id}` : "/profile";
  const accountName = user?.display_name || user?.full_name || user?.username || user?.email || "Account";
  const canSeeAdminLink = isStaffUser(user || authUser);
  const matchHistoryPath = profilePath;

  const closeDropdowns = () => {
    setNavMenuOpen(null);
    setMatchesOpen(false);
    setNotifOpen(false);
    setMessagesOpen(false);
    setProfileOpen(false);
  };

  const clearUserState = () => {
    setUser(null);
    setNotifications([]);
    setMessages([]);
    setUnreadNotifCount(0);
    setUnreadMessagesCount(0);
    setWalletBalance(0);
    setActiveMatches([]);
  };

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
    closeDropdowns();
  }, [location.pathname]);

  useEffect(() => {
    if (!isAuthenticated) {
      clearUserState();
      return;
    }

    loadUser();
    loadNotifications();
    loadMessages();
    loadActiveMatches();
  }, [location.pathname, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) {
      clearUserState();
      return;
    }

    if (authUser) {
      setUser(authUser);
    }

    loadUser();
    loadNotifications();
    loadMessages();
    loadActiveMatches();
    
    const interval = setInterval(() => {
      loadUser();
      loadNotifications();
      loadMessages();
      loadActiveMatches();
    }, 30000);
    return () => clearInterval(interval);
  }, [isAuthenticated, authUser]);

  useEffect(() => {
    if (!isAuthenticated) return undefined;
    const notificationInterval = setInterval(() => {
      loadNotifications();
    }, 5000);
    return () => clearInterval(notificationInterval);
  }, [isAuthenticated, authUser?.id]);

  useEffect(() => {
    if (!isAuthenticated) return undefined;
    const messageInterval = setInterval(() => {
      loadMessages();
    }, 5000);
    return () => clearInterval(messageInterval);
  }, [isAuthenticated, authUser?.id]);

  const loadUser = async () => {
    try {
      const userData = await base44.auth.me();
      if (!userData) {
        setUser(null);
        setWalletBalance(0);
        return;
      }
      const wallets = await base44.entities.Wallet.filter({ user_id: userData.id }, "-created_date", 1).catch(() => []);
      setWalletBalance(Number(wallets[0]?.available_balance ?? 0));
      setUser({ ...userData, wallet: wallets[0] || null });
    } catch (error) {
      console.error('Failed to load user:', error);
      setUser(null);
      setWalletBalance(0);
    }
  };

  const loadNotifications = async () => {
    try {
      const user = await base44.auth.me();
      if (!user) return;
      const data = await base44.entities.Notification.filterFresh({ user_id: user.id }, '-created_date', 10);
      const rows = data || [];
      const unreadCount = rows.filter(n => !n.is_read).length;
      setNotifications(rows);
      setUnreadNotifCount(unreadCount);
    } catch (error) {
      console.error('Failed to load notifications:', error);
    }
  };

  const loadMessages = async () => {
    try {
      const user = await base44.auth.me();
      if (!user) return;
      const data = await base44.entities.Message.filter({ recipient_id: user.id }, '-created_date', 5);
      const rows = data || [];
      setMessages(rows);
      setUnreadMessagesCount(rows.filter(m => !m.is_read).length);
    } catch (error) {
      console.error('Failed to load messages:', error);
    }
  };

  const loadActiveMatches = async () => {
    try {
      const user = await base44.auth.me();
      if (!user) return;
      
      const [
        hostedWagers,
        challengedWagers,
        hostedRanked,
        challengedRanked,
        tournamentParticipants,
      ] = await Promise.all([
        base44.entities.Wager.filter({ host_id: user.id }).catch(() => []),
        base44.entities.Wager.filter({ challenger_id: user.id }).catch(() => []),
        base44.entities.RankedMatch.filter({ host_id: user.id }).catch(() => []),
        base44.entities.RankedMatch.filter({ challenger_id: user.id }).catch(() => []),
        base44.entities.TournamentParticipant.filterFresh({}, "-registered_date", 500).catch(() => []),
      ]);

      const byId = new Map();
      [...hostedWagers, ...challengedWagers].forEach((match) => byId.set(`wager:${match.id}`, { ...match, entity_type: "wager" }));
      [...hostedRanked, ...challengedRanked].forEach((match) => byId.set(`ranked:${match.id}`, { ...match, entity_type: "ranked" }));

      const userParticipants = (tournamentParticipants || []).filter((participant) => participantBelongsToUser(participant, user.id));
      const participantKeySet = new Set(userParticipants.flatMap(participantKeys));
      const tournamentIds = [...new Set(userParticipants.map((participant) => participant.tournament_id).filter(Boolean))];
      const [tournamentMatchesByTournament, tournaments] = await Promise.all([
        Promise.all(tournamentIds.map((tournamentId) => (
          base44.entities.TournamentMatch.filterFresh({ tournament_id: tournamentId }, "-created_date", 256).catch(() => [])
        ))),
        Promise.all(tournamentIds.map((tournamentId) => (
          base44.entities.Tournament.get(tournamentId).catch(() => null)
        ))),
      ]);
      const tournamentNames = Object.fromEntries(tournaments.filter(Boolean).map((tournament) => [tournament.id, tournament.name]));

      tournamentMatchesByTournament.flat().forEach((match) => {
        const side = tournamentMatchSideFor(match, participantKeySet);
        if (!side) return;
        if (match.completed || !activeTournamentStatuses.has(match.status)) return;

        byId.set(`tournament:${match.id}`, {
          ...match,
          entity_type: "tournament",
          current_user_side: side,
          game_mode_display: tournamentNames[match.tournament_id] || "Tournament Match",
          game_mode: match.game_mode || "Search and Destroy",
          team_size: `BO${match.best_of || 3}`,
        });
      });

      const active = [...byId.values()]
        .filter((match) => (
          match.entity_type === "tournament"
            ? activeTournamentStatuses.has(match.status) && !match.completed
            : activeMatchStatuses.has(match.status)
        ))
        .sort((a, b) => new Date(b.match_started_date || b.assigned_date || b.created_date || 0) - new Date(a.match_started_date || a.assigned_date || a.created_date || 0))
        .slice(0, 5);
      
      setActiveMatches(active);
    } catch (error) {
      console.error('Failed to load active matches:', error);
    }
  };

  const markNotifAsRead = async (id) => {
    try {
      await base44.entities.Notification.update(id, { is_read: true });
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
      setUnreadNotifCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  };

  const markMessageAsRead = async (id) => {
    try {
      await base44.entities.Message.update(id, { is_read: true });
      setMessages(prev => prev.map(m => m.id === id ? { ...m, is_read: true } : m));
      setUnreadMessagesCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Failed to mark message as read:', error);
    }
  };

  return (
    <>
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        scrolled ? "glass-nav shadow-lg shadow-black/20" : "bg-transparent"
      }`}>
        <div className="max-w-[1600px] mx-auto px-4 lg:px-6">
          <div className="flex items-center justify-between h-16">
            {/* Logo + primary destination */}
            <div className="flex items-center gap-3 shrink-0">
              <Link to="/" className="flex items-center gap-2" aria-label="Topfragg.gg home">
                <TopfraggLogo markClassName="h-8 w-8" wordmarkClassName="hidden text-lg sm:inline-flex" />
              </Link>
              {user && (
                <Link
                  to="/dashboard"
                  className={`hidden md:inline-flex h-9 items-center gap-2 rounded-lg px-3 text-[13px] font-semibold transition-all duration-200 ${
                    location.pathname === "/dashboard"
                      ? "bg-cyan/10 text-cyan border border-cyan/20"
                      : "text-vapor hover:text-foreground hover:bg-white/5 border border-transparent"
                  }`}
                >
                  <Gamepad2 className="w-4 h-4" />
                  Dashboard
                </Link>
              )}
            </div>

            {/* Desktop Nav */}
            {user && (
              <div className="hidden xl:flex flex-1 items-center justify-center gap-1 px-4">
                {navGroups.map((group) => {
                  const GroupIcon = group.icon;
                  const active = group.items.some((item) => location.pathname === item.path);
                  const open = navMenuOpen === group.label;

                  return (
                    <div
                      key={group.label}
                      className="relative"
                      onMouseEnter={() => {
                        setNavMenuOpen(group.label);
                        setMatchesOpen(false);
                        setNotifOpen(false);
                        setMessagesOpen(false);
                        setProfileOpen(false);
                      }}
                      onMouseLeave={() => setNavMenuOpen(null)}
                    >
                      <button
                        className={`${navButtonClass} ${
                          active || open
                            ? "bg-cyan/10 text-cyan border border-cyan/20"
                            : "text-vapor hover:text-foreground hover:bg-white/5 border border-transparent"
                        }`}
                      >
                        <GroupIcon className="w-3.5 h-3.5" />
                        {group.label}
                        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
                      </button>

                      <AnimatePresence>
                        {open && (
                          <motion.div
                            {...dropdownMotion}
                            className="absolute left-0 top-11 w-56 rounded-lg border border-white/10 bg-background/95 p-2 shadow-2xl shadow-black/40 backdrop-blur-xl"
                          >
                            {group.items.map((item) => {
                              const ItemIcon = item.icon;
                              const itemActive = location.pathname === item.path;

                              return (
                                <Link
                                  key={item.path}
                                  to={item.path}
                                  onClick={() => setNavMenuOpen(null)}
                                  className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-all ${
                                    itemActive
                                      ? "bg-cyan/10 text-cyan"
                                      : "text-vapor hover:bg-white/5 hover:text-foreground"
                                  }`}
                                >
                                  <ItemIcon className="w-4 h-4" />
                                  <span className="font-medium">{item.label}</span>
                                </Link>
                              );
                            })}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}

                <div
                  className="relative"
                  onMouseEnter={() => {
                    setMatchesOpen(true);
                    setNavMenuOpen(null);
                    setNotifOpen(false);
                    setMessagesOpen(false);
                    setProfileOpen(false);
                    loadActiveMatches();
                  }}
                  onMouseLeave={() => setMatchesOpen(false)}
                >
                  <button
                    className={`${navButtonClass} ${
                      matchesOpen
                        ? "bg-cyan/10 text-cyan border border-cyan/20"
                        : "text-vapor hover:text-foreground hover:bg-white/5 border border-transparent"
                    }`}
                  >
                    <Activity className="w-3.5 h-3.5" />
                    Matches
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform ${matchesOpen ? "rotate-180" : ""}`} />
                    {activeMatches.length > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-orange rounded-full" />
                    )}
                  </button>

                  <AnimatePresence>
                    {matchesOpen && (
                      <motion.div
                        {...dropdownMotion}
                        className="absolute left-0 top-11 w-80 overflow-hidden rounded-lg border border-white/10 bg-background/95 shadow-2xl shadow-black/40 backdrop-blur-xl"
                      >
                        <div className="grid grid-cols-2 gap-2 p-2 border-b border-white/5">
                          <Link
                            to="/dashboard"
                            onClick={() => setMatchesOpen(false)}
                            className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-vapor hover:bg-white/5 hover:text-foreground"
                          >
                            <Activity className="w-4 h-4 text-cyan" />
                            Active Matches
                          </Link>
                          <Link
                            to={matchHistoryPath}
                            onClick={() => setMatchesOpen(false)}
                            className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-vapor hover:bg-white/5 hover:text-foreground"
                          >
                            <History className="w-4 h-4 text-cyan" />
                            Match History
                          </Link>
                        </div>
                        <div className="px-4 py-3 border-b border-white/5">
                          <h3 className="font-bold text-sm">Active Matches</h3>
                          <p className="text-xs text-vapor mt-0.5">Jump into your ongoing games</p>
                        </div>
                        <div className="max-h-80 overflow-y-auto">
                          {activeMatches.length === 0 ? (
                            <div className="px-4 py-8 text-center">
                              <Swords className="w-8 h-8 text-vapor/30 mx-auto mb-2" />
                              <p className="text-xs text-vapor">No active matches</p>
                            </div>
                          ) : (
                            activeMatches.map((match) => {
                              const isTournament = match.entity_type === "tournament";
                              const isHost = user?.id === match.host_id;
                              const opponentName = isTournament
                                ? (match.current_user_side === "team_a" ? match.team_b_name : match.team_a_name) || "Opponent pending"
                                : isHost ? (match.challenger_name || "Opponent pending") : (match.host_name || "Host unavailable");
                              const route = isTournament ? `/tournament-match/${match.id}` :
                                           match.entity_type === 'ranked' ? `/ranked-match/${match.id}` :
                                           match.match_type === '8s' ? `/8s-match/${match.id}` :
                                           match.match_type === 'xp' ? `/xp-match/${match.id}` :
                                           `/wagers-match/${match.id}`;
                              const matchType = isTournament ? "tournament" : match.entity_type === 'ranked' ? 'ranked' : match.match_type;
                              const themeClasses = matchType === '8s' ? 'bg-orange/10 text-orange' :
                                                  matchType === 'ranked' ? 'bg-cyan/10 text-cyan' :
                                                  matchType === 'xp' ? 'bg-purple-400/10 text-purple-400' :
                                                  matchType === 'tournament' ? 'bg-orange/10 text-orange' : 'bg-green/10 text-green';

                              return (
                                <Link
                                  key={`${match.entity_type}:${match.id}`}
                                  to={route}
                                  onClick={() => setMatchesOpen(false)}
                                  className="block px-4 py-3 border-b border-white/5 hover:bg-white/5 transition-all"
                                >
                                  <div className="flex items-center gap-3">
                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${themeClasses}`}>
                                      <Swords className="w-4 h-4" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2">
                                        <p className="text-xs font-semibold truncate">{match.game_mode_display || match.game_mode}</p>
                                        <span className={`text-[9px] px-1.5 py-0.5 rounded ${themeClasses} font-bold uppercase`}>
                                          {match.team_size}
                                        </span>
                                      </div>
                                      <p className="text-[10px] text-vapor truncate">vs {opponentName}</p>
                                    </div>
                                    <ExternalLink className="w-3 h-3 shrink-0 text-vapor" />
                                  </div>
                                </Link>
                              );
                            })
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            )}

            {/* Right Side */}
            <div className="flex items-center gap-2">
              {user ? (
                <>
              {/* Wallet */}
              <Link to="/wallet" className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green/10 border border-green/20 hover:border-green/40 transition-all">
                <Wallet className="w-4 h-4 text-green" />
                <span className="text-green text-sm font-mono font-semibold">
                  ${walletBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </Link>

              {/* Notifications */}
              <div
                className="relative"
                onMouseEnter={() => {
                  setNotifOpen(true);
                  setNavMenuOpen(null);
                  setMatchesOpen(false);
                  setMessagesOpen(false);
                  setProfileOpen(false);
                  loadNotifications();
                }}
                onMouseLeave={() => setNotifOpen(false)}
              >
                <button
                  type="button"
                  className="relative p-2 rounded-lg text-vapor hover:text-foreground hover:bg-secondary transition-all"
                >
                  <Bell className="w-4 h-4" />
                  {unreadNotifCount > 0 && (
                    <span className="absolute top-1 right-1 w-2 h-2 bg-orange rounded-full" />
                  )}
                </button>

                <AnimatePresence>
                  {notifOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 8, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 8, scale: 0.95 }}
                      className="absolute right-0 top-12 w-80 glass rounded-xl border border-white/10 shadow-2xl overflow-hidden z-50"
                    >
                      <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
                        <h3 className="font-bold text-sm">Notifications</h3>
                        <Link to="/notifications" onClick={() => setNotifOpen(false)} className="text-xs text-cyan hover:underline">
                          View All
                        </Link>
                      </div>
                      <div className="max-h-80 overflow-y-auto">
                        {notifications.length === 0 ? (
                          <div className="px-4 py-8 text-center">
                            <Bell className="w-8 h-8 text-vapor/30 mx-auto mb-2" />
                            <p className="text-xs text-vapor">No notifications</p>
                          </div>
                        ) : (
                          notifications.map((notification) => (
                            <Link
                              key={notification.id}
                              to={notification.action_url || "/notifications"}
                              onClick={() => { markNotifAsRead(notification.id); setNotifOpen(false); }}
                              className={`block px-4 py-3 border-b border-white/5 hover:bg-white/5 cursor-pointer transition-all ${
                                !notification.is_read ? 'bg-cyan/5' : ''
                              }`}
                            >
                              <div className="flex items-start gap-3">
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                                  notification.type === 'system' ? 'bg-cyan/10' :
                                  notification.type === 'match' ? 'bg-orange/10' :
                                  notification.type === 'tournament' ? 'bg-purple/10' : 'bg-secondary'
                                }`}>
                                  {notification.type === 'system' ? <Info className="w-4 h-4 text-cyan" /> :
                                   notification.type === 'match' ? <Trophy className="w-4 h-4 text-orange" /> :
                                   notification.type === 'tournament' ? <Star className="w-4 h-4 text-purple-400" /> :
                                   <AlertCircle className="w-4 h-4 text-vapor" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-semibold truncate">{notification.title}</p>
                                  <p className="text-[10px] text-vapor mt-0.5 truncate">{notification.message}</p>
                                  <p className="text-[9px] text-vapor/50 mt-1">
                                    {new Date(notification.created_date).toLocaleDateString()}
                                  </p>
                                </div>
                                {!notification.is_read && (
                                  <span className="w-2 h-2 bg-cyan rounded-full shrink-0" />
                                )}
                              </div>
                            </Link>
                          ))
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Messages */}
              <div
                className="relative hidden sm:block"
                onMouseEnter={() => {
                  setMessagesOpen(true);
                  setNavMenuOpen(null);
                  setMatchesOpen(false);
                  setNotifOpen(false);
                  setProfileOpen(false);
                  loadMessages();
                }}
                onMouseLeave={() => setMessagesOpen(false)}
              >
                <button
                  type="button"
                  className="p-2 rounded-lg text-vapor hover:text-foreground hover:bg-secondary transition-all"
                >
                  <MessageSquare className="w-4 h-4" />
                  {unreadMessagesCount > 0 && (
                    <span className="absolute top-1 right-1 w-2 h-2 bg-cyan rounded-full" />
                  )}
                </button>

                <AnimatePresence>
                  {messagesOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 8, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 8, scale: 0.95 }}
                      className="absolute right-0 top-12 w-80 glass rounded-xl border border-white/10 shadow-2xl overflow-hidden z-50"
                    >
                      <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
                        <h3 className="font-bold text-sm">Messages</h3>
                        <Link to="/messages" onClick={() => setMessagesOpen(false)} className="text-xs text-cyan hover:underline">
                          View All
                        </Link>
                      </div>
                      <div className="max-h-80 overflow-y-auto">
                        {messages.length === 0 ? (
                          <div className="px-4 py-8 text-center">
                            <MessageSquare className="w-8 h-8 text-vapor/30 mx-auto mb-2" />
                            <p className="text-xs text-vapor">No messages</p>
                          </div>
                        ) : (
                          messages.map((message) => (
                            <div
                              key={message.id}
                              onClick={() => { markMessageAsRead(message.id); setMessagesOpen(false); }}
                              className={`px-4 py-3 border-b border-white/5 hover:bg-white/5 cursor-pointer transition-all ${
                                !message.is_read ? 'bg-cyan/5' : ''
                              }`}
                            >
                              <div className="flex items-start gap-3">
                                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan/30 to-orange/30 border border-white/10 flex items-center justify-center text-xs font-bold shrink-0">
                                  {(message.sender_name || "Unknown sender").charAt(0)}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className={`text-xs font-semibold truncate ${!message.is_read ? 'text-cyan' : 'text-foreground'}`}>
                                    {message.sender_name || "Unknown sender"}
                                  </p>
                                  <p className="text-[10px] text-vapor truncate">{message.subject || 'No subject'}</p>
                                  <p className="text-[9px] text-vapor/50 mt-1">
                                    {new Date(message.created_date).toLocaleDateString()}
                                  </p>
                                </div>
                                {!message.is_read && (
                                  <span className="w-2 h-2 bg-cyan rounded-full shrink-0" />
                                )}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {canSeeAdminLink && (
                <Link
                  to="/admin"
                  className="hidden lg:inline-flex items-center gap-2 rounded-lg border border-pink-400/20 bg-pink-400/10 px-3 py-2 text-sm font-semibold text-pink-300 transition-all hover:border-pink-400/40 hover:text-pink-200"
                >
                  <ShieldCheck className="w-4 h-4" />
                  Admin
                </Link>
              )}

              {/* Profile */}
              <div
                className="relative"
                onMouseEnter={() => {
                  setProfileOpen(true);
                  setNavMenuOpen(null);
                  setMatchesOpen(false);
                  setNotifOpen(false);
                  setMessagesOpen(false);
                }}
                onMouseLeave={() => setProfileOpen(false)}
              >
                <button
                  type="button"
                  className="flex items-center gap-2 pl-2 pr-1 py-1 rounded-lg hover:bg-secondary transition-all"
                >
                  <div className="w-7 h-7 rounded-md bg-gradient-to-br from-cyan/30 to-orange/30 border border-white/10 flex items-center justify-center">
                    <User className="w-3.5 h-3.5" />
                  </div>
                  <ChevronDown className={`w-3.5 h-3.5 text-vapor transition-transform ${profileOpen ? "rotate-180" : ""}`} />
                </button>

                <AnimatePresence>
                  {profileOpen && (
                    <motion.div
                      {...dropdownMotion}
                      className="absolute right-0 top-12 z-50 w-72 rounded-lg border border-white/10 bg-background/95 p-2 shadow-2xl shadow-black/40 backdrop-blur-xl"
                    >
                      <div className="px-3 py-2 border-b border-white/5 mb-1">
                        <p className="text-sm font-semibold">{accountName}</p>
                        <p className="text-xs text-vapor">
                          {user?.credits ? `${user.credits.toLocaleString()} Credits` : 'Member'}
                        </p>
                      </div>
                      <ProfileMenuSection
                        label="Account"
                        items={[
                          { label: "My Profile", path: profilePath, icon: User },
                          { label: "Settings", path: "/settings", icon: Settings },
                        ]}
                        onSelect={() => setProfileOpen(false)}
                      />
                      <ProfileMenuSection
                        label="Armory"
                        items={[
                          { label: "Wallet", path: "/wallet", icon: Wallet },
                          { label: "Buy Credits", path: "/marketplace#credits-store", icon: Coins },
                          { label: "Inventory", path: "/inventory", icon: Package },
                          { label: "Trading", path: "/trading", icon: ShoppingBag },
                        ]}
                        onSelect={() => setProfileOpen(false)}
                      />
                      {canSeeAdminLink && (
                        <div className="border-t border-white/5 pt-2 mt-2">
                          <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-vapor/60">Admin</p>
                          <Link
                            to="/admin"
                            onClick={() => setProfileOpen(false)}
                            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-vapor transition-all hover:bg-white/5 hover:text-foreground"
                          >
                            <ShieldCheck className="w-4 h-4 text-pink-300" />
                            Admin Console
                          </Link>
                          <button
                            onClick={() => { setProfileOpen(false); setForgeOpen(true); }}
                            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm text-vapor transition-all hover:bg-orange/10 hover:text-orange"
                          >
                            <Flame className="w-4 h-4 text-orange" />
                            Forge Money to Credits
                          </button>
                        </div>
                      )}
                      <div className="border-t border-white/5 mt-1 pt-1">
                        <Link
                          to="/logout"
                          onClick={() => setProfileOpen(false)}
                          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm text-destructive transition-all hover:bg-destructive/10"
                        >
                          <LogOut className="w-4 h-4" />
                          Sign Out
                        </Link>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
                </>
              ) : (
                <div className="flex items-center gap-2">
                  <Link
                    to="/login"
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-vapor hover:text-foreground hover:bg-secondary transition-all text-sm font-semibold"
                  >
                    <LogIn className="w-4 h-4" />
                    Login
                  </Link>
                  <Link
                    to="/register"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan text-background hover:shadow-lg hover:shadow-cyan/20 transition-all text-sm font-bold"
                  >
                    <UserPlus className="w-4 h-4" />
                    Register
                  </Link>
                </div>
              )}

              {/* Mobile Toggle */}
              <button
                onClick={() => setMobileOpen(!mobileOpen)}
                className={`${user ? "xl:hidden" : "hidden"} p-2 rounded-lg text-vapor hover:text-foreground hover:bg-secondary transition-all`}
              >
                {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Mobile Menu */}
      <AnimatePresence>
        {user && mobileOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed inset-0 z-40 bg-background/95 backdrop-blur-xl pt-20 overflow-y-auto xl:hidden"
          >
            <div className="max-w-lg mx-auto px-6 py-4 space-y-1">
              <Link
                to="/dashboard"
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-base font-medium transition-all
                  ${location.pathname === "/dashboard" ? "bg-cyan/10 text-cyan" : "text-vapor hover:text-foreground hover:bg-secondary"}`}
              >
                <Gamepad2 className="w-5 h-5" />
                Dashboard
              </Link>
              {mobileNavSections.map((section) => (
                <div key={section.label} className="pt-3">
                  <p className="px-4 pb-1 text-[10px] font-bold uppercase tracking-wider text-vapor/60">{section.label}</p>
                  <div className="space-y-1">
                    {section.items.map((link) => {
                      const Icon = link.icon;
                      const active = location.pathname === link.path;
                      return (
                        <Link
                          key={link.path}
                          to={link.path}
                          className={`flex items-center gap-3 px-4 py-3 rounded-xl text-base font-medium transition-all
                            ${active ? "bg-cyan/10 text-cyan" : "text-vapor hover:text-foreground hover:bg-secondary"}`}
                        >
                          <Icon className="w-5 h-5" />
                          {link.label}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
              <div className="pt-3">
                <p className="px-4 pb-1 text-[10px] font-bold uppercase tracking-wider text-vapor/60">Matches</p>
                <div className="space-y-1">
                  <Link
                    to="/dashboard"
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl text-base font-medium transition-all
                      text-vapor hover:text-foreground hover:bg-secondary`}
                  >
                    <Activity className="w-5 h-5" />
                    Active Matches
                  </Link>
                  <Link
                    to={matchHistoryPath}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl text-base font-medium text-vapor hover:text-foreground hover:bg-secondary transition-all"
                  >
                    <History className="w-5 h-5" />
                    Match History
                  </Link>
                </div>
              </div>
              <div className="pt-4 border-t border-white/5">
                {user ? (
                  <>
                    {canSeeAdminLink && (
                      <Link
                        to="/admin"
                        className="flex items-center gap-3 px-4 py-3 rounded-xl text-base font-medium text-pink-300 hover:bg-pink-400/10 transition-all"
                      >
                        <ShieldCheck className="w-5 h-5" />
                        Admin Console
                      </Link>
                    )}
                    <Link
                      to={profilePath}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl text-base font-medium text-vapor hover:text-foreground hover:bg-secondary transition-all"
                    >
                      <User className="w-5 h-5" />
                      My Profile
                    </Link>
                    <Link
                      to="/wallet"
                      className="flex items-center gap-2 px-4 py-3 rounded-xl hover:bg-secondary transition-all"
                    >
                      <Wallet className="w-5 h-5 text-green" />
                      <span className="text-green font-mono font-semibold">
                        ${walletBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </Link>
                    <Link
                      to="/logout"
                      className="flex items-center gap-3 px-4 py-3 rounded-xl text-base font-medium text-destructive hover:bg-destructive/10 transition-all"
                    >
                      <LogIn className="w-5 h-5" />
                      Sign Out
                    </Link>
                  </>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <Link
                      to="/login"
                      className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-vapor bg-secondary hover:text-foreground transition-all font-semibold"
                    >
                      <LogIn className="w-4 h-4" />
                      Login
                    </Link>
                    <Link
                      to="/register"
                      className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-cyan text-background transition-all font-bold"
                    >
                      <UserPlus className="w-4 h-4" />
                      Register
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <ForgeModal open={forgeOpen} onClose={() => setForgeOpen(false)} />
    </>
  );
}

function ProfileMenuSection({ label, items, onSelect }) {
  return (
    <div className="border-t border-white/5 pt-2 mt-2 first:border-t-0 first:pt-1 first:mt-1">
      <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-vapor/60">{label}</p>
      {items.map((item) => {
        const Icon = item.icon;

        return (
          <Link
            key={item.path}
            to={item.path}
            onClick={onSelect}
            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-vapor transition-all hover:bg-white/5 hover:text-foreground"
          >
            <Icon className="w-4 h-4 text-cyan" />
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}
