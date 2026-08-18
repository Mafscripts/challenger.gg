import React from "react";

export default function PageHeader({ eyebrow, title, description, action, className = "" }) {
  return (
    <header className={`premium-panel relative mb-8 overflow-hidden rounded-[1.75rem] p-6 sm:p-8 ${className}`}>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_90%_0%,rgba(59,130,246,.14),transparent_30%),radial-gradient(circle_at_10%_100%,rgba(148,163,184,.06),transparent_34%)]" />
      <div className="pointer-events-none absolute -right-24 -top-32 h-72 w-72 rotate-[-18deg] rounded-[4rem] border border-blue-400/10" />
      <div className="relative flex flex-col items-start justify-between gap-5 sm:flex-row sm:items-center">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-blue-400">{eyebrow}</p>
          <h1 className="mt-2 text-3xl font-black tracking-[-0.035em] text-white sm:text-4xl">{title}</h1>
          {description && <p className="mt-2 max-w-2xl text-sm leading-6 text-vapor">{description}</p>}
        </div>
        {action && <div className="relative shrink-0">{action}</div>}
      </div>
    </header>
  );
}
