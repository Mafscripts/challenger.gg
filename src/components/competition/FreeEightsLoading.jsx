import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";

const FreeEightsLoadingContext = createContext(false);
const matchTypeKey = (id) => `topfragg:loader-match-type:${id}`;
const validType = (type) => ["8s", "money8s"].includes(type) ? type : "";

function cachedMatchType(id) {
  if (!id) return "";
  try { return validType(window.sessionStorage.getItem(matchTypeKey(id))); }
  catch { return ""; }
}

export function FreeEightsLoadingProvider({ children }) {
  const location = useLocation();
  const { user, isAuthenticated } = useAuth();
  const matchId = location.pathname.match(/^\/8s-match\/([^/]+)\/?$/)?.[1] || "";
  const cachedType = useMemo(() => cachedMatchType(matchId), [matchId]);
  const [resolved, setResolved] = useState({ id: "", type: "" });
  const matchType = resolved.id === matchId ? resolved.type : cachedType;

  useEffect(() => {
    if (!matchId || !isAuthenticated) return;
    let cancelled = false;
    // Reuse the existing match endpoint and its in-flight request deduplication.
    // The cached type is only a visual hint for refresh, never authorization.
    base44.entities.Wager.getFresh(matchId).then((match) => {
      if (cancelled) return;
      const type = validType(match?.match_type);
      setResolved({ id: matchId, type });
      try {
        if (type) window.sessionStorage.setItem(matchTypeKey(matchId), type);
        else window.sessionStorage.removeItem(matchTypeKey(matchId));
      } catch { /* Loading still works when storage is unavailable. */ }
    }).catch(() => {
      if (!cancelled) setResolved({ id: matchId, type: "" });
    });
    return () => { cancelled = true; };
  }, [matchId, isAuthenticated, user?.id]);

  const freeOverview = location.pathname === "/ranked/8s" && new URLSearchParams(location.search).get("mode") !== "money";
  return <FreeEightsLoadingContext.Provider value={freeOverview || (Boolean(matchId) && matchType === "8s")}>
    {children}
  </FreeEightsLoadingContext.Provider>;
}

export const useFreeEightsLoading = () => useContext(FreeEightsLoadingContext);
