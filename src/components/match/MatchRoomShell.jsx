import React from "react";

export default function MatchRoomShell({ header, headerClassName = "", beforeTeams = null, teams, sidebar }) {
  return (
    <section className="relative mb-6 overflow-hidden rounded-2xl border border-white/[0.09] bg-[#11171f] shadow-[0_24px_70px_-48px_rgba(0,0,0,.95)]">
      <header className={`match-room-header relative border-b border-white/[0.07] p-4 sm:p-5 lg:p-6 ${headerClassName}`}>
        {header}
      </header>
      {beforeTeams}
      <div className="grid min-w-0 gap-4 bg-[#11171f] p-3 sm:p-4 xl:grid-cols-[minmax(0,1fr)_410px] xl:gap-4">
        <div className="min-w-0 space-y-4">{teams}</div>
        <aside className="flex min-w-0 flex-col gap-4">{sidebar}</aside>
      </div>
    </section>
  );
}
