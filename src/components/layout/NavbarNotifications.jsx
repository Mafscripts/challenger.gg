import React from "react";
import { Link } from "react-router-dom";
import { AlertCircle, ArrowRight, Bell, ChevronRight, Info, LoaderCircle, MessageSquare, ShieldCheck, ShoppingBag, Swords, Trophy, Users, Wallet, X } from "lucide-react";
import "@/styles/navbar-messages.css";
import "@/styles/navbar-notifications.css";

const notificationKinds = {
  system: { icon: Info, label: "Topfragg update", color: "hsl(var(--cyan))" },
  admin_request: { icon: ShieldCheck, label: "Staff request", color: "#f87171" },
  dispute: { icon: AlertCircle, label: "Dispute", color: "hsl(var(--orange))" },
  match: { icon: Swords, label: "Match update", color: "hsl(var(--orange))" },
  wager: { icon: Swords, label: "Cash match", color: "hsl(var(--orange))" },
  tournament: { icon: Trophy, label: "Tournament", color: "#c084fc" },
  challenge: { icon: Swords, label: "Challenge", color: "#f87171" },
  trade: { icon: ShoppingBag, label: "Trading", color: "hsl(var(--green))" },
  message: { icon: MessageSquare, label: "Private message", color: "hsl(var(--cyan))" },
  chat_mention: { icon: MessageSquare, label: "Chat mention", color: "hsl(var(--cyan))" },
  team: { icon: Users, label: "Team update", color: "hsl(var(--cyan))" },
};

function notificationKind(notification) {
  if (notification.type === "admin_request" || notification.type === "dispute") return notificationKinds[notification.type];
  if (notification.balance_type || notification.action_url === "/wallet" || notification.title === "Wager refunded") {
    return { icon: Wallet, label: notification.balance_type === "credits" ? "Credits" : "Wallet", color: Number(notification.balance_change) < 0 ? "#f87171" : "hsl(var(--green))" };
  }
  return notificationKinds[notification.type] || { icon: Bell, label: "Notification", color: "hsl(var(--cyan))" };
}

export default function NavbarNotifications({ notifications, unreadCount, formatTime, onRead, onClose, loading = false, error = "", onRetry }) {
  return <div id="nav-notifications-preview" className="nav-popover nav-popover-enter nav-messages-popover nav-notifications-popover absolute right-0 top-12 z-50 w-[min(400px,calc(100vw-1rem))] overflow-hidden rounded-2xl" role="region" aria-label="Notifications preview" aria-busy={loading}>
    <header className="nav-messages-header">
      <div><p className="nav-messages-eyebrow">Activity feed</p><h3>Notifications<span className="nav-messages-title-dot" /></h3></div>
      <button type="button" onClick={onClose} className="nav-notifications-close" aria-label="Close notifications"><X size={18} /></button>
      {unreadCount > 0 && <span className="nav-messages-unread-count">{unreadCount} unread</span>}
    </header>
    <div className="nav-messages-list-label"><span>Latest updates</span><span>{notifications.length ? `${notifications.length} shown` : "All quiet"}</span></div>
    {error && <div className="nav-notifications-error" role="alert"><span>{error}</span><button type="button" onClick={onRetry} disabled={loading}>Try again</button></div>}
    <div className="nav-messages-list">
      {loading && notifications.length === 0 ? <div className="nav-messages-empty" role="status"><LoaderCircle size={26} className="animate-spin" /><strong>Loading notifications…</strong></div>
        : notifications.length === 0 && !error ? <div className="nav-messages-empty"><Bell size={26} /><strong>You're all caught up.</strong><p>Match updates, rewards and team activity will appear here.</p></div>
        : notifications.map(notification => {
          const kind = notificationKind(notification);
          const Icon = kind.icon;
          const amount = Number(notification.balance_change || 0);
          const hasAmount = Number.isFinite(amount) && amount !== 0;
          const destination = notification.title === "Wager refunded" ? "/wallet" : notification.action_url || "/notifications";
          return <Link key={notification.id} to={destination} className="nav-message-row nav-notification-row" data-unread={!notification.is_read} style={{ "--notice-accent": kind.color }} onClick={() => { if (!notification.is_read || notification.type === "dispute") onRead(notification.id); onClose(); }}>
            <span className="nav-notification-icon" aria-hidden="true"><Icon size={20} /></span>
            <div className="nav-message-copy"><span className="nav-notification-kind">{kind.label}</span><div className="nav-message-identity"><strong>{notification.title || "Topfragg update"}</strong></div><p>{notification.message || "Open this notification for details."}</p>{hasAmount && <span className="nav-notification-amount">{amount > 0 ? "+" : "−"}{notification.balance_type === "wallet" ? `$${Math.abs(amount).toFixed(2)}` : `${Math.abs(amount).toLocaleString()} credits`}</span>}</div>
            <div className="nav-message-meta"><time dateTime={notification.created_date || undefined}>{formatTime(notification.created_date)}</time>{!notification.is_read ? <span className="nav-message-unread-dot" aria-label="Unread" /> : <ChevronRight size={14} />}</div>
          </Link>;
        })}
    </div>
    <footer className="nav-messages-footer"><Link to="/notifications" onClick={onClose} className="nav-messages-inbox-link"><span><strong>View all notifications</strong><small>Automatically deleted after 24 hours</small></span><span className="nav-messages-inbox-arrow"><ArrowRight size={18} /></span></Link></footer>
  </div>;
}
