import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Gamepad2, TrendingUp, Trophy, Users } from "lucide-react";

const destinations = [
  { title: "Matchfinder", detail: "Find your next match", href: "/matchfinder", icon: Gamepad2 },
  { title: "Modern Warfare 4 Free 8s", detail: "Play 2v2, 3v3 or 4v4", href: "/ranked/8s?game=mw4", icon: Users },
  { title: "Tournaments", detail: "Compete with your team", href: "/tournaments", icon: Trophy },
  { title: "Leaderboards", detail: "See where you stand", href: "/leaderboards", icon: TrendingUp },
];
const directHref = (path) => path;

export default function HomeModeNavigation({ resolveHref = directHref }) {
  return (
    <nav className="home-mode-nav" aria-label="Explore TopFragg">
      {destinations.map(({ title, detail, href, icon: Icon }) => (
        <Link key={href} to={resolveHref(href)} className="home-mode-link">
          <Icon size={19} strokeWidth={1.7} aria-hidden="true" />
          <span className="min-w-0"><strong>{title}</strong><small>{detail}</small></span>
          <ArrowRight size={14} aria-hidden="true" />
        </Link>
      ))}
    </nav>
  );
}
