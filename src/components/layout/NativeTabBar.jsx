import React from "react";
import { Link, useLocation } from "react-router-dom";
import { Home, Swords, ClipboardList, MessageSquare, Settings } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { isNativeApp } from "@/lib/nativeApp";
import { nativeNavigationTab } from "@/lib/nativeNavigation";

const tabs = [
  ["/dashboard", "Home", Home], ["/ranked", "Play", Swords], ["/my-matches", "Matches", ClipboardList],
  ["/messages", "Messages", MessageSquare], ["/settings", "Settings", Settings],
];

export default function NativeTabBar() {
  const { isAuthenticated } = useAuth();
  const { pathname } = useLocation();
  const selectedTab = nativeNavigationTab(pathname);
  if (!isNativeApp || !isAuthenticated) return null;
  return <nav className="native-tab-bar" aria-label="App navigation">
    {tabs.map(([to, label, Icon]) => <Link key={to} to={to} className={selectedTab === to ? "is-active" : undefined} aria-current={selectedTab === to ? "page" : undefined}>
      <Icon aria-hidden="true" size={21} strokeWidth={1.8} /><span>{label}</span>
    </Link>)}
  </nav>;
}
