import React, { useEffect } from "react";
import { Navigate } from "react-router-dom";
import { cancelledMatchDestination, notifyCancelledMatch } from "@/lib/cancelledMatchRoom";

export default function CancelledMatchRedirect({ match, matchType, tournament }) {
  const destination = cancelledMatchDestination(match, matchType, tournament);
  useEffect(() => {
    const entity = matchType === "tournament" ? "TournamentMatch"
      : matchType === "ranked" ? "RankedMatch" : matchType === "xp" ? "XPMatch" : "Wager";
    notifyCancelledMatch(match, entity);
    notifyCancelledMatch(tournament, "Tournament");
  }, [match?.id, match?.status, matchType, tournament?.id, tournament?.status]);
  return destination ? <Navigate to={destination} replace /> : null;
}
