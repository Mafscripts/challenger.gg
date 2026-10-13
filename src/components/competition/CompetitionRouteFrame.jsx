import React, { useCallback, useState } from "react";
import { useLocation } from "react-router-dom";
import { CompetitionHeaderView } from "./CompetitionLadder";
import { CompetitionHeaderContext } from "./CompetitionHeaderContext";
import "@/styles/competition-route.css";

export default function CompetitionRouteFrame({ children }) {
  const { pathname, search } = useLocation();
  const params = new URLSearchParams(search);
  const mode = pathname === "/ranked" ? "ranked" : pathname === "/xp" ? "xp"
    : pathname === "/wagers" ? "wagers" : pathname === "/ranked/8s" ? (params.get("mode") === "money" ? "money8s" : "eights") : "";
  const routeKey = `${pathname}${search}`;
  const [registered, setRegistered] = useState(null);
  const registerHeader = useCallback((key, props) => {
    setRegistered(current => current?.key === key && Object.keys(props).every(field => current.props[field] === props[field])
      ? current : { key, props });
  }, []);
  const header = registered?.key === routeKey ? registered.props : { mode, gameId: params.get("game") || "bo7", playerCount: null };

  return <CompetitionHeaderContext.Provider value={mode ? registerHeader : null}>
    <div className={mode ? "competition-route-frame" : undefined}>
      {mode && <div className="mx-auto max-w-[1600px] px-4 pt-8 lg:px-6">
        {header.headerIntro}
        <CompetitionHeaderView {...header} mode={mode} />
      </div>}
      {children}
    </div>
  </CompetitionHeaderContext.Provider>;
}
