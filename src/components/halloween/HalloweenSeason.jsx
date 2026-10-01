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

const bats = [
  { left: "5%", top: "13%", size: "24px", delay: "-2s", duration: "18s" },
  { left: "19%", top: "31%", size: "15px", delay: "-11s", duration: "24s" },
  { left: "42%", top: "10%", size: "19px", delay: "-7s", duration: "21s" },
  { left: "61%", top: "26%", size: "13px", delay: "-16s", duration: "26s" },
  { left: "76%", top: "9%", size: "21px", delay: "-4s", duration: "20s" },
  { left: "89%", top: "37%", size: "16px", delay: "-13s", duration: "23s" },
];

export function HalloweenAtmosphere() {
  return (
    <div className="halloween-atmosphere" aria-hidden="true">
      {bats.map((bat, index) => (
        <span
          key={index}
          className="halloween-bat"
          style={{
            left: bat.left,
            top: bat.top,
            width: bat.size,
            height: bat.size,
            "--bat-delay": bat.delay,
            "--bat-duration": bat.duration,
          }}
        />
      ))}
      <span className="halloween-mist halloween-mist-one" />
      <span className="halloween-mist halloween-mist-two" />
    </div>
  );
}
