import { trophyAssets } from "@/lib/trophyAssets";
import React, { useContext, useLayoutEffect, useMemo, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  CalendarDays,
  Clock3,
  Coins,
  DollarSign,
  Flame,
  Gamepad2,
  Medal,
  ShieldCheck,
  Sparkles,
  Trophy,
  Users,
  Zap,
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import useCompetitionLeaderboard, { leaderboardQueryOptions, useLeaderboardAvatars } from "@/hooks/useCompetitionLeaderboard";
import { useAuth } from "@/lib/AuthContext";
import TrophyCounts from "@/components/ui/TrophyCounts";
import PlayerAvatarImage from "@/components/ui/PlayerAvatarImage";
import TPRankBadge, { TPRankGuide } from "./TPRankBadge";
import LeaderboardPagination from "@/components/ui/LeaderboardPagination";
import { useLeaderboardPagination } from "@/hooks/useLeaderboardPagination";
import { buildFreeEightsStandings } from "@/lib/freeEightsStandings";
import { CompetitionHeaderContext } from "./CompetitionHeaderContext";
import CompetitionHero from "./CompetitionHero";
import PlayPreparation from "./PlayPreparation";
import { competitionTheme } from "@/lib/competitionPresentation";
import { monthlyEightsPrizeLabel, publicCommerceEnabled } from "@/lib/commerce";
import CommercePausedNotice from "@/components/commerce/CommercePausedNotice";

const navigation = [
  { key: "ranked", label: "Ranked", to: "/ranked", icon: Medal },
  { key: "eights", label: "Free 8s", to: "/ranked/8s", icon: Users },
  { key: "money8s", label: "Money 8s", to: "/ranked/8s?mode=money", icon: DollarSign },
  { key: "xp", label: "XP Matches", to: "/xp", icon: Zap },
  { key: "challenge", label: "Challenge a Team", to: "/challenge-a-team", icon: ShieldCheck },
  { key: "wagers", label: "Cash Matches", to: "/wagers", icon: Coins },
  { key: "tournaments", label: "Tournaments", to: "/tournaments", icon: Trophy },
];

const modeCopy = {
  ranked: {
    eyebrow: "Ranked competition",
    title: "Ranked",
    description: "Create or accept ranked matches and climb the ELO ladder.",
    accent: "text-cyan",
    line: "bg-cyan",
  },
  xp: {
    eyebrow: "XP competition ladder",
    title: "XP Matches",
    description: "Play 1v1 to 4v4. Beat stronger teams for more XP; losing to weaker teams costs more.",
    accent: "text-purple-300",
    line: "bg-purple-400",
  },
  wagers: {
    eyebrow: "Cash competition ladder",
    title: "Cash Matches",
    description: "Post a cash match, accept a challenge and climb the cash standings.",
    accent: "text-green",
    line: "bg-green",
  },
  eights: {
    eyebrow: "Free 8s ELO ladder",
    title: "Free 8s",
    description: "Join solo for 2v2, 3v3 or 4v4 with balanced teams and climb the same 8s ELO standings.",
    accent: "text-blue-300",
    line: "bg-blue-400",
  },
  money8s: {
    eyebrow: "Money 8s ladder",
    title: "Money 8s",
    description: "Play for the pot, track your winnings and climb the Money 8s standings.",
    accent: "text-green",
    line: "bg-green",
  },
  tournaments: {
    eyebrow: "Tournament center",
    title: "Upcoming Tournaments",
    description: "Choose an upcoming event, enter with your team and follow every bracket.",
    accent: "text-amber-300",
    line: "bg-amber-400",
  },
};

const trophyTypes = [
  { key: "gold", label: "Gold", image: trophyAssets.gold, fields: ["gold_count"] },
  { key: "silver", label: "Silver", image: trophyAssets.silver, fields: ["silver_count"] },
  { key: "bronze", label: "Bronze", image: trophyAssets.bronze, fields: ["bronze_count"] },
  { key: "premium", label: "Premium", image: trophyAssets.premium, fields: ["premium_count", "premium_trophies"] },
];

const number = (value) => Number(value || 0);
const playerName = (user, row) => user?.display_name || user?.username || user?.full_name || row?.username || row?.user_name || "Player";
const playerSlug = (user, row) => user?.username || user?.handle || row?.username || row?.user_id || user?.id || "";
const monthLabel = () => new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(new Date());
const trophyCount = (user) => {
  const detailed = trophyTypes.reduce((sum, trophy) => {
    const value = trophy.fields.reduce((best, field) => Math.max(best, number(user?.[field])), 0);
    return sum + value;
  }, 0);
  return Math.max(detailed, number(user?.trophies));
};

const pct = (wins, losses) => {
  const total = number(wins) + number(losses);
  return total ? `${((number(wins) / total) * 100).toFixed(1)}%` : "0.0%";
};

const formatDate = (value) => {
  if (!value) return "To be announced";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "To be announced";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(date);
};

function rankTone(index) {
  if (index === 0) return "text-yellow-300";
  if (index === 1) return "text-slate-200";
  if (index === 2) return "text-orange";
  return "text-vapor";
}

export function CompetitionHeader(props) {
  const registerHeader = useContext(CompetitionHeaderContext);
  const { pathname, search } = useLocation();
  const { mode, playerCount, action, className, titleOverride, eyebrowOverride, descriptionOverride, gameId, headerIntro } = props;
  useLayoutEffect(() => {
    if (registerHeader) registerHeader(`${pathname}${search}`, { mode, playerCount, action, className, titleOverride, eyebrowOverride, descriptionOverride, gameId, headerIntro });
  }, [registerHeader, pathname, search, mode, playerCount, action, className, titleOverride, eyebrowOverride, descriptionOverride, gameId, headerIntro]);
  return registerHeader ? null : <>{headerIntro}<CompetitionHeaderView {...props} /></>;
}

export function CompetitionHeaderView({ mode = "xp", playerCount, action, className = "", titleOverride, eyebrowOverride, descriptionOverride, gameId }) {
  const { pathname, search } = useLocation();
  const withinPlay = ["/ranked", "/xp", "/wagers", "/ranked/8s"].includes(pathname);
  const isMw4 = mode === "eights" && gameId === "mw4";
  const copy = isMw4 ? { ...modeCopy.eights, accent: "text-yellow-400", line: "bg-yellow-400" } : modeCopy[mode] || competitionTheme(mode);
  const headerImage = isMw4 ? "/assets/mw4/hero.webp" : "/assets/competition/play-hero.png";

  return (
    <div className={`space-y-6 ${className}`}>
      <CompetitionHero mode={mode} gameId={gameId} title={titleOverride || copy.title} eyebrow={eyebrowOverride || copy.eyebrow} description={descriptionOverride || copy.description} artwork={headerImage} action={action} count={playerCount} countLabel={mode === "tournaments" ? "events" : "players"} />

      <nav className="competition-mode-nav" aria-label="Competition modes">
        {navigation.map(({ key, label, to, icon: Icon }) => {
          const active = key === mode;
          return (
            <Link
              key={key}
              to={key === "tournaments" && withinPlay ? `${pathname}${search}#upcoming-tournaments` : to}
              state={{ preserveCompetitionScroll: true }}
              aria-current={active ? "page" : undefined}
              data-competition={key}
              className="competition-mode-link"
            >
              <span className="competition-nav-icon"><Icon size={19} /></span><span>{label}</span>
            </Link>
          );
        })}
      </nav>
      <PlayPreparation mode={mode} />
    </div>
  );
}

export default function CompetitionLadder({ mode = "xp", currentUser, openCount = 0, action, matchfinder, headerTitle, headerEyebrow, headerDescription, gameId = "bo7", competitionTitle, headerIntro }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user: authenticatedUser } = useAuth();
  const { users, xpRows, rankedRows, eightsRows, moneyRows, tournaments, extraXPPending, loading, error, retry } = useCompetitionLeaderboard(mode, gameId);
  const standingsRef = useRef(null);
  const copy = mode === "eights" && gameId === "mw4" ? { ...modeCopy.eights, accent: "text-yellow-400", line: "bg-yellow-400" } : modeCopy[mode] || modeCopy.xp;
  const activeTab = location.hash === "#matchfinder" ? "matchfinder" : "standings";
  const selectTab = (tab) => navigate(`${location.pathname}${location.search}#${tab}`);
  const standingColumns = mode === "eights"
    ? "grid-cols-[70px_minmax(220px,1fr)_55px_55px_85px_85px_190px_100px]"
    : mode === "xp"
      ? "grid-cols-[70px_minmax(220px,1fr)_85px_55px_55px_85px_85px_90px_190px]"
      : "grid-cols-[70px_minmax(220px,1fr)_55px_55px_85px_85px_90px_190px_100px]";

  const usersById = useMemo(() => new Map(users.map((user) => [String(user.id), user])), [users]);
  const xpByUser = useMemo(() => new Map(xpRows.map((row) => [String(row.user_id), row])), [xpRows]);

  const standings = useMemo(() => {
    if (mode === "wagers") {
      const competitive = users.filter((user) => number(user.wager_wins) + number(user.wager_losses) + number(user.total_wager_earnings) > 0);
      return competitive
        .map((user) => ({
          id: user.id,
          userId: user.id,
          user,
          name: playerName(user),
          slug: playerSlug(user),
          wins: number(user.wager_wins),
          losses: number(user.wager_losses),
          streak: number(user.current_win_streak),
          xp: extraXPPending ? null : number(xpByUser.get(String(user.id))?.total_xp),
          score: number(user.total_wager_earnings),
          trophies: trophyCount(user),
        }))
        .sort((a, b) => b.score - a.score || b.wins - a.wins || b.xp - a.xp);
    }

    if (mode === "eights") {
      return buildFreeEightsStandings(eightsRows, usersById, eightsRows.length);
    }

    if (mode === "money8s") {
      return moneyRows
        .map((row) => {
          const user = usersById.get(String(row.user_id));
          return {
            id: row.user_id,
            userId: row.user_id,
            user,
            name: playerName(user, row),
            slug: playerSlug(user, row),
            wins: number(row.wins),
            losses: number(row.losses),
            streak: 0,
            xp: extraXPPending ? null : number(xpByUser.get(String(row.user_id))?.total_xp),
            score: number(row.winnings),
            trophies: trophyCount(user),
          };
        })
        .sort((a, b) => b.score - a.score || b.wins - a.wins || a.losses - b.losses);
    }

    if (mode === "xp") {
      return xpRows
        .map((xp) => {
          const user = usersById.get(String(xp.user_id));
          return {
            id: xp.id || xp.user_id,
            userId: xp.user_id,
            user,
            name: playerName(user, xp),
            slug: playerSlug(user, xp),
            wins: number(xp.wins),
            losses: number(xp.losses),
            streak: number(xp.win_streak),
            tpRank: xp.tp_rank,
            xp: number(xp.total_xp),
            score: number(xp.total_xp),
            trophies: trophyCount(user),
          };
        });
    }

    const rowsByUser = new Map(rankedRows.map((row) => [String(row.user_id), row]));
    const ids = new Set(rankedRows.map((row) => String(row.user_id)));
    return [...ids]
      .map((id) => {
        const row = rowsByUser.get(id) || {};
        const user = usersById.get(id);
        return {
          id: row.id || id,
          userId: id,
          user,
          name: playerName(user, row),
          slug: playerSlug(user, row),
          wins: number(row.wins),
          losses: number(row.losses),
          streak: number(row.win_streak ?? user?.current_win_streak),
          xp: 0,
          score: number(row.elo),
          trophies: trophyCount(user),
        };
      })
      .filter((row) => row.wins + row.losses + row.xp + row.score > 0)
      .sort((a, b) => b.xp - a.xp || b.wins - a.wins || b.score - a.score);
  }, [eightsRows, mode, moneyRows, rankedRows, users, usersById, xpByUser, xpRows, extraXPPending]);

  const pagination = useLeaderboardPagination(standings, `${mode}:${gameId}`);
  const changePage = (page) => {
    pagination.setPage(page);
    window.requestAnimationFrame(() => standingsRef.current?.scrollIntoView({ block: "start", behavior: "auto" }));
  };
  const paginationProps = { page: pagination.page, pageCount: pagination.pageCount, total: pagination.total, onPageChange: changePage };
  const standingsUserIds = useMemo(() => pagination.visibleRows.map((row) => String(row.userId || "")).filter(Boolean).join("|"), [pagination.visibleRows]);
  const playerAvatars = useLeaderboardAvatars(standingsUserIds.split("|"), activeTab === "standings");

  const trophyQuery = useQuery({
    ...leaderboardQueryOptions,
    queryKey: ["leaderboard-trophies", authenticatedUser?.id, standingsUserIds],
    queryFn: async () => (await base44.functions.invoke("getCompetitionTrophyCounts", { user_ids: standingsUserIds.split("|") })).data?.counts || {},
    enabled: Boolean(authenticatedUser?.id && standingsUserIds && activeTab === "standings"),
  });
  const leaderboardTrophies = trophyQuery.data || {};
  const me = { ...(usersById.get(String(currentUser?.id)) || {}), ...(currentUser || {}) };
  const nextTournament = tournaments
    .slice()
    .sort((a, b) => new Date(a.start_date || 8640000000000000) - new Date(b.start_date || 8640000000000000))[0];
  const totalScore = standings.reduce((sum, row) => sum + row.score, 0);
  const hasPremium = Boolean(me?.is_premium && (!me?.premium_expires || new Date(me.premium_expires) > new Date()));

  const summary = mode === "wagers" ? [
    { label: "Open cash matches", value: openCount, detail: "Ready to accept", icon: Gamepad2, tone: "text-cyan" },
    { label: "Your wallet", value: `$${number(me?.wallet_balance).toFixed(2)}`, detail: "Available balance", icon: Coins, tone: "text-green" },
    { label: "Account", value: hasPremium ? "Premium" : "Standard", detail: `${hasPremium ? 5 : 10}% platform fee`, icon: ShieldCheck, tone: "text-cyan" },
    { label: "Ladder winnings", value: `$${totalScore.toLocaleString()}`, detail: `${standings.length} ranked players`, icon: Trophy, tone: "text-green" },
    { label: "Next tournament", value: formatDate(nextTournament?.start_date), detail: nextTournament?.name || "No event announced", icon: CalendarDays, tone: "text-orange" },
  ] : mode === "eights" ? [
    gameId === "bo7" ? { label: "Monthly prize", value: monthlyEightsPrizeLabel, detail: publicCommerceEnabled ? "Winner takes the prize" : "Virtual reward · No cash value", icon: Trophy, tone: "text-green" } : { label: "Formats", value: "2v2 / 3v3 / 4v4", detail: "Free entry", icon: Trophy, tone: "text-green" },
    { label: "Open lobbies", value: openCount, detail: "2v2 / 3v3 / 4v4", icon: Gamepad2, tone: "text-cyan" },
    { label: "Players", value: standings.length, detail: "On the 8s ELO ladder", icon: Users, tone: "text-purple-300" },
    { label: gameId === "bo7" ? "Prize month" : "Season", value: monthLabel(), detail: gameId === "bo7" ? "Monthly prize period" : "Separate game standings", icon: Clock3, tone: "text-orange" },
  ] : mode === "money8s" ? [
    { label: "Money 8s matches", value: standings.reduce((sum, row) => sum + row.wins + row.losses, 0), detail: "Completed matches", icon: Gamepad2, tone: "text-cyan" },
    { label: "Players", value: standings.length, detail: "On the Money 8s ladder", icon: Users, tone: "text-purple-300" },
    { label: "Total winnings", value: `$${totalScore.toFixed(2)}`, detail: "Prize money won", icon: DollarSign, tone: "text-green" },
    { label: "Prize format", value: "8-player pot", detail: "Wallet-backed matches", icon: Trophy, tone: "text-orange" },
  ] : [
    { label: "Total XP", value: standings.reduce((sum, row) => sum + row.xp, 0).toLocaleString(), detail: "Across the XP ladder", icon: Sparkles, tone: "text-purple-300" },
    { label: "Open matches", value: openCount, detail: "Ready to join", icon: Gamepad2, tone: "text-cyan" },
    { label: "Players", value: standings.length, detail: "On the XP ladder", icon: Users, tone: "text-green" },
    { label: "Next tournament", value: formatDate(nextTournament?.start_date), detail: nextTournament?.name || "No event announced", icon: CalendarDays, tone: "text-orange" },
  ];

  return (
    <div className="competition-ladder mb-7 space-y-5" data-competition={mode} data-game={gameId}>
      <CompetitionHeader mode={mode} gameId={gameId} playerCount={loading ? null : standings.length} action={action} titleOverride={headerTitle} eyebrowOverride={headerEyebrow} descriptionOverride={headerDescription} headerIntro={headerIntro} />
      {!publicCommerceEnabled && ["wagers", "money8s", "tournaments", "eights"].includes(mode) && <CommercePausedNotice compact />}

      <div className={`grid gap-3 sm:grid-cols-2 ${mode === "wagers" ? "xl:grid-cols-5" : "xl:grid-cols-4"}`}>
        {summary.map(({ label, value, detail, icon: Icon, tone }) => (
          <div key={label} data-tone={tone.includes("green") ? "green" : tone.includes("purple") ? "purple" : tone.includes("orange") ? "gold" : "cyan"} className="competition-stat-card premium-card flex min-h-[82px] items-center gap-4 rounded-xl border border-white/[0.07] p-4">
            <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-white/[0.035] ${tone}`}><Icon className="h-5 w-5" /></div>
            <div className="min-w-0"><p className="text-[8px] font-black uppercase tracking-[0.2em] text-vapor">{label}</p><p className={`mt-1 truncate font-mono text-lg font-black ${tone}`}>{value}</p><p className="mt-0.5 truncate text-[9px] text-vapor/75">{detail}</p></div>
          </div>
        ))}
      </div>

      <section ref={standingsRef} id={activeTab} className="competition-ladder-panel leaderboard-surface" style={mode === "eights" && gameId === "mw4" ? { "--ladder-accent": "#facc15" } : undefined}>
        <div className="flex flex-col gap-4 border-b border-white/[0.07] px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div><div className="flex items-center gap-2"><span className={`h-2 w-2 ${copy.line}`} /><h2 className="font-black">{competitionTitle || copy.title} {activeTab === "matchfinder" ? "matchfinder" : "standings"}</h2></div><p className="mt-1 text-xs text-vapor">{activeTab === "matchfinder" ? `${openCount} open ${openCount === 1 ? "match" : "matches"} in this competition.` : mode === "eights" ? "Ranked by 8s ELO, highest first." : "A separate leaderboard for this competition."}</p></div>
          <div className="competition-section-tabs flex rounded-lg border border-white/[0.07] bg-black/15 p-1 text-[9px] font-black uppercase tracking-wider">
            <button type="button" onClick={() => selectTab("standings")} aria-pressed={activeTab === "standings"} className="rounded-md px-3 py-2 text-vapor"><Medal className="mr-1.5 inline h-3 w-3" /> Standings</button>
            <button type="button" onClick={() => selectTab("matchfinder")} aria-pressed={activeTab === "matchfinder"} className="rounded-md px-3 py-2 text-vapor"><Gamepad2 className="mr-1.5 inline h-3 w-3" /> Matchfinder</button>
            <Link to="/rules" className="rounded-md px-3 py-2 text-vapor hover:text-white"><ShieldCheck className="mr-1.5 inline h-3 w-3" /> Rules</Link>
          </div>
        </div>
        {error && <div role="alert" className="flex items-center justify-between gap-3 border-b border-red-400/20 bg-red-500/5 px-5 py-3 text-xs text-red-200"><span>The latest standings could not be loaded.</span><button type="button" onClick={retry} className="font-bold text-cyan">Try again</button></div>}
        {mode === "xp" && activeTab === "standings" && <TPRankGuide />}
        {activeTab === "standings" && !loading && standings.length > 0 && <LeaderboardPagination {...paginationProps} compact />}
        {activeTab === "matchfinder" ? matchfinder : <div className="overflow-x-auto">
          <div className={mode === "eights" ? "min-w-[980px]" : "min-w-[1080px]"}>
            <div className={`grid ${standingColumns} gap-3 border-b border-white/[0.06] bg-white/[0.015] px-5 py-3 text-[8px] font-black uppercase tracking-[0.16em] text-vapor`}>
              <span>Rank</span><span>Player</span>{mode === "xp" && <span className="text-center">TP RANK</span>}<span className="text-center">W</span><span className="text-center">L</span><span className="text-center">Win %</span><span className="text-center">Streak</span>{mode !== "eights" && <span className="text-center">XP</span>}<span>Trophies</span>{mode !== "xp" && <span className="text-right">{mode === "wagers" || mode === "money8s" ? "Winnings" : mode === "eights" ? "8s ELO" : "ELO"}</span>}
            </div>
            {loading ? (
              <div className="space-y-px" aria-label={`Loading ${copy.title} standings`}>
                {[0, 1, 2, 3, 4].map((item) => (
                  <div key={item} className={`grid min-h-[52px] ${standingColumns} items-center gap-3 border-b border-white/[0.035] px-5`}>
                    <span className="h-2 w-5 rounded-full bg-white/[0.055]" />
                    <span className="h-2.5 w-32 rounded-full bg-white/[0.055]" />
                    {Array.from({ length: mode === "eights" ? 6 : 7 }, (_, cell) => <span key={cell} className="mx-auto h-2 w-7 rounded-full bg-white/[0.045]" />)}
                  </div>
                ))}
              </div>
            ) : standings.length === 0 ? <div className="px-5 py-12 text-center text-sm text-vapor">The standings begin when the first match is completed.</div> : pagination.visibleRows.map((row, index) => (
              <div key={row.id} data-podium={pagination.offset + index < 3 ? pagination.offset + index + 1 : undefined} data-self={String(row.userId) === String(currentUser?.id) || undefined} className={`competition-standing-row grid min-h-[66px] ${standingColumns} items-center gap-3 border-b border-white/[0.045] px-5 py-3 text-xs transition-colors`}>
                <span className={`font-mono font-black ${rankTone(pagination.offset + index)}`}>{pagination.offset + index < 3 ? <Trophy className="mr-2 inline h-3.5 w-3.5" /> : null}#{pagination.offset + index + 1}</span>
                <Link to={`/profile/${row.slug}`} className="flex min-w-0 items-center gap-3 font-bold text-white hover:text-cyan"><span className="leaderboard-avatar"><PlayerAvatarImage user={row.user} src={playerAvatars[row.userId] || row.user?.avatar_url} /></span><span data-name-effect={row.user?.display_name_color || undefined} style={row.user?.display_name_color ? { "--player-name-color": row.user.display_name_color } : undefined} className={`player-name-wrap ${row.user?.display_name_color ? "player-name-color" : ""}`}>{row.name}</span></Link>
                {mode === "xp" && <span className="text-center"><TPRankBadge xp={row.tpRank?.xp} matchesPlayed={row.tpRank?.matchesPlayed} position={row.tpRank?.position} loading={!row.tpRank} /></span>}
                <span className="text-center font-mono font-black text-green">{row.wins}</span>
                <span className="text-center font-mono font-black text-red-400">{row.losses}</span>
                <span className="text-center font-mono font-black text-white">{pct(row.wins, row.losses)}</span>
                <span className="text-center font-mono font-black"><Flame className="mr-1 inline h-3.5 w-3.5 text-orange" />{row.streak}</span>
                {mode !== "eights" && <span className="text-center font-mono font-black text-purple-300">{row.xp === null ? "—" : row.xp.toLocaleString()}</span>}
                <TrophyCounts
                  trophies={{
                    gold: number(row.user?.gold_count) + number(leaderboardTrophies[row.userId]?.gold),
                    silver: number(row.user?.silver_count) + number(leaderboardTrophies[row.userId]?.silver),
                    bronze: number(row.user?.bronze_count) + number(leaderboardTrophies[row.userId]?.bronze),
                    premium: number(row.user?.premium_count ?? row.user?.premium_trophies) + number(leaderboardTrophies[row.userId]?.premium),
                  }}
                  className="flex-nowrap"
                />
                {mode !== "xp" && <span className={`text-right font-mono font-black ${mode === "wagers" || mode === "money8s" ? "text-green" : "text-cyan"}`}>{mode === "wagers" || mode === "money8s" ? `$${row.score.toFixed(2)}` : row.score.toLocaleString()}</span>}
              </div>
            ))}
          </div>
        </div>}
        {activeTab === "standings" && !loading && standings.length > 0 && <LeaderboardPagination {...paginationProps} />}
      </section>
    </div>
  );
}

