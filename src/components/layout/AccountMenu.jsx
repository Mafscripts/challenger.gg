import React from "react";
import { Link } from "react-router-dom";
import { BookOpen, ChevronRight, CircleAlert, Crown, History, LogOut, Settings, ShieldCheck, Ticket, User, Users, Wallet } from "lucide-react";
import NavigationLayoutToggle from "./NavigationLayoutToggle";
import PlayerAvatarImage from "@/components/ui/PlayerAvatarImage";

export default function AccountMenu({ user, name, role, avatar, profilePath, staff, sidebar, onClose }) {
  const links = [
    { label: "My Profile", path: profilePath, icon: User },
    { label: "My Matches", path: "/my-matches", icon: History },
    { label: "Wallet", path: "/wallet", icon: Wallet },
    { label: "Teams", path: "/teams", icon: Users },
    { label: "My Tickets", path: "/my-tickets", icon: Ticket },
    { label: "Account Settings", path: "/settings", icon: Settings },
  ];
  return <div id="nav-account-menu" className="nav-popover nav-popover-enter nav-profile-popover profile-menu-compact absolute right-0 top-12 z-50 w-[min(360px,calc(100vw-1rem))] rounded-2xl" aria-label="Account menu">
    <Link to={profilePath} onClick={onClose} className="profile-menu-header" aria-label={`View ${name}'s profile`}>
      <span className="profile-menu-avatar"><PlayerAvatarImage user={user} src={avatar} /></span>
      <span className="profile-menu-identity"><strong>{name}</strong><span>View profile</span></span>
      <span className="profile-menu-role" data-staff={staff}>{role}</span><ChevronRight className="profile-menu-header-arrow" size={14} aria-hidden="true" />
    </Link>
    <div className="profile-menu-scroll">
      <nav className="profile-menu-section" aria-label="Your account"><p>Account</p><div className="profile-menu-account-grid">{links.map(({ label, path, icon: Icon }) => <Link key={path} to={path} onClick={onClose} className="profile-menu-link"><span className="profile-menu-item-icon"><Icon size={15} aria-hidden="true" /></span><span className="profile-menu-link-label">{label}</span></Link>)}</div></nav>
      <div className="profile-menu-secondary">
        <Link to="/premium" onClick={onClose} className="profile-menu-link profile-menu-premium"><span className="profile-menu-item-icon"><Crown size={15} aria-hidden="true" /></span><span className="profile-menu-link-label">Topfragg Premium</span><ChevronRight size={13} className="profile-menu-link-arrow" aria-hidden="true" /></Link>
        <Link to="/rules" onClick={onClose} className="profile-menu-link profile-menu-rules"><span className="profile-menu-item-icon"><BookOpen size={15} aria-hidden="true" /></span><span className="profile-menu-link-label">Rules</span><span className="profile-menu-important"><CircleAlert size={11} aria-hidden="true" />Important</span><ChevronRight size={13} className="profile-menu-link-arrow" aria-hidden="true" /></Link>
        {staff && <Link to="/admin" onClick={onClose} className="profile-menu-link profile-menu-admin-shortcut"><span className="profile-menu-item-icon"><ShieldCheck size={15} aria-hidden="true" /></span><span className="profile-menu-link-label">Admin Panel</span><ChevronRight size={13} className="profile-menu-link-arrow" aria-hidden="true" /></Link>}
      </div>
    </div>
    <footer className="profile-menu-footer" data-layout-switch={!sidebar}>
      {!sidebar && <NavigationLayoutToggle showLabel textOnly />}
      <Link to="/logout" onClick={onClose} className="profile-menu-logout"><LogOut size={14} aria-hidden="true" /><span>Log out</span></Link>
    </footer>
  </div>;
}
