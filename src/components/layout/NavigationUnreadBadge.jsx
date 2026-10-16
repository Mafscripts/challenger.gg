import React from "react";

export default function NavigationUnreadBadge({ count, label, inline = false }) {
  if (!(count > 0)) return null;
  return <span className="navigation-unread-badge" data-inline={inline} aria-label={`${count} ${label}`}>{count > 99 ? "99+" : count}</span>;
}
