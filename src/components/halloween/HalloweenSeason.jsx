import React, { useEffect, useMemo, useState } from "react";
import { Ghost } from "lucide-react";

const halloweenWindow = (now) => {
  const year = now.getFullYear();
  const start = new Date(year, 9, 31, 0, 0, 0, 0);
  const end = new Date(year, 10, 1, 0, 0, 0, 0);
  if (now < start) return { start, end, live: false };
  if (now < end) return { start, end, live: true };
  return {
    start: new Date(year + 1, 9, 31, 0, 0, 0, 0),
    end: new Date(year + 1, 10, 1, 0, 0, 0, 0),
    live: false,
  };
};

export function HalloweenCountdown({ className = "" }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  const countdown = useMemo(() => {
    const window = halloweenWindow(now);
    if (window.live) return { live: true, units: [] };
    const totalMinutes = Math.max(0, Math.floor((window.start.getTime() - now.getTime()) / 60000));
    return {
      live: false,
      units: [
        { label: "Days", value: Math.floor(totalMinutes / 1440) },
        { label: "Hours", value: Math.floor((totalMinutes % 1440) / 60) },
        { label: "Min", value: totalMinutes % 60 },
      ],
    };
  }, [now]);

  return (
    <div className={`halloween-countdown ${className}`} aria-label={countdown.live ? "Halloween is live" : "Countdown to Halloween"}>
      <Ghost className="halloween-countdown-icon" aria-hidden="true" />
      <span className="halloween-countdown-label">{countdown.live ? "Halloween is live" : "Halloween begins in"}</span>
      {!countdown.live && countdown.units.map((unit) => (
        <span key={unit.label} className="halloween-countdown-unit">
          <strong>{String(unit.value).padStart(2, "0")}</strong>
          <small>{unit.label}</small>
        </span>
      ))}
    </div>
  );
}

export function HalloweenEventBadge({ className = "" }) {
  return (
    <span className={`halloween-event-badge inline-flex ${className}`}>
      <Ghost aria-hidden="true" /> Halloween event
    </span>
  );
}
