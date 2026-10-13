import React from "react";
import { Crosshair } from "lucide-react";

export function Mw4SeasonSignal({ className = "" }) {
  return <div className={`mw4-season-signal ${className}`}>
    <Crosshair className="h-4 w-4" aria-hidden="true" />
    <span>Next deployment</span><strong>Modern Warfare <span className="text-yellow-400">4</span></strong>
    <span className="mw4-signal-status">Coming soon</span>
  </div>;
}
