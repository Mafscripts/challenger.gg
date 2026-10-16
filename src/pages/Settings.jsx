import React, { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  AtSign,
  Award,
  Coins,
  ArrowUpRight,
  ChevronRight,
  Settings2,
  Gamepad2,
  Gift,
  KeyRound,
  Link2,
  MessageCircle,
  MonitorPlay,
  PanelLeft,
  ShieldCheck,
  UserRound,
  WalletCards,
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import AccountSection from "@/components/settings/AccountSection";
import CreditsSection from "@/components/settings/CreditsSection";
import PaymentPermissionsSection from "@/components/settings/PaymentPermissionsSection";
import DiscordSection from "@/components/settings/DiscordSection";
import TwitchSection from "@/components/settings/TwitchSection";
import GamingIdsSection from "@/components/settings/GamingIdsSection";
import GameRankSection from "@/components/settings/GameRankSection";
import NavigationLayoutSection from "@/components/settings/NavigationLayoutSection";
import SocialsSection from "@/components/settings/SocialsSection";
import ReferralSection from "@/components/settings/ReferralSection";
import StreamOverlaySection from "@/components/settings/StreamOverlaySection";
import "@/styles/settings.css";
import PageLoader from "@/components/ui/PageLoader";

const settingGroups = [
  {
    id: "appearance", label: "Appearance", description: "Topbar or sidebar navigation", icon: PanelLeft,
    items: [{ label: "Navigation layout", icon: PanelLeft, target: "settings-navigation" }],
  },
  {
    id: "account",
    label: "Account",
    description: "Profile, password & game rank",
    icon: UserRound,
    items: [
      { label: "Profile & username", icon: UserRound, target: "settings-account" },
      { label: "Game rank", icon: Award, target: "settings-rank" },
      { label: "Password", icon: KeyRound, target: "settings-password" },
    ],
  },
  {
    id: "wallet",
    label: "Wallet & rewards",
    description: "Credits, payments & referrals",
    icon: WalletCards,
    items: [
      { label: "Credits", icon: Coins, target: "settings-credits" },
      { label: "Team payments", icon: ShieldCheck, target: "settings-payments" },
      { label: "Referrals", icon: Gift, target: "settings-referrals" },
    ],
  },
  {
    id: "connections",
    label: "Connections",
    description: "Gaming accounts & social profiles",
    icon: Link2,
    items: [
      { label: "Gaming IDs", icon: Gamepad2, target: "settings-gaming" },
      { label: "Social profiles", icon: AtSign, target: "settings-socials" },
      { label: "Twitch", icon: MessageCircle, target: "settings-twitch" },
      { label: "Stream overlay", icon: MonitorPlay, target: "settings-overlay" },
      { label: "Discord", icon: MessageCircle, target: "settings-discord" },
    ],
  },
];

const legacyTargets = { "gaming-ids": "settings-gaming", credits: "settings-credits", discord: "settings-discord", twitch: "settings-twitch" };
const groupDetails = {
  appearance: { title: "Your navigation, your choice", description: "Choose the layout that feels right for you." },
  account: { title: "Account & security", description: "Manage how players see you and keep your login up to date." },
  wallet: { title: "Wallet & rewards", description: "View your credits, manage team payments and share your referral link." },
  connections: { title: "Connected accounts", description: "Keep your gaming IDs, social profiles and community connections in one place." },
};

function settingTarget(hash, search) {
  const rawTarget = hash.slice(1);
  const target = legacyTargets[rawTarget] || rawTarget;
  if (settingGroups.some(group => group.items.some(item => item.target === target))) return target;
  const params = new URLSearchParams(search);
  if (params.has("discord") || params.get("connect") === "discord") return "settings-discord";
  if (params.has("twitch")) return "settings-twitch";
  return "settings-account";
}

function scrollToSetting(target) {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.getElementById(target)?.scrollIntoView({ behavior: reducedMotion ? "instant" : "smooth", block: "start" });
}

export default function Settings() {
  const { pathname, hash, search, state } = useLocation();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [failedAvatar, setFailedAvatar] = useState("");
  const preserveSettingsScroll = state?.preserveSettingsScroll === true;
  const target = settingTarget(hash, search);
  const activeGroup = settingGroups.find(group => group.items.some(item => item.target === target));
  const details = groupDetails[activeGroup.id];
  const GroupIcon = activeGroup.icon;

  const loadUser = useCallback(async () => {
    const me = await base44.auth.me();
    setUser(me);
  }, []);

  useEffect(() => {
    base44.auth.isAuthenticated().then(async (authed) => {
      if (authed) await loadUser();
    }).catch(() => setError("Your settings could not be loaded. Please refresh and try again."))
      .finally(() => setLoading(false));
  }, [loadUser]);

  useEffect(() => {
    const params = new URLSearchParams(search);
    if (!loading && !preserveSettingsScroll && (hash || params.has("discord") || params.has("twitch") || params.get("connect") === "discord")) scrollToSetting(target);
  }, [loading, hash, search, target, preserveSettingsScroll]);

  const openSetting = (nextTarget, { scroll = true } = {}) => {
    if (target === nextTarget) {
      if (scroll) scrollToSetting(nextTarget);
      return;
    }
    navigate({ pathname, search: window.location.search, hash: `#${nextTarget}` }, {
      state: scroll ? null : { preserveSettingsScroll: true },
    });
  };

  if (loading) return <PageLoader label="Loading settings" />;
  const displayName = user?.display_name || user?.full_name || user?.username || "Player";
  const avatar = user?.avatar_url;

  return (
    <div className="settings-page">
      <div className="settings-container">
        <header className="settings-heading">
          <div className="settings-heading-copy">
            <span className="settings-eyebrow"><Settings2 size={14} aria-hidden="true" />Your Topfragg account</span>
            <h1>Settings</h1>
            <p>Your profile, security and connections. All in one place.</p>
          </div>
          {user && <Link to={`/profile/${user.username || user.id}`} className="settings-profile-link" aria-label={`View ${displayName}'s profile`}>
            <span className="settings-profile-avatar">{avatar && failedAvatar !== avatar ? <img src={avatar} alt="" onError={() => setFailedAvatar(avatar)} /> : displayName.slice(0, 2).toUpperCase()}</span>
            <span className="settings-profile-copy"><strong>{displayName}</strong><span>View your profile</span></span>
            <ArrowUpRight size={17} aria-hidden="true" />
          </Link>}
        </header>

        {error ? <p role="alert" className="settings-load-error">{error}</p> : !user ? <div className="settings-sign-in"><h2>Sign in to manage your account</h2><Link to="/login">Log in<ChevronRight size={16} /></Link></div> : (
          <div className="settings-workspace">
            <aside className="settings-sidebar">
              <p className="settings-nav-label">Manage your account</p>
              <nav aria-label="Settings categories" className="settings-categories">
                {settingGroups.map(group => {
                  const Icon = group.icon;
                  const selected = activeGroup.id === group.id;
                  return <button key={group.id} type="button" onClick={() => openSetting(group.items[0].target, { scroll: false })} aria-current={selected ? "true" : undefined} className="settings-category">
                    <span className="settings-category-icon"><Icon size={19} aria-hidden="true" /></span>
                    <span className="settings-category-copy"><strong>{group.label}</strong><span>{group.description}</span></span>
                    <ChevronRight size={15} className="settings-category-arrow" aria-hidden="true" />
                  </button>;
                })}
              </nav>
              <div className="settings-shortcuts">
                <p className="settings-nav-label">In this section</p>
                <nav aria-label={`${activeGroup.label} shortcuts`}>
                  {activeGroup.items.map(item => {
                    const Icon = item.icon;
                    return <button key={item.target} type="button" onClick={() => openSetting(item.target)} aria-current={target === item.target ? "location" : undefined}><Icon size={16} aria-hidden="true" /><span>{item.label}</span><ChevronRight size={13} aria-hidden="true" /></button>;
                  })}
                </nav>
              </div>
            </aside>
            <div className="settings-content">
              <header className="settings-section-heading">
                <span><GroupIcon size={22} aria-hidden="true" /></span>
                <div><h2>{details.title}</h2><p>{details.description}</p></div>
              </header>
              {activeGroup.id === "appearance" && <div className="settings-panel"><div id="settings-navigation" className="settings-block"><NavigationLayoutSection /></div></div>}
              {activeGroup.id === "account" && <div className="settings-panel">
                <div id="settings-account" className="settings-block"><AccountSection user={user} onUserUpdate={loadUser} /></div>
                <div id="settings-rank" className="settings-block"><GameRankSection user={user} onUserUpdate={loadUser} /></div>
              </div>}
              {activeGroup.id === "wallet" && <div className="settings-panel">
                <div id="settings-credits" className="settings-block"><CreditsSection user={user} onUserUpdate={loadUser} /></div>
                <div id="settings-payments" className="settings-block"><PaymentPermissionsSection user={user} onUserUpdate={loadUser} /></div>
                <div id="settings-referrals" className="settings-block"><ReferralSection /></div>
              </div>}
              {activeGroup.id === "connections" && <div className="settings-panel">
                <div id="settings-gaming" className="settings-block"><GamingIdsSection user={user} onUserUpdate={loadUser} /></div>
                <div id="settings-socials" className="settings-block"><SocialsSection user={user} onUserUpdate={loadUser} /></div>
                <div id="settings-twitch" className="settings-block"><TwitchSection user={user} onUserUpdate={loadUser} /></div>
                <div id="settings-overlay" className="settings-block"><StreamOverlaySection user={user} /></div>
                <div id="settings-discord" className="settings-block"><DiscordSection user={user} onUserUpdate={loadUser} /></div>
              </div>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
