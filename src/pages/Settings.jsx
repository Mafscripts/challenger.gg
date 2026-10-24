import PlayerCardSection from "@/components/settings/PlayerCardSection";
import StreamConnectionsSection from "@/components/settings/StreamConnectionsSection";
import React, { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  AtSign,
  Award,
  Coins,
  ArrowUpRight,
  ArrowRight,
  ChevronRight,
  Gamepad2,
  Gift,
  KeyRound,
  Link2,
  MessageCircle,
  MonitorPlay,
  PanelLeft,
  Palette,
  ShieldCheck,
  UserRound,
  WalletCards,
  Radio,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import CompetitionHero from "@/components/competition/CompetitionHero";
import { settingGroups, settingTarget, searchSettings } from "@/lib/settingsNavigation";
import { base44 } from "@/api/base44Client";
import AccountSection from "@/components/settings/AccountSection";
import DeleteOwnAccountSection from "@/components/settings/DeleteOwnAccountSection";
import NameColorSection from "@/components/settings/NameColorSection";
import CreditsSection from "@/components/settings/CreditsSection";
import PaymentPermissionsSection from "@/components/settings/PaymentPermissionsSection";
import DiscordSection from "@/components/settings/DiscordSection";
import GamingIdsSection from "@/components/settings/GamingIdsSection";
import GameRankSection from "@/components/settings/GameRankSection";
import NavigationLayoutSection from "@/components/settings/NavigationLayoutSection";
import SocialsSection from "@/components/settings/SocialsSection";
import ReferralSection from "@/components/settings/ReferralSection";
import StreamOverlaySection from "@/components/settings/StreamOverlaySection";
import "@/styles/settings.css";
import PageLoader from "@/components/ui/PageLoader";
import PlayerAvatarImage from "@/components/ui/PlayerAvatarImage";

const icons = { AtSign, Award, Coins, Gamepad2, Gift, KeyRound, Link2, MessageCircle, MonitorPlay, PanelLeft, Palette, Radio, ShieldCheck, UserRound, WalletCards };
const groupDetails = {
  appearance: { title: "Your navigation, your choice", description: "Choose the layout that feels right for you." },
  account: { title: "Account & security", description: "Manage how players see you and keep your login up to date." },
  wallet: { title: "Wallet & rewards", description: "View your credits, manage team payments and share your referral link." },
  connections: { title: "Connected accounts", description: "Keep your gaming IDs, social profiles and community connections in one place." },
};

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
  const [query, setQuery] = useState("");
  const preserveSettingsScroll = state?.preserveSettingsScroll === true;
  const target = settingTarget(hash, search);
  const activeGroup = settingGroups.find(group => group.items.some(item => item.target === target));
  const details = groupDetails[activeGroup.id];
  const GroupIcon = icons[activeGroup.icon];
  const searchResults = searchSettings(query);

  const loadUser = useCallback(async ({ force = true } = {}) => {
    const me = await base44.auth.me({ force });
    setUser(me);
  }, []);
  const applyPlayerCardUser = useCallback(updatedUser => {
    if (updatedUser?.id) setUser(updatedUser);
    else return loadUser();
  }, [loadUser]);

  useEffect(() => {
    base44.auth.isAuthenticated().then(async (authed) => {
      if (authed) await loadUser({ force: false });
    }).catch(() => setError("Your settings could not be loaded. Please refresh and try again."))
      .finally(() => setLoading(false));
  }, [loadUser]);

  useEffect(() => {
    const params = new URLSearchParams(search);
    if (!loading && !preserveSettingsScroll && (hash || params.has("discord") || params.has("twitch") || params.has("stream_provider") || params.get("connect") === "discord")) scrollToSetting(target);
  }, [loading, hash, search, target, preserveSettingsScroll]);

  const openSetting = (nextTarget, { scroll = true } = {}) => {
    setQuery("");
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
    <div className="settings-page page-shell">
      <div className="page-container">
        <CompetitionHero mode="settings" className="mb-6" description="Your identity. Your style. Your arena. Manage your profile, connections and account in one place."
          action={user && <nav className="competition-actions" aria-label="Frequently used settings">
            <button className="competition-action-pill" type="button" onClick={() => openSetting("settings-streaming")}><Radio size={14} />Connect a stream<ArrowRight size={13} /></button>
            <button className="competition-action-pill" type="button" onClick={() => openSetting("settings-gaming")}><Gamepad2 size={14} />Gaming IDs</button>
            <button className="competition-action-pill" type="button" onClick={() => openSetting("settings-password")}><KeyRound size={14} />Password</button>
          </nav>}
          metadata={user && <Link to={`/profile/${user.username || user.id}`} className="settings-profile-link" aria-label={`View ${displayName}'s profile`}>
            <span className="settings-profile-avatar"><PlayerAvatarImage user={user} src={avatar} /></span>
            <span className="settings-profile-copy"><small>YOUR PLAYER PROFILE</small><strong>{displayName}</strong><span>View profile<ArrowUpRight size={12} /></span></span>
            <ArrowUpRight size={17} aria-hidden="true" />
          </Link>} />

        {error ? <p role="alert" className="settings-load-error">{error}</p> : !user ? <div className="settings-sign-in"><h2>Sign in to manage your account</h2><Link to="/login">Log in<ChevronRight size={16} /></Link></div> : (
          <div className="settings-dashboard">
            <div className="settings-search-area">
              <form id="settings-search-form" className="settings-search-bar" role="search" autoComplete="off" onSubmit={event => { event.preventDefault(); if (query.trim() && searchResults.length) openSetting(searchResults[0].target); }}>
                <label htmlFor="settings-search"><Search size={19} /><span className="sr-only">Search all settings</span></label>
                <input id="settings-search" name="settings-filter" type="search" autoComplete="off" autoCapitalize="none" spellCheck={false} value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === "Escape") setQuery(""); }} placeholder="Find a setting…" aria-controls={query.trim() ? "settings-search-results" : undefined} />
                {query ? <button type="button" aria-label="Clear settings search" onClick={() => setQuery("")}><X size={17} /></button> : <span>Search all categories</span>}
              </form>
              {Boolean(query.trim()) && <div id="settings-search-results" className="settings-search-results"><p role="status" aria-live="polite">{searchResults.length ? `${searchResults.length} ${searchResults.length === 1 ? "setting" : "settings"} found` : "No settings found. Try “stream”, “name” or “password”."}</p><nav aria-label="Settings search results">{searchResults.map(item => { const Icon = icons[item.icon]; return <button type="button" key={item.target} data-tone={item.tone} onClick={() => openSetting(item.target)}><span className="settings-result-icon"><Icon size={18} /></span><span><strong>{item.label}</strong><small>{item.group} · {item.description}</small></span><ArrowRight size={16} /></button>; })}</nav></div>}
            </div>
            <nav aria-label="Settings categories" className="settings-categories">
              {settingGroups.map((group, index) => {
                const Icon = icons[group.icon];
                return <button key={group.id} type="button" data-tone={group.tone} onClick={() => openSetting(group.items[0].target)} aria-pressed={activeGroup.id === group.id} className="settings-category">
                  <Icon size={96} className="settings-category-watermark" aria-hidden="true" />
                  <span className="settings-category-top"><span className="settings-category-icon"><Icon size={23} aria-hidden="true" /></span><span>0{index + 1}</span></span>
                  <span className="settings-category-copy"><strong>{group.label}</strong><span>{group.description}</span></span>
                  <span className="settings-category-bottom">{group.items.length} {group.items.length === 1 ? "setting" : "settings"}<ArrowRight size={15} /></span>
                </button>;
              })}
            </nav>
          <div className="settings-workspace">
            <aside className="settings-sidebar" data-tone={activeGroup.tone}>
              <label className="settings-group-switch"><span className="settings-nav-label">Switch category</span><select value={activeGroup.id} onChange={event => openSetting(settingGroups.find(group => group.id === event.target.value).items[0].target)}>{settingGroups.map(group => <option key={group.id} value={group.id}>{group.label}</option>)}</select></label>
              <div className="settings-shortcuts">
                <p className="settings-nav-label">Jump to a setting</p>
                <nav aria-label={`${activeGroup.label} shortcuts`}>
                  {activeGroup.items.map(item => {
                    const Icon = icons[item.icon];
                    return <button key={item.target} type="button" onClick={() => openSetting(item.target)} aria-current={target === item.target ? "location" : undefined}><Icon size={17} aria-hidden="true" /><span><strong>{item.label}</strong><small>{item.description}</small></span><ChevronRight size={13} aria-hidden="true" /></button>;
                  })}
                </nav>
              </div>
              <Link to="/support" className="settings-sidebar-help"><MessageCircle size={17} /><span>Need a hand?<strong>Contact support<ArrowUpRight size={12} /></strong></span></Link>
            </aside>
            <div className="settings-content" data-tone={activeGroup.tone}>
              <header className="settings-section-heading">
                <span><GroupIcon size={22} aria-hidden="true" /></span>
                <div><span className="settings-section-kicker"><Sparkles size={11} /> MAKE IT YOURS</span><h2>{details.title}</h2><p>{details.description}</p></div>
              </header>
              {activeGroup.id === "appearance" && <div className="settings-panel"><div id="settings-navigation" className="settings-block"><NavigationLayoutSection /></div><div id="settings-player-card" className="settings-block"><PlayerCardSection user={user} onUserUpdate={applyPlayerCardUser} /></div></div>}
              {activeGroup.id === "account" && <div className="settings-panel">
                <div id="settings-account" className="settings-block"><AccountSection user={user} onUserUpdate={loadUser} /></div>
                <div id="settings-name-color" className="settings-block"><NameColorSection user={user} onUserUpdate={loadUser} /></div>
                <div id="settings-rank" className="settings-block"><GameRankSection user={user} onUserUpdate={loadUser} /></div>
                <div className="settings-block"><DeleteOwnAccountSection user={user} /></div>
              </div>}
              {activeGroup.id === "wallet" && <div className="settings-panel">
                <div id="settings-credits" className="settings-block"><CreditsSection user={user} onUserUpdate={loadUser} /></div>
                <div id="settings-payments" className="settings-block"><PaymentPermissionsSection user={user} onUserUpdate={loadUser} /></div>
                <div id="settings-referrals" className="settings-block"><ReferralSection /></div>
              </div>}
              {activeGroup.id === "connections" && <div className="settings-panel">
                <div id="settings-gaming" className="settings-block"><GamingIdsSection user={user} onUserUpdate={loadUser} /></div>
                <div id="settings-streaming" className="settings-block"><StreamConnectionsSection user={user} onUserUpdate={loadUser} /></div>
                <div id="settings-socials" className="settings-block"><SocialsSection user={user} onUserUpdate={loadUser} /></div>
                <div id="settings-overlay" className="settings-block"><StreamOverlaySection user={user} /></div>
                <div id="settings-discord" className="settings-block"><DiscordSection user={user} onUserUpdate={loadUser} /></div>
              </div>}
            </div>
          </div>
          </div>
        )}
      </div>
    </div>
  );
}
