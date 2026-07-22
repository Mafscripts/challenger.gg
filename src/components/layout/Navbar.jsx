import React, { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Wallet, Bell, MessageSquare, ChevronDown, User, Crown,
  Menu, X, Gamepad2, Swords, Trophy, ShoppingBag,
  Users, Newspaper, BookOpen, Zap, Target,
  Info, AlertCircle, Star, ExternalLink, LogIn, UserPlus,
  Activity, History, Settings, Package, LogOut, ShieldCheck, Monitor, Plus, LifeBuoy, Coins
} from "lucide-react";
import TopfraggLogo from "@/components/brand/TopfraggLogo";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";

const navGroups = [
  {
    label: "Compete",
    icon: Swords,
    eyebrow: "Competition Hub",
    tone: "cyan",
    items: [
      { label: "Ranked", description: "Climb the competitive ladder", path: "/ranked", icon: Swords, tone: "cyan" },
      { label: "Wagers", description: "Compete for real stakes", path: "/wagers", icon: Zap, tone: "green" },
      { label: "Tournaments", description: "Enter official competitions", path: "/tournaments", icon: Trophy, tone: "orange" },
      { label: "8s", description: "Quick competitive lobbies", path: "/8s", icon: Target, tone: "purple" },
    ],
  },
  {
    label: "Leaderboards",
    icon: Trophy,
    eyebrow: "Competitive Rankings",
    tone: "gold",
    items: [
      { label: "Leaderboard", description: "Explore all competitive rankings", path: "/leaderboards", icon: Trophy, tone: "gold" },
      { label: "XP Ladder", description: "Compare account levels and XP", path: "/xp", icon: Zap, tone: "purple" },
    ],
  },
  {
    label: "Armory",
    icon: ShoppingBag,
    eyebrow: "Your Collection",
    tone: "purple",
    items: [
      { label: "Marketplace", description: "Discover items and cosmetics", path: "/marketplace", icon: ShoppingBag, tone: "purple" },
      { label: "My Inventory", description: "Manage your owned items", path: "/inventory", icon: Package, tone: "cyan" },
      { label: "Trading", description: "Trade with other players", path: "/trading", icon: Activity, tone: "green" },
      { label: "Premium", description: "Unlock premium benefits", path: "/premium", icon: Crown, tone: "gold" },
    ],
  },
  {
    label: "Community",
    icon: Users,
    eyebrow: "Topfragg Network",
    tone: "blue",
    items: [
      { label: "Teams", description: "Build and manage your roster", path: "/teams", icon: Users, tone: "blue" },
      { label: "News", description: "Latest Topfragg updates", path: "/news", icon: Newspaper, tone: "cyan" },
      { label: "Rules", description: "Competitive rules and policies", path: "/rules", icon: BookOpen, tone: "orange" },
      { label: "Support", description: "Get help from our staff", path: "/support", icon: LifeBuoy, tone: "red" },
    ],
  },
];

const mobileNavSections = [
  {
    label: "Compete",
    items: navGroups[0].items,
  },
  {
    label: "Leaderboards",
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
const isStreamerUser = (candidate) => {
  const badges = Array.isArray(candidate?.badges) ? candidate.badges : [];
  return Boolean(candidate?.streamer_badge || candidate?.is_streamer || badges.some((badge) => badge?.type === "streamer"));
};

const activeMatchStatuses = new Set([
  "accepted",
  "escrow_paid",
  "ready",
  "in_progress",
  "awaiting_team_alpha_report",
  "awaiting_team_bravo_report",
  "awaiting_host_report",
  "awaiting_challenger_report",
  "awaiting_completion",
  "score_conflict",
  "disputed",
]);
const activeTournamentStatuses = new Set([
  "ready",
  "in_progress",
  "awaiting_report",
  "awaiting_team_a_report",
  "awaiting_team_b_report",
  "score_conflict",
  "disputed",
]);

const navButtonClass = "relative inline-flex h-10 items-center gap-2 rounded-xl border px-2.5 text-[13px] font-bold transition-colors duration-100";
const navTone = {
  cyan: { button: "border-cyan/25 bg-cyan/10 text-cyan", icon: "border-cyan/20 bg-cyan/10 text-cyan" },
  gold: { button: "border-yellow-400/25 bg-yellow-400/10 text-yellow-300", icon: "border-yellow-400/20 bg-yellow-400/10 text-yellow-300" },
  purple: { button: "border-purple-400/25 bg-purple-400/10 text-purple-300", icon: "border-purple-400/20 bg-purple-400/10 text-purple-300" },
  blue: { button: "border-blue-400/25 bg-blue-400/10 text-blue-300", icon: "border-blue-400/20 bg-blue-400/10 text-blue-300" },
  green: { button: "border-green/25 bg-green/10 text-green", icon: "border-green/20 bg-green/10 text-green" },
  orange: { button: "border-orange/25 bg-orange/10 text-orange", icon: "border-orange/20 bg-orange/10 text-orange" },
  red: { button: "border-red-400/25 bg-red-400/10 text-red-300", icon: "border-red-400/20 bg-red-400/10 text-red-300" },
};

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
  const [notifOpen, setNotifOpen] = useState(false);
  const [messagesOpen, setMessagesOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [messages, setMessages] = useState([]);
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);
  const [walletBalance, setWalletBalance] = useState(0);
  const [creditBalance, setCreditBalance] = useState(0);
  const [profileAvatar, setProfileAvatar] = useState("");
  const [matchesOpen, setMatchesOpen] = useState(false);
  const [activeMatches, setActiveMatches] = useState([]);
  const [adminDispute, setAdminDispute] = useState(null);
  const activeMatchesLoadedAt = useRef(0);
  const activeAdminDisputeId = useRef(null);
  const dismissedAdminDisputes = useRef(new Set());
  const notificationsLoadedAt = useRef(0);
  const messagesLoadedAt = useRef(0);
  const dropdownCloseTimer = useRef(null);
  const location = useLocation();
  const { isAuthenticated, user: authUser } = useAuth();
  const profilePath = user ? `/profile/${user.username || user.id}` : "/profile";
  const accountName = user?.display_name || user?.full_name || user?.username || user?.email || "Account";
  const canSeeAdminLink = isStaffUser(user || authUser);
  const canSeeStreamerShortcut = isStreamerUser(user || authUser);
  const matchHistoryPath = profilePath;

  const cancelDropdownClose = () => {
    if (!dropdownCloseTimer.current) return;
    window.clearTimeout(dropdownCloseTimer.current);
    dropdownCloseTimer.current = null;
  };

  const scheduleDropdownClose = (close) => {
    cancelDropdownClose();
    dropdownCloseTimer.current = window.setTimeout(() => {
      close();
      dropdownCloseTimer.current = null;
    }, 100);
  };

  const closeDropdowns = () => {
    cancelDropdownClose();
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
    setCreditBalance(0);
    setProfileAvatar("");
    setActiveMatches([]);
  };

  useEffect(() => {
    let animationFrame = null;
    const handleScroll = () => {
      if (animationFrame) return;
      animationFrame = window.requestAnimationFrame(() => {
        const next = window.scrollY > 20;
        setScrolled((current) => current === next ? current : next);
        animationFrame = null;
      });
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
    };
  }, []);

  useEffect(() => () => {
    if (dropdownCloseTimer.current) window.clearTimeout(dropdownCloseTimer.current);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
    closeDropdowns();
  }, [location.pathname]);

  useEffect(() => {
    if (!isAuthenticated) {
      clearUserState();
      return undefined;
    }

    if (authUser) {
      setUser(authUser);
    }

    const refreshHeader = () => {
      if (document.visibilityState === "hidden") return;
      loadUser(authUser);
      loadNotifications({ userId: authUser?.id });
      loadMessages({ userId: authUser?.id });
    };
    refreshHeader();
    const interval = window.setInterval(refreshHeader, 60000);
    document.addEventListener("visibilitychange", refreshHeader);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshHeader);
    };
  }, [isAuthenticated, authUser?.id]);

  useEffect(() => {
    const handleProfileUpdated = (event) => {
      if (event.detail?.avatarUrl !== undefined) setProfileAvatar(event.detail.avatarUrl || "");
      loadUser(authUser);
    };
    window.addEventListener("topfragg:profile-updated", handleProfileUpdated);
    return () => window.removeEventListener("topfragg:profile-updated", handleProfileUpdated);
  }, [authUser?.id]);

  useEffect(() => {
    const handleNotificationsUpdated = (event) => {
      const detail = event.detail || {};
      if (detail.refresh) {
        notificationsLoadedAt.current = 0;
        loadNotifications({ fresh: true });
        return;
      }
      if (Number.isFinite(detail.unreadCount)) setUnreadNotifCount(detail.unreadCount);
      if (detail.clearAll) {
        setNotifications([]);
      } else if (detail.markAllRead) {
        setNotifications(prev => prev.map(notification => ({ ...notification, is_read: true })));
      } else if (detail.readId) {
        setNotifications(prev => prev.map(notification => (
          notification.id === detail.readId ? { ...notification, is_read: true } : notification
        )));
      } else if (detail.removedId) {
        setNotifications(prev => prev.filter(notification => notification.id !== detail.removedId));
      }
      notificationsLoadedAt.current = 0;
    };

    window.addEventListener("topfragg:notifications-updated", handleNotificationsUpdated);
    return () => window.removeEventListener("topfragg:notifications-updated", handleNotificationsUpdated);
  }, []);

  useEffect(() => {
    const handleMessagesUpdated = () => {
      messagesLoadedAt.current = 0;
      loadMessages({ fresh: true });
    };
    window.addEventListener("topfragg:messages-updated", handleMessagesUpdated);
    return () => window.removeEventListener("topfragg:messages-updated", handleMessagesUpdated);
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return undefined;
    const loadWhenIdle = () => {
      if (document.visibilityState !== "hidden") loadActiveMatches();
    };
    const idleHandle = "requestIdleCallback" in window
      ? window.requestIdleCallback(loadWhenIdle, { timeout: 3500 })
      : window.setTimeout(loadWhenIdle, 1500);
    return () => {
      if ("cancelIdleCallback" in window) window.cancelIdleCallback(idleHandle);
      else window.clearTimeout(idleHandle);
    };
  }, [isAuthenticated, authUser?.id]);

  useEffect(() => {
    if (!isAuthenticated || !authUser?.id) return undefined;
    let active = true;
    const refreshLiveHeader = () => {
      if (!active || document.visibilityState === "hidden") return;
      loadActiveMatches({ fresh: true });
      loadNotifications({ fresh: true, userId: authUser.id });
      if (isStaffUser(user || authUser)) {
        base44.entities.Dispute.filterFresh({}, "-created_date", 50).then(async (rows) => {
          if (!active) return;
          const pendingDisputes = (rows || []).filter((dispute) => ["pending", "under_review"].includes(dispute.status));
          const pendingIds = new Set(pendingDisputes.map((dispute) => dispute.id));
          if (activeAdminDisputeId.current && !pendingIds.has(activeAdminDisputeId.current)) {
            activeAdminDisputeId.current = null;
            setAdminDispute(null);
          }

          const matchIsClosed = async (dispute) => {
            const matchId = dispute.match_id || dispute.wager_id || dispute.tournament_match_id;
            if (!matchId) return true;
            const matchType = dispute.match_type || (dispute.tournament_match_id ? "tournament" : "wager");
            const entityName = matchType === "ranked" ? "RankedMatch" : matchType === "tournament" ? "TournamentMatch" : "Wager";
            const match = await base44.entities[entityName].getFresh(matchId).catch(() => null);
            return !match || match.completed === true || ["completed", "cancelled", "closed"].includes(match.status);
          };

          if (activeAdminDisputeId.current) {
            const visibleDispute = pendingDisputes.find((dispute) => dispute.id === activeAdminDisputeId.current);
            if (visibleDispute && await matchIsClosed(visibleDispute)) {
              dismissedAdminDisputes.current.add(visibleDispute.id);
              activeAdminDisputeId.current = null;
              setAdminDispute(null);
            } else {
              return;
            }
          }

          let nextDispute = null;
          for (const dispute of pendingDisputes) {
            if (dismissedAdminDisputes.current.has(dispute.id)) continue;
            if (await matchIsClosed(dispute)) {
              dismissedAdminDisputes.current.add(dispute.id);
              continue;
            }
            nextDispute = dispute;
            break;
          }
          if (!active || !nextDispute) return;
          activeAdminDisputeId.current = nextDispute.id;
          setAdminDispute(nextDispute);
        }).catch((error) => console.error("Failed to refresh staff disputes:", error));
      }
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") refreshLiveHeader();
    };
    refreshLiveHeader();
    const interval = window.setInterval(refreshLiveHeader, 1000);
    window.addEventListener("focus", refreshLiveHeader);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshLiveHeader);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [isAuthenticated, authUser?.id, user?.id, user?.role]);

  const loadUser = async (knownUser = null) => {
    try {
      const userData = knownUser?.id ? knownUser : await base44.auth.me();
      if (!userData) {
        setUser(null);
        setWalletBalance(0);
        setCreditBalance(0);
        setProfileAvatar("");
        return;
      }
      const [wallets, profiles] = await Promise.all([
        base44.entities.Wallet.filter({ user_id: userData.id }, "-created_date", 1).catch(() => []),
        base44.entities.PlayerProfile.filter({ user_id: userData.id }, "-created_date", 1).catch(() => []),
      ]);
      const playerProfile = profiles[0] || null;
      setWalletBalance(Number(wallets[0]?.available_balance ?? 0));
      setCreditBalance(Number(userData.credits ?? playerProfile?.credits ?? 0));
      setProfileAvatar(playerProfile?.avatar_url || userData.avatar_url || "");
      setUser({ ...userData, wallet: wallets[0] || null, player_profile: playerProfile });
    } catch (error) {
      console.error('Failed to load user:', error);
      setUser(null);
      setWalletBalance(0);
      setCreditBalance(0);
      setProfileAvatar("");
    }
  };

  const loadNotifications = async ({ fresh = false, userId = null } = {}) => {
    try {
      if (fresh && Date.now() - notificationsLoadedAt.current < 900) return;
      const resolvedUserId = userId || user?.id || authUser?.id || (await base44.auth.me())?.id;
      if (!resolvedUserId) return;
      const notificationQuery = fresh
        ? base44.entities.Notification.filterFresh
        : base44.entities.Notification.filter;
      const data = await notificationQuery({ user_id: resolvedUserId }, '-created_date', 10);
      const rows = data || [];
      const unreadCount = rows.filter(n => !n.is_read).length;
      setNotifications(rows);
      setUnreadNotifCount(unreadCount);
      notificationsLoadedAt.current = Date.now();
    } catch (error) {
      console.error('Failed to load notifications:', error);
    }
  };

  const loadMessages = async ({ fresh = false, userId = null } = {}) => {
    try {
      if (fresh && Date.now() - messagesLoadedAt.current < 10000) return;
      const resolvedUserId = userId || user?.id || authUser?.id || (await base44.auth.me())?.id;
      if (!resolvedUserId) return;
      const messageQuery = fresh
        ? base44.entities.Message.filterFresh
        : base44.entities.Message.filter;
      const data = await messageQuery({ recipient_id: resolvedUserId }, '-created_date', 5);
      const rows = data || [];
      setMessages(rows);
      setUnreadMessagesCount(rows.filter(m => !m.is_read).length);
      messagesLoadedAt.current = Date.now();
    } catch (error) {
      console.error('Failed to load messages:', error);
    }
  };

  const loadActiveMatches = async ({ fresh = false } = {}) => {
    if (Date.now() - activeMatchesLoadedAt.current < 900) return;
    activeMatchesLoadedAt.current = Date.now();
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
        base44.entities.Wager[fresh ? "filterFresh" : "filter"]({ host_id: user.id }).catch(() => []),
        base44.entities.Wager[fresh ? "filterFresh" : "filter"]({ challenger_id: user.id }).catch(() => []),
        base44.entities.RankedMatch[fresh ? "filterFresh" : "filter"]({ host_id: user.id }).catch(() => []),
        base44.entities.RankedMatch[fresh ? "filterFresh" : "filter"]({ challenger_id: user.id }).catch(() => []),
        base44.entities.TournamentParticipant.filter({}, "-registered_date", 500).catch(() => []),
      ]);

      const byId = new Map();
      [...hostedWagers, ...challengedWagers].forEach((match) => byId.set(`wager:${match.id}`, { ...match, entity_type: "wager" }));
      [...hostedRanked, ...challengedRanked].forEach((match) => byId.set(`ranked:${match.id}`, { ...match, entity_type: "ranked" }));

      const userParticipants = (tournamentParticipants || []).filter((participant) => participantBelongsToUser(participant, user.id));
      const participantKeySet = new Set(userParticipants.flatMap(participantKeys));
      const tournamentIds = [...new Set(userParticipants.map((participant) => participant.tournament_id).filter(Boolean))];
      const [tournamentMatchesByTournament, tournaments] = await Promise.all([
        Promise.all(tournamentIds.map((tournamentId) => (
          base44.entities.TournamentMatch.filter({ tournament_id: tournamentId }, "-created_date", 256).catch(() => [])
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
      activeMatchesLoadedAt.current = 0;
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
      {adminDispute && isStaffUser(user || authUser) && (() => {
        const details = adminDispute.wager_details || adminDispute.match_details || {};
        const matchId = adminDispute.match_id || adminDispute.wager_id || adminDispute.tournament_match_id;
        const matchType = adminDispute.match_type || (adminDispute.tournament_match_id ? "tournament" : "wager");
        const roomPath = matchType === "ranked"
          ? `/ranked-match/${matchId}`
          : matchType === "tournament"
            ? `/tournament-match/${matchId}`
            : matchType === "8s"
              ? `/8s-match/${matchId}`
              : `/wagers-match/${matchId}`;
        const teamA = details.host_team_name || details.host_name || details.team_a_name || adminDispute.reported_by_name || "Team Alpha";
        const teamB = details.challenger_team_name || details.challenger_name || details.team_b_name || adminDispute.reported_against_name || "Team Bravo";
        const dismiss = () => {
          dismissedAdminDisputes.current.add(adminDispute.id);
          activeAdminDisputeId.current = null;
          setAdminDispute(null);
        };
        return (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
            <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-orange/35 bg-card p-7 text-center shadow-2xl">
              <div className="absolute inset-x-0 top-0 h-1 bg-orange" />
              <button type="button" onClick={dismiss} className="absolute right-4 top-4 rounded-lg p-2 text-vapor transition-colors hover:bg-white/5 hover:text-white" aria-label="Close dispute alert"><X className="h-4 w-4" /></button>
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-orange/15 text-orange"><AlertCircle className="h-8 w-8" /></div>
              <p className="mt-5 text-xs font-black uppercase tracking-[0.24em] text-orange">New dispute</p>
              <h2 className="mt-2 text-2xl font-black">Match #{String(matchId || adminDispute.id).slice(-8)}</h2>
              <div className="mt-5 rounded-2xl border border-white/5 bg-background/45 p-4">
                <p className="text-sm font-black text-cyan">{teamA}</p>
                <p className="my-1 text-[10px] font-black uppercase tracking-wider text-vapor">versus</p>
                <p className="text-sm font-black text-orange">{teamB}</p>
              </div>
              <p className="mt-4 text-xs leading-5 text-vapor">Both teams submitted conflicting scores. Review the reports and resolve the match.</p>
              <Link to={roomPath} onClick={dismiss} className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-orange px-5 py-3.5 text-sm font-black uppercase tracking-wider text-background">Open match room <ExternalLink className="h-4 w-4" /></Link>
            </div>
          </div>
        );
      })()}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-colors duration-200 ${
        scrolled ? "glass-nav" : "bg-transparent"
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
                  const groupTone = navTone[group.tone] || navTone.cyan;

                  return (
                    <div
                      key={group.label}
                      className="nav-dropdown-anchor relative"
                      onMouseEnter={() => {
                        cancelDropdownClose();
                        setNavMenuOpen(group.label);
                        setMatchesOpen(false);
                        setNotifOpen(false);
                        setMessagesOpen(false);
                        setProfileOpen(false);
                      }}
                      onMouseLeave={() => scheduleDropdownClose(() => setNavMenuOpen(null))}
                    >
                      <button
                        type="button"
                        onClick={() => setNavMenuOpen(open ? null : group.label)}
                        className={`${navButtonClass} ${
                          active || open
                            ? groupTone.button
                            : "border-transparent text-vapor hover:border-white/10 hover:bg-white/5 hover:text-foreground"
                        }`}
                      >
                        <span className={`flex h-7 w-7 items-center justify-center rounded-lg border ${active || open ? groupTone.icon : "border-white/[0.06] bg-white/[0.035] text-vapor"}`}>
                          <GroupIcon className="h-3.5 w-3.5" />
                        </span>
                        {group.label}
                        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
                      </button>

                      {open && (
                          <div className="nav-popover nav-popover-enter absolute left-0 top-12 w-[310px] rounded-xl p-2.5">
                            <div className="mb-2 border-b border-white/[0.06] px-2 pb-2.5 pt-1">
                              <p className={`text-[9px] font-black uppercase tracking-[0.2em] ${groupTone.icon.split(" ").at(-1)}`}>{group.eyebrow}</p>
                              <p className="mt-1 text-[11px] text-vapor">Choose where you want to go</p>
                            </div>
                            {group.items.map((item) => {
                              const ItemIcon = item.icon;
                              const itemActive = location.pathname === item.path;
                              const itemTone = navTone[item.tone] || navTone.cyan;

                              return (
                                <Link
                                  key={item.path}
                                  to={item.path}
                                  onClick={() => setNavMenuOpen(null)}
                                  className={`group flex items-center gap-3 rounded-lg border px-2.5 py-2.5 transition-colors duration-100 ${
                                    itemActive
                                      ? `${itemTone.button}`
                                      : "border-transparent text-vapor hover:border-white/[0.07] hover:bg-white/[0.045] hover:text-foreground"
                                  }`}
                                >
                                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${itemTone.icon}`}><ItemIcon className="h-4 w-4" /></span>
                                  <span className="min-w-0 flex-1">
                                    <span className="block text-[13px] font-black">{item.label}</span>
                                    {item.description && (
                                      <span className="mt-0.5 block truncate text-[10px] text-vapor">{item.description}</span>
                                    )}
                                  </span>
                                  <span className="text-vapor/40 transition-transform duration-100 group-hover:translate-x-0.5 group-hover:text-foreground">→</span>
                                </Link>
                              );
                            })}
                          </div>
                      )}
                    </div>
                  );
                })}

                <div
                  className="nav-dropdown-anchor relative"
                  onMouseEnter={() => {
                    cancelDropdownClose();
                    setMatchesOpen(true);
                    setNavMenuOpen(null);
                    setNotifOpen(false);
                    setMessagesOpen(false);
                    setProfileOpen(false);
                    loadActiveMatches();
                  }}
                  onMouseLeave={() => scheduleDropdownClose(() => setMatchesOpen(false))}
                >
                  <button
                    className={`${navButtonClass} ${
                      matchesOpen
                        ? "border-white/15 bg-white/[0.07] text-white"
                        : "border-transparent text-vapor hover:border-white/10 hover:bg-white/5 hover:text-foreground"
                    }`}
                  >
                    <span className={`flex h-7 w-7 items-center justify-center rounded-lg border ${matchesOpen ? "border-slate-300/20 bg-slate-200/10 text-slate-100" : "border-white/[0.06] bg-white/[0.035] text-vapor"}`}><Activity className="h-3.5 w-3.5" /></span>
                    My Matches
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform ${matchesOpen ? "rotate-180" : ""}`} />
                    {activeMatches.length > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-orange rounded-full" />
                    )}
                  </button>

                  {matchesOpen && (
                      <div className="nav-popover nav-popover-enter absolute left-0 top-11 w-80 overflow-hidden rounded-xl">
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
                      </div>
                  )}
                </div>
              </div>
            )}

            {/* Right Side */}
            <div className="flex items-center gap-2">
              {user ? (
                <>
              {/* Wallet */}
              <div className="hidden h-8 items-center overflow-hidden rounded-lg border border-green/15 bg-green/[0.055] md:flex">
                <Link to="/wallet" className="flex h-full items-center gap-1.5 px-2.5 text-green transition-colors hover:bg-green/10">
                  <Wallet className="h-3.5 w-3.5" />
                  <span className="font-mono text-xs font-bold">${walletBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </Link>
                <Link to="/wallet" title="Add funds" aria-label="Add funds" className="flex h-full w-7 items-center justify-center border-l border-green/15 text-green/80 transition-colors hover:bg-green/15 hover:text-white">
                  <Plus className="h-3.5 w-3.5" />
                </Link>
              </div>

              {/* Credits */}
              <Link to="/marketplace" title="Marketplace credits" className="hidden h-8 items-center gap-1.5 rounded-lg border border-yellow-400/15 bg-yellow-400/[0.045] px-2.5 text-yellow-300 transition-colors hover:border-yellow-400/30 hover:bg-yellow-400/[0.08] md:flex">
                <Coins className="h-3.5 w-3.5" />
                <span className="font-mono text-xs font-bold">{creditBalance.toLocaleString("en-US")}</span>
                <span className="text-[7px] font-black uppercase tracking-wider text-yellow-200/60">Credits</span>
              </Link>

              {/* Notifications */}
              <div
                className="nav-dropdown-anchor relative"
                onMouseEnter={() => {
                  cancelDropdownClose();
                  setNotifOpen(true);
                  setNavMenuOpen(null);
                  setMatchesOpen(false);
                  setMessagesOpen(false);
                  setProfileOpen(false);
                  loadNotifications({ fresh: true });
                }}
                onMouseLeave={() => scheduleDropdownClose(() => setNotifOpen(false))}
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

                {notifOpen && (
                    <div className="nav-popover nav-popover-enter absolute right-0 top-12 z-50 w-80 overflow-hidden rounded-xl">
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
                              to={notification.title === "Wager refunded" ? "/wallet" : (notification.action_url || "/notifications")}
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
                    </div>
                )}
              </div>

              {/* Messages */}
              <div
                className="nav-dropdown-anchor relative hidden sm:block"
              >
                <Link
                  to="/messages"
                  onClick={() => {
                    setMessagesOpen(false);
                    setNotifOpen(false);
                    setProfileOpen(false);
                  }}
                  className="relative flex h-9 w-9 items-center justify-center rounded-lg text-vapor transition-colors hover:bg-secondary hover:text-foreground"
                  aria-label="Open messages"
                >
                  <MessageSquare className="w-4 h-4" />
                  {unreadMessagesCount > 0 && (
                    <span className="absolute top-1 right-1 w-2 h-2 bg-cyan rounded-full" />
                  )}
                </Link>

                {messagesOpen && (
                    <div className="nav-popover nav-popover-enter absolute right-0 top-12 z-50 w-80 overflow-hidden rounded-xl">
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
                            <Link
                              key={message.id}
                              to={message.action_url || (
                                message.message_type === "direct_message" && message.sender_id
                                  ? `/messages?conversation=${encodeURIComponent(message.sender_id)}`
                                  : "/messages"
                              )}
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
                            </Link>
                          ))
                        )}
                      </div>
                    </div>
                )}
              </div>

              {/* Profile */}
              <div
                className="nav-dropdown-anchor relative"
                onMouseEnter={() => {
                  cancelDropdownClose();
                  setProfileOpen(true);
                  setNavMenuOpen(null);
                  setMatchesOpen(false);
                  setNotifOpen(false);
                  setMessagesOpen(false);
                }}
                onMouseLeave={() => scheduleDropdownClose(() => setProfileOpen(false))}
              >
                <button
                  type="button"
                  className={`flex h-10 items-center gap-2 rounded-xl border px-2 transition-colors ${profileOpen ? "border-cyan/25 bg-cyan/10" : "border-white/[0.07] bg-white/[0.025] hover:border-white/15 hover:bg-white/[0.05]"}`}
                >
                  <div className="relative flex h-7 w-7 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-gradient-to-br from-cyan/30 to-orange/30">
                    <User className="h-3.5 w-3.5" />
                    {profileAvatar && <img src={profileAvatar} alt="" className="absolute inset-0 h-full w-full object-cover" onError={(event) => { event.currentTarget.style.display = "none"; }} />}
                  </div>
                  <span className="hidden max-w-[110px] text-left lg:block">
                    <span className="truncate text-xs font-black text-foreground">{accountName}</span>
                    <span className={`block text-[8px] font-black uppercase tracking-wider ${canSeeAdminLink ? "text-red-300" : "text-vapor"}`}>{canSeeAdminLink ? (user?.role || "Staff").replace("_", " ") : "Competitor"}</span>
                  </span>
                  <ChevronDown className={`w-3.5 h-3.5 text-vapor transition-transform ${profileOpen ? "rotate-180" : ""}`} />
                </button>

                {profileOpen && (
                    <div className="nav-popover nav-popover-enter absolute right-0 top-12 z-50 w-80 rounded-xl p-2.5">
                      <ProfileMenuSection
                        label="Account"
                        items={[
                          { label: "My Profile", path: profilePath, icon: User },
                          { label: "Settings", path: "/settings", icon: Settings },
                        ]}
                        onSelect={() => setProfileOpen(false)}
                      />
                      <ProfileMenuSection
                        label="Competitive"
                        items={[
                          { label: "My Ranked Stats", path: "/ranked", icon: Trophy },
                          { label: "My Teams", path: "/teams", icon: Users },
                          { label: "Match History", path: matchHistoryPath, icon: History },
                          ...(canSeeStreamerShortcut ? [{ label: "Streamer Tournaments", path: "/streamer-tournaments", icon: Monitor }] : []),
                        ]}
                        onSelect={() => setProfileOpen(false)}
                      />
                      <ProfileMenuSection
                        label="Armory"
                        items={[
                          { label: "Wallet", path: "/wallet", icon: Wallet },
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
                            className="nav-menu-item flex items-center gap-3 rounded-md px-3 py-2 text-sm text-vapor hover:bg-white/5 hover:text-foreground"
                          >
                            <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-red-400/20 bg-red-500/10"><ShieldCheck className="h-4 w-4 text-red-300" /></span>
                            Admin Console
                          </Link>
                        </div>
                      )}
                      <div className="border-t border-white/5 mt-1 pt-1">
                        <Link
                          to="/logout"
                          onClick={() => setProfileOpen(false)}
                          className="nav-menu-item flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm text-destructive hover:bg-destructive/10"
                        >
                          <LogOut className="w-4 h-4" />
                          Sign Out
                        </Link>
                      </div>
                    </div>
                )}
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
      {user && mobileOpen && (
          <div className="mobile-menu-enter fixed inset-0 z-40 overflow-y-auto bg-background/98 pt-20 xl:hidden">
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
                    {canSeeStreamerShortcut && (
                      <Link
                        to="/streamer-tournaments"
                        className="flex items-center gap-3 px-4 py-3 rounded-xl text-base font-medium text-blue-300 hover:bg-blue-500/10 transition-all"
                      >
                        <Monitor className="w-5 h-5" />
                        Streamer Tournaments
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
                      to="/teams"
                      className="flex items-center gap-3 px-4 py-3 rounded-xl text-base font-medium text-vapor hover:text-foreground hover:bg-secondary transition-all"
                    >
                      <Users className="w-5 h-5" />
                      My Teams
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
                      to="/marketplace"
                      className="flex items-center gap-2 rounded-xl px-4 py-3 transition-all hover:bg-secondary"
                    >
                      <Coins className="h-5 w-5 text-yellow-300" />
                      <span className="font-mono font-semibold text-yellow-300">{creditBalance.toLocaleString("en-US")} Credits</span>
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
          </div>
      )}
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
            className="nav-menu-item group flex items-center gap-3 rounded-lg border border-transparent px-2.5 py-2 text-sm text-vapor transition-colors duration-100 hover:border-white/[0.06] hover:bg-white/[0.04] hover:text-foreground"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-cyan/15 bg-cyan/[0.07] text-cyan"><Icon className="h-4 w-4" /></span>
            <span className="font-bold">{item.label}</span>
            <span className="ml-auto text-vapor/30 transition-transform duration-100 group-hover:translate-x-0.5 group-hover:text-vapor">→</span>
          </Link>
        );
      })}
    </div>
  );
}
