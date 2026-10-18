import React, { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ChevronRight, Gamepad2, Shield, Swords, Trophy, Users } from "lucide-react";
import TPRankBadge from "@/components/competition/TPRankBadge";
import FreeEightsRankBadge from "@/components/competition/FreeEightsRankBadge";
import RankBadge from "@/components/ui/RankBadge";
import { TrophySymbol } from "@/components/ui/TrophyCounts";
import BadgeTooltip from "@/components/ui/BadgeTooltip";
import { matchOpponentFor, matchRouteFor, matchScoreFor } from "@/lib/matchPresentation";
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
    <Heading title="Arena" icon={Swords} />
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
          : <div className="pd-empty-inline"><Gamepad2 /><p>No ranked games played{filter !== "all" ? " in this arena" : " yet"}.</p></div>}
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

function RecentArenaMatches({ matches = [], userId, loading, error, onViewAll }) {
  return <section className="pd-panel pd-recent"><Heading title="Recent matches" icon={Swords} />
    {loading ? <p className="pd-empty" role="status">Loading match activity…</p> : error ? <p className="pd-empty">Match activity is temporarily unavailable.</p> : matches.length ? <div className="pd-recent-list">{matches.slice(0, 4).map((match) => {
      const score = matchScoreFor(match, userId), won = match.profile_result === "win";
      return <Link to={matchRouteFor(match)} key={`${match.match_type}:${match.id}`} className={`pd-recent-row ${won ? "is-win" : "is-loss"}`}><span className="pd-result-mark">{won ? "W" : "L"}</span><span className="pd-recent-copy"><strong>{matchOpponentFor(match, userId)}</strong><small>{match.game_name}</small><span>{match.match_type === "8s" ? "Free 8s" : match.match_type === "xp" ? "XP Matches" : "Ranked"} · {match.game_mode_display || match.game_mode || "Match"}</span></span><span className="pd-recent-score"><b>{score.text}</b><small>{new Date(match.match_completed_date || match.completed_date || match.created_date).toLocaleDateString()}</small></span><ChevronRight /></Link>;
    })}</div> : <div className="pd-empty-inline"><Swords /><p>Completed arena matches will appear here.</p></div>}
    {matches.length > 0 && <button onClick={onViewAll} className="pd-view-all">View match history <ArrowRight /></button>}
  </section>;
}

export default function ProfileOverview({ arena, arenaLoading, arenaError, onRetry, user, profile, recentTrophies, trophiesLoading, trophiesError, teams, teamsLoading, friends, friendsLoading, canManageFriends, onTab }) {
  const rank = arena?.tp_rank, played = rank?.matchesPlayed > 0;
  return <div className="profile-dashboard">
    <aside className="pd-sidebar">
      <section className="pd-panel pd-rank-panel"><p className="pd-eyebrow">TopFragg · XP Matches</p><h2>TP RANK</h2><div className="pd-rank-stage">{arenaError ? <span className="pd-unranked">Rank unavailable</span> : <TPRankBadge xp={rank?.xp} matchesPlayed={rank?.matchesPlayed} position={rank?.position} loading={arenaLoading} size="hero" />}</div>
        {!arenaLoading && !arenaError && <><strong className="pd-rank-name">{played ? rank.position === 1 ? "Champion" : rank.elite ? "Top 1000" : rank.name : "Unranked"}</strong><p className="pd-rank-points">{number(rank?.xp)} <span>XP</span></p><p className="pd-rank-help">{played ? `${number(rank.matchesPlayed)} XP matches played` : "Play your first XP Match to earn your star."}</p></>}
        <Link to="/xp#standings" className="pd-view-all">XP leaderboard <ArrowRight /></Link>
      </section>
      <section className="pd-panel pd-about"><Heading title="About me" /><p>{profile?.bio || "This player hasn't added a bio yet."}</p><dl><div><dt>Member since</dt><dd>{new Date(profile?.account_created_date || user.account_created_date || user.created_date).toLocaleDateString()}</dd></div><div><dt>Region</dt><dd>{profile?.country || user.region || "Not set"}</dd></div></dl></section>
    </aside>
    <div className="pd-main"><TrophyShelf trophies={recentTrophies} loading={trophiesLoading} error={trophiesError} onViewAll={() => onTab("trophies")} /><ProfileFriends {...friends} loading={friendsLoading} onManageRequests={canManageFriends ? () => onTab("friends") : undefined} onViewAll={() => onTab("friends")} />
      <div className="pd-columns"><div className="pd-column"><FeaturedTeams teams={teams} userId={user.id} loading={teamsLoading} onViewAll={() => onTab("teams")} /><RecentArenaMatches matches={arena?.recent_matches} userId={user.id} loading={arenaLoading} error={arenaError} onViewAll={() => onTab("matches")} /></div><ArenaRecords data={arena} loading={arenaLoading} error={arenaError} onRetry={onRetry} screenshotRank={user.screenshot_rank} /></div>
    </div>
  </div>;
}
