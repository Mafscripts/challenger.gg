import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { freeEightsVoiceView, recordFreeEightsVoiceResponse } from "@/lib/freeEightsVoiceStatus";

export function useFreeEightsVoice({ matchId, players, user, rosterVersion = "", enabled = true }) {
  const [voiceResult, setVoiceResult] = useState(null);
  const rosterKey = JSON.stringify(players.map((player) => [player.user_id, player.team]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
  useEffect(() => {
    if (!enabled || !matchId || !user?.id) return;
    let cancelled = false;
    let inFlight = false;
    setVoiceResult(recordFreeEightsVoiceResponse(null, { matchId, userId: user.id, data: null }));
    const refresh = async () => {
      if (cancelled || inFlight) return;
      inFlight = true;
      try {
        const data = await base44.discord.freeEightsVoice(matchId);
        if (!cancelled) setVoiceResult((previous) => recordFreeEightsVoiceResponse(previous, { matchId, userId: user.id, data }));
      } catch {
        if (!cancelled) setVoiceResult((previous) => recordFreeEightsVoiceResponse(previous, { matchId, userId: user.id, failed: true }));
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
  const current = enabled && voiceResult?.matchId === matchId && voiceResult?.userId === user?.id ? voiceResult : null;
  return freeEightsVoiceView(current, players);
}
