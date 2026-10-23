import React, { lazy, Suspense, useEffect, useState } from "react";
import { MessageSquare } from "lucide-react";
const NavbarMessages = lazy(() => import("./NavbarMessages"));
import NavigationUnreadBadge from "./NavigationUnreadBadge";

function DeferredMessagePreview({ open, unreadCount, ...previewProps }) {
  const [hasOpened, setHasOpened] = useState(open);
  useEffect(() => { if (open) setHasOpened(true); }, [open]);
  if (!open && !hasOpened) return null;
  return <Suspense fallback={open ? <div role="status" className="nav-popover absolute right-0 top-12 z-50 rounded-xl bg-card p-4 text-xs text-vapor">Loading messages…</div> : null}><NavbarMessages open={open} unreadCount={unreadCount} {...previewProps} /></Suspense>;
}

export default function NavbarMessageMenu({ sidebar, open, unreadCount, onToggle, ...previewProps }) {
  return <div className={`nav-dropdown-anchor relative ${sidebar ? "sidebar-inbox-anchor" : ""}`}>
    <button type="button" onClick={onToggle} aria-label="Open messages" aria-expanded={open} aria-controls="nav-messages-preview"
      className={sidebar ? "sidebar-utility-button" : "topbar-icon-button relative flex h-10 w-10 items-center justify-center rounded-xl text-vapor transition-colors"}>
      <MessageSquare className="w-4 h-4" />
      {sidebar && <span>Inbox</span>}
      <NavigationUnreadBadge count={unreadCount} label="unread messages" inline={sidebar} />
    </button>
    <DeferredMessagePreview open={open} unreadCount={unreadCount} {...previewProps} />
  </div>;
}
