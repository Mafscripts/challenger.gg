import React from "react";

export default function AuthLayout({ icon: Icon, title, subtitle, footer, children, compact = false }) {
  if (compact) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4 py-6 sm:py-8">
        <div className="w-full max-w-[540px]">
          <div className="text-center mb-5">
            <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary shadow-sm">
              <Icon className="h-6 w-6 text-primary-foreground" aria-hidden="true" />
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
