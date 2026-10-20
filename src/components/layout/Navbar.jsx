import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PlayerAvatarImage from "@/components/ui/PlayerAvatarImage";
import { Link, useLocation } from "react-router-dom";
import {
  Wallet, MessageSquare, ChevronDown, User,
  Menu, X, House,
  AlertCircle, ExternalLink, LogIn, UserPlus,
  Activity, History, ShieldCheck, Plus, Coins, Ticket
} from "lucide-react";
import TopfraggLogo from "@/components/brand/TopfraggLogo";
import NavbarMessageMenu from "./NavbarMessageMenu";
import NavbarNotificationMenu from "./NavbarNotificationMenu";
import { isCurrentNotification } from "@/lib/notificationRetention";
import { applyNotificationChange } from "@/lib/notificationInbox";
import TopbarNavigation from "./TopbarNavigation";
import { topbarMobileSections } from "./navigationGroups";
import { useNavigationLayout } from "./NavigationLayoutProvider";
import { isNativeApp } from "@/lib/nativeApp";
import AccountMenu from "./AccountMenu";
import NavigationChrome from "./NavigationChrome";
import SidebarBalances from "./SidebarBalances";
import "@/styles/navbar-profile.css";
import "@/styles/topbar.css";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { effectiveRoleForUser, getPublicRoleConfig } from "@/lib/roles";
import { excludeCancelledHeaderMatches, matchCancelledEvent } from "@/lib/cancelledMatchRoom";

const ADMIN_DISPUTE_POPUP_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const BALANCE_POPUP_DURATION_MS = 5200;
const BALANCE_POPUP_EXIT_MS = 260;
const isRecentAdminDispute = (item) => {
  const createdAt = Date.parse(item?.created_date || "");
  return !Number.isFinite(createdAt) || Date.now() - createdAt <= ADMIN_DISPUTE_POPUP_MAX_AGE_MS;
};
const balancePopupKey = (item) => (
  `${item?.related_entity_type || "balance"}:${item?.related_entity_id || item?.id || "event"}:${Number(item?.balance_change || 0).toFixed(2)}`
);

function BalancePopup({ notification, onClose }) {
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (!notification?.popup_id) return undefined;
    setClosing(false);
    const exitTimer = window.setTimeout(() => setClosing(true), BALANCE_POPUP_DURATION_MS - BALANCE_POPUP_EXIT_MS);
    const closeTimer = window.setTimeout(onClose, BALANCE_POPUP_DURATION_MS);
    return () => {
      window.clearTimeout(exitTimer);
      window.clearTimeout(closeTimer);
    };
  }, [notification?.popup_id, onClose]);

  if (!notification) return null;
  const amount = Number(notification.balance_change || 0);
  const positive = amount > 0;
  const absoluteAmount = Math.abs(amount);
  const isWallet = notification.balance_type === "wallet";
  const amountLabel = isWallet
    ? `${positive ? "+" : "−"}$${absoluteAmount.toFixed(2)}`
    : `${positive ? "+" : "−"}${absoluteAmount.toLocaleString()} Credits`;

  return (
    <div className="pointer-events-none fixed left-1/2 top-1/2 z-[120] w-[calc(100%-2rem)] max-w-[390px] -translate-x-1/2 -translate-y-1/2">
      <div key={notification.popup_id} className={`pointer-events-auto relative w-full overflow-hidden rounded-2xl border p-4 shadow-2xl backdrop-blur-xl ${closing ? "balance-popup-exit" : "balance-popup-enter"} ${positive ? "border-green/40 bg-[#071d1a]/95 shadow-[0_18px_48px_-20px_rgba(0,255,150,.8)]" : "border-red-400/40 bg-[#241317]/95 shadow-[0_18px_48px_-20px_rgba(255,80,100,.7)]"}`}>
        <div className={`absolute inset-x-0 top-0 h-1 ${positive ? "bg-green" : "bg-red-400"}`} />
        <button type="button" onClick={onClose} aria-label="Close balance notification" className="absolute right-2.5 top-2.5 rounded-lg p-1.5 text-vapor transition-colors hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button>
        <div className="flex items-center gap-3 pr-7">
          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${positive ? "bg-green/15 text-green" : "bg-red-400/15 text-red-300"}`}><Wallet className="h-5 w-5" /></div>
          <div className="min-w-0">
            <p className={`text-[10px] font-black uppercase tracking-[0.2em] ${positive ? "text-green" : "text-red-300"}`}>{positive ? "Wallet credited" : "Wallet charged"}</p>
            <p className="mt-0.5 font-mono text-2xl font-black text-white">{amountLabel}</p>
          </div>
        </div>
        {notification.message && <p className="mt-3 text-xs leading-5 text-vapor">{notification.message}</p>}
        <div className={`balance-popup-progress mt-3 h-0.5 origin-left rounded-full ${positive ? "bg-green/60" : "bg-red-400/60"}`} />
      </div>
    </div>
  );
}

const staffRoles = new Set(["ceo", "super_admin", "admin", "moderator"]);
const isStaffUser = (candidate) => (
  staffRoles.has(candidate?.role)
  || staffRoles.has(candidate?.admin_role)
  || candidate?.is_admin === true
);
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
const hiddenMatchTypes = new Set();
let disputeAlertAudioContext = null;

const unlockDisputeAlertAudio = async () => {
  if (typeof window === "undefined") return false;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return false;
  disputeAlertAudioContext ||= new AudioContextClass();
  if (disputeAlertAudioContext.state === "suspended") {
    await disputeAlertAudioContext.resume().catch(() => null);
  }
  return disputeAlertAudioContext.state === "running";
};

const playDisputeAlertSound = async () => {
  if (!await unlockDisputeAlertAudio()) return false;
  const context = disputeAlertAudioContext;
  const startTime = context.currentTime + 0.02;
  [
    { frequency: 880, offset: 0 },
    { frequency: 660, offset: 0.3 },
  ].forEach(({ frequency, offset }) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const toneStart = startTime + offset;
    const toneEnd = toneStart + 0.22;
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, toneStart);
    gain.gain.setValueAtTime(0.0001, toneStart);
    gain.gain.exponentialRampToValueAtTime(0.07, toneStart + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, toneEnd);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(toneStart);
    oscillator.stop(toneEnd);
  });
  return true;
};

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

const navItemIsActive = (pathname, path, hash = "", search = "", activeEightMatchType = "") => {
  const [targetPathWithQuery, targetHash] = String(path || "").split("#");
  const [targetPath, targetQuery] = targetPathWithQuery.split("?");
  const expectedHash = targetHash ? `#${targetHash}` : "";
  const expectedSearch = targetQuery ? `?${targetQuery}` : "";

  if (expectedHash) return pathname === targetPath && hash === expectedHash && (!expectedSearch || search === expectedSearch);
  if (pathname === targetPath) {
    if (expectedSearch) return search === expectedSearch;
    if (targetPath === "/ranked/8s" && search) return false;
    return targetPath !== "/ranked" || hash !== "#standings";
  }

  if (targetPath === "/ranked/8s" && pathname.startsWith("/8s-match/")) {
    if (!activeEightMatchType) return false;
    return expectedSearch === "?mode=money"
      ? activeEightMatchType === "money8s"
      : activeEightMatchType === "8s";
  }

  return (targetPath === "/tournaments" && pathname.startsWith("/tournament-match/"))
    || (targetPath === "/streamer-tournaments" && pathname.startsWith("/streamer-tournament/"))
    || (targetPath === "/ranked" && pathname.startsWith("/ranked-match/"))
    || (targetPath === "/xp" && pathname.startsWith("/xp-match/"))
    || (targetPath === "/wagers" && pathname.startsWith("/wagers-match/"))
    || (targetPath === "/challenge-a-team" && pathname.startsWith("/challenge-a-team/"))
    || (targetPath === "/dashboard" && pathname.startsWith("/match-room/"));
};

const formatMessageTime = (value) => {
  const timestamp = new Date(value || 0).getTime();
  if (!Number.isFinite(timestamp)) return "";
  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
  if (elapsedMinutes < 1) return "Now";
  if (elapsedMinutes < 60) return `${elapsedMinutes}m`;
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `${elapsedHours}h`;
  const elapsedDays = Math.floor(elapsedHours / 24);
  if (elapsedDays < 7) return `${elapsedDays}d`;
  return new Date(timestamp).toLocaleDateString([], { month: "short", day: "numeric" });
};

export default function Navbar() {
  const savedNavigationLayout = useNavigationLayout()?.layout || "topbar";
  const navigationLayout = isNativeApp ? "topbar" : savedNavigationLayout;
  const [sidebarWidth, setSidebarWidth] = useState(() => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches);
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [navMenuOpen, setNavMenuOpen] = useState(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [messagesOpen, setMessagesOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [notificationsHydrated, setNotificationsHydrated] = useState(false);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsError, setNotificationsError] = useState("");
  const [messages, setMessages] = useState([]);
  const unreadNotifCount = notifications.filter((notification) => !notification.is_read).length;
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);
  useEffect(() => {
    setMobileOpen(false); setNavMenuOpen(null); setMatchesOpen(false);
    setNotifOpen(false); setMessagesOpen(false); setProfileOpen(false);
  }, [navigationLayout]);
  useEffect(() => {
    const desktop = window.matchMedia(navigationLayout === "sidebar" ? "(min-width: 1024px)" : "(min-width: 1280px)");
    const closeMobileMenu = () => { if (desktop.matches) setMobileOpen(false); };
    closeMobileMenu();
    desktop.addEventListener("change", closeMobileMenu);
    return () => desktop.removeEventListener("change", closeMobileMenu);
  }, [navigationLayout]);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const update = () => setSidebarWidth(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const messagePreviews = useMemo(() => {
    const seen = new Set();
    return messages.filter((message) => {
      const key = message.message_type === "direct_message"
        ? `direct:${message.sender_id || message.sender_name}`
        : `message:${message.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 5);
  }, [messages]);
  const [walletBalance, setWalletBalance] = useState(0);
  const [creditBalance, setCreditBalance] = useState(0);
  const [profileAvatar, setProfileAvatar] = useState("");
  const [matchesOpen, setMatchesOpen] = useState(false);
  const [activeMatches, setActiveMatches] = useState([]);
  const [adminRequest, setAdminRequest] = useState(null);
  const [adminDispute, setAdminDispute] = useState(null);
  const activeAdminRequestId = useRef(null);
  const dismissedAdminRequests = useRef(new Set());
  const soundedAdminRequests = useRef(new Set());
  const pendingAdminRequestSoundId = useRef(null);
  const activeMatchesLoadedAt = useRef(0);
  const activeMatchesRequestId = useRef(0);
  const cancelledHeaderMatches = useRef(new Set());
  const activeAdminDisputeId = useRef(null);
  const dismissedAdminDisputes = useRef(new Set());
  const soundedAdminDisputes = useRef(new Set());
  const pendingAdminDisputeSoundId = useRef(null);
  const notificationsLoadedAt = useRef(0);
  const notificationsRequestId = useRef(0);
  const pendingNotificationReads = useRef(new Set());
  const balancePopupsReady = useRef(false);
  const shownBalancePopupIds = useRef(new Set());
  const shownBalancePopupKeys = useRef(new Set());
  const [balancePopup, setBalancePopup] = useState(null);

  const rememberBalancePopupKey = (key) => {
    shownBalancePopupKeys.current.add(key);
    window.setTimeout(() => shownBalancePopupKeys.current.delete(key), 15000);
  };

  const showBalancePopup = (notification) => {
    const amount = Number(notification?.balance_change || 0);
    if (!Number.isFinite(amount) || amount === 0) return;
    setBalancePopup({ ...notification, popup_id: `${balancePopupKey(notification)}:${Date.now()}` });
  };

  const closeBalancePopup = useCallback(() => setBalancePopup(null), []);

  useEffect(() => {
    const unlockAndPlayPendingStaffAlert = async () => {
      if (!await unlockDisputeAlertAudio()) return;
      const requestId = pendingAdminRequestSoundId.current;
      if (requestId && !soundedAdminRequests.current.has(requestId) && await playDisputeAlertSound()) {
        soundedAdminRequests.current.add(requestId);
        pendingAdminRequestSoundId.current = null;
      }
      const disputeId = pendingAdminDisputeSoundId.current;
      if (!disputeId || soundedAdminDisputes.current.has(disputeId)) return;
      if (await playDisputeAlertSound()) {
        soundedAdminDisputes.current.add(disputeId);
        pendingAdminDisputeSoundId.current = null;
      }
    };
    window.addEventListener("pointerdown", unlockAndPlayPendingStaffAlert);
    window.addEventListener("keydown", unlockAndPlayPendingStaffAlert);
    return () => {
      window.removeEventListener("pointerdown", unlockAndPlayPendingStaffAlert);
      window.removeEventListener("keydown", unlockAndPlayPendingStaffAlert);
    };
  }, []);

  useEffect(() => {
    const requestId = adminRequest?.id;
    if (!requestId || soundedAdminRequests.current.has(requestId) || pendingAdminRequestSoundId.current === requestId) return;
    pendingAdminRequestSoundId.current = requestId;
    playDisputeAlertSound().then((played) => {
      if (!played || pendingAdminRequestSoundId.current !== requestId) return;
      soundedAdminRequests.current.add(requestId);
      pendingAdminRequestSoundId.current = null;
    });
  }, [adminRequest?.id]);

  useEffect(() => {
    const disputeId = adminDispute?.id;
    if (!disputeId || soundedAdminDisputes.current.has(disputeId) || pendingAdminDisputeSoundId.current === disputeId) return;
    pendingAdminDisputeSoundId.current = disputeId;
    playDisputeAlertSound().then((played) => {
      if (!played || pendingAdminDisputeSoundId.current !== disputeId) return;
      soundedAdminDisputes.current.add(disputeId);
      pendingAdminDisputeSoundId.current = null;
    });
  }, [adminDispute?.id]);
  const messagesLoadedAt = useRef(0);
  const messagesRequestId = useRef(0);
  const dropdownCloseTimer = useRef(null);
  const location = useLocation();
  const { isAuthenticated, user: authUser } = useAuth();
  const notificationOwner = useRef(authUser?.id);
  notificationOwner.current = authUser?.id;
  const activeEightMatchType = activeMatches.find((match) => (
    (match?.match_type === "8s" || match?.match_type === "money8s")
      && location.pathname === `/8s-match/${match.id}`
  ))?.match_type || "";
  const isCurrentNavItemActive = (path) => navItemIsActive(
    location.pathname,
    path,
    location.hash,
    location.search,
    activeEightMatchType,
  );
  const profilePath = user ? `/profile/${user.username || user.id}` : "/profile";
  const accountName = user?.display_name || user?.full_name || user?.username || user?.email || "Account";
  const canSeeAdminLink = isStaffUser(user || authUser);
  const accountRole = canSeeAdminLink
    ? getPublicRoleConfig(effectiveRoleForUser(user || authUser)).label
    : "Player";
  const matchHistoryPath = "/my-matches?view=history";

  useEffect(() => {
    if (!isStaffUser(user || authUser)) return;
    const adminRequestNotification = notifications.find((notification) => (
      notification.type === "admin_request" && !notification.is_read
    ));
    if (adminRequestNotification) {
      const requestId = adminRequestNotification.admin_alert_id || adminRequestNotification.related_entity_id || adminRequestNotification.id;
      if (!soundedAdminRequests.current.has(requestId) && pendingAdminRequestSoundId.current !== requestId) {
        pendingAdminRequestSoundId.current = requestId;
        playDisputeAlertSound().then((played) => {
          if (!played || pendingAdminRequestSoundId.current !== requestId) return;
          soundedAdminRequests.current.add(requestId);
          pendingAdminRequestSoundId.current = null;
        });
      }
    }
    const disputeNotification = notifications.find((notification) => (
      notification.type === "dispute"
      && !notification.is_read
      && !notification.popup_suppressed
      && isRecentAdminDispute(notification)
    ));
    if (!disputeNotification) return;
    const disputeId = disputeNotification.related_entity_id || disputeNotification.id;
    if (soundedAdminDisputes.current.has(disputeId) || pendingAdminDisputeSoundId.current === disputeId) return;
    pendingAdminDisputeSoundId.current = disputeId;
    playDisputeAlertSound().then((played) => {
      if (!played || pendingAdminDisputeSoundId.current !== disputeId) return;
      soundedAdminDisputes.current.add(disputeId);
      pendingAdminDisputeSoundId.current = null;
    });
  }, [authUser, notifications, user]);

  useEffect(() => {
    if (!notificationsHydrated) return;
    const balanceNotifications = notifications.filter((notification) => notification.show_balance_popup === true);
    if (!balancePopupsReady.current) {
      balanceNotifications.forEach((notification) => {
        shownBalancePopupIds.current.add(notification.id);
      });
      balancePopupsReady.current = true;
      return;
    }

    const unseen = balanceNotifications.filter((notification) => (
      !shownBalancePopupIds.current.has(notification.id)
      && !shownBalancePopupKeys.current.has(balancePopupKey(notification))
    ));
    if (unseen.length === 0) return;
    unseen.slice().reverse().forEach((notification) => {
      shownBalancePopupIds.current.add(notification.id);
      rememberBalancePopupKey(balancePopupKey(notification));
      showBalancePopup(notification);
    });
    loadUser(null, { fresh: true });
  }, [notifications, notificationsHydrated]);

  useEffect(() => {
    const handleBalancePopup = (event) => {
      const detail = event.detail || {};
      const change = Number(detail.balance_change || 0);
      if (!Number.isFinite(change) || change === 0) return;
      const notification = {
        ...detail,
        balance_change: change,
        balance_type: detail.balance_type || "wallet",
      };
      const key = balancePopupKey(notification);
      if (detail.balance_popup_event_id) {
        if (shownBalancePopupIds.current.has(detail.balance_popup_event_id)) return;
        shownBalancePopupIds.current.add(detail.balance_popup_event_id);
      } else if (shownBalancePopupKeys.current.has(key)) return;
      rememberBalancePopupKey(key);
      showBalancePopup(notification);
      loadUser(null, { fresh: true });
    };

    window.addEventListener("topfragg:balance-popup", handleBalancePopup);
    return () => window.removeEventListener("topfragg:balance-popup", handleBalancePopup);
  }, []);

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

  const closeMobileMenu = () => {
    setMobileOpen(false);
    closeDropdowns();
  };

  const acknowledgeAdminDispute = (disputeId) => {
    if (!disputeId) return;
    setNotifications(prev => prev.map(notification => (
      notification.related_entity_id === disputeId
        ? { ...notification, popup_suppressed: true }
        : notification
    )));
    base44.functions.invoke("acknowledgeDispute", { dispute_id: disputeId }).catch((error) => {
      console.error("Failed to acknowledge dispute popup:", error);
    });
  };

  const supportsDesktopHover = () => (
    !notifOpen && !messagesOpen && (typeof window === "undefined"
    || window.matchMedia("(hover: hover) and (pointer: fine)").matches)
  );

  useEffect(() => {
    const handleOutsidePointer = (event) => {
      if (event.target instanceof Element && event.target.closest(".nav-dropdown-anchor")) return;
      closeDropdowns();
    };
    document.addEventListener("pointerdown", handleOutsidePointer);
    const handleEscape = (event) => { if (event.key === "Escape") closeDropdowns(); };
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("pointerdown", handleOutsidePointer);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  const clearUserState = () => {
    setUser(null);
    setNotifications([]);
    setNotificationsHydrated(false);
    setNotificationsLoading(false);
    setNotificationsError("");
    notificationsLoadedAt.current = 0;
    notificationsRequestId.current += 1;
    pendingNotificationReads.current.clear();
    setBalancePopup(null);
    balancePopupsReady.current = false;
    shownBalancePopupIds.current.clear();
    shownBalancePopupKeys.current.clear();
    setMessages([]);
    messagesRequestId.current += 1;
    messagesLoadedAt.current = 0;
    setUnreadMessagesCount(0);
    setWalletBalance(0);
    setCreditBalance(0);
    setProfileAvatar("");
    setActiveMatches([]);
    activeMatchesLoadedAt.current = 0;
    activeMatchesRequestId.current += 1;
    cancelledHeaderMatches.current.clear();
    setAdminRequest(null);
    activeAdminRequestId.current = null;
    dismissedAdminRequests.current.clear();
    soundedAdminRequests.current.clear();
    pendingAdminRequestSoundId.current = null;
    setAdminDispute(null);
    activeAdminDisputeId.current = null;
    dismissedAdminDisputes.current.clear();
    soundedAdminDisputes.current.clear();
    pendingAdminDisputeSoundId.current = null;
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
    notificationsRequestId.current += 1;
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
    notificationsRequestId.current += 1;
    notificationsLoadedAt.current = 0;
    setNotifications([]);
    setNotificationsHydrated(false);
    setNotificationsLoading(false);
    setNotificationsError("");

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
    const handleCreditsUpdated = () => loadUser(null, { fresh: true });
    window.addEventListener("topfragg:credits-updated", handleCreditsUpdated);
    return () => window.removeEventListener("topfragg:credits-updated", handleCreditsUpdated);
  }, [authUser?.id]);

  useEffect(() => {
    const handleNotificationsUpdated = (event) => {
      const detail = event.detail || {};
      // A poll started before this confirmed change must not restore unread
      // or deleted rows when its response arrives later.
      notificationsRequestId.current += 1;
      setNotificationsLoading(false);
      if (detail.refresh) {
        notificationsLoadedAt.current = 0;
        loadNotifications({ fresh: true });
        return;
      }
      setNotifications(prev => applyNotificationChange(prev, detail));
      notificationsLoadedAt.current = 0;
    };

    window.addEventListener("topfragg:notifications-updated", handleNotificationsUpdated);
    return () => window.removeEventListener("topfragg:notifications-updated", handleNotificationsUpdated);
  }, []);

  useEffect(() => {
    const handleAdminRequestAcknowledged = (event) => {
      const matchId = String(event.detail?.matchId || "");
      const activeMatchId = String(adminRequest?.match_id || adminRequest?.related_entity_id || "");
      if (!matchId || !activeMatchId || matchId !== activeMatchId) return;
      dismissedAdminRequests.current.add(adminRequest.id);
      activeAdminRequestId.current = null;
      setAdminRequest(null);
    };

    window.addEventListener("topfragg:admin-request-acknowledged", handleAdminRequestAcknowledged);
    return () => window.removeEventListener("topfragg:admin-request-acknowledged", handleAdminRequestAcknowledged);
  }, [adminRequest?.id, adminRequest?.match_id, adminRequest?.related_entity_id]);

  useEffect(() => {
    if (!isAuthenticated) return undefined;
    const interval = window.setInterval(() => {
      loadNotifications({ fresh: true });
      loadMessages({ fresh: true });
    }, 15000);
    return () => window.clearInterval(interval);
  }, [isAuthenticated, authUser?.id]);

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
    const refreshInterval = window.setInterval(() => {
      if (document.visibilityState !== "hidden") loadActiveMatches({ fresh: true });
    }, 15000);
    return () => {
      if ("cancelIdleCallback" in window) window.cancelIdleCallback(idleHandle);
      else window.clearTimeout(idleHandle);
      window.clearInterval(refreshInterval);
    };
  }, [isAuthenticated, authUser?.id]);

  useEffect(() => {
    if (!isAuthenticated) return undefined;
    const handleCancelled = (event) => {
      const { entityType, id } = event.detail || {};
      if (!id || !["wager", "ranked", "xp", "tournament", "tournament-parent"].includes(entityType)) return;
      const key = `${entityType}:${id}`;
      if (cancelledHeaderMatches.current.has(key)) return;
      cancelledHeaderMatches.current.add(key);
      setActiveMatches((matches) => excludeCancelledHeaderMatches(matches, cancelledHeaderMatches.current));
      void loadActiveMatches({ fresh: true, force: true });
    };
    window.addEventListener(matchCancelledEvent, handleCancelled);
    return () => window.removeEventListener(matchCancelledEvent, handleCancelled);
  }, [isAuthenticated, authUser?.id]);

  useEffect(() => {
    if (!isAuthenticated || !authUser?.id) return undefined;
    let active = true;
    const refreshLiveHeader = () => {
      if (!active || document.visibilityState === "hidden") return;
      loadNotifications({ fresh: true, userId: authUser.id });
      if (isStaffUser(user || authUser)) {
        base44.entities.AdminAlert.filterFresh({ status: "open" }, "-created_date", 50).then(async (rows) => {
          if (!active) return;
          const openRequests = (rows || []).filter((alert) => (
            alert.status === "open"
            && String(alert.match_type || "").toLowerCase() !== "xp"
            && alert.match_id
            && !hiddenMatchTypes.has(String(alert.match_type || "").toLowerCase())
          ));

          const requestIsInactive = async (alert) => {
            const matchType = String(alert.match_type || "wager").toLowerCase();
            const entityName = matchType === "ranked" ? "RankedMatch" : matchType === "tournament" ? "TournamentMatch" : "Wager";
            const match = await base44.entities[entityName].getFresh(alert.match_id).catch(() => null);
            return !match
              || match.completed === true
              || ["completed", "cancelled", "closed"].includes(match.status)
              || ["admin_joined", "resolved", "closed"].includes(match.admin_request_status);
          };

          if (activeAdminRequestId.current) {
            const visibleRequest = openRequests.find((alert) => alert.id === activeAdminRequestId.current);
            if (!visibleRequest || await requestIsInactive(visibleRequest)) {
              if (visibleRequest) dismissedAdminRequests.current.add(visibleRequest.id);
              activeAdminRequestId.current = null;
              setAdminRequest(null);
            } else {
              return;
            }
          }

          let nextRequest = null;
          for (const request of openRequests) {
            if (dismissedAdminRequests.current.has(request.id)) continue;
            if (await requestIsInactive(request)) {
              dismissedAdminRequests.current.add(request.id);
              continue;
            }
            nextRequest = request;
            break;
          }
          if (!active || !nextRequest) return;
          activeAdminRequestId.current = nextRequest.id;
          setAdminRequest(nextRequest);
        }).catch((error) => console.error("Failed to refresh admin requests:", error));

        base44.entities.Dispute.filterFresh({}, "-created_date", 50).then(async (rows) => {
          if (!active) return;
          const pendingDisputes = (rows || []).filter((dispute) => (
            ["pending", "under_review", "escalated"].includes(dispute.status)
            && String(dispute.match_type || "").toLowerCase() !== "xp"
            && dispute.admin_popup_suppressed !== true
            && isRecentAdminDispute(dispute)
            && !hiddenMatchTypes.has(String(dispute.match_type || "").toLowerCase())
          ));
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
    const interval = window.setInterval(refreshLiveHeader, 15000);
    window.addEventListener("focus", refreshLiveHeader);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshLiveHeader);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [isAuthenticated, authUser?.id, user?.id, user?.role, user?.admin_role, user?.is_admin]);

  const loadUser = async (knownUser = null, { fresh = false } = {}) => {
    try {
      const userData = fresh ? await base44.auth.me({ force: true }) : knownUser?.id ? knownUser : await base44.auth.me();
      if (!userData) {
        setUser(null);
        setWalletBalance(0);
        setCreditBalance(0);
        setProfileAvatar("");
        return;
      }
      const [wallets, profiles] = await Promise.all([
        base44.entities.Wallet[fresh ? "filterFresh" : "filter"]({ user_id: userData.id }, "-created_date", 1).catch(() => []),
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

  const loadNotifications = async ({ userId = null, force = false } = {}) => {
    if (!force && Date.now() - notificationsLoadedAt.current < 12000) return;
    const requestId = ++notificationsRequestId.current;
    const ownerId = userId || notificationOwner.current;
    if (!ownerId) return;
    setNotificationsLoading(true);
    setNotificationsError("");
    try {
      const data = await base44.entities.Notification.filterFresh({ user_id: ownerId }, '-created_date', 50);
      if (requestId !== notificationsRequestId.current || ownerId !== notificationOwner.current) return;
      const rows = (data || []).filter((notification) => isCurrentNotification(notification));
      setNotifications(rows);
      setNotificationsHydrated(true);
      notificationsLoadedAt.current = Date.now();
    } catch (error) {
      if (requestId !== notificationsRequestId.current || ownerId !== notificationOwner.current) return;
      setNotificationsError("Could not load notifications.");
      console.error('Failed to load notifications:', error);
    } finally {
      if (requestId === notificationsRequestId.current) setNotificationsLoading(false);
    }
  };

  const loadMessages = async ({ fresh = false, userId = null, force = false } = {}) => {
    try {
      if (!force && fresh && Date.now() - messagesLoadedAt.current < 10000) return;
      const requestId = ++messagesRequestId.current;
      const resolvedUserId = userId || user?.id || authUser?.id || (await base44.auth.me())?.id;
      if (!resolvedUserId) return;
      const messageQuery = fresh
        ? base44.entities.Message.filterFresh
        : base44.entities.Message.filter;
      const data = await messageQuery({ recipient_id: resolvedUserId }, '-created_date', 25);
      if (requestId !== messagesRequestId.current) return;
      const rows = data || [];
      setMessages(rows);
      setUnreadMessagesCount(rows.filter(m => !m.is_read).length);
      messagesLoadedAt.current = Date.now();
    } catch (error) {
      console.error('Failed to load messages:', error);
    }
  };

  const loadActiveMatches = async ({ fresh = false, force = false } = {}) => {
    if (!force && Date.now() - activeMatchesLoadedAt.current < 12000) return;
    activeMatchesLoadedAt.current = Date.now();
    const requestId = ++activeMatchesRequestId.current;
    try {
      const user = await base44.auth.me();
      if (!user) return;
      
      const [
        hostedWagers,
        challengedWagers,
        wagerParticipants,
        hostedRanked,
        challengedRanked,
        hostedXP,
        challengedXP,
        tournamentParticipants,
        challengeActivity,
      ] = await Promise.all([
        base44.entities.Wager[fresh ? "filterFresh" : "filter"]({ host_id: user.id }).catch(() => []),
        base44.entities.Wager[fresh ? "filterFresh" : "filter"]({ challenger_id: user.id }).catch(() => []),
        base44.entities.WagerParticipant[fresh ? "filterFresh" : "filter"]({ user_id: user.id }).catch(() => []),
        base44.entities.RankedMatch[fresh ? "filterFresh" : "filter"]({ host_id: user.id }).catch(() => []),
        base44.entities.RankedMatch[fresh ? "filterFresh" : "filter"]({ challenger_id: user.id }).catch(() => []),
        base44.entities.XPMatch[fresh ? "filterFresh" : "filter"]({ host_id: user.id }).catch(() => []),
        base44.entities.XPMatch[fresh ? "filterFresh" : "filter"]({ challenger_id: user.id }).catch(() => []),
        base44.profile.tournamentParticipants(user.id).catch(() => []),
        base44.functions.invoke("getChallengeActivity").then((response) => response.data?.matches || []).catch(() => []),
      ]);

      const byId = new Map();
      challengeActivity.forEach((match) => byId.set(`challenge:${match.id}`, match));
      const knownWagerIds = new Set([...hostedWagers, ...challengedWagers].map((match) => String(match.id)));
      const participantWagerIds = [...new Set((wagerParticipants || []).map((participant) => participant?.wager_id).filter(Boolean))]
        .filter((id) => !knownWagerIds.has(String(id)));
      const participantWagers = await Promise.all(participantWagerIds.map((id) => (
        base44.entities.Wager[fresh ? "getFresh" : "get"](id).catch(() => null)
      )));
      [...hostedWagers, ...challengedWagers, ...participantWagers.filter(Boolean)]
        .filter((match) => !hiddenMatchTypes.has(String(match.match_type || "").toLowerCase()))
        .forEach((match) => byId.set(`wager:${match.id}`, { ...match, entity_type: "wager" }));
      [...hostedRanked, ...challengedRanked].forEach((match) => byId.set(`ranked:${match.id}`, { ...match, entity_type: "ranked" }));
      [...hostedXP, ...challengedXP]
        .filter((match) => match.status !== "open")
        .forEach((match) => byId.set(`xp:${match.id}`, { ...match, entity_type: "xp", match_type: "xp" }));

      const participantKeySet = new Set((tournamentParticipants || []).flatMap(participantKeys));
      const tournamentIds = [...new Set((tournamentParticipants || []).map((participant) => participant.tournament_id).filter(Boolean))];
      const [tournamentMatchesByTournament, tournaments] = await Promise.all([
        Promise.all(tournamentIds.map((tournamentId) => (
          base44.entities.TournamentMatch[fresh ? "filterFresh" : "filter"]({ tournament_id: tournamentId }, "-created_date", 256).catch(() => [])
        ))),
        Promise.all(tournamentIds.map((tournamentId) => (
          base44.entities.Tournament[fresh ? "getFresh" : "get"](tournamentId).catch(() => null)
        ))),
      ]);
      const tournamentNames = Object.fromEntries(tournaments.filter(Boolean).map((tournament) => [tournament.id, tournament.name]));
      const cancelledTournamentIds = new Set(tournaments.filter((row) => row?.status === "cancelled").map((row) => row.id));

      tournamentMatchesByTournament.flat().forEach((match) => {
        if (cancelledTournamentIds.has(match.tournament_id)) return;
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

      const active = excludeCancelledHeaderMatches([...byId.values()], cancelledHeaderMatches.current)
        .filter((match) => (
          match.entity_type === "tournament"
            ? activeTournamentStatuses.has(match.status) && !match.completed
            : activeMatchStatuses.has(match.status) || (match.entity_type === "challenge" && ["open", "ready_check", "awaiting_confirmation"].includes(match.status)) || ((match.match_type === "8s" || match.match_type === "money8s") && match.status === "open")
        ))
        .sort((a, b) => (
          (new Date(b.match_started_date || b.assigned_date || b.created_date || 0).getTime() || 0)
          - (new Date(a.match_started_date || a.assigned_date || a.created_date || 0).getTime() || 0)
        ))
        .slice(0, 5);
      
      if (requestId === activeMatchesRequestId.current) setActiveMatches(active);
    } catch (error) {
      if (requestId === activeMatchesRequestId.current) activeMatchesLoadedAt.current = 0;
      console.error('Failed to load active matches:', error);
    }
  };

  const markNotifAsRead = async (id) => {
    const ownerId = notificationOwner.current;
    const notification = notifications.find((row) => row.id === id);
    if (!notification || pendingNotificationReads.current.has(id)) return;
    pendingNotificationReads.current.add(id);
    try {
      if (!notification.is_read) await base44.entities.Notification.update(id, { is_read: true });
      if (notification.type === "dispute" && notification.related_entity_id) {
        await base44.functions.invoke("acknowledgeDispute", { dispute_id: notification.related_entity_id }).catch((error) => {
          console.error("Failed to acknowledge dispute popup:", error);
        });
      }
      if (ownerId !== notificationOwner.current) return;
      notificationsRequestId.current += 1;
      notificationsLoadedAt.current = 0;
      setNotificationsLoading(false);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
      window.dispatchEvent(new CustomEvent("topfragg:notifications-updated", { detail: { readId: id, disputeId: notification.type === "dispute" ? notification.related_entity_id : undefined } }));
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    } finally {
      pendingNotificationReads.current.delete(id);
    }
  };

  const markMessageAsRead = async (id) => {
    const message = messages.find((row) => row.id === id);
    if (!message || message.is_read) return;
    try {
      if (message.message_type === "direct_message") {
        const response = await base44.functions.invoke("markDirectConversationRead", { other_user_id: message.sender_id, message_ids: [id] });
        if (!response.data?.success) throw new Error(response.data?.error || "Could not mark message as read");
        window.dispatchEvent(new CustomEvent("topfragg:notifications-updated", { detail: { refresh: true } }));
      } else await base44.entities.Message.update(id, { is_read: true });
      setMessages(prev => prev.map(m => m.id === id ? { ...m, is_read: true } : m));
      messagesLoadedAt.current = 0;
      await loadMessages({ fresh: true });
    } catch (error) {
      console.error('Failed to mark message as read:', error);
    }
  };

  const sidebarDesktop = navigationLayout === "sidebar" && sidebarWidth && Boolean(authUser?.id);

  const accountActions = (
    <div className={sidebarDesktop ? "sidebar-account-actions" : "topbar-actions flex shrink-0 items-center gap-2"}>
      {user ? (
        <>
      {/* Wallet summary */}
      {sidebarDesktop ? <SidebarBalances walletBalance={walletBalance} creditBalance={creditBalance} /> : <div className="topbar-wallet-summary hidden items-center md:flex">
        <div className="topbar-balance topbar-wallet flex h-10 items-center overflow-hidden">
          <Link to="/wallet" className="topbar-balance-main flex h-full items-center gap-2.5 px-2 transition-colors">
            <span className="topbar-balance-icon"><Wallet className="h-3.5 w-3.5" /></span>
            <span className="topbar-balance-copy">
              <span className="topbar-balance-kicker">Balance</span>
              <span className="font-mono text-[11px] font-black">${walletBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </span>
          </Link>
          <Link to="/wallet" title="Add funds" aria-label="Add funds" className="topbar-balance-add flex h-full w-7 items-center justify-center transition-colors">
            <Plus className="h-3.5 w-3.5" />
          </Link>
        </div>
        <span aria-hidden="true" className="topbar-wallet-divider" />
        <div className="topbar-balance topbar-credits flex h-10 items-center overflow-hidden">
          <Link to="/marketplace" title="Marketplace credits" className="topbar-balance-main flex h-full items-center gap-2.5 px-2 transition-colors">
            <span className="topbar-balance-icon"><Coins className="h-3.5 w-3.5" /></span>
            <span className="topbar-balance-copy">
              <span className="topbar-balance-kicker">Credits</span>
              <span className="font-mono text-[11px] font-black">{creditBalance.toLocaleString("en-US")}</span>
            </span>
          </Link>
          <Link to="/marketplace" title="Get credits" aria-label="Get credits" className="topbar-balance-add flex h-full w-7 items-center justify-center transition-colors">
            <Plus className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>}

      {/* Notifications */}
      <NavbarNotificationMenu
          sidebar={sidebarDesktop}
          open={notifOpen}
          onToggle={() => {
            cancelDropdownClose();
            setNotifOpen((current) => !current);
            setNavMenuOpen(null);
            setMatchesOpen(false);
            setMessagesOpen(false);
            setProfileOpen(false);
            if (!notifOpen) loadNotifications({ force: true });
          }}
          notifications={notifications}
          unreadCount={unreadNotifCount}
          loading={notificationsLoading}
          error={notificationsError}
          onRetry={() => loadNotifications({ force: true })}
          formatTime={formatMessageTime}
          onRead={markNotifAsRead}
          onClose={() => setNotifOpen(false)}
      />

      {/* Messages */}
      <NavbarMessageMenu
        key={user?.id || authUser?.id || "guest"}
        sidebar={sidebarDesktop}
        open={messagesOpen}
        onToggle={() => {
          cancelDropdownClose();
          setMessagesOpen((current) => !current);
          setNavMenuOpen(null);
          setMatchesOpen(false);
          setNotifOpen(false);
          setProfileOpen(false);
          if (!messagesOpen) loadMessages({ fresh: true, force: true });
        }}
          messages={messagePreviews}
          unreadCount={unreadMessagesCount}
          formatTime={formatMessageTime}
          onRead={markMessageAsRead}
          onClose={() => setMessagesOpen(false)}
      />

      {/* Profile */}
      <div
        className={`nav-dropdown-anchor relative ${sidebarDesktop ? "sidebar-profile-anchor" : ""}`}
        onMouseEnter={() => {
          if (!sidebarDesktop || !supportsDesktopHover()) return;
          cancelDropdownClose();
          setProfileOpen(true);
          setNavMenuOpen(null);
          setMatchesOpen(false);
          setNotifOpen(false);
          setMessagesOpen(false);
        }}
        onMouseLeave={() => { if (sidebarDesktop) scheduleDropdownClose(() => setProfileOpen(false)); }}
      >
        <button
          type="button"
          onClick={() => {
            cancelDropdownClose();
            setProfileOpen((current) => !current);
            setNavMenuOpen(null);
            setMatchesOpen(false);
            setNotifOpen(false);
            setMessagesOpen(false);
          }}
          className={`${sidebarDesktop ? "sidebar-profile-button" : "topbar-profile topbar-account-button"} ${profileOpen ? "is-open" : ""}`}
          aria-label={`Open account menu for ${accountName}`}
          title={`${accountName} · ${accountRole}`}
          aria-expanded={profileOpen}
          aria-controls="nav-account-menu"
        >
          <span className="topbar-avatar topbar-account-avatar" aria-hidden="true">
            <PlayerAvatarImage user={user || authUser} src={profileAvatar} loading="eager" />
          </span>
          <span className="topbar-account-copy">
            <span className="topbar-account-name">{accountName}</span>
            <span className="topbar-account-role" data-staff={canSeeAdminLink}>{canSeeAdminLink && <ShieldCheck size={11} aria-hidden="true" />}{accountRole}</span>
          </span>
          <span className="topbar-account-chevron" aria-hidden="true"><ChevronDown size={14} /></span>
        </button>

        {profileOpen && <AccountMenu user={user || authUser}
          name={accountName}
          role={accountRole}
          avatar={profileAvatar}
          profilePath={profilePath}
          staff={canSeeAdminLink}
          sidebar={sidebarDesktop}
          onClose={() => setProfileOpen(false)}
        />}
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
            className="inline-flex items-center gap-2 rounded-lg bg-orange px-4 py-2 text-sm font-bold text-background shadow-[0_0_24px_rgba(255,108,0,.16)] transition-all hover:bg-orange/90"
          >
            <UserPlus className="w-4 h-4" />
            Register
          </Link>
        </div>
      )}

      {/* Mobile Toggle */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        type="button"
        aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
        aria-expanded={mobileOpen}
        className={`navigation-mobile-toggle ${user ? "xl:hidden" : "hidden"} p-2 rounded-lg text-vapor hover:text-foreground hover:bg-secondary transition-all`}
      >
        {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>
    </div>
  );

  return (
    <>
      <BalancePopup notification={balancePopup} onClose={closeBalancePopup} />
      {adminRequest && isStaffUser(user || authUser) && (() => {
        const matchId = adminRequest.match_id || adminRequest.related_entity_id;
        const matchType = String(adminRequest.match_type || "wager").toLowerCase();
        const roomPath = adminRequest.action_url || (matchType === "ranked"
          ? `/ranked-match/${matchId}`
          : matchType === "tournament"
            ? `/tournament-match/${matchId}`
            : `/wagers-match/${matchId}`);
        const dismiss = () => {
          dismissedAdminRequests.current.add(adminRequest.id);
          activeAdminRequestId.current = null;
          setAdminRequest(null);
        };
        return (
          <div className="fixed inset-0 z-[101] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
            <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-red-400/35 bg-card p-7 text-center shadow-2xl">
              <div className="absolute inset-x-0 top-0 h-1 bg-red-400" />
              <button type="button" onClick={dismiss} className="absolute right-4 top-4 rounded-lg p-2 text-vapor transition-colors hover:bg-white/5 hover:text-white" aria-label="Close admin request"><X className="h-4 w-4" /></button>
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-red-500/15 text-red-400"><ShieldCheck className="h-8 w-8" /></div>
              <p className="mt-5 text-xs font-black uppercase tracking-[0.24em] text-red-400">Admin requested</p>
              <h2 className="mt-2 text-2xl font-black">{String(matchType).replace(/_/g, " ")} match #{String(matchId || adminRequest.id).slice(-8)}</h2>
              <div className="mt-5 rounded-2xl border border-white/5 bg-background/45 p-4">
                <p className="text-[10px] font-black uppercase tracking-wider text-vapor">Requested by</p>
                <p className="mt-1 text-base font-black text-cyan">{adminRequest.requested_by_name || adminRequest.username || "Player"}</p>
                {adminRequest.message && <p className="mt-3 text-xs leading-5 text-vapor">{adminRequest.message}</p>}
              </div>
              <p className="mt-4 text-xs leading-5 text-vapor">A player needs staff in this match room. Opening the room will register your staff join.</p>
              <Link to={roomPath} onClick={dismiss} className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-red-400 px-5 py-3.5 text-sm font-black uppercase tracking-wider text-background">Join match room <ExternalLink className="h-4 w-4" /></Link>
            </div>
          </div>
        );
      })()}
      {!adminRequest && adminDispute && isStaffUser(user || authUser) && (() => {
        const details = adminDispute.wager_details || adminDispute.match_details || {};
        const matchId = adminDispute.match_id || adminDispute.wager_id || adminDispute.tournament_match_id;
        const matchType = adminDispute.match_type || (adminDispute.tournament_match_id ? "tournament" : "wager");
        const roomPath = matchType === "ranked"
          ? `/ranked-match/${matchId}`
          : matchType === "tournament"
            ? `/tournament-match/${matchId}`
            : `/wagers-match/${matchId}`;
        const teamA = details.host_team_name || details.host_name || details.team_a_name || adminDispute.reported_by_name || "Team Alpha";
        const teamB = details.challenger_team_name || details.challenger_name || details.team_b_name || adminDispute.reported_against_name || "Team Bravo";
        const dismiss = () => {
          acknowledgeAdminDispute(adminDispute.id);
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
      <NavigationChrome sidebar={sidebarDesktop} accountActions={accountActions}>
      <nav
        data-scrolled={scrolled ? "true" : "false"}
        aria-label="Topbar navigation"
        className={`app-topbar app-topbar-v2 topbar-clean fixed top-0 left-0 right-0 z-50 ${scrolled ? "glass-nav" : ""}`}
      >
        <div className="app-topbar-inner mx-auto max-w-[1720px] px-3 lg:px-5">
          <div className="topbar-shell flex h-14 items-center justify-between gap-4 px-2.5 lg:px-3.5">
            {/* Logo + primary destination */}
            <div className="topbar-brand flex items-center gap-3 shrink-0">
              <Link to="/" className="topbar-brand-link flex items-center gap-2.5" aria-label="Topfragg.gg home">
                <TopfraggLogo className="topbar-logo" markClassName="topbar-logo-mark h-9 w-9" wordmarkClassName="topbar-logo-wordmark" />
              </Link>
            </div>

            {user && <TopbarNavigation
              isActive={isCurrentNavItemActive}
              openMenu={navMenuOpen}
              matchesOpen={matchesOpen}
              activeMatches={activeMatches}
              userId={user.id}
              historyPath={matchHistoryPath}
              onClose={closeDropdowns}
              onMenuToggle={(label) => { const next = navMenuOpen === label ? null : label; closeDropdowns(); setNavMenuOpen(next); }}
              onMatchesToggle={() => { const next = !matchesOpen; closeDropdowns(); setMatchesOpen(next); if (next) loadActiveMatches(); }}
            />}

            {accountActions}
          </div>
        </div>
      </nav>
      </NavigationChrome>

      {/* Mobile Menu */}
      {user && mobileOpen && (
          <div
            className="mobile-menu-enter fixed inset-0 z-40 overflow-y-auto overscroll-contain bg-background/98 pt-20 touch-pan-y xl:hidden"
            onClick={closeMobileMenu}
          >
            <div className="mx-auto max-w-lg space-y-1 px-4 pb-10 sm:px-6" onClick={(event) => event.stopPropagation()}>
              <div className="mb-2 flex items-center justify-between rounded-2xl border border-white/[0.08] bg-card/80 px-4 py-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan">Topfragg menu</p>
                  <p className="mt-0.5 text-xs text-vapor">Choose where you want to go</p>
                </div>
                <button
                  type="button"
                  onClick={closeMobileMenu}
                  aria-label="Close menu"
                  className="flex min-h-11 min-w-11 touch-manipulation items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04] text-vapor transition-colors hover:bg-white/[0.08] hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <Link
                to="/dashboard"
                onClick={closeMobileMenu}
                className={`flex items-center gap-3 rounded-xl px-4 py-3 text-base font-medium transition-all ${
                  isCurrentNavItemActive("/dashboard") ? "bg-orange/10 text-orange" : "text-vapor hover:bg-secondary hover:text-foreground"
                }`}
              >
                <House className="h-5 w-5" />
                Home
              </Link>
              {topbarMobileSections.map((section) => (
                <div key={section.label} className="pt-3">
                  <p className="px-4 pb-1 text-[10px] font-bold uppercase tracking-wider text-vapor/60">{section.label}</p>
                  <div className="space-y-1">
                    {section.items.map((link) => {
                      const Icon = link.icon;
                      const active = isCurrentNavItemActive(link.path);
                      return (
                        <Link
                          key={link.path}
                          to={link.path}
                          onClick={closeMobileMenu}
                          className={`flex items-center gap-3 px-4 py-3 rounded-xl text-base font-medium transition-all
                            ${active ? "bg-cyan/10 text-cyan" : "text-vapor hover:text-foreground hover:bg-secondary"}`}
                        >
                          <Icon className="w-5 h-5" />
                          {link.label}{link.isNew && <span className="challenge-new-tag">New</span>}
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
                    to="/my-matches?view=active"
                    onClick={closeMobileMenu}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl text-base font-medium transition-all
                      text-vapor hover:text-foreground hover:bg-secondary`}
                  >
                    <Activity className="w-5 h-5" />
                    Active Matches
                  </Link>
                  <Link
                    to={matchHistoryPath}
                    onClick={closeMobileMenu}
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
                        onClick={closeMobileMenu}
                        className="flex items-center gap-3 px-4 py-3 rounded-xl text-base font-medium text-pink-300 hover:bg-pink-400/10 transition-all"
                      >
                        <ShieldCheck className="w-5 h-5" />
                        Admin Console
                      </Link>
                    )}
                    <Link
                      to={profilePath}
                      onClick={closeMobileMenu}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl text-base font-medium text-vapor hover:text-foreground hover:bg-secondary transition-all"
                    >
                      <User className="w-5 h-5" />
                      My Profile
                    </Link>
                    <Link
                      to="/league"
                      onClick={closeMobileMenu}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl text-base font-medium text-vapor hover:text-foreground hover:bg-secondary transition-all"
                    >
                      <ShieldCheck className="w-5 h-5 text-cyan" />
                      <span>Topfragg League <span className="ml-1 text-[10px] text-cyan">Coming Soon</span></span>
                    </Link>
                    <Link
                      to="/my-tickets"
                      onClick={closeMobileMenu}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl text-base font-medium text-vapor hover:text-foreground hover:bg-secondary transition-all"
                    >
                      <Ticket className="w-5 h-5" />
                      My Tickets
                    </Link>
                    <Link
                      to="/find-players"
                      onClick={closeMobileMenu}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl text-base font-medium text-vapor hover:text-foreground hover:bg-secondary transition-all"
                    >
                      <MessageSquare className="w-5 h-5" />
                      Find Players Chat
                    </Link>
                    <Link
                      to="/rules"
                      onClick={closeMobileMenu}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl text-base font-medium text-vapor hover:text-foreground hover:bg-secondary transition-all"
                    >
                      <ShieldCheck className="w-5 h-5" />
                      Rules
                    </Link>
                    <Link
                      to="/wallet"
                      onClick={closeMobileMenu}
                      className="flex items-center gap-2 px-4 py-3 rounded-xl hover:bg-secondary transition-all"
                    >
                      <Wallet className="w-5 h-5 text-primary" />
                      <span className="font-mono font-semibold text-foreground">
                        ${walletBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </Link>
                    <Link
                      to="/marketplace"
                      onClick={closeMobileMenu}
                      className="flex items-center gap-2 rounded-xl px-4 py-3 transition-all hover:bg-secondary"
                    >
                      <Coins className="h-5 w-5 text-primary" />
                      <span className="font-mono font-semibold text-foreground">{creditBalance.toLocaleString("en-US")} Credits</span>
                    </Link>
                    <Link
                      to="/logout"
                      onClick={closeMobileMenu}
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
                      onClick={closeMobileMenu}
                      className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-vapor bg-secondary hover:text-foreground transition-all font-semibold"
                    >
                      <LogIn className="w-4 h-4" />
                      Login
                    </Link>
                    <Link
                      to="/register"
                      onClick={closeMobileMenu}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange px-4 py-3 font-bold text-background shadow-[0_0_24px_rgba(255,108,0,.16)] transition-all hover:bg-orange/90"
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

