import React from "react";
import { Bell } from "lucide-react";
import NavbarNotifications from "./NavbarNotifications";
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
    {open && <NavbarNotifications unreadCount={unreadCount} {...previewProps} />}
  </div>;
}
