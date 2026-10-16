import React from "react";
import Sidebar from "./Sidebar";

// Mount one navigation surface so menus, IDs and account controls stay unique.
export default function NavigationChrome({ sidebar, accountActions, unreadMessages = 0, unreadMatchUpdates = 0, children }) {
  return sidebar ? <Sidebar accountActions={accountActions} unreadMessages={unreadMessages} unreadMatchUpdates={unreadMatchUpdates} /> : children;
}
