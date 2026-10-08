import React from "react";

export default function BadgeTooltip({ id, label, description, icon: Icon, toneClass = "text-white", placement = "top" }) {
  const positionClass = placement === "bottom"
    ? "left-1/2 top-full mt-2 -translate-x-1/2"
    : "bottom-full left-1/2 mb-2 -translate-x-1/2";

  return (
    <span id={id} role="tooltip" className={`pointer-events-none invisible absolute z-[70] w-40 translate-y-1 rounded-lg border border-white/[0.12] bg-[#111821] px-3 py-2.5 text-left opacity-0 shadow-[0_14px_36px_rgba(0,0,0,.65)] transition-all duration-150 group-hover/badge:visible group-hover/badge:translate-y-0 group-hover/badge:opacity-100 group-focus-visible/badge:visible group-focus-visible/badge:translate-y-0 group-focus-visible/badge:opacity-100 ${positionClass}`}>
      <span className={`mb-1 flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider ${toneClass}`}>
        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {label}
      </span>
      <span className="block text-[11px] font-medium normal-case leading-snug tracking-normal text-vapor">{description}</span>
    </span>
  );
}
