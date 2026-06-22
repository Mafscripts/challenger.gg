import React, { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Wallet, Bell, MessageSquare, ChevronDown, User, Crown,
  Menu, X, Gamepad2, Swords, Trophy, ShoppingBag,
  BarChart3, Users, Newspaper, BookOpen, Zap, Target, Flame,
  Info, AlertCircle, Star, ExternalLink, LogIn, UserPlus
} from "lucide-react";
import ForgeModal from "@/components/navbar/ForgeModal";
import { base44 } from "@/api/base44Client";
import { canAccessAdminPanel } from "@/lib/roles";
import { useAuth } from "@/lib/AuthContext";

const navLinks = [
  { label: "Dashboard", path: "/dashboard", icon: Gamepad2 },
  { label: "8s", path: "/8s", icon: Target },
  { label: "Ranked", path: "/ranked", icon: Swords },
  { label: "Wagers", path: "/wagers", icon: Zap },
  { label: "Tournaments", path: "/tournaments", icon: Trophy },
  { label: "XP Ladder", path: "/xp", icon: Zap },
  { label: "Marketplace", path: "/marketplace", icon: ShoppingBag },
  { label: "Leaderboards", path: "/leaderboards", icon: BarChart3 },
  { label: "Teams", path: "/teams", icon: Users },
  { label: "News", path: "/news", icon: Newspaper },
  { label: "Rules", path: "/rules", icon: BookOpen },
  { label: "Premium", path: "/premium", icon: Crown },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [forgeOpen, setForgeOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [messagesOpen, setMessagesOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [messages, setMessages] = useState([]);
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);
  const [matchesOpen, setMatchesOpen] = useState(false);
  const [activeMatches, setActiveMatches] = useState([]);
  const location = useLocation();
  const { isAuthenticated, user: authUser } = useAuth();
  const profilePath = user ? `/profile/${user.username || user.id}` : "/profile";
  const accountName = user?.display_name || user?.full_name || user?.username || user?.email || "Account";

  const clearUserState = () => {
    setUser(null);
    setNotifications([]);
    setMessages([]);
    setUnreadNotifCount(0);
    setUnreadMessagesCount(0);
    setActiveMatches([]);
  };

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

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
    
    // Refresh wallet data every 30 seconds
    const interval = setInterval(loadUser, 30000);
    return () => clearInterval(interval);
  }, [isAuthenticated, authUser]);

  const loadUser = async () => {
    try {
      const userData = await base44.auth.me();
      setUser(userData || null);
    } catch (error) {
      console.error('Failed to load user:', error);
      setUser(null);
    }
  };

  const loadNotifications = async () => {
    try {
      const user = await base44.auth.me();
      if (!user) return;
      const data = await base44.entities.Notification.filter({ user_id: user.id }, '-created_date', 5);
      setNotifications(data || []);
      setUnreadNotifCount((data || []).filter(n => !n.is_read).length);
    } catch (error) {
      console.error('Failed to load notifications:', error);
    }
  };

  const loadMessages = async () => {
    try {
      const user = await base44.auth.me();
      if (!user) return;
      const data = await base44.entities.Message.filter({ recipient_id: user.id }, '-created_date', 5);
      setMessages(data || []);
      setUnreadMessagesCount((data || []).filter(m => !m.is_read).length);
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
      ] = await Promise.all([
        base44.entities.Wager.filter({ host_id: user.id }).catch(() => []),
        base44.entities.Wager.filter({ challenger_id: user.id }).catch(() => []),
        base44.entities.RankedMatch.filter({ host_id: user.id }).catch(() => []),
        base44.entities.RankedMatch.filter({ challenger_id: user.id }).catch(() => []),
      ]);

      const byId = new Map();
      [...hostedWagers, ...challengedWagers].forEach((match) => byId.set(`wager:${match.id}`, { ...match, entity_type: "wager" }));
      [...hostedRanked, ...challengedRanked].forEach((match) => byId.set(`ranked:${match.id}`, { ...match, entity_type: "ranked" }));

      const active = [...byId.values()]
        .filter((match) => ['in_progress', 'awaiting_team_alpha_report', 'awaiting_team_bravo_report', 'awaiting_host_report', 'awaiting_challenger_report', 'score_conflict'].includes(match.status))
        .sort((a, b) => new Date(b.match_started_date || b.created_date || 0) - new Date(a.match_started_date || a.created_date || 0))
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
            {/* Logo */}
            <Link to="/" className="flex items-center gap-2 shrink-0">
              <div className="w-8 h-8 rounded bg-gradient-to-br from-cyan to-cyan/60 flex items-center justify-center">
                <span className="text-background font-bold text-sm font-mono">C</span>
              </div>
              <span className="font-bold text-lg tracking-tight hidden sm:block">
                Challenger<span className="text-cyan">.gg</span>
              </span>
            </Link>

            {/* Desktop Nav */}
            <div className="hidden xl:flex items-center gap-1">
              {user && navLinks.map((link) => {
                const active = location.pathname === link.path;
                return (
                  <Link
                    key={link.path}
                    to={link.path}
                    className={`relative px-3 py-2 text-[13px] font-medium rounded-md transition-all duration-300 
                      ${active ? "text-cyan" : "text-vapor hover:text-foreground"}`}
                  >
                    {link.label}
                    {active && (
                      <motion.div
                        layoutId="navIndicator"
                        className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-0.5 bg-cyan rounded-full"
                      />
                    )}
                  </Link>
                );
              })}
              
              {/* Matches Dropdown */}
              {user && (
              <div className="relative">
                <button
                  onClick={() => { setMatchesOpen(!matchesOpen); setNotifOpen(false); setMessagesOpen(false); }}
                  className={`relative px-3 py-2 text-[13px] font-medium rounded-md transition-all duration-300 flex items-center gap-1.5
                    ${matchesOpen ? "text-cyan bg-cyan/10" : "text-vapor hover:text-foreground"}`}
                >
                  <Swords className="w-3.5 h-3.5" />
                  Matches
                  <ChevronDown className={`w-3 h-3 transition-transform ${matchesOpen ? "rotate-180" : ""}`} />
                  {activeMatches.length > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-orange rounded-full" />
                  )}
                </button>

                <AnimatePresence>
                  {matchesOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 8, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 8, scale: 0.95 }}
                      className="absolute left-0 top-12 w-80 glass rounded-xl border border-white/10 shadow-2xl overflow-hidden z-50"
                    >
                      <div className="px-4 py-3 border-b border-white/5">
                        <h3 className="font-bold text-sm">Active Matches</h3>
                        <p className="text-xs text-vapor mt-0.5">Jump into your ongoing games</p>
                      </div>
                      <div className="max-h-96 overflow-y-auto">
                        {activeMatches.length === 0 ? (
                          <div className="px-4 py-8 text-center">
                            <Swords className="w-8 h-8 text-vapor/30 mx-auto mb-2" />
                            <p className="text-xs text-vapor">No active matches</p>
                            <p className="text-[10px] text-vapor/50 mt-1">Create or join a match to get started</p>
                          </div>
                        ) : (
                          activeMatches.map((match) => {
                            const isHost = user?.id === match.host_id;
                            const opponentName = isHost ? (match.challenger_name || "Opponent pending") : (match.host_name || "Host unavailable");
                            const route = match.entity_type === 'ranked' ? `/ranked-match/${match.id}` :
                                         match.match_type === '8s' ? `/8s-match/${match.id}` :
                                         match.match_type === 'xp' ? `/xp-match/${match.id}` :
                                         `/wagers-match/${match.id}`;
                            const matchType = match.entity_type === 'ranked' ? 'ranked' : match.match_type;
                            const themeClasses = matchType === '8s' ? 'bg-orange/10 text-orange' :
                                                matchType === 'ranked' ? 'bg-cyan/10 text-cyan' :
                                                matchType === 'xp' ? 'bg-purple-400/10 text-purple-400' : 'bg-green/10 text-green';
                            
                            return (
                              <Link
                                key={match.id}
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
                                    <div className="flex items-center gap-2 mt-1">
                                      <span className={`text-[9px] px-1 py-0.5 rounded ${themeClasses} font-medium`}>
                                        {match.status === 'in_progress' ? 'In Progress' : 
                                         match.status === 'score_conflict' ? 'Score Conflict' :
                                         'Awaiting Report'}
                                      </span>
                                      {match.entry_fee > 0 && (
                                        <span className="text-[9px] text-green font-medium">
                                          ${match.entry_fee} Wager
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <ExternalLink className={`w-3 h-3 shrink-0 ${themeClasses}`} />
                                </div>
                              </Link>
                            );
                          })
                        )}
                      </div>
                      {activeMatches.length > 0 && (
                        <div className="px-4 py-3 border-t border-white/5 bg-secondary/30">
                          <Link
                            to="/dashboard"
                            onClick={() => setMatchesOpen(false)}
                            className="text-xs text-cyan hover:underline font-medium flex items-center gap-1"
                          >
                            View all matches <ExternalLink className="w-3 h-3" />
                          </Link>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              )}
              
              {user && canAccessAdminPanel(user?.role || "user") && (
                <Link
                  to="/admin"
                  className="relative px-3 py-2 text-[13px] font-medium rounded-md transition-all duration-300 text-pink-400 hover:text-pink-300"
                >
                  Admin
                  <motion.div
                    className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-0.5 bg-pink-400 rounded-full"
                  />
                </Link>
              )}
            </div>

            {/* Right Side */}
            <div className="flex items-center gap-2">
              {user ? (
                <>
              {/* Wallet */}
              <Link to="/wallet" className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green/10 border border-green/20 hover:border-green/40 transition-all">
                <Wallet className="w-4 h-4 text-green" />
                <span className="text-green text-sm font-mono font-semibold">
                  ${user?.wallet_balance?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
                </span>
              </Link>

              {/* Notifications */}
              <div className="relative">
                <button
                  onClick={() => { setNotifOpen(!notifOpen); setMessagesOpen(false); }}
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
                            <div
                              key={notification.id}
                              onClick={() => { markNotifAsRead(notification.id); setNotifOpen(false); }}
                              className={`px-4 py-3 border-b border-white/5 hover:bg-white/5 cursor-pointer transition-all ${
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
                            </div>
                          ))
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Messages */}
              <div className="relative hidden sm:block">
                <button
                  onClick={() => { setMessagesOpen(!messagesOpen); setNotifOpen(false); }}
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

              {/* Profile */}
              <div className="relative">
                <button
                  onClick={() => setProfileOpen(!profileOpen)}
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
                      initial={{ opacity: 0, y: 8, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 8, scale: 0.95 }}
                      className="absolute right-0 top-12 w-56 glass rounded-xl p-2 shadow-2xl shadow-black/40"
                    >
                      <div className="px-3 py-2 border-b border-white/5 mb-1">
                        <p className="text-sm font-semibold">{accountName}</p>
                        <p className="text-xs text-vapor">
                          {user?.credits ? `${user.credits.toLocaleString()} Credits` : 'Member'}
                        </p>
                      </div>
                      {[
                        { label: "My Profile", path: profilePath },
                        { label: "Inventory", path: "/inventory" },
                        { label: "Trading", path: "/trading" },
                        { label: "Buy Credits", path: "/marketplace#credits-store" },
                        { label: "Settings", path: "/settings" },
                      ].map((item) => (
                        <Link
                          key={item.path}
                          to={item.path}
                          onClick={() => setProfileOpen(false)}
                          className="block px-3 py-2 text-sm text-vapor hover:text-foreground hover:bg-white/5 rounded-lg transition-all"
                        >
                          {item.label}
                        </Link>
                      ))}
                      <button
                        onClick={() => { setProfileOpen(false); setForgeOpen(true); }}
                        className="w-full text-left px-3 py-2 text-sm text-orange hover:text-foreground hover:bg-orange/10 rounded-lg transition-all flex items-center gap-2"
                      >
                        <Flame className="w-3.5 h-3.5" /> Forge Money to Credits
                      </button>
                      <div className="border-t border-white/5 mt-1 pt-1">
                        <Link
                          to="/logout"
                          onClick={() => setProfileOpen(false)}
                          className="block w-full text-left px-3 py-2 text-sm text-destructive hover:bg-destructive/10 rounded-lg transition-all"
                        >
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
              {user && navLinks.map((link) => {
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
              <div className="pt-4 border-t border-white/5">
                {user ? (
                  <>
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
                        ${user?.wallet_balance?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
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
