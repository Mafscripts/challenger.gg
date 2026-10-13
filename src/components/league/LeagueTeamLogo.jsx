import React from "react";
import TopfraggLogo from "@/components/brand/TopfraggLogo";

const accents = {
  topfragg: "#14d8ff", "nova-reign": "#a78bfa", "iron-wolves": "#93c5fd",
  "neon-syndicate": "#f472b6", voltage: "#facc15", "vortex-unit": "#2dd4bf",
  "phantom-crew": "#c4b5fd", "crimson-edge": "#fb7185",
};

function TeamMark({ id }) {
  switch (id) {
    case "nova-reign": return <>
      <circle cx="24" cy="24" r="17" fill="none" stroke="currentColor" strokeWidth="1.5" opacity=".5" />
      <path d="m24 5 5 13 14 6-14 5-5 14-5-14-14-5 14-6Z" fill="currentColor" />
      <path d="m24 15 3 7 7 2-7 3-3 7-2-7-7-3 7-2Z" fill="#f8fafc" />
      <path d="m8 11 3-6 3 6m20 26 3 6 3-6" fill="none" stroke="currentColor" strokeWidth="2" />
    </>;
    case "iron-wolves": return <>
      <path d="m9 6 10 9 5-3 5 3L39 6l-2 18-5 13-8 7-8-7-5-13Z" fill="currentColor" />
      <path d="m14 14 6 7-4 4 8 12 8-12-4-4 6-7-2 16-8 9-8-9Z" fill="#0d1722" />
      <path d="m13 23 8 3-4 4Zm22 0-8 3 4 4Z" fill="#f8fafc" />
      <path d="m20 32 4 3 4-3-4-2Z" fill="currentColor" />
    </>;
    case "neon-syndicate": return <>
      <path d="m24 5 19 33H5Z" fill="none" stroke="currentColor" strokeWidth="2.5" />
      <path d="m24 12 13 23H11Z" fill="currentColor" opacity=".2" />
      <path d="M16 33V20l16 12V19" fill="none" stroke="#f8fafc" strokeWidth="4" strokeLinejoin="miter" />
      <path d="M11 42h26" stroke="currentColor" strokeWidth="2.5" />
    </>;
    case "voltage": return <>
      <path d="M12 10h24l7 14-7 14H12L5 24Z" fill="none" stroke="currentColor" strokeWidth="2" opacity=".6" />
      <path d="M27 4 13 26h10l-2 18 15-24H26Z" fill="currentColor" />
      <path d="m27 13-8 12h8l-3 10 9-13h-8Z" fill="#f8fafc" />
    </>;
    case "vortex-unit": return <>
      {[0, 120, 240].map((angle) => <path key={angle} transform={`rotate(${angle} 24 24)`} d="M25 5c13 1 20 14 13 24l-8 2c7-8 4-17-7-20l-7-3Z" fill="currentColor" />)}
      <path d="m24 18 6 6-6 6-6-6Z" fill="#f8fafc" />
    </>;
    case "phantom-crew": return <>
      <path d="M24 5c-10 3-15 12-15 23l-4 9 10-2 9 8 9-8 10 2-4-9C39 17 34 8 24 5Z" fill="currentColor" />
      <path d="M24 12c-8 4-11 12-9 20l9 5 9-5c2-8-1-16-9-20Z" fill="#0d1722" />
      <path d="m16 23 7 3-2 4-5-3Zm16 0-7 3 2 4 5-3Z" fill="#f8fafc" />
      <path d="m21 33 3-2 3 2" fill="none" stroke="currentColor" strokeWidth="2" />
    </>;
    case "crimson-edge": return <>
      <path d="m24 4 17 10v19L24 44 7 33V14Z" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="m35 8-5 17-13 12-5-5 12-13Z" fill="currentColor" />
      <path d="m31 13-6 9-8 10 3 1 9-10Z" fill="#f8fafc" />
      <path d="m11 28 9 9m-10 1 4-4" stroke="currentColor" strokeWidth="3" />
    </>;
    default: return <path d="m24 6 16 7v12L24 42 8 25V13Z" fill="none" stroke="currentColor" strokeWidth="3" />;
  }
}

export default function LeagueTeamLogo({ team, size = 36, className = "" }) {
  return <span aria-hidden="true" className={`league-team-logo ${team.id === "topfragg" ? "league-team-logo-topfragg" : ""} ${className}`} style={{ "--team-accent": accents[team.id] || "#14d8ff", "--team-logo-size": `${size}px` }}>
    {team.id === "topfragg" ? <TopfraggLogo showWordmark={false} className="league-team-original-logo" markClassName="league-team-original-mark" /> : <svg viewBox="0 0 48 48" fill="none" strokeLinejoin="round" className="league-team-mark" focusable="false"><TeamMark id={team.id} /></svg>}
  </span>;
}
