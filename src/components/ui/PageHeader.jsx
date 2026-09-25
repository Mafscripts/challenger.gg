import React from "react";

export default function PageHeader({ eyebrow, title, description, action, className = "" }) {
  return (
    <header className={`page-header premium-panel relative mb-6 overflow-hidden rounded-xl px-5 py-5 sm:px-6 sm:py-6 ${className}`}>
      <div className="pointer-events-none absolute inset-y-0 left-0 w-1 bg-accent" />
      <div className="relative flex flex-col items-start justify-between gap-5 sm:flex-row sm:items-center">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-accent">{eyebrow}</p>
          <h1 className="mt-1.5 text-2xl font-black tracking-[-0.035em] text-foreground sm:text-3xl">{title}</h1>
          {description && <p className="mt-2 max-w-2xl text-sm leading-6 text-vapor">{description}</p>}
        </div>
        {action && <div className="relative shrink-0">{action}</div>}
      </div>
    </header>
  );
}
