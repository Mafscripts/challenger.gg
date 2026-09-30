import React from "react";
import TopfraggLogo from "@/components/brand/TopfraggLogo";

export default function PageLoader({ label = "Loading page", fullscreen = false, className = "" }) {
  return (
    <div
      className={`page-logo-loader ${fullscreen ? "fixed inset-0 z-[100] min-h-screen" : "min-h-[calc(100svh-4rem)]"} ${className}`}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <div className="page-logo-loader-stage" aria-hidden="true">
        <span className="page-logo-loader-orbit" />
        <span className="page-logo-loader-glow" />
        <TopfraggLogo showWordmark={false} markClassName="h-[76px] w-[76px]" />
      </div>
    </div>
  );
}
