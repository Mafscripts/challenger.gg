import { useEffect, useState } from "react";
import { resolvedBrowserTimeZone } from "@/lib/tournamentTime";

// Every visitor sees the event in their device's local time, worldwide.
export function useTournamentTimeZone() {
  const [timeZone, setTimeZone] = useState(resolvedBrowserTimeZone);
  useEffect(() => {
    // Retire the previous manual override so it cannot keep showing another city's time.
    try { window.localStorage.removeItem("topfragg:tournament-timezone"); } catch { /* Local time also works without storage. */ }
    const refresh = () => setTimeZone(resolvedBrowserTimeZone());
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, []);
  return { timeZone };
}

export default useTournamentTimeZone;
