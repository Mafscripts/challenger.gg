import React, { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ChevronRight, Gamepad2, Medal, Shield, Swords, Trophy, Users } from "lucide-react";
import TPRankBadge from "@/components/competition/TPRankBadge";
import FreeEightsRankBadge from "@/components/competition/FreeEightsRankBadge";
import RankBadge from "@/components/ui/RankBadge";
import { TrophySymbol } from "@/components/ui/TrophyCounts";
import BadgeTooltip from "@/components/ui/BadgeTooltip";
import RecentMatchesPanel from "@/components/match/RecentMatchesPanel";
import { teamPageUrl, teamPurposeFor } from "@/lib/teamPresentation";
import "@/styles/profile-dashboard.css";

const modes = { ranked: { label: "Ranked", href: "/ranked", tone: "cyan" }, eights: { label: "Free 8s", href: "/ranked/8s", tone: "orange" }, xp: { label: "XP Matches", href: "/xp", tone: "purple" } };
const number = (value) => Math.max(0, Number(value) || 0).toLocaleString();
const trophyPlacements = { gold: "1st Place", silver: "2nd Place", bronze: "3rd Place", premium: "1st Premium" };

function Heading({ title, children, icon: Icon }) {
  return <div className="pd-heading"><div>{Icon && <Icon aria-hidden="true" />}<h2>{title}</h2></div><span />{children}</div>;
}

function PlayerAvatar({ player }) {
  const [failed, setFailed] = useState(false);
  return <span className="pd-friend-avatar">{player.avatar_url && !failed ? <img src={player.avatar_url} alt="" loading="lazy" onError={() => setFailed(true)} /> : String(player.name || "P").charAt(0).toUpperCase()}</span>;
}

export function ProfileFriends({ friends = [], total = 0, next_offset = null, loading = false, expanded = false, onViewAll, onManageRequests, onLoadMore, loadingMore = false, error = false }) {
  const visible = expanded ? friends : friends.slice(0, 8);
  return <section className="pd-panel pd-friends">
    <Heading title="Friends" icon={Users}><span className="pd-count">{loading ? "…" : total}</span>{onManageRequests && <button className="pd-text-action" onClick={onManageRequests}>Friend requests <ChevronRight /></button>}</Heading>
    {loading ? <p className="pd-empty" role="status">Loading friends…</p> : error && !visible.length ? <p className="pd-empty">Friends could not be loaded.</p> : visible.length ? <div className={`pd-friend-grid${expanded ? " pd-friend-grid-expanded" : ""}`}>
      {visible.map((friend) => <Link key={friend.id} to={`/profile/${encodeURIComponent(friend.username || friend.id)}`} className="pd-friend"><PlayerAvatar player={friend} /><span>{friend.name}</span></Link>)}
    </div> : <div className="pd-empty-inline"><Users aria-hidden="true" /><p>No friends to show yet.</p></div>}
    {!expanded && total > 0 && <button className="pd-view-all" onClick={onViewAll}>View all friends <ChevronRight /></button>}
    {expanded && error && visible.length > 0 && <p role="alert" className="pd-footnote">More friends could not be loaded. Try again below.</p>}
    {expanded && next_offset !== null && <button disabled={loadingMore} className="pd-view-all" onClick={onLoadMore}>{loadingMore ? "Loading…" : "Load next 25 friends"}<ChevronRight /></button>}
  </section>;
}

export function ArenaRecords({ data, loading = false, error = false, onRetry, screenshotRank }) {
  const [filter, setFilter] = useState("all");
  const rows = (data?.arenas || []).filter((row) => filter === "all" || row.mode === filter);
  const wins = rows.reduce((sum, row) => sum + row.wins, 0), losses = rows.reduce((sum, row) => sum + row.losses, 0);
  return <section className="pd-panel pd-arena">
    <Heading title="Competition stats" icon={Swords} />
    <div className="pd-filters" aria-label="Arena competition">
      {[{ id: "all", label: "All arenas" }, ...Object.entries(modes).map(([id, mode]) => ({ id, label: mode.label }))].map((mode) => <button key={mode.id} aria-pressed={filter === mode.id} onClick={() => setFilter(mode.id)}>{mode.label}</button>)}
    </div>
    {loading ? <div className="pd-record-skeleton" role="status" aria-label="Loading Arena records">{[0, 1, 2].map((i) => <div key={i} />)}</div>
      : error ? <div className="pd-empty"><p>Arena records could not be loaded.</p><button onClick={onRetry} className="pd-text-action">Try again</button></div>
        : rows.length ? <div className="pd-table-scroll"><table className="pd-record-table"><thead><tr><th>Game / competition</th><th>Rank / rating</th><th>W</th><th>L</th></tr></thead><tbody>
          {rows.map((row) => <tr key={row.id}>
            <td><Link to={`${modes[row.mode].href}${row.mode === "eights" ? `?game=${encodeURIComponent(row.game_id)}` : ""}`} className="pd-arena-game"><span className={`pd-game-mark pd-tone-${modes[row.mode].tone}`}><Gamepad2 /></span><span><strong>{row.game_name}</strong><small>{modes[row.mode].label}</small></span></Link></td>
            <td><div className="pd-rating">
              {row.mode === "eights" && <FreeEightsRankBadge elo={row.rating || 0} screenshotRank={screenshotRank} />}
              {row.mode === "ranked" && row.rating !== null && <RankBadge elo={row.rating} size="sm" showLabel={false} animated={false} />}
              {row.mode === "xp" && <TPRankBadge xp={data.tp_rank?.xp} matchesPlayed={data.tp_rank?.matchesPlayed} position={data.tp_rank?.position} />}
              <span>{row.rating === null ? "—" : number(row.rating)}<small>{row.rating_label}</small></span>
            </div></td><td className="pd-wins">{number(row.wins)}</td><td className="pd-losses">{number(row.losses)}</td>
          </tr>)}
        </tbody><tfoot><tr><td colSpan={2}>Total record</td><td className="pd-wins">{number(wins)}</td><td className="pd-losses">{number(losses)}</td></tr></tfoot></table></div>
          : <div className="pd-empty-inline"><Gamepad2 /><p>No completed matches{filter !== "all" ? " in this competition" : " in these competitions yet"}.</p></div>}
    <p className="pd-footnote">Completed Ranked, Free 8s and XP Matches only. XP is shared across XP arenas.</p>
  </section>;
}

export function TrophyShelf({ trophies = [], loading = false, error = false, onViewAll }) {
  return <section className="pd-panel pd-trophies"><Heading title="Trophy showcase" icon={Trophy}><button onClick={onViewAll} className="pd-text-action">View cabinet <ChevronRight /></button></Heading>
    {loading ? <p className="pd-empty" role="status">Loading trophies…</p> : error ? <p className="pd-empty">Trophies could not be loaded.</p> : trophies.length ? <div className="pd-trophy-shelf" aria-label="Latest 10 earned trophies">{trophies.slice(0, 10).map((trophy) => <BadgeTooltip key={trophy.id} label={trophy.name} description={[trophy.event, trophy.earned_at ? `Earned ${new Date(trophy.earned_at).toLocaleDateString()}` : "Earned trophy"].filter(Boolean).join(" · ")}>
      <button onClick={onViewAll} className="pd-trophy" data-tier={trophy.tier} aria-label={`${trophyPlacements[trophy.tier] || trophy.tier} trophy${trophy.event ? ` · ${trophy.event}` : ""}`}><TrophySymbol type={trophy.tier} className="pd-trophy-symbol" /><span className="pd-trophy-placement">{trophyPlacements[trophy.tier]}</span></button>
    </BadgeTooltip>)}</div> : <div className="pd-empty-inline"><Trophy /><p>No trophies earned yet.</p></div>}
  </section>;
}

function FeaturedTeams({ teams, userId, loading, onViewAll }) {
  return <section className="pd-panel pd-teams"><Heading title="Featured teams" icon={Shield}><span className="pd-count">{loading ? "…" : teams.length}</span></Heading>
    {loading ? <p role="status" className="pd-empty">Loading teams…</p> : teams.length ? <div className="pd-team-list">{teams.slice(0, 3).map(({ team, role }) => <Link key={team.id} to={teamPageUrl(team)} className="pd-team-row">
      <span className="pd-team-logo">{team.logo_url ? <img src={team.logo_url} alt="" loading="lazy" /> : String(team.tag || team.name).slice(0, 2).toUpperCase()}</span>
      <span className="pd-team-copy"><strong>{team.name}</strong><small>{teamPurposeFor(team).label}{team.region ? ` · ${team.region}` : ""}</small><span>{team.captain_id === userId ? "Captain" : role || "Member"}</span></span>
      <span className="pd-team-record"><b>{number(team.total_wins)} <span>–</span> {number(team.total_losses)}</b><small>Team record</small></span><ChevronRight />
    </Link>)}</div> : <div className="pd-empty-inline"><Shield /><p>No teams joined yet.</p></div>}
    {teams.length > 0 && <button onClick={onViewAll} className="pd-view-all">View all teams <ChevronRight /></button>}
  </section>;
}

export default function ProfileOverview({ arena, arenaLoading, arenaError, onRetry, user, profile, matches = [], matchesLoading, trophyCount = 0, recentTrophies, trophiesLoading, trophiesError, teams, teamsLoading, friends, friendsLoading, canManageFriends, onTab, onEditProfile }) {
  const rank = arena?.tp_rank, played = rank?.matchesPlayed > 0;
  const wins = (arena?.arenas || []).reduce((sum, row) => sum + (Number(row.wins) || 0), 0);
  const losses = (arena?.arenas || []).reduce((sum, row) => sum + (Number(row.losses) || 0), 0);
  const total = wins + losses;
  const summaries = [
    { label: "Arena matches", value: number(total), detail: "Ranked · Free 8s · XP", icon: Swords, tab: "statistics", loading: arenaLoading || arenaError },
    { label: "Arena win rate", value: total ? `${Math.round(wins / total * 100)}%` : "—", detail: `${number(wins)} wins · ${number(losses)} losses`, icon: Medal, tab: "statistics", loading: arenaLoading || arenaError },
    { label: "Trophies", value: number(trophyCount), detail: "Open trophy cabinet", icon: Trophy, tab: "trophies", loading: trophiesLoading },
    { label: "Teams", value: number(teams.length), detail: "Competition rosters", icon: Users, tab: "teams", loading: teamsLoading },
  ];
  return <div className="profile-overview">
    <div className="pd-summary-grid" aria-label="Player summary">{summaries.map(({ label, value, detail, icon: Icon, tab, loading }) => <button key={label} type="button" className="competition-stat-card pd-summary-card" onClick={() => onTab(tab)}><div className="competition-stat-icon"><Icon size={21} /></div><div><p className="competition-stat-label">{label}</p><strong className="competition-stat-value">{loading ? "—" : value}</strong><p className="competition-stat-detail">{detail}</p></div><ChevronRight size={14} aria-hidden="true" /></button>)}</div>
    <div className="profile-dashboard">
      <div className="pd-main">
        <section className={`pd-panel pd-activity${!matches.length ? " pd-activity-empty" : ""}`}>
          <RecentMatchesPanel key={user.id} matches={matches} userId={user.id} loading={matchesLoading} title="Recent match activity" availableModesOnly onViewAll={() => onTab("matches")} />
          {!matchesLoading && !matches.length && <div className="pd-activity-start"><p>{canManageFriends ? "Your matches and results will appear here once you start playing." : "This player has no recent matches to show yet."}</p>{canManageFriends && <Link to="/matchfinder" className="pd-primary-action"><Swords size={16} />Find your first match<ArrowRight size={14} /></Link>}</div>}
        </section>
        {(arenaLoading || arenaError || (arena?.arenas || []).length > 0) && <ArenaRecords data={arena} loading={arenaLoading} error={arenaError} onRetry={onRetry} screenshotRank={user.screenshot_rank} />}
        {(teamsLoading || teams.length > 0) && <FeaturedTeams teams={teams} userId={user.id} loading={teamsLoading} onViewAll={() => onTab("teams")} />}
        {(trophiesLoading || trophiesError || recentTrophies?.length > 0) && <TrophyShelf trophies={recentTrophies} loading={trophiesLoading} error={trophiesError} onViewAll={() => onTab("trophies")} />}
      </div>
      <aside className="pd-sidebar">
        <section className="pd-panel pd-rank-panel" data-ranked={played}>
          <Heading title="XP progression" icon={Medal} />
          <div className="pd-rank-summary">
            {(arenaLoading || played) && <div className="pd-rank-stage"><TPRankBadge xp={rank?.xp} matchesPlayed={rank?.matchesPlayed} position={rank?.position} loading={arenaLoading} size="large" /></div>}
            <div>{arenaError ? <strong className="pd-unranked">Rank unavailable</strong> : !arenaLoading && <><strong className="pd-rank-name">{played ? rank.position === 1 ? "Champion" : rank.elite ? "Top 1000" : rank.name : "Unranked"}</strong><p className="pd-rank-points">{number(rank?.xp)} <span>XP</span></p></>}</div>
          </div>
          {!arenaLoading && !arenaError && <p className="pd-rank-help">{played ? `${number(rank.matchesPlayed)} XP matches played` : "Complete your first XP Match to earn a rank star."}</p>}
          {arenaError ? <button type="button" onClick={onRetry} className="pd-view-all">Try again<ArrowRight /></button> : <Link to="/xp#standings" className="pd-view-all">XP leaderboard<ArrowRight /></Link>}
        </section>
        <section className="pd-panel pd-about"><Heading title="About the player" /><p>{profile?.bio || (canManageFriends ? "Add a bio to introduce yourself to other players." : "This player hasn't added a bio yet.")}</p>{canManageFriends && <button type="button" className="pd-view-all" onClick={onEditProfile}>Edit bio & appearance<ChevronRight /></button>}</section>
        {!friendsLoading && friends?.total > 0 && <ProfileFriends {...friends} onManageRequests={canManageFriends ? () => onTab("friends") : undefined} onViewAll={() => onTab("friends")} />}
        {canManageFriends && !teamsLoading && teams.length === 0 && <section className="pd-panel pd-team-start"><Heading title="Play as a team" icon={Shield} /><p>Find a roster or create your own team for your next competition.</p><Link to="/teams" className="pd-view-all">Browse teams<ArrowRight /></Link></section>}
      </aside>
    </div>
  </div>;
}
