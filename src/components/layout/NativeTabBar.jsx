import React from "react";
import { NavLink } from "react-router-dom";
import { Home, Swords, ClipboardList, MessageSquare, Settings } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { isNativeApp } from "@/lib/nativeApp";

const tabs = [
  ["/dashboard", "Home", Home], ["/ranked", "Play", Swords], ["/my-matches", "Matches", ClipboardList],
  ["/messages", "Messages", MessageSquare], ["/settings", "Settings", Settings],
];

export default function NativeTabBar() {
  const { isAuthenticated } = useAuth();
  if (!isNativeApp || !isAuthenticated) return null;
  return <nav className="native-tab-bar" aria-label="App navigation">
    {tabs.map(([to, label, Icon]) => <NavLink key={to} to={to} className={({ isActive }) => isActive ? "is-active" : undefined}>
      <Icon aria-hidden="true" size={21} strokeWidth={1.8} /><span>{label}</span>
    </NavLink>)}
  </nav>;
}
