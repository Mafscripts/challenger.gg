import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Trophy } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { leaderboardQueryOptions } from "@/hooks/useCompetitionLeaderboard";
import { useLeaderboardPagination } from "@/hooks/useLeaderboardPagination";
import LeaderboardPagination from "@/components/ui/LeaderboardPagination";
import XPFormatSelect from "./XPFormatSelect";
import useRouteSection from "@/hooks/useRouteSection";
const labels = { xp: "XP Matches", "xp:solo": "XP Solo", "xp:duos": "XP Duos", "xp:teams": "XP Teams", ranked: "Ranked", money8s: "Money 8s", wagers: "Cash Matches", challenge: "Challenge a Team" };
export default function RewardSeasonBoard({ mode, gameId = "bo7", region = "Global", category = "global" }) {
  const { user } = useAuth();
  const [xpFormat, setXPFormat] = useRouteSection("season_format", category, ["global", "solo", "duos", "teams"]);
  const ladder = mode === "eights" ? `free8s:${gameId}` : mode === "xp" && xpFormat !== "global" ? `xp:${xpFormat}` : mode;
  const query = useQuery({ ...leaderboardQueryOptions, queryKey: ["competition-standings", user?.id, "reward-season"], queryFn: async () => {
    const { data } = await base44.functions.invoke("getRewardSeasonStandings", {}); if (!data?.success) throw new Error(data?.error || "Could not load this season"); return data;
  }, enabled: Boolean(user?.id), retry: false });
  const rows = useMemo(() => (query.data?.standings?.[ladder] || []).filter((row) => region === "Global" || String(row.region || "").toLowerCase() === region.toLowerCase()), [query.data, ladder, region]);
  const pagination = useLeaderboardPagination(rows, `${ladder}:${region}`);
  const cash = ["money8s", "wagers"].includes(ladder), start = query.data?.season.start, end = query.data?.season.end;
  if (mode === "tournaments") return <div className="xp-format-empty"><Trophy size={22} className="mx-auto mb-3" />Tournaments award random items through match drops. There is no tournament season prize ladder.</div>;
  return <section className="xp-format-standings"><header><div><h3><CalendarDays size={16} className="mr-2 inline" />{labels[ladder] || "Free 8s"} · {query.data?.season.id || "Current season"}</h3><p>{start && end ? `${new Date(start).toLocaleDateString()} – ${new Date(end).toLocaleDateString()} · UTC` : "Six two-month seasons per year"}. Global rank and career progress are kept.</p></div>{mode === "xp" && <XPFormatSelect allowGlobal value={xpFormat} onChange={setXPFormat} />}</header>
    <p className="px-5 pb-5 text-xs leading-6 text-vapor">{mode === "challenge" ? "The #1 team earns two months of Premium for its participating roster." : "The #1 eligible player wins a randomly selected item from this ladder’s active reward pool."} Season points track confirmed results within this period.</p>
    {!user ? <p className="xp-format-empty">Sign in to view this season.</p> : query.isPending ? <p className="xp-format-empty" role="status">Loading this season…</p> : query.error ? <div className="xp-format-empty" role="alert">{query.error.message}<button onClick={() => query.refetch()}>Try again</button></div> : !rows.length ? <p className="xp-format-empty">No confirmed results in this season yet.</p> : <><div className="xp-format-table"><table><thead><tr><th>Place</th><th>{mode === "challenge" ? "Team" : "Player"}</th><th>W</th><th>L</th><th>{cash ? "Season winnings" : "Season points"}</th></tr></thead><tbody>{pagination.visibleRows.map((row, index) => <tr key={row.id} data-own={row.id === user.id || undefined}><td>#{(pagination.page - 1) * 50 + index + 1}</td><td><Link to={row.kind === "team" ? `/teams?team=${encodeURIComponent(row.id)}` : `/profile/${encodeURIComponent(row.username || row.id)}`}>{row.name}</Link></td><td className="text-green">{row.wins}</td><td className="text-red-300">{row.losses}</td><td>{cash ? `$${(row.score / 100).toFixed(2)}` : row.score.toLocaleString()}</td></tr>)}</tbody></table></div><LeaderboardPagination page={pagination.page} pageCount={pagination.pageCount} total={pagination.total} itemLabel={mode === "challenge" ? "teams" : "players"} onPageChange={pagination.setPage} /></>}
  </section>;
}
