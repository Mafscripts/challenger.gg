import React from "react";
import { Navigate } from "react-router-dom";
import { cancelledMatchDestination } from "@/lib/cancelledMatchRoom";

export default function CancelledMatchRedirect({ match, matchType, tournament }) {
  const destination = cancelledMatchDestination(match, matchType, tournament);
  return destination ? <Navigate to={destination} replace /> : null;
}
