import React from "react";
import { Link, useLocation } from "react-router-dom";
import { BookOpen, ChevronRight, House, LogOut, Settings, ShieldCheck, Ticket, User, Users } from "lucide-react";
import TopfraggLogo from "@/components/brand/TopfraggLogo";
import { useAuth } from "@/lib/AuthContext";
import { isStaffUser } from "@/lib/roles";
import { mobileNavSections } from "./navigationGroups";
import NavigationLayoutToggle from "./NavigationLayoutToggle";
import NavigationHoverFill from "./NavigationHoverFill";

function activeDestination(location, path) {
  const [pathname, query] = path.split("?");
  if (location.pathname !== pathname) return false;
  const expected = new URLSearchParams(query);
  if (pathname === "/ranked/8s") return (new URLSearchParams(location.search).get("mode") === "money") === (expected.get("mode") === "money");
  if (pathname === "/leaderboards") return (new URLSearchParams(location.search).get("tab") || "") === (expected.get("tab") || "");
  return [...expected].every(([key, value]) => new URLSearchParams(location.search).get(key) === value);
}

export default function Sidebar({ accountActions }) {
  const location = useLocation();
  const { user } = useAuth();
  const profilePath = user ? `/profile/${encodeURIComponent(user.username || user.id)}` : "/profile";
  const sections = [
    { label: "Your arena", items: [{ label: "Home", path: "/dashboard", icon: House, tone: "orange" }, { label: "My Profile", path: profilePath, icon: User, tone: "cyan" }] },
    ...mobileNavSections.filter((section) => section.label !== "Teams"),
    { label: "Community", items: [{ label: "Teams", path: "/teams", icon: Users, tone: "orange" }, { label: "My Tickets", path: "/my-tickets", icon: Ticket, tone: "orange" }] },
  ];
  const navLink = (item) => {
    const Icon = item.icon;
    const active = activeDestination(location, item.path) || (item.path === "/challenge-a-team" && location.pathname.startsWith("/challenge-a-team/")) || (item.path === profilePath && location.pathname === "/profile");
    return <Link key={item.path} to={item.path} className="layout-sidebar-link navigation-hover" data-tone={item.tone || "cyan"} aria-current={active ? "page" : undefined}>
      <NavigationHoverFill />
      <span className="layout-sidebar-item-icon"><Icon size={15} strokeWidth={1.8} aria-hidden="true" /></span><span className="layout-sidebar-item-label">{item.label}</span>{item.isNew && <span className="challenge-new-tag">New</span>}{active && !item.isNew && <ChevronRight className="layout-sidebar-current" size={13} aria-hidden="true" />}
    </Link>;
  };
  return <aside className="layout-sidebar" aria-label="Sidebar navigation">
    <Link to="/dashboard" className="layout-sidebar-brand" aria-label="Topfragg dashboard"><TopfraggLogo markClassName="h-9 w-9" wordmarkClassName="text-[16px]" /></Link>
    {accountActions && <div className="sidebar-account-controls app-topbar-v2">{accountActions}</div>}
    <nav className="layout-sidebar-nav" aria-label="Primary navigation">
      {sections.map((section) => <div key={section.label} className="layout-sidebar-section"><p>{section.label}</p>{section.items.map(navLink)}</div>)}
      <div className="layout-sidebar-game-wrap">
        <Link to="/ranked/8s?game=mw4" className="layout-sidebar-game navigation-hover">
          <NavigationHoverFill />
          <span className="layout-sidebar-game-eyebrow">Next deployment</span>
          <span className="layout-sidebar-game-title">Modern Warfare 4</span>
          <span className="layout-sidebar-game-action">View Free 8s <ChevronRight size={13} aria-hidden="true" /></span>
        </Link>
      </div>
    </nav>
    <div className="layout-sidebar-footer">
      {isStaffUser(user) && navLink({ label: "Admin Panel", path: "/admin", icon: ShieldCheck, tone: "red" })}
      <div className="layout-sidebar-utilities">{navLink({ label: "Rules", path: "/rules", icon: BookOpen })}{navLink({ label: "Settings", path: "/settings", icon: Settings })}</div>
      <NavigationLayoutToggle showLabel />
      <Link to="/logout" className="layout-sidebar-signout navigation-hover"><NavigationHoverFill /><LogOut size={14} aria-hidden="true" /><span>Log out</span><ChevronRight size={13} aria-hidden="true" /></Link>
    </div>
  </aside>;
}
