import { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { freeEightsVoiceDisplaySignature, freeEightsVoiceView, recordFreeEightsVoiceResponse } from "@/lib/freeEightsVoiceStatus";

export function useFreeEightsVoice({ matchId, players, user, rosterVersion = "", enabled = true }) {
  const [voiceResult, setVoiceResult] = useState(null);
  const latestResult = useRef(null);
  const rosterKey = JSON.stringify(players.map((player) => [player.user_id, player.team]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
  useEffect(() => {
    if (!enabled || !matchId || !user?.id) return;
    let cancelled = false;
    let inFlight = false;
    if (latestResult.current?.matchId !== matchId || latestResult.current?.userId !== user.id) {
      latestResult.current = recordFreeEightsVoiceResponse(null, { matchId, userId: user.id, data: null });
    }
    const recordResponse = (response) => {
      const next = recordFreeEightsVoiceResponse(latestResult.current, { matchId, userId: user.id, ...response });
      latestResult.current = next;
      // Poll timestamps, stale snapshots and retries stay in the background.
      // Publish only a changed room link or a changed observed player status.
      setVoiceResult((previous) => freeEightsVoiceDisplaySignature(previous, players) === freeEightsVoiceDisplaySignature(next, players) ? previous : next);
    };
    const refresh = async () => {
      if (cancelled || inFlight) return;
      inFlight = true;
      try {
        const data = await base44.discord.freeEightsVoice(matchId);
        if (!cancelled) recordResponse({ data });
      } catch {
        if (!cancelled) recordResponse({ failed: true });
      } finally { inFlight = false; }
    };
    refresh();
    const timer = window.setInterval(refresh, 2000);
    const onVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true; window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, matchId, user?.id, rosterKey, rosterVersion]);
  const result = latestResult.current || voiceResult;
  const current = enabled && result?.matchId === matchId && result?.userId === user?.id ? result : null;
  return freeEightsVoiceView(current, players);
}
