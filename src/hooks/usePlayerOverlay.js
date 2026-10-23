import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";

const REFRESH_MS = 15000;

export function usePlayerOverlay(identifier) {
  const [state, setState] = useState({ data: null, error: "", loading: true, stale: false });
  useEffect(() => {
    let disposed = false;
    let timer;
    let failedAttempts = 0;
    setState({ data: null, error: "", loading: true, stale: false });
    const refresh = async () => {
      try {
        const data = await base44.public.playerOverlay(identifier);
        if (disposed) return;
        failedAttempts = 0;
        setState({ data, error: "", loading: false, stale: false });
      } catch (error) {
        if (disposed) return;
        failedAttempts += 1;
        const missing = [400, 404].includes(error.status);
        setState(previous => ({
          data: missing ? null : previous.data,
          error: missing ? "Player not found. Check the player URL." : "Player stats are temporarily unavailable. Reconnecting…",
          loading: false,
          stale: true,
        }));
      }
      if (!disposed) timer = window.setTimeout(refresh, Math.min(REFRESH_MS * Math.max(1, failedAttempts), 60000));
    };
    refresh();
    return () => { disposed = true; window.clearTimeout(timer); };
  }, [identifier]);
  return state;
}
