import React from "react";
import { Link, useLocation } from "react-router-dom";
import { Swords, Users } from "lucide-react";

const tabs = [
  { to: "/ranked", label: "Ranked ladder", icon: Swords, exact: true },
  { to: "/ranked/8s", label: "8s", icon: Users },
];

export default function RankedModeTabs() {
  const location = useLocation();

  return (
    <nav aria-label="Ranked modes" className="mb-6 flex w-full gap-1 rounded-xl border border-white/[0.07] bg-black/20 p-1.5 sm:w-fit">
      {tabs.map(({ to, label, icon: Icon, exact }) => {
        const active = exact ? location.pathname === to : location.pathname.startsWith(to);
        return (
          <Link
            key={to}
            to={to}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-xs font-black uppercase tracking-wider transition-colors sm:flex-none ${active ? "bg-cyan text-background shadow-[0_0_24px_rgba(20,216,255,.18)]" : "text-vapor hover:bg-white/[0.05] hover:text-white"}`}
          >
            <Icon className="h-4 w-4" /> {label}
          </Link>
        );
      })}
    </nav>
  );
}
