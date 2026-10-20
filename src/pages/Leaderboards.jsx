import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { DollarSign, Flame, Globe2, Search, Trophy, TrendingUp, Users } from "lucide-react";
import { base44 } from "@/api/base44Client";
import CompetitionHero from "@/components/competition/CompetitionHero";
import { getRankForElo } from "@/lib/ranks";
import UserBadges from "@/components/ui/UserBadges";
import PageLoader from "@/components/ui/PageLoader";
import LeaderboardPagination from "@/components/ui/LeaderboardPagination";
import { useLeaderboardPagination } from "@/hooks/useLeaderboardPagination";

const tabs = [
  { key: "elo", label: "Ranked", title: "ELO rankings", metric: "ELO", icon: TrendingUp },
  { key: "tournaments", label: "Tournaments", title: "Tournament wins", metric: "Wins", icon: Trophy },
  { key: "wagers", label: "Cash Matches", title: "Cash match earnings", metric: "Earnings", icon: DollarSign },
];

const regions = ["Global", "NA", "EU", "APAC", "SA", "OCE"];

const playerName = (row) => row.username || row.display_name || row.full_name || row.email || "Unnamed player";
const playerSlug = (row) => row.username || row.user_id || row.id || "";

function PlayerName({ row }) {
  return <div className="leaderboard-player-name">
    <Link to={`/profile/${row.slug}`} data-name-effect={row.user?.display_name_color || undefined} style={row.user?.display_name_color ? { "--player-name-color": row.user.display_name_color } : undefined} className={`player-name-wrap ${row.user?.display_name_color ? "player-name-color" : ""}`}>{row.name}</Link>
    <UserBadges user={row.user} size="xs" iconOnly showForceStream={false} showMonitorCam tooltipPlacement="bottom" />
  </div>;
}

function PlayerAvatar({ row }) {
  return <span className="leaderboard-avatar">{row.user?.avatar_url ? <img src={row.user.avatar_url} alt="" loading="lazy" /> : row.name.charAt(0).toUpperCase()}</span>;
}

export default function Leaderboards() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const activeTab = tabs.some((tab) => tab.key === requestedTab) ? requestedTab : "elo";
  const [region, setRegion] = useState("Global");
  const [searchQuery, setSearchQuery] = useState("");
  const standingsRef = useRef(null);
  const [rankedStats, setRankedStats] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [rankedRows, userRows] = await Promise.all([
        base44.entities.RankedStats.filter({}, "-elo", 500).catch(() => []),
        base44.entities.User.filter({}, "-total_wager_earnings", 500).catch(() => []),
      ]);
      setRankedStats(rankedRows || []);
      setUsers(userRows || []);
    } finally {
      setLoading(false);
    }
  };

  const rows = useMemo(() => {
    const selectedRegion = region.toLowerCase();
    const regionFilter = (row) => region === "Global" || String(row.region || "").toLowerCase() === selectedRegion;
    const userById = new Map(users.map(user => [user.id, user]));
    const enrich = (row) => {
      const linkedUser = userById.get(row.user_id) || userById.get(row.id) || null;
      return linkedUser ? {
        ...row,
        ...linkedUser,
        id: row.id,
        user_id: row.user_id || linkedUser.id,
        elo: row.elo,
        win_streak: row.win_streak,
        region: linkedUser.region || row.region,
      } : row;
    };

    if (activeTab === "elo") {
      return rankedStats
        .map(enrich)
        .filter(regionFilter)
        .map((row) => ({
          id: row.id,
          name: playerName(row),
          slug: playerSlug(row),
          tier: getRankForElo(row.elo).name,
          region: (row.region || "na").toUpperCase(),
          streak: row.win_streak || 0,
          value: Number(row.elo || 0),
          display: Number(row.elo || 0).toLocaleString(),
          user: userById.get(row.user_id) || null,
        }))
        .sort((a, b) => b.value - a.value);
    }

    const userRows = users.filter(regionFilter);
    if (activeTab === "tournaments") {
      return userRows.map((row) => ({
        id: row.id,
        name: playerName(row),
        slug: playerSlug(row),
        tier: row.rank || "unranked",
        region: (row.region || "na").toUpperCase(),
        streak: row.current_win_streak || 0,
        value: Number(row.tournament_wins || 0),
        display: Number(row.tournament_wins || 0).toLocaleString(),
        user: row,
      })).sort((a, b) => b.value - a.value);
    }

    return userRows.map((row) => ({
      id: row.id,
      name: playerName(row),
      slug: playerSlug(row),
      tier: row.rank || "unranked",
      region: (row.region || "na").toUpperCase(),
      streak: row.current_win_streak || 0,
      value: Number(row.total_wager_earnings || 0),
      display: `$${Number(row.total_wager_earnings || 0).toLocaleString()}`,
      user: row,
    })).sort((a, b) => b.value - a.value);
  }, [activeTab, region, rankedStats, users]);

  const rankedRows = useMemo(() => rows.map((row, index) => ({ ...row, rank: index + 1 })), [rows]);
  const filteredRows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return query ? rankedRows.filter((row) => `${row.name} ${row.slug}`.toLowerCase().includes(query)) : rankedRows;
  }, [rankedRows, searchQuery]);
  const pagination = useLeaderboardPagination(filteredRows, `${activeTab}:${region}:${searchQuery}`);
  const selectedTab = tabs.find((tab) => tab.key === activeTab);
  const podium = rankedRows.slice(0, 3);
  const changePage = (page) => {
    pagination.setPage(page);
    window.requestAnimationFrame(() => standingsRef.current?.scrollIntoView({ block: "start", behavior: "auto" }));
  };
  const paginationProps = { page: pagination.page, pageCount: pagination.pageCount, total: pagination.total, onPageChange: changePage };
  const selectTab = (key) => setSearchParams((previous) => {
    const next = new URLSearchParams(previous);
    next.set("tab", key);
    return next;
  });

  if (loading) return <PageLoader label="Loading leaderboards" />;

  return (
    <div className="leaderboard-page competition-surface" data-competition={activeTab === "elo" ? "ranked" : activeTab}>
      <div className="leaderboard-container">
        <CompetitionHero mode={activeTab === "elo" ? "ranked" : activeTab} title="Leaderboards" eyebrow={selectedTab.label + " / Competitive rankings"} description="Compare ranked ELO, tournament wins and cash match earnings. Find your place among the TopFragg competitors." className="mb-6" />

        <div className="leaderboard-filters">
          <div className="leaderboard-tabs" role="group" aria-label="Leaderboard competition">
            {tabs.map((tab) => <button type="button" key={tab.key} aria-pressed={activeTab === tab.key} onClick={() => selectTab(tab.key)}><tab.icon size={14} />{tab.label}</button>)}
          </div>
          <label className="leaderboard-region"><Globe2 size={14} /><span>Region</span><select value={region} onChange={(event) => setRegion(event.target.value)}>{regions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        </div>

        {pagination.page === 1 && !searchQuery.trim() && podium.length > 0 && (
          <section className="leaderboard-podium" aria-label={`${region} top three players`}>
            {podium.map((row) => <article key={row.id} className="leaderboard-champion" data-place={row.rank}>
              <div className="leaderboard-champion-place"><Trophy size={15} /> #{row.rank}</div>
              <div className="leaderboard-champion-player"><PlayerAvatar row={row} /><div className="min-w-0"><PlayerName row={row} /><p className="leaderboard-player-detail">{row.tier} · {row.region}</p></div></div>
              <div className="leaderboard-champion-score"><strong>{row.display}</strong><span>{selectedTab.metric}</span></div>
            </article>)}
          </section>
        )}

        <section ref={standingsRef} className="leaderboard-surface" aria-label={selectedTab.title}>
          <div className="leaderboard-list-heading">
            <div><h2>{selectedTab.title}</h2><p>{region === "Global" ? "Worldwide standings" : `${region} standings`} · 50 players per page</p></div>
            <label className="leaderboard-search"><Search size={15} /><span className="sr-only">Search players</span><input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Find a player…" type="search" /></label>
          </div>
          <LeaderboardPagination {...paginationProps} compact />
          <div role="table" aria-label={selectedTab.title}>
            <div role="rowgroup">
              <div role="row" className="leaderboard-columns leaderboard-table-head">
                <span role="columnheader">Rank</span><span role="columnheader">Player</span><span role="columnheader" className="leaderboard-desktop">Tier</span><span role="columnheader" className="leaderboard-desktop">Region</span><span role="columnheader" className="leaderboard-desktop">Streak</span><span role="columnheader" className="text-right">{selectedTab.metric}</span>
              </div>
            </div>
            <div role="rowgroup">
              {pagination.visibleRows.map((row) => (
                <div role="row" key={row.id} className="leaderboard-columns leaderboard-row">
                  <span role="cell" className="leaderboard-rank" data-place={row.rank}>#{row.rank}</span>
                  <div role="cell" className="leaderboard-player-cell"><PlayerAvatar row={row} /><div className="min-w-0"><PlayerName row={row} /><p className="leaderboard-mobile-detail">{row.region} · {row.tier} · {row.streak} streak</p></div></div>
                  <span role="cell" className="leaderboard-tier leaderboard-desktop">{row.tier}</span>
                  <span role="cell" className="leaderboard-location leaderboard-desktop">{row.region}</span>
                  <span role="cell" className="leaderboard-streak leaderboard-desktop"><Flame size={13} className={row.streak >= 5 ? "text-orange" : "text-vapor"} />{row.streak}</span>
                  <span role="cell" className="leaderboard-score">{row.display}</span>
                </div>
              ))}
            </div>
          </div>
          {filteredRows.length === 0 && <div className="leaderboard-empty"><Users size={26} strokeWidth={1.5} /><strong>{rankedRows.length ? "No players found" : "The ladder starts here"}</strong><p>{rankedRows.length ? "Try another player name or change the region." : "Rankings appear when players start competing in this region."}</p></div>}
          {filteredRows.length > 0 && <LeaderboardPagination {...paginationProps} />}
        </section>
      </div>
    </div>
  );
}
