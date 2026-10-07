import React, { useLayoutEffect, useRef } from "react";
import TopfraggLogo from "@/components/brand/TopfraggLogo";
import { useFreeEightsLoading } from "@/components/competition/FreeEightsLoading";

export default function PageLoader({ label = "Loading page", fullscreen = false, className = "", continuous }) {
  const freeEights = useFreeEightsLoading();
  const steady = continuous ?? freeEights;
  const orbit = useRef(null);
  useLayoutEffect(() => {
    if (!steady || !orbit.current) return;
    // Route code, account checks and match data can mount separate loaders.
    // Keep their rings on the same clock instead of restarting at the top.
    orbit.current.style.setProperty("--page-loader-orbit-delay", `${-(performance.now() % 1450)}ms`);
  }, [steady]);
  return (
    <div
      className={`page-logo-loader ${steady ? "page-logo-loader--continuous" : ""} ${fullscreen ? "fixed inset-0 z-[100] min-h-screen" : "min-h-[calc(100svh-4rem)]"} ${className}`}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <div className="page-logo-loader-stage" aria-hidden="true">
        <span ref={orbit} className="page-logo-loader-orbit" />
        <span className="page-logo-loader-glow" />
        <TopfraggLogo showWordmark={false} markClassName="h-[76px] w-[76px]" />
      </div>
    </div>
  );
}
