import React from "react";
import Sidebar from "./Sidebar";

// Mount one navigation surface so menus, IDs and account controls stay unique.
export default function NavigationChrome({ sidebar, accountActions, children }) {
  return sidebar ? <Sidebar accountActions={accountActions} /> : children;
}
