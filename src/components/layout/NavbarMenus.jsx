import React from "react";
import { Link } from "react-router-dom";
import { Activity, ArrowRight, ChevronRight, History, Swords, Trophy } from "lucide-react";
import "@/styles/navbar-menus.css";
import NavbarPlayerSearch from "./NavbarPlayerSearch";
import NavigationHoverFill from "./NavigationHoverFill";
import { xpMatchDestination } from "@/lib/xpMatchAccess";

const menuColors = {
  cyan: "hsl(var(--cyan))", green: "hsl(var(--green))", orange: "hsl(var(--orange))",
  gold: "#facc15", purple: "#c084fc", red: "#f87171",
};

function MenuPanel({ title, eyebrow, icon: Icon, tone, children }) {
  return <div id={`nav-menu-${title.toLowerCase().replaceAll(" ", "-")}`} className="nav-popover nav-popover-enter nav-destination-popover absolute left-0 top-12 z-50 w-[360px] overflow-hidden rounded-2xl" style={{ "--menu-accent": menuColors[tone] || menuColors.cyan }} aria-label={`${title} navigation`}>
    <header className="nav-destination-header"><div><p>{eyebrow}</p><h3>{title}<span aria-hidden="true" /></h3></div><span className="nav-destination-header-icon" aria-hidden="true"><Icon size={21} /></span></header>
    {children}
  </div>;
}

function MenuLink({ path, label, description, icon: Icon, tone, active = false, onSelect, children, isNew = false }) {
  return <Link to={path} onClick={onSelect} className="nav-destination-link navigation-hover" data-active={active} aria-current={active ? "page" : undefined} style={{ "--menu-item-accent": menuColors[tone] || menuColors.cyan }}>
    <NavigationHoverFill />
    <span className="nav-destination-icon" aria-hidden="true"><Icon size={18} /></span>
    <span className="nav-destination-copy"><strong>{label}{isNew && <span className="challenge-new-tag nav-mode-new">New</span>}</strong>{description && <small>{description}</small>}{children}</span>
    {active ? <span className="nav-destination-current">Current</span> : <ChevronRight className="nav-destination-arrow" size={14} aria-hidden="true" />}
  </Link>;
}

export function NavbarDestinations({ group, isActive, onSelect }) {
  return <MenuPanel title={group.label} eyebrow={group.eyebrow} icon={group.icon} tone={group.tone}>
    {group.playerSearch && <NavbarPlayerSearch onSelect={onSelect} />}
    <div className="nav-destination-links">{group.items.map(item => <MenuLink key={item.path} path={item.path} label={item.label} description={item.description} icon={item.icon} tone={item.tone} isNew={item.isNew} active={isActive(item.path)} onSelect={onSelect} />)}</div>
  </MenuPanel>;
}

const matchKinds = {
  challenge: { label: "Challenge a Team", tone: "purple", icon: Swords },
  tournament: { label: "Tournament", tone: "orange", icon: Trophy },
  ranked: { label: "Ranked", tone: "cyan", icon: Swords },
  xp: { label: "XP match", tone: "purple", icon: Swords },
  "8s": { label: "Free 8s", tone: "cyan", icon: Swords },
  money8s: { label: "Money 8s", tone: "green", icon: Swords },
};

export function NavbarMatches({ matches, userId, historyPath, isActive, onSelect }) {
  return <MenuPanel title="My Matches" eyebrow="Your match center" icon={Activity} tone="purple">
    <div className="nav-destination-links nav-match-shortcuts">
      <MenuLink path="/my-matches?view=active" label="Active matches" description="See your current competitions" icon={Activity} tone="purple" active={isActive("/my-matches?view=active")} onSelect={onSelect} />
      <MenuLink path={historyPath} label="Match history" description="Your results and past matches" icon={History} tone="purple" active={isActive(historyPath)} onSelect={onSelect} />
    </div>
    <div className="nav-destination-section-label"><span>Current match rooms</span><span>{matches.length}</span></div>
    <div className="nav-destination-links nav-match-rooms">
      {matches.length === 0 ? <div className="nav-destination-empty"><Swords size={25} /><strong>No active matches</strong><p>Your current match rooms will appear here.</p></div>
        : matches.map(match => {
          const isTournament = match.entity_type === "tournament";
          const isHost = match.entity_type === "challenge" ? match.profile_side === "alpha" : userId === match.host_id;
          const opponent = isTournament
            ? (match.current_user_side === "team_a" ? match.team_b_name : match.team_a_name) || "Opponent pending"
            : isHost ? match.challenger_name || "Opponent pending" : match.host_name || "Host unavailable";
          const path = match.entity_type === "challenge" ? `/challenge-a-team/${match.id}` : isTournament ? `/tournament-match/${match.id}`
            : match.entity_type === "ranked" ? `/ranked-match/${match.id}`
              : match.entity_type === "xp" ? xpMatchDestination(match)
                : (match.match_type === "8s" || match.match_type === "money8s") ? `/8s-match/${match.id}` : `/wagers-match/${match.id}`;
          const type = isTournament ? "tournament" : match.entity_type === "ranked" ? "ranked" : match.entity_type === "xp" ? "xp" : match.match_type;
          const kind = matchKinds[type] || { label: "Cash match", tone: "green", icon: Swords };
          return <MenuLink key={`${match.entity_type}:${match.id}`} path={path} label={match.game_mode_display || match.game_mode || kind.label} description={`vs ${opponent}`} icon={kind.icon} tone={kind.tone} active={isActive(path)} onSelect={onSelect}>
            <span className="nav-match-room-tags"><span>{kind.label}</span>{match.team_size && <span>{match.team_size}</span>}</span>
          </MenuLink>;
        })}
    </div>
    <footer className="nav-destination-footer"><Link to="/my-matches" onClick={onSelect} className="navigation-hover"><NavigationHoverFill /><span>Open match center</span><ArrowRight size={16} /></Link></footer>
  </MenuPanel>;
}
