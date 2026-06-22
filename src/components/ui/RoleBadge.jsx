import React from "react";
import { getRoleConfig } from "@/lib/roles";

export default function RoleBadge({ role = "user", className = "" }) {
  const cfg = getRoleConfig(role);

  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${cfg.bg} ${cfg.border} ${cfg.color} ${className}`}>
      {cfg.label}
    </span>
  );
}
