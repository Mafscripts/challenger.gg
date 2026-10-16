import React from "react";
import { MessageSquare } from "lucide-react";
import NavbarMessages from "./NavbarMessages";
import NavigationUnreadBadge from "./NavigationUnreadBadge";

export default function NavbarMessageMenu({ sidebar, open, unreadCount, onToggle, ...previewProps }) {
  return <div className={`nav-dropdown-anchor relative ${sidebar ? "sidebar-inbox-anchor" : ""}`}>
    <button type="button" onClick={onToggle} aria-label="Open messages" aria-expanded={open} aria-controls="nav-messages-preview"
      className={sidebar ? "sidebar-utility-button" : "topbar-icon-button relative flex h-10 w-10 items-center justify-center rounded-xl text-vapor transition-colors"}>
      <MessageSquare className="w-4 h-4" />
      {sidebar && <span>Inbox</span>}
      <NavigationUnreadBadge count={unreadCount} label="unread messages" inline={sidebar} />
    </button>
    <NavbarMessages open={open} unreadCount={unreadCount} {...previewProps} />
  </div>;
}
