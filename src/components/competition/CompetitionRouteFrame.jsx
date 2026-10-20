import React, { useCallback, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { CompetitionHeaderView } from "./CompetitionLadder";
import { CompetitionHeaderContext } from "./CompetitionHeaderContext";
import UpcomingTournaments, { useUpcomingTournaments } from "./UpcomingTournaments";
import "@/styles/competition-route.css";

export default function CompetitionRouteFrame({ children }) {
  const { pathname, search, hash } = useLocation();
  const params = new URLSearchParams(search);
  const mode = pathname === "/ranked" ? "ranked" : pathname === "/xp" ? "xp"
    : pathname === "/wagers" ? "wagers" : pathname === "/ranked/8s" ? (params.get("mode") === "money" ? "money8s" : "eights") : "";
  const routeKey = `${pathname}${search}`;
  const upcoming = Boolean(mode) && hash === "#upcoming-tournaments";
  const events = useUpcomingTournaments(upcoming);
  const [registered, setRegistered] = useState(null);
  const registerHeader = useCallback((key, props) => {
    setRegistered(current => current?.key === key && Object.keys(props).every(field => current.props[field] === props[field])
      ? current : { key, props });
  }, []);
  const header = registered?.key === routeKey ? registered.props : { mode, gameId: params.get("game") || "bo7", playerCount: null };
  const shownHeader = upcoming ? {
    ...header, titleOverride: undefined, eyebrowOverride: undefined, descriptionOverride: "Browse upcoming events, compare entry requirements and find your next tournament.",
    playerCount: events.data?.length ?? null,
    action: <div className="competition-actions"><Link to="/tournaments" className="competition-action-pill">Full tournament center<ArrowRight size={14} /></Link></div>,
  } : header;

  return <CompetitionHeaderContext.Provider value={mode ? registerHeader : null}>
    <div className={mode ? "competition-route-frame competition-surface" : undefined} data-competition={mode ? upcoming ? "tournaments" : mode : undefined}>
      {mode && <div className="mx-auto max-w-[1600px] px-4 pt-8 lg:px-6">
        {!upcoming && header.headerIntro}
        <CompetitionHeaderView {...shownHeader} mode={upcoming ? "tournaments" : mode} />
      </div>}
      {upcoming && <div className="mx-auto max-w-[1600px] px-4 py-5 lg:px-6"><UpcomingTournaments query={events} /></div>}
      <div hidden={upcoming}>{children}</div>
    </div>
  </CompetitionHeaderContext.Provider>;
}
