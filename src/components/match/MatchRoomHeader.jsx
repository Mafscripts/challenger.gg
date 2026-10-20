import React from "react";
import { Swords } from "lucide-react";

// XP rooms can contain several complete teams on either side.
export function matchRoomTeamName(match, side) {
  const alpha = side === "alpha";
  const parties = match?.[alpha ? "team_alpha_party_teams" : "team_bravo_party_teams"];
  const names = [...new Set((Array.isArray(parties) ? parties : []).map((team) => team?.name).filter(Boolean))];
  return names.join(" + ") || match?.[alpha ? "host_team_name" : "challenger_team_name"]
    || match?.[alpha ? "host_name" : "challenger_name"] || (alpha ? "Team Alpha" : "Opponent pending");
}

export function MatchRoomTitle({ alpha, bravo }) {
  return <><span>{alpha}</span><span className="room-title-versus">vs</span><span>{bravo}</span></>;
}

export default function MatchRoomHeader({ label, title, subtitle, status, complete = false, icon: Icon = Swords, metadata = [], actions, extra, children }) {
  return (
    <div className="room-hero">
      <div className="room-hero-main">
        <div className="room-hero-copy">
          <div className="room-hero-eyebrow"><Icon aria-hidden="true" /><span>{label}</span>{status && <span className={`room-status ${complete ? "room-status-complete" : ""}`}>{status}</span>}</div>
          <h1 className="room-hero-title">{title}</h1>
          {subtitle && <p className="room-hero-subtitle">{subtitle}</p>}
        </div>
        <div className="room-hero-controls">
          {actions && <div className="room-hero-actions" aria-label="Match actions">{actions}</div>}
          {extra}
        </div>
      </div>
      {metadata.length > 0 && <dl className="room-hero-facts">{metadata.map(({ label: fact, value }) => <div key={fact}><dt>{fact}</dt><dd>{value || "Pending"}</dd></div>)}</dl>}
      {children && <div className="room-hero-detail">{children}</div>}
    </div>
  );
}
