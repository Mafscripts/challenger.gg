import React from "react";
import { Activity, ChevronDown } from "lucide-react";
import { topbarNavGroups } from "./navigationGroups";
import { NavbarDestinations, NavbarMatches } from "./NavbarMenus";
import NavigationHoverFill from "./NavigationHoverFill";

export default function TopbarNavigation({ isActive, openMenu, matchesOpen, onMenuToggle, onMatchesToggle, onClose, activeMatches, userId, historyPath }) {
  return <div className="clean-primary-nav hidden xl:flex" aria-label="Main navigation">
    {topbarNavGroups.map((group) => {
      const open = openMenu === group.label;
      const active = group.items.some((item) => isActive(item.path));
      return <div key={group.label} className="nav-dropdown-anchor clean-nav-anchor">
        <button type="button" className="clean-nav-link navigation-hover" aria-expanded={open} aria-controls={`nav-menu-${group.label.toLowerCase().replaceAll(" ", "-")}`} data-current={active} onClick={() => onMenuToggle(group.label)}>
          <NavigationHoverFill />
          {group.label}<ChevronDown className="clean-nav-chevron" size={12} aria-hidden="true" />
        </button>
        {open && <NavbarDestinations group={group} isActive={isActive} onSelect={onClose} />}
      </div>;
    })}
    <div className="nav-dropdown-anchor clean-nav-anchor clean-matches-anchor">
      <button type="button" className="clean-nav-link clean-matches-link navigation-hover" aria-expanded={matchesOpen} aria-controls="nav-menu-my-matches" data-current={isActive("/my-matches")} onClick={onMatchesToggle}>
        <NavigationHoverFill />
        <Activity size={14} aria-hidden="true" /><span>My Matches</span>{activeMatches.length > 0 && <span className="clean-active-count" aria-label={`${activeMatches.length} active matches`}>{activeMatches.length}</span>}<ChevronDown className="clean-nav-chevron" size={12} aria-hidden="true" />
      </button>
      {matchesOpen && <NavbarMatches matches={activeMatches} userId={userId} historyPath={historyPath} isActive={isActive} onSelect={onClose} />}
    </div>
  </div>;
}
