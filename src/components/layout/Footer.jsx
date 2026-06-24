import React from "react";
import { Link } from "react-router-dom";
import { Twitter, Youtube, MessageCircle } from "lucide-react";

const footerLinks = {
  Platform: [
    { label: "Dashboard", path: "/dashboard" },
    { label: "8s", path: "/8s" },
    { label: "Ranked", path: "/ranked" },
    { label: "Wagers", path: "/wagers" },
    { label: "Tournaments", path: "/tournaments" },
  ],
  Community: [
    { label: "Leaderboards", path: "/leaderboards" },
    { label: "Teams", path: "/teams" },
    { label: "News", path: "/news" },
    { label: "CDL Live", path: "/cdl" },
    { label: "Premium", path: "/premium" },
  ],
  Marketplace: [
    { label: "Browse Items", path: "/marketplace" },
    { label: "Trading", path: "/trading" },
    { label: "Inventory", path: "/inventory" },
  ],
  Support: [
    { label: "Rules", path: "/rules" },
    { label: "FAQ", path: "/#faq" },
    { label: "Contact", path: "/support" },
    { label: "Privacy Policy", path: "/terms#privacy" },
    { label: "Terms of Service", path: "/terms" },
  ],
};

export default function Footer() {
  return (
    <footer className="border-t border-white/5 bg-background">
      <div className="max-w-[1600px] mx-auto px-4 lg:px-6 py-16">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <Link to="/" className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded bg-gradient-to-br from-cyan to-cyan/60 flex items-center justify-center">
                <span className="text-background font-bold text-sm font-mono">C</span>
              </div>
              <span className="font-bold text-lg tracking-tight">
                Challenger<span className="text-cyan">.gg</span>
              </span>
            </Link>
            <p className="text-vapor text-sm leading-relaxed mb-6">
              The premier competitive Call of Duty platform. Play. Compete. Win.
            </p>
            <div className="flex items-center gap-3">
              <a href="https://x.com/ChallengerGG" target="_blank" rel="noopener noreferrer" aria-label="Challenger.gg on X" className="p-2 rounded-lg bg-secondary hover:bg-cyan/10 hover:text-cyan text-vapor transition-all">
                <Twitter className="w-4 h-4" />
              </a>
              <a href="https://www.youtube.com/@ChallengerGG" target="_blank" rel="noopener noreferrer" aria-label="Challenger.gg on YouTube" className="p-2 rounded-lg bg-secondary hover:bg-cyan/10 hover:text-cyan text-vapor transition-all">
                <Youtube className="w-4 h-4" />
              </a>
              <a href="https://discord.gg/challengergg" target="_blank" rel="noopener noreferrer" aria-label="Challenger.gg Discord" className="p-2 rounded-lg bg-secondary hover:bg-cyan/10 hover:text-cyan text-vapor transition-all">
                <MessageCircle className="w-4 h-4" />
              </a>
            </div>
          </div>

          {Object.entries(footerLinks).map(([title, links]) => (
            <div key={title}>
              <h4 className="font-semibold text-sm mb-4 text-foreground">{title}</h4>
              <ul className="space-y-2.5">
                {links.map((link) => (
                  <li key={link.label}>
                    <Link to={link.path} className="text-sm text-vapor hover:text-cyan transition-colors">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="border-t border-white/5 mt-12 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-vapor">
            © 2026 Challenger.gg — All rights reserved. Not affiliated with Activision or Call of Duty.
          </p>
          <p className="text-xs text-vapor/50 font-mono">v2.0.0-alpha</p>
        </div>
      </div>
    </footer>
  );
}
