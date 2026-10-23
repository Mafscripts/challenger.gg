import React, { lazy, Suspense } from "react";
import { Bell } from "lucide-react";
const NavbarNotifications = lazy(() => import("./NavbarNotifications"));
import NavigationUnreadBadge from "./NavigationUnreadBadge";

// Keep this menu click-controlled: hover followed by click used to close it
// immediately, and the sidebar's detached panel could not be reached in time.
export default function NavbarNotificationMenu({ sidebar, open, unreadCount, onToggle, ...previewProps }) {
  return <div className={`nav-dropdown-anchor relative ${sidebar ? "sidebar-updates-anchor" : ""}`}>
    <button
      type="button"
      aria-label="Open notifications"
      aria-expanded={open}
      aria-controls="nav-notifications-preview"
      onClick={onToggle}
      className={sidebar ? "sidebar-utility-button" : "topbar-icon-button topbar-notification-button relative flex h-11 w-11 touch-manipulation items-center justify-center rounded-xl text-vapor transition-all"}
    >
      <Bell className="w-4 h-4" />
      {sidebar && <span>Updates</span>}
      <NavigationUnreadBadge count={unreadCount} label="unread notifications" inline={sidebar} />
    </button>
    {open && <Suspense fallback={<div role="status" className="nav-popover absolute right-0 top-12 z-50 rounded-xl bg-card p-4 text-xs text-vapor">Loading notifications…</div>}><NavbarNotifications unreadCount={unreadCount} {...previewProps} /></Suspense>}
  </div>;
}
