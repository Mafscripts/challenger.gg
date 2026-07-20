import React from "react";

export default function AuthLayout({ icon: Icon, title, subtitle, footer, children, compact = false }) {
  if (compact) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4 py-6 sm:py-8">
        <div className="w-full max-w-[540px]">
          <div className="text-center mb-5">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-cyan to-[#0EA5C7] shadow-[0_0_28px_rgba(20,216,255,0.18)] mb-3">
              <Icon className="w-6 h-6 text-background" aria-hidden="true" />
            </div>
            <h1 className="text-2xl font-black tracking-tight text-foreground">{title}</h1>
            {subtitle && <p className="text-sm text-muted-foreground mt-1.5">{subtitle}</p>}
          </div>
          <div className="premium-panel rounded-3xl p-6">
            {children}
          </div>
          {footer && (
            <p className="text-center text-sm text-muted-foreground mt-4">{footer}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary mb-4">
            <Icon className="w-7 h-7 text-primary-foreground" aria-hidden="true" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">{title}</h1>
          {subtitle && <p className="text-muted-foreground mt-2">{subtitle}</p>}
        </div>
        <div className="bg-card rounded-2xl shadow-sm border border-border p-8">
          {children}
        </div>
        {footer && (
          <p className="text-center text-sm text-muted-foreground mt-6">{footer}</p>
        )}
      </div>
    </div>
  );
}
