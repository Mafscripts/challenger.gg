import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Search, Users, UserRound, RefreshCw } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import useRouteSection from "@/hooks/useRouteSection";
import { xpCategory } from "@/lib/xpCategories";
import { leaderboardQueryOptions, loadLeaderboardPlayers, useLeaderboardAvatars } from "@/hooks/useCompetitionLeaderboard";
import { useLeaderboardPagination } from "@/hooks/useLeaderboardPagination";
import LeaderboardPagination from "@/components/ui/LeaderboardPagination";
import PlayerAvatarImage from "@/components/ui/PlayerAvatarImage";
import UserBadges from "@/components/ui/UserBadges";
import TPRankBadge, { TPRankGuide } from "./TPRankBadge";
import "@/styles/xp-formats.css";

export default function XPFormatStandings({ category, region = "Global", gameId = "mw4" }) {
  const { user } = useAuth();
  const [kind, setKind] = useRouteSection("ranking", "teams", ["teams", "players"]);
  const [search, setSearch] = useState("");
  const query = useQuery({ ...leaderboardQueryOptions, queryKey: ["competition-standings", user?.id, "xp-formats", category, gameId], queryFn: async () => {
    const { data } = await base44.functions.invoke("getXPFormatStandings", { category, game_id: gameId });
    if (!data?.success) throw new Error(data?.error || "XP standings could not be loaded");
    return data;
  }, enabled: Boolean(user?.id), retry: false });
  const players = useQuery({ ...leaderboardQueryOptions, queryKey: ["leaderboard-users", user?.id, "-created_date"], queryFn: () => loadLeaderboardPlayers("-created_date"), enabled: Boolean(user?.id) && kind === "players" });
  const rows = useMemo(() => {
    const users = new Map((players.data || []).map((row) => [row.id, row]));
    return (query.data?.[kind] || []).map((row, index) => ({ ...row, place: index + 1, user: users.get(row.user_id) }))
      .filter((row) => region === "Global" || String(row.region || row.user?.region || "").toLowerCase() === region.toLowerCase())
      .map((row, index) => ({ ...row, place: index + 1 }))
      .filter((row) => `${row.name || row.user?.display_name || row.user?.username || row.username} ${row.tag || ""}`.toLowerCase().includes(search.trim().toLowerCase()));
  }, [query.data, players.data, kind, region, search]);
  const pagination = useLeaderboardPagination(rows, `${category}:${kind}:${region}:${search}`);
  const avatars = useLeaderboardAvatars(pagination.visibleRows.map((row) => row.user_id).filter(Boolean), kind === "players");
  const loading = query.isPending || (kind === "players" && players.isPending);
  const error = query.error || (kind === "players" && players.error);
  return <section className="xp-format-standings"><header><div><h3>{xpCategory(category).label} {kind === "teams" ? "team" : "player"} leaderboard</h3><p>{kind === "teams" ? (category === "teams" ? "Each team earns its own XP, once per result. Three-, four- and five-player teams share this ladder." : "Each team earns its own XP, once per result. Personal XP progresses across every format.") : "Only this format counts here. Your TP rank and personal XP remain shared across formats within this game."}</p></div><div className="xp-ranking-switch" role="group" aria-label="XP leaderboard type"><button type="button" aria-pressed={kind === "teams"} onClick={() => setKind("teams")}><Users size={14} />Teams</button><button type="button" aria-pressed={kind === "players"} onClick={() => setKind("players")}><UserRound size={14} />Players</button></div></header>
    <div className="xp-format-tools"><label className="xp-format-search embedded-field"><Search size={15} /><input aria-label="Search XP standings" placeholder={`Find ${kind === "teams" ? "a team" : "a player"}…`} value={search} onChange={(event) => setSearch(event.target.value)} /></label><span>Personal XP · Separate standings per game and format</span><button type="button" className="xp-format-refresh site-hover" aria-label="Refresh XP standings" disabled={!user?.id || query.isFetching || (kind === "players" && players.isFetching)} onClick={() => { void query.refetch(); if (kind === "players") void players.refetch(); }}><RefreshCw size={14} />Refresh</button></div>
    {kind === "players" && <TPRankGuide />}
    {!user?.id ? <p className="xp-format-empty">Sign in to view XP standings.</p> : error ? <div className="xp-format-empty" role="alert"><p>{error.message}</p><button type="button" onClick={() => { void query.refetch(); if (kind === "players") void players.refetch(); }}>Try again</button></div> : loading ? <p className="xp-format-empty" role="status">Loading XP standings…</p> : !rows.length ? <p className="xp-format-empty">{search ? "No matching entries." : "Standings appear after completed XP matches in this format."}</p> : <><div className="xp-format-table"><table><thead><tr><th>Place</th><th>{kind === "teams" ? "Team" : "Player"}</th>{kind === "players" && <th>Global TP rank</th>}<th>W</th><th>L</th><th>Win %</th><th>{kind === "teams" ? "Team XP" : "Format XP"}</th></tr></thead><tbody>{pagination.visibleRows.map((row) => {
      const name = kind === "teams" ? row.name : row.user?.display_name || row.user?.username || row.username;
      const path = kind === "teams" ? `/teams?team=${encodeURIComponent(row.team_id)}` : `/profile/${encodeURIComponent(row.user?.username || row.user_id)}`;
      const matches = Number(row.wins) + Number(row.losses);
      return <tr key={row.team_id || row.user_id} data-own={(row.user_id === user?.id || row.captain_id === user?.id) || undefined}><td>#{row.place}</td><td><Link to={path}><span className="leaderboard-avatar"><PlayerAvatarImage user={kind === "teams" ? null : row.user} src={kind === "teams" ? row.logo_url : avatars[row.user_id]} /></span><span><span className="flex flex-wrap items-center gap-2"><strong className={kind === "players" && row.user?.display_name_color ? "player-name-wrap player-name-color" : undefined} data-name-effect={kind === "players" ? row.user?.display_name_color : undefined} style={kind === "players" && row.user?.display_name_color ? { "--player-name-color": row.user.display_name_color } : undefined}>{name}</strong>{kind === "players" && <UserBadges user={row.user} size="xs" iconOnly showForceStream={false} showMonitorCam tooltipPlacement="bottom" />}</span><small>{kind === "teams" ? `${row.roster_size}-player XP team` : `${Number(row.global_xp || 0).toLocaleString()} global XP`}</small></span></Link></td>{kind === "players" && <td><TPRankBadge xp={row.tp_rank?.xp} matchesPlayed={row.tp_rank?.matchesPlayed} position={row.tp_rank?.position} /></td>}<td className="text-green">{row.wins}</td><td className="text-red-400">{row.losses}</td><td>{matches ? (Number(row.wins) / matches * 100).toFixed(1) : "0.0"}%</td><td>{Number(row.total_xp).toLocaleString()}</td></tr>;
    })}</tbody></table></div><LeaderboardPagination itemLabel={kind} page={pagination.page} pageCount={pagination.pageCount} total={pagination.total} onPageChange={pagination.setPage} /></>}
  </section>;
}
