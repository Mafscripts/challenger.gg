import React from "react";
import { Link, useLocation } from "react-router-dom";
import {
  BarChart3,
  BookOpen,
  Crosshair,
  History,
  LayoutDashboard,
  LogOut,
  Newspaper,
  Package,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Swords,
  Trophy,
  User,
  Users,
  Wallet,
} from "lucide-react";
import TopfraggLogo from "@/components/brand/TopfraggLogo";
import { useAuth } from "@/lib/AuthContext";

const sections = [
  {
    label: "Arena",
    items: [
      { label: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
      { label: "Profile", path: "/profile", icon: User, matchPrefix: "/profile/" },
      { label: "Ranked", path: "/ranked", icon: Crosshair },
      { label: "Wagers", path: "/wagers", icon: Swords },
      { label: "Tournaments", path: "/tournaments", icon: Trophy },
    ],
  },
  {
    label: "Community",
    items: [
      { label: "Teams", path: "/teams", icon: Users },
      { label: "Leaderboards", path: "/leaderboards", icon: BarChart3 },
      { label: "CDL Live", path: "/cdl", icon: History },
      { label: "News", path: "/news", icon: Newspaper },
    ],
  },
  {
    label: "Armory",
    items: [
      { label: "Marketplace", path: "/marketplace", icon: ShoppingBag },
      { label: "Inventory", path: "/inventory", icon: Package },
      { label: "Trading", path: "/trading", icon: Wallet },
      { label: "Premium", path: "/premium", icon: Trophy },
    ],
  },
];

const staffRoles = new Set(["ceo", "super_admin", "admin", "moderator"]);

export default function Sidebar() {
  const location = useLocation();
  const { user } = useAuth();
  const canSeeAdmin = user?.is_admin === true
    || staffRoles.has(user?.role)
    || staffRoles.has(user?.admin_role);

  const isActive = (item) => (
    location.pathname === item.path
    || (item.matchPrefix && location.pathname.startsWith(item.matchPrefix))
  );

  return (
    <aside className="arena-sidebar fixed inset-y-0 left-0 z-[60] hidden w-60 flex-col xl:flex">
      <Link to="/dashboard" className="arena-sidebar-brand" aria-label="Topfragg dashboard">
        <TopfraggLogo markClassName="h-7 w-7" wordmarkClassName="text-[15px]" />
      </Link>

      <nav className="arena-sidebar-nav" aria-label="Primary navigation">
        {sections.map((section) => (
          <div key={section.label} className="arena-sidebar-section">
            <p className="arena-sidebar-label">{section.label}</p>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon;
                const active = isActive(item);
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`arena-sidebar-link ${active ? "is-active" : ""}`}
                  >
                    <Icon className="h-4 w-4" strokeWidth={1.8} />
                    <span>{item.label}</span>
                    {active && <span className="arena-sidebar-active-dot" aria-hidden="true" />}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="arena-sidebar-footer">
        {canSeeAdmin && (
          <Link to="/admin" className={`arena-sidebar-link ${location.pathname === "/admin" ? "is-active" : ""}`}>
            <ShieldCheck className="h-4 w-4" strokeWidth={1.8} />
            <span>Admin Panel</span>
          </Link>
        )}
        <Link to="/rules" className={`arena-sidebar-link ${location.pathname === "/rules" ? "is-active" : ""}`}>
          <BookOpen className="h-4 w-4" strokeWidth={1.8} />
          <span>Rules</span>
        </Link>
        <Link to="/settings" className={`arena-sidebar-link ${location.pathname === "/settings" ? "is-active" : ""}`}>
          <Settings className="h-4 w-4" strokeWidth={1.8} />
          <span>Settings</span>
        </Link>
        <Link to="/logout" className="arena-sidebar-link arena-sidebar-logout">
          <LogOut className="h-4 w-4" strokeWidth={1.8} />
          <span>Logout</span>
        </Link>
      </div>
    </aside>
  );
}
