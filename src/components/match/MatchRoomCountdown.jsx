import React, { useEffect, useState } from "react";

const secondsLeft = (deadline) => Math.max(0, Math.ceil((Date.parse(deadline) - Date.now()) / 1000));

// The room only needs to update its controls when the deadline expires.
// Keep the per-second display updates inside the small countdown component.
export function useRoomDeadlineExpired(deadline) {
  const [expiredDeadline, setExpiredDeadline] = useState(null);
  const deadlineMs = Date.parse(deadline);
  useEffect(() => {
    if (!Number.isFinite(deadlineMs)) return;
    const timer = window.setTimeout(() => setExpiredDeadline(deadline), Math.max(0, deadlineMs - Date.now()));
    return () => window.clearTimeout(timer);
  }, [deadline, deadlineMs]);
  return Number.isFinite(deadlineMs) && (expiredDeadline === deadline || deadlineMs <= Date.now());
}

export default React.memo(function MatchRoomCountdown({ deadline }) {
  const [seconds, setSeconds] = useState(() => secondsLeft(deadline));
  useEffect(() => {
    let timer;
    const update = () => {
      window.clearTimeout(timer);
      const remaining = secondsLeft(deadline);
      setSeconds(remaining);
      if (remaining > 0 && document.visibilityState === "visible") {
        timer = window.setTimeout(update, Math.min(1000, Math.max(1, Date.parse(deadline) - Date.now())));
      }
    };
    update();
    document.addEventListener("visibilitychange", update);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", update);
    };
  }, [deadline]);
  return <span className="inline-block min-w-[4ch] tabular-nums">{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}</span>;
});
