import { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { freeEightsVoiceRenderSignature, freeEightsVoiceView, recordFreeEightsVoiceResponse } from "@/lib/freeEightsVoiceStatus";

export function useFreeEightsVoice({ matchId, players, user, rosterVersion = "", enabled = true }) {
  const [voiceResult, setVoiceResult] = useState(null);
  const latestResult = useRef(null);
  const rosterKey = JSON.stringify(players.map((player) => [player.user_id, player.team]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
  useEffect(() => {
    if (!enabled || !matchId || !user?.id) return;
    let cancelled = false;
    let inFlight = false;
    let queued = false;
    let displayedSignature = null;
    if (latestResult.current?.matchId !== matchId || latestResult.current?.userId !== user.id) {
      latestResult.current = recordFreeEightsVoiceResponse(null, { matchId, userId: user.id, data: null });
    }
    const recordResponse = (response) => {
      const next = recordFreeEightsVoiceResponse(latestResult.current, { matchId, userId: user.id, ...response });
      latestResult.current = next;
      const signature = freeEightsVoiceRenderSignature(next, players);
      if (signature !== displayedSignature) {
        displayedSignature = signature;
        setVoiceResult(next);
      }
    };
    const refresh = async (priority = false) => {
      if (cancelled) return;
      if (inFlight) { queued ||= priority; return; }
      inFlight = true;
      try {
        const data = await base44.discord.freeEightsVoice(matchId);
        if (!cancelled) recordResponse({ data });
      } catch {
        if (!cancelled) recordResponse({ failed: true });
      } finally {
        inFlight = false;
        if (queued && !cancelled) { queued = false; void refresh(); }
      }
    };
    refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 1000);
    const onVisible = () => { if (document.visibilityState === "visible") void refresh(true); };
    const onVoiceUpdate = (event) => { if (String(event.detail?.matchId) === String(matchId)) void refresh(true); };
    window.addEventListener("focus", onVisible);
    window.addEventListener("topfragg:free-eights-voice-updated", onVoiceUpdate);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true; window.clearInterval(timer);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("topfragg:free-eights-voice-updated", onVoiceUpdate);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, matchId, user?.id, rosterKey, rosterVersion]);
  const result = latestResult.current || voiceResult;
  const current = enabled && result?.matchId === matchId && result?.userId === user?.id ? result : null;
  return freeEightsVoiceView(current, players);
}
