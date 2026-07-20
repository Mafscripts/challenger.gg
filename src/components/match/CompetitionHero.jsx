import React from "react";

export default function CompetitionHero({
  eyebrow = "Competitive Arena",
  title,
  description,
  action,
  stats = [],
}) {
  return (
    <section className="premium-panel relative mb-10 overflow-hidden rounded-[1.75rem] p-6 md:p-9">
      <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-cyan/10 blur-3xl" />
      <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
        <div className="max-w-2xl">
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan">{eyebrow}</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight md:text-4xl">{title}</h1>
          <p className="mt-2 text-sm text-vapor">{description}</p>
        </div>
        {action}
      </div>

      {stats.length > 0 && (
        <div className="relative mt-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {stats.map(({ label, value, icon: Icon, color = "text-cyan" }) => (
            <div key={label} className="premium-card rounded-2xl px-4 py-4">
              <div className="flex items-center gap-2">
                {Icon && <Icon className={`h-4 w-4 ${color}`} />}
                <span className="text-[10px] font-black uppercase tracking-wider text-vapor">{label}</span>
              </div>
              <p className={`mt-2 font-mono text-xl font-black ${color}`}>{value}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
