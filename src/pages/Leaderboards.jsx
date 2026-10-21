import RewardSeasonBoard from "@/components/competition/RewardSeasonBoard";
import XPFormatSelect from "@/components/competition/XPFormatSelect";
import XPFormatStandings from "@/components/competition/XPFormatStandings";
import useRouteSection from "@/hooks/useRouteSection";
import React, { useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowDown, ArrowUpRight, Crown, Crosshair, DollarSign, Flame, Gamepad2, Globe2, Medal, Search, Trophy, TrendingUp, Users, Zap } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/AuthContext";
import { leaderboardQueryOptions, loadLeaderboardPlayers, useLeaderboardAvatars } from "@/hooks/useCompetitionLeaderboard";
import CompetitionHero from "@/components/competition/CompetitionHero";
import { buildFreeEightsStandings } from "@/lib/freeEightsStandings";
import { getFreeEightsRank } from "@/lib/freeEightsRanks";
import { DEFAULT_EIGHTS_GAMES, eightsGameName } from "@/lib/freeEightsGames";
import { useFreeEightsGames } from "@/hooks/useFreeEightsGames";
import { challengeRank } from "@/lib/challengeRanks";
import TPRankBadge from "@/components/competition/TPRankBadge";
import ChallengeRankBadge from "@/components/challenge/ChallengeRankBadge";
import { getRankForElo } from "@/lib/ranks";
import UserBadges from "@/components/ui/UserBadges";
import PlayerAvatarImage from "@/components/ui/PlayerAvatarImage";
import LeaderboardPagination from "@/components/ui/LeaderboardPagination";
import { useLeaderboardPagination } from "@/hooks/useLeaderboardPagination";
import "@/styles/leaderboards-page.css";

const tabs = [
  { key: "elo", mode: "ranked", label: "Ranked", title: "ELO rankings", metric: "ELO", icon: TrendingUp, detail: "Climb the ELO ladder", fact: "Ranked ELO", factIcon: "Medal" },
  { key: "eights", mode: "eights", label: "Free 8s", title: "Free 8s rankings", metric: "8s ELO", icon: Users, detail: "Your game. Your ladder.", fact: "Free 8s ELO", factIcon: "Users" },
  { key: "money8s", mode: "money8s", label: "Money 8s", title: "Money 8s winnings", metric: "Winnings", icon: DollarSign, detail: "Play for the pot", fact: "Money 8s winnings", factIcon: "DollarSign" },
  { key: "xp", mode: "xp", label: "XP Matches", title: "XP Match rankings", metric: "XP", icon: Zap, detail: "Earn your own star", fact: "XP Matches only", factIcon: "Sparkles" },
  { key: "challenge", mode: "challenge", label: "Challenge a Team", title: "Challenge rankings", metric: "Challenge XP", icon: Crosshair, detail: "Your own challenge ladder", fact: "Separate Challenge XP", factIcon: "Crosshair" },
  { key: "wagers", mode: "wagers", label: "Cash Matches", title: "Cash match earnings", metric: "Earnings", icon: DollarSign, detail: "Follow the earnings ladder", fact: "Cash match earnings", factIcon: "DollarSign" },
  { key: "tournaments", mode: "tournaments", label: "Tournaments", title: "Tournament wins", metric: "Wins", icon: Trophy, detail: "Make every event count", fact: "Tournament wins", factIcon: "Trophy" },
];

const regions = ["Global", "NA", "EU", "APAC", "SA", "OCE"];

const playerName = (row) => row.username || row.display_name || row.full_name || row.email || "Unnamed player";
const playerSlug = (row) => row.username || row.user_id || row.id || "";

function PlayerName({ row }) {
  return <div className="leaderboard-player-name">
    <Link to={row.profilePath || `/profile/${row.slug}`} data-name-effect={row.user?.display_name_color || undefined} style={row.user?.display_name_color ? { "--player-name-color": row.user.display_name_color } : undefined} className={`player-name-wrap ${row.user?.display_name_color ? "player-name-color" : ""}`}>{row.name}</Link>
    {row.kind !== "team" && <UserBadges user={row.user} size="xs" iconOnly showForceStream={false} showMonitorCam tooltipPlacement="bottom" />}
  </div>;
}

function PlayerAvatar({ row, src }) {
  return <span className="leaderboard-avatar"><PlayerAvatarImage user={row.user} src={row.kind === "team" ? row.avatarUrl : src || row.user?.avatar_url} /></span>;
}

function StandingTier({ row, mode }) {
  if (mode === "xp") return <TPRankBadge xp={row.value} matchesPlayed={row.matchesPlayed} position={row.tpRank?.position} />;
  if (mode === "challenge") return <ChallengeRankBadge xp={row.value} />;
  if (mode === "money8s") return <span className="leaderboard-record"><strong>{row.wins}W</strong><span> · {row.losses}L</span></span>;
  return <span className="leaderboard-tier-pill" data-tier={String(row.tier).toLowerCase()}>{row.tier}</span>;
}

export default function Leaderboards() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const activeTab = tabs.some((tab) => tab.key === requestedTab) ? requestedTab : "elo";
  const selectedTab = tabs.find((tab) => tab.key === activeTab);
  const [xpFormat, setXPFormat] = useRouteSection("xp_format", "global", ["global", "solo", "duos", "teams"]);
  const seasonView = searchParams.get("view") === "season";
  const formatXP = activeTab === "xp" && xpFormat !== "global";
  const [eightsGame, setEightsGame] = useState("bo7");
  const [challengeKind, setChallengeKind] = useState("team");
  const gamesQuery = useFreeEightsGames(activeTab === "eights");
  const games = gamesQuery.data?.games?.length ? gamesQuery.data.games : DEFAULT_EIGHTS_GAMES;
  const selectedGame = games.find((game) => game.id === eightsGame);
  const [region, setRegion] = useState("Global");
  const [searchQuery, setSearchQuery] = useState("");
  const standingsRef = useRef(null);
  const { user } = useAuth();
  const userOrder = activeTab === "tournaments" ? "-tournament_wins" : activeTab === "wagers" ? "-total_wager_earnings" : "-created_date";
  const usersQuery = useQuery({
    ...leaderboardQueryOptions,
    queryKey: ["leaderboard-users", user?.id, userOrder],
    queryFn: () => loadLeaderboardPlayers(userOrder),
    enabled: Boolean(user?.id) && !seasonView,
  });
  const hasStandaloneStats = !seasonView && !formatXP && !["tournaments", "wagers"].includes(activeTab);
  const standingsQuery = useQuery({
    ...leaderboardQueryOptions,
    queryKey: ["competition-standings", user?.id, selectedTab.mode, activeTab === "eights" ? eightsGame : activeTab === "challenge" ? challengeKind : "all"],
    queryFn: async () => {
      if (activeTab === "elo") return base44.entities.RankedStats.filterFresh({}, "-elo", 500);
      const name = { xp: "getXPStandings", eights: "getFreeEightsStandings", money8s: "getMoneyEightsStandings", challenge: "getChallengeStandings" }[activeTab];
      const response = await base44.functions.invoke(name, activeTab === "eights" ? { game_id: eightsGame } : activeTab === "challenge" ? { kind: challengeKind } : {});
      if (!response.data?.success) throw new Error(response.data?.error || "Standings could not be loaded.");
      return response.data.rows || [];
    },
    enabled: Boolean(user?.id) && hasStandaloneStats,
  });
  const users = usersQuery.data || [];
  const stats = standingsQuery.data || [];
  const loading = usersQuery.isPending || (hasStandaloneStats && standingsQuery.isPending);
  const error = usersQuery.error || (hasStandaloneStats && standingsQuery.error);
  const rows = useMemo(() => {
    const usersById = new Map(users.map((entry) => [String(entry.id), entry]));
    const player = (row) => {
      const id = row.user_id || row.id;
      const linked = usersById.get(String(id));
      return { id: row.id || id, userId: id, user: linked || null,
        name: playerName(linked || row), slug: playerSlug(linked || row),
        region: String(linked?.region || row.region || "—").toUpperCase() };
    };
    let entries;
    if (activeTab === "eights") {
      entries = buildFreeEightsStandings(stats, usersById, stats.length).map((row) => ({ ...row,
        region: String(row.user?.region || "—").toUpperCase(), value: row.score, display: row.score.toLocaleString(), tier: getFreeEightsRank(row.score).name }));
    } else if (activeTab === "xp") {
      // Preserve the XP service's order and global TP rank, including in regional views.
      entries = stats.map((row) => ({ ...player(row), value: Number(row.total_xp || 0), display: Number(row.total_xp || 0).toLocaleString(),
        tier: row.tp_rank?.position === 1 ? "Champion" : row.tp_rank?.name || "Unranked", tpRank: row.tp_rank,
        matchesPlayed: Number(row.matches_played || 0), streak: Number(row.win_streak || 0) }));
    } else if (activeTab === "money8s") {
      entries = stats.map((row) => ({ ...player(row), value: Number(row.winnings || 0), display: `$${Number(row.winnings || 0).toLocaleString()}`,
        wins: Number(row.wins || 0), losses: Number(row.losses || 0), tier: `${row.wins || 0}W · ${row.losses || 0}L`, streak: null }));
    } else if (activeTab === "challenge") {
      entries = stats.map((row) => {
        const linked = row.kind === "solo" ? usersById.get(String(row.subject_id)) : null;
        return { id: row.id, userId: row.kind === "solo" ? row.subject_id : null, user: linked, kind: row.kind, captainId: row.captain_id,
          name: row.name, slug: row.subject_id, profilePath: row.kind === "team" ? `/teams?team=${encodeURIComponent(row.subject_id)}` : `/profile/${encodeURIComponent(row.username || linked?.username || row.subject_id)}`,
          avatarUrl: row.logo_url, region: String(row.region || "—").toUpperCase(),
          value: Number(row.xp || 0), display: Number(row.xp || 0).toLocaleString(), tier: challengeRank(row.xp).name, streak: null };
      });
    } else if (activeTab === "elo") {
      entries = stats.map((row) => ({ ...player(row), value: Number(row.elo || 0), display: Number(row.elo || 0).toLocaleString(), tier: getRankForElo(row.elo).name, streak: Number(row.win_streak || 0) }))
        .sort((a, b) => b.value - a.value);
    } else {
      const tournaments = activeTab === "tournaments";
      entries = users.map((row) => {
        const value = Number((tournaments ? row.tournament_wins : row.total_wager_earnings) || 0);
        return { ...player(row), value, display: `${tournaments ? "" : "$"}${value.toLocaleString()}`, tier: row.rank || "Unranked", streak: Number(row.current_win_streak || 0) };
      }).sort((a, b) => b.value - a.value);
    }
    return entries.filter((row) => region === "Global" || row.region.toLowerCase() === region.toLowerCase());
  }, [activeTab, region, stats, users]);

  const rankedRows = useMemo(() => rows.map((row, index) => ({ ...row, rank: index + 1 })), [rows]);
  const filteredRows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return query ? rankedRows.filter((row) => `${row.name} ${row.slug}`.toLowerCase().includes(query)) : rankedRows;
  }, [rankedRows, searchQuery]);
  const pagination = useLeaderboardPagination(filteredRows, `${activeTab}:${eightsGame}:${challengeKind}:${region}:${searchQuery}`);
  const playerAvatars = useLeaderboardAvatars(seasonView ? [] : pagination.visibleRows.map((row) => row.userId));
  const podium = rankedRows.slice(0, 3);
  const ownStanding = rankedRows.find((row) => row.userId === user?.id || (row.kind === "team" && row.captainId === user?.id));
  const isTeamLadder = activeTab === "challenge" && challengeKind === "team";
  const tierTitle = activeTab === "xp" ? "TP rank" : activeTab === "money8s" ? "Record" : "Tier";
  const changePage = (page) => {
    pagination.setPage(page);
    window.requestAnimationFrame(() => standingsRef.current?.scrollIntoView({ block: "start", behavior: "auto" }));
  };
  const paginationProps = { itemLabel: isTeamLadder ? "teams" : "players", page: pagination.page, pageCount: pagination.pageCount, total: pagination.total, onPageChange: changePage };
  const selectTab = (key) => setSearchParams((previous) => {
    const next = new URLSearchParams(previous);
    next.set("tab", key);
    return next;
  });

  return (
    <div className="leaderboard-page competition-surface page-shell" data-competition={activeTab === "elo" ? "ranked" : activeTab}>
      <div className="page-container">
        <CompetitionHero mode="leaderboards" title="Leaderboards" eyebrow={isTeamLadder ? "The teams setting the pace" : "The players setting the pace"}
          description="Every win tells a story. Explore the leaders, find your place and set your sights on the next spot."
          className="leaderboard-page-hero mb-6"
          facts={[[selectedTab.factIcon, selectedTab.fact], ["Globe2", region === "Global" ? "Worldwide competition" : `${region} competition`], [isTeamLadder ? "ShieldCheck" : "UserRound", formatXP ? "Team & player XP standings" : isTeamLadder ? "Team profiles & stats" : "Player profiles & stats"]]}
          count={loading || error || formatXP || seasonView ? undefined : rankedRows.length} countLabel={isTeamLadder ? "teams" : "players"}
          metadata={<><Globe2 size={13} aria-hidden="true" />{region === "Global" ? "Global standings" : `${region} standings`}</>}
          action={<div className="competition-actions"><button type="button" onClick={() => standingsRef.current?.scrollIntoView({ block: "start", behavior: "auto" })} className="competition-action-pill"><ArrowDown size={15} />View rankings</button>{!seasonView && !formatXP && !loading && !error && ownStanding && <span className="leaderboard-own-position"><Medal size={15} />Your position<strong>#{ownStanding.rank}</strong></span>}</div>}
        />

        <div className="leaderboard-filters">
          <div className="leaderboard-tabs" role="group" aria-label="Leaderboard competition">
            {tabs.map((tab) => <button type="button" key={tab.key} data-ladder={tab.key} aria-pressed={activeTab === tab.key} onClick={() => selectTab(tab.key)}><span className="leaderboard-tab-icon"><tab.icon size={19} /></span><span><strong>{tab.label}</strong><small>{tab.detail}</small></span><ArrowUpRight className="leaderboard-tab-arrow" size={15} /></button>)}
          </div>
          <div className="leaderboard-scope-filters">
            <div className="xp-ranking-switch" role="group" aria-label="Leaderboard period">{[["all", "Global"], ["season", "Season"]].map(([value, label]) => <button type="button" key={value} aria-pressed={seasonView === (value === "season")} onClick={() => setSearchParams((previous) => { const next = new URLSearchParams(previous); if (value === "season") next.set("view", value); else next.delete("view"); return next; })}>{label}</button>)}</div>
            {!seasonView && activeTab === "xp" && <XPFormatSelect allowGlobal value={xpFormat} onChange={setXPFormat} />}
            {activeTab === "eights" && <label className="leaderboard-region"><Gamepad2 size={14} /><span>Game</span><select value={eightsGame} onChange={(event) => setEightsGame(event.target.value)}>{games.map((game) => <option key={game.id} value={game.id}>{eightsGameName(game)}</option>)}</select></label>}
            {!seasonView && activeTab === "challenge" && <div className="leaderboard-kind-switch" role="group" aria-label="Challenge ladder"><button type="button" aria-pressed={challengeKind === "team"} onClick={() => setChallengeKind("team")}>Teams</button><button type="button" aria-pressed={challengeKind === "solo"} onClick={() => setChallengeKind("solo")}>Solo players</button></div>}
            <label className="leaderboard-region"><Globe2 size={14} /><span>Region</span><select value={region} onChange={(event) => setRegion(event.target.value)}>{regions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          </div>
        </div>

        {seasonView ? <div ref={standingsRef} className="leaderboard-list-panel"><RewardSeasonBoard mode={selectedTab.mode} gameId={eightsGame} region={region} category={xpFormat} /></div> : formatXP ? <div ref={standingsRef} className="leaderboard-list-panel"><XPFormatStandings category={xpFormat} region={region} /></div> : <>
        {!loading && !error && pagination.page === 1 && !searchQuery.trim() && podium.length > 0 && (
          <section className="leaderboard-podium-section" aria-label={`${region} top three ${isTeamLadder ? "teams" : "players"}`}>
            <div className="leaderboard-section-heading"><h2><Crown size={16} />Leading the way</h2><span>Top {podium.length} · {region === "Global" ? "Worldwide" : region}</span></div>
            <div className="leaderboard-podium">{podium.map((row) => <article key={row.id} className="leaderboard-champion" data-place={row.rank}>
              <div className="leaderboard-champion-place"><span className="leaderboard-podium-medal"><Trophy size={21} /></span><span>{["1st place", "2nd place", "3rd place"][row.rank - 1]}<small>{selectedTab.label}</small></span><span className="leaderboard-podium-number" aria-hidden="true">0{row.rank}</span></div>
              <div className="leaderboard-champion-player"><PlayerAvatar row={row} src={playerAvatars[row.userId]} /><div className="min-w-0"><PlayerName row={row} /><div className="leaderboard-player-detail"><StandingTier row={row} mode={activeTab} /><span> · {row.region}</span></div></div></div>
              <div className="leaderboard-champion-footer"><div className="leaderboard-champion-score"><strong>{row.display}</strong><span>{selectedTab.metric}</span></div><Link to={row.profilePath || `/profile/${row.slug}`} className="site-hover leaderboard-podium-profile" aria-label={`View ${row.name}'s ${row.kind === "team" ? "team" : "profile"}`}>{row.kind === "team" ? "Team" : "Profile"}<ArrowUpRight size={14} /></Link></div>
            </article>)}</div>
          </section>
        )}

        <section ref={standingsRef} className="leaderboard-surface" aria-label={selectedTab.title}>
          <div className="leaderboard-list-heading">
            <div><p className="leaderboard-list-eyebrow"><selectedTab.icon size={13} />{selectedTab.label} standings</p><h2>{selectedTab.title}</h2><p>{region === "Global" ? "Worldwide standings" : `${region} standings`} · 50 {isTeamLadder ? "teams" : "players"} per page{activeTab === "eights" && selectedGame ? ` · ${eightsGameName(selectedGame)}` : ""}</p></div>
            <label className="leaderboard-search"><Search size={15} /><span className="sr-only">Search {isTeamLadder ? "teams" : "players"}</span><input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder={isTeamLadder ? "Find a team…" : "Find a player…"} type="search" /></label>
          </div>
          <LeaderboardPagination {...paginationProps} compact />
          <div role="table" aria-label={selectedTab.title}>
            <div role="rowgroup">
              <div role="row" className="leaderboard-columns leaderboard-table-head">
                <span role="columnheader">Rank</span><span role="columnheader">{isTeamLadder ? "Team" : "Player"}</span><span role="columnheader" className="leaderboard-desktop">{tierTitle}</span><span role="columnheader" className="leaderboard-desktop">Region</span><span role="columnheader" className="leaderboard-desktop">Streak</span><span role="columnheader" className="text-right">{selectedTab.metric}</span>
              </div>
            </div>
            <div role="rowgroup">
              {pagination.visibleRows.map((row) => (
                <div role="row" key={row.id} className="leaderboard-columns leaderboard-row" data-self={row.userId === user?.id || (row.kind === "team" && row.captainId === user?.id) ? true : undefined} data-podium={row.rank <= 3 ? row.rank : undefined}>
                  <span role="cell" className="leaderboard-rank" data-place={row.rank}><span>#{row.rank}</span></span>
                  <div role="cell" className="leaderboard-player-cell"><PlayerAvatar row={row} src={playerAvatars[row.userId]} /><div className="min-w-0"><PlayerName row={row} /><p className="leaderboard-mobile-detail">{row.region} · {row.tier}{row.streak !== null ? ` · ${row.streak} streak` : ""}</p></div></div>
                  <span role="cell" className="leaderboard-tier leaderboard-desktop"><StandingTier row={row} mode={activeTab} /></span>
                  <span role="cell" className="leaderboard-location leaderboard-desktop"><span className="leaderboard-region-pill">{row.region}</span></span>
                  <span role="cell" className="leaderboard-streak leaderboard-desktop" data-hot={row.streak >= 5 ? true : undefined}>{row.streak === null ? "—" : <><Flame size={13} className={row.streak >= 5 ? "text-orange" : "text-vapor"} />{row.streak}</>}</span>
                  <span role="cell" className="leaderboard-score">{row.display}</span>
                </div>
              ))}
            </div>
          </div>
          {loading ? <p role="status" className="px-5 py-12 text-center text-sm text-vapor">Loading standings…</p> : error ? <div role="alert" className="leaderboard-empty"><strong>Standings could not be loaded.</strong><button type="button" onClick={() => { void usersQuery.refetch(); if (hasStandaloneStats) void standingsQuery.refetch(); }} className="site-hover rounded-lg border border-cyan/25 px-4 py-2 text-xs font-bold text-cyan">Try again</button></div> : filteredRows.length === 0 && <div className="leaderboard-empty"><Users size={26} strokeWidth={1.5} /><strong>{rankedRows.length ? isTeamLadder ? "No teams found" : "No players found" : "The ladder starts here"}</strong><p>{rankedRows.length ? "Try another name or change the region." : `Rankings appear when ${isTeamLadder ? "teams" : "players"} start competing in this region.`}</p></div>}
          {filteredRows.length > 0 && <LeaderboardPagination {...paginationProps} />}
        </section>
        </>}
      </div>
    </div>
  );
}
