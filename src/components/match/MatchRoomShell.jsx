import React from "react";
import "@/styles/matchrooms.css";

export default function MatchRoomShell({ header, headerClassName = "", className = "", beforeTeams = null, summary = null, teams, sidebar }) {
  return (
    <section className={`match-room-shell relative mb-6 overflow-hidden rounded-2xl border border-white/[0.09] bg-card shadow-[0_24px_70px_-48px_rgba(0,0,0,.95)] ${className}`}>
      <header className={`match-room-header relative border-b border-white/[0.07] p-4 sm:p-5 lg:p-6 ${headerClassName}`}>
        {header}
      </header>
      {summary}
      {beforeTeams}
      <div className={`match-room-body grid min-w-0 gap-4 bg-[var(--arena-pill)] p-3 sm:p-4 ${sidebar ? "match-room-has-sidebar xl:grid-cols-[minmax(0,1fr)_410px]" : ""}`}>
        <div className="match-room-teams min-w-0 space-y-4">{teams}</div>
        {sidebar && <aside className="match-room-sidebar flex min-w-0 flex-col gap-4">{sidebar}</aside>}
      </div>
    </section>
  );
}
