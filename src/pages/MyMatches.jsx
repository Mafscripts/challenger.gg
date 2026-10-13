import React from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Activity, ArrowRight, History, RefreshCw, Swords } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { loadPlayerMatchActivity } from "@/lib/playerMatchActivity";
import PageHeader from "@/components/ui/PageHeader";
import RecentMatchesPanel from "@/components/match/RecentMatchesPanel";

export default function MyMatches() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const view = searchParams.get("view") === "history" ? "history" : "active";
  const activity = useQuery({
    queryKey: ["my-match-activity", user?.id],
    queryFn: () => loadPlayerMatchActivity(base44, user.id),
    enabled: Boolean(user?.id),
    staleTime: 15000,
    refetchInterval: view === "active" ? 60000 : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
  });
  const matches = activity.data?.matches || [];
  const active = matches.filter((match) => String(match.status || "").toLowerCase() !== "completed");
  const history = matches.filter((match) => String(match.status || "").toLowerCase() === "completed");
  const incomplete = activity.data?.incompleteSources || [];
  const selected = view === "active" ? active : history;
  const changeView = (value) => { const params = new URLSearchParams(searchParams); params.set("view", value); setSearchParams(params); };

  return (
    <div className="min-h-screen py-6 sm:py-8">
      <div className="mx-auto max-w-[1600px] px-4 lg:px-6">
        <PageHeader eyebrow="Your match center" title="My Matches" description="Return to your open matches or review your recent results across competitions." action={
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={activity.isFetching} onClick={() => activity.refetch()} className="team-summary-action"><RefreshCw className={`h-4 w-4 ${activity.isFetching ? "animate-spin" : ""}`} />{activity.isFetching ? "Refreshing..." : "Refresh"}</button>
            <Link to="/matchfinder" className="team-summary-action team-summary-primary"><Swords className="h-4 w-4" />Find a match<ArrowRight className="h-3.5 w-3.5" /></Link>
          </div>
        } />
        <nav className="arena-tabs mb-6 grid grid-cols-2" aria-label="My Matches sections">
          <button type="button" aria-pressed={view === "active"} onClick={() => changeView("active")} className="arena-tab flex items-center justify-center gap-2 px-4 py-3"><Activity className="h-4 w-4" />Active matches{!activity.isPending && <span className="profile-mode-count">{active.length}</span>}</button>
          <button type="button" aria-pressed={view === "history"} onClick={() => changeView("history")} className="arena-tab flex items-center justify-center gap-2 px-4 py-3"><History className="h-4 w-4" />Match history{!activity.isPending && <span className="profile-mode-count">{history.length}</span>}</button>
        </nav>
        {(activity.error || incomplete.length > 0) && <div role="status" className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-cyan/20 bg-cyan/5 p-4 text-sm text-vapor"><p>{activity.error ? activity.data ? "Live updates are unavailable. Showing your last loaded matches." : "Your matches could not be loaded. Please try again shortly." : `Some ${incomplete.join(", ")} matches could not be loaded.`}</p><button type="button" disabled={activity.isFetching} onClick={() => activity.refetch()} className="font-bold text-cyan hover:underline disabled:opacity-50">{activity.isFetching ? "Retrying..." : "Retry"}</button></div>}
        {!activity.error || activity.data ? <>
          <p className="mb-4 text-sm text-vapor">{view === "active" ? "Open lobbies, scheduled matches and matches awaiting a result appear here." : "Completed matches appear here. Use the pills to filter by competition."}</p>
          <RecentMatchesPanel key={`${user?.id}:${view}`} matches={selected} userId={user?.id} expanded loading={activity.isPending} title={view === "active" ? "Active matches" : "Match history"} />
        </> : null}
      </div>
    </div>
  );
}
