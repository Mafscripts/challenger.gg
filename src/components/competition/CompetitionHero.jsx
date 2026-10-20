import React from "react";
import { CalendarDays, Crosshair, DollarSign, Gamepad2, Medal, Radio, Search, ShieldCheck, Shuffle, Sparkles, Swords, Trophy, Users, Zap } from "lucide-react";
import TopfraggLogo from "@/components/brand/TopfraggLogo";
import { competitionTheme } from "@/lib/competitionPresentation";
import "@/styles/competition-presentation.css";

const icons = { Crosshair, DollarSign, Gamepad2, Medal, Radio, Search, ShieldCheck, Shuffle, Sparkles, Swords, Trophy, Users, Zap };

export default function CompetitionHero({ mode = "ranked", title, eyebrow, description, action, count, countLabel = "players", artwork, gameId, className = "" }) {
  const theme = competitionTheme(mode), Icon = icons[theme.icon];
  const CountIcon = countLabel.includes("event") ? Trophy : countLabel.includes("match") ? Swords : Users;
  return <header className={`competition-hero ${className}`} data-competition={mode} data-game={gameId}>
    {artwork && <img src={artwork} alt="" className="competition-hero-artwork" decoding="async" />}
    <div className="competition-hero-main">
      <div className="competition-hero-copy">
        <p className="competition-hero-eyebrow"><TopfraggLogo showWordmark={false} markClassName="!h-7 !w-7" />{eyebrow || theme.eyebrow}</p>
        <h1>{title || theme.title}<span className="competition-title-dot">.</span></h1>
        {description && <p className="competition-hero-description">{description}</p>}
        <div className="competition-hero-facts">{theme.facts.map(([icon, label]) => { const FactIcon = icons[icon]; return <span key={label}><FactIcon size={14} aria-hidden="true" />{label}</span>; })}</div>
        {count !== undefined && <p className="competition-hero-count"><CountIcon size={13} aria-hidden="true" /><strong>{count ?? "—"}</strong>{countLabel}<span aria-hidden="true">/</span><CalendarDays size={13} aria-hidden="true" />{new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(new Date())}</p>}
      </div>
      <div className="competition-hero-emblem" aria-hidden="true"><span className="competition-orbit competition-orbit-outer" /><span className="competition-orbit competition-orbit-inner" /><span className="competition-mode-emblem"><Icon size={76} strokeWidth={1.35} /></span><span className="competition-emblem-spark"><Sparkles size={21} /></span><span className="competition-emblem-medal"><ShieldCheck size={22} /></span><p>{theme.motto}</p></div>
    </div>
    {action && <div className="competition-hero-actions">{action}</div>}
  </header>;
}
