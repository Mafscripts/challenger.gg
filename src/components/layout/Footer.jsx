import React from "react";
import { Link } from "react-router-dom";
import { Twitter, Youtube, MessageCircle } from "lucide-react";
import TopfraggLogo from "@/components/brand/TopfraggLogo";

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
    <footer className="mt-16 bg-gradient-to-b from-transparent to-black/15">
      <div className="mx-auto max-w-[1560px] px-4 py-16 sm:px-6 lg:px-10 lg:py-20">
        <div className="grid grid-cols-2 gap-10 md:grid-cols-5 lg:gap-14">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <Link to="/" className="mb-4 inline-flex" aria-label="Topfragg.gg home">
              <TopfraggLogo markClassName="h-8 w-8" wordmarkClassName="text-lg" />
            </Link>
            <p className="mb-7 text-sm leading-6 text-vapor">
              The premier competitive Call of Duty platform. Play. Compete. Win.
            </p>
            <div className="flex items-center gap-3">
              <a href="https://x.com/TopfraggGG" target="_blank" rel="noopener noreferrer" aria-label="Topfragg.gg on X" className="rounded-xl bg-white/[0.035] p-2.5 text-vapor shadow-[inset_0_1px_0_rgba(255,255,255,.03)] transition-all hover:-translate-y-0.5 hover:bg-cyan/10 hover:text-cyan">
                <Twitter className="w-4 h-4" />
              </a>
              <a href="https://www.youtube.com/@TopfraggGG" target="_blank" rel="noopener noreferrer" aria-label="Topfragg.gg on YouTube" className="rounded-xl bg-white/[0.035] p-2.5 text-vapor shadow-[inset_0_1px_0_rgba(255,255,255,.03)] transition-all hover:-translate-y-0.5 hover:bg-cyan/10 hover:text-cyan">
                <Youtube className="w-4 h-4" />
              </a>
              <a href="https://discord.gg/topfragg" target="_blank" rel="noopener noreferrer" aria-label="Topfragg.gg Discord" className="rounded-xl bg-white/[0.035] p-2.5 text-vapor shadow-[inset_0_1px_0_rgba(255,255,255,.03)] transition-all hover:-translate-y-0.5 hover:bg-cyan/10 hover:text-cyan">
                <MessageCircle className="w-4 h-4" />
              </a>
            </div>
          </div>

          {Object.entries(footerLinks).map(([title, links]) => (
            <div key={title}>
              <h4 className="mb-5 text-xs font-black uppercase tracking-[0.14em] text-foreground">{title}</h4>
              <ul className="space-y-3">
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

        <div className="mt-14 flex flex-col items-center justify-between gap-4 border-t border-white/[0.04] pt-8 sm:flex-row">
          <p className="text-xs text-vapor">
            (c) 2026 Topfragg.gg - All rights reserved. Not affiliated with Activision or Call of Duty.
          </p>
          <p className="text-xs text-vapor/50 font-mono">v2.0.0-alpha</p>
        </div>
      </div>
    </footer>
  );
}
