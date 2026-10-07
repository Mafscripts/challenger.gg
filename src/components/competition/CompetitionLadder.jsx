import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  CalendarDays,
  ChevronRight,
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
import TrophyCounts from "@/components/ui/TrophyCounts";

const navigation = [
  { key: "ranked", label: "Ranked", to: "/ranked", icon: Medal },
  { key: "xp", label: "XP Matches", to: "/xp", icon: Zap },
  { key: "wagers", label: "Wagers", to: "/wagers", icon: Coins },
  { key: "eights", label: "8s", to: "/ranked/8s", icon: Users },
  { key: "money8s", label: "Money 8s", to: "/ranked/8s?mode=money", icon: DollarSign },
  { key: "tournaments", label: "Upcoming Tournaments", to: "/tournaments", icon: Trophy },
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
    description: "Create a match, find an opponent and climb the XP standings.",
    accent: "text-cyan",
    line: "bg-cyan",
  },
  wagers: {
    eyebrow: "Cash competition ladder",
    title: "Wagers",
    description: "Post a wager, accept a challenge and climb the cash standings.",
    accent: "text-green",
    line: "bg-green",
  },
  eights: {
    eyebrow: "Monthly 8s ladder",
    title: "8s",
    description: "Join solo, get shuffled into a 4v4 team and climb the monthly standings.",
    accent: "text-orange",
    line: "bg-orange",
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
    accent: "text-orange",
    line: "bg-orange",
  },
};

const competitionBulletImpacts = [
  { left: "61%", top: "17%", size: "25px", delay: ".25s", rotate: "-8deg" },
  { left: "69%", top: "29%", size: "34px", delay: ".85s", rotate: "12deg" },
  { left: "87%", top: "19%", size: "22px", delay: "1.45s", rotate: "36deg" },
  { left: "82%", top: "41%", size: "27px", delay: "2.05s", rotate: "-18deg" },
  { left: "67%", top: "55%", size: "20px", delay: "2.65s", rotate: "18deg" },
  { left: "74%", top: "69%", size: "31px", delay: "3.25s", rotate: "29deg" },
  { left: "92%", top: "65%", size: "23px", delay: "3.85s", rotate: "-33deg" },
  { left: "86%", top: "84%", size: "19px", delay: "4.45s", rotate: "7deg" },
];

const trophyTypes = [
  { key: "gold", label: "Gold", image: "/assets/trophies/compact/gold.png", fields: ["gold_count"] },
  { key: "silver", label: "Silver", image: "/assets/trophies/compact/silver.png", fields: ["silver_count"] },
  { key: "bronze", label: "Bronze", image: "/assets/trophies/compact/bronze.png", fields: ["bronze_count"] },
  { key: "premium", label: "Premium", image: "/assets/trophies/compact/premium.png", fields: ["premium_count", "premium_trophies"] },
  { key: "topfragg", label: "TopFragg", image: "/assets/trophies/compact/topfragg.png", fields: ["topfragg_count", "topfrag_count", "topfragg_trophies"] },
  { key: "hosted", label: "Hosted", image: "/assets/trophies/compact/hosted.png", fields: ["hosted_count", "hosted_trophies"] },
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

export function CompetitionHeader({ mode = "xp", playerCount = 0, action, className = "", titleOverride, eyebrowOverride, descriptionOverride }) {
  const copy = modeCopy[mode] || modeCopy.xp;
  const headerImage = "/assets/competition/play-hero.png";
  const headerHeight = "min-h-[350px] lg:min-h-[370px]";
  return (
    <div className={`space-y-5 ${className}`}>
      <section className={`premium-panel relative overflow-hidden rounded-2xl border border-white/[0.07] ${headerHeight}`}>
        <img src={headerImage} alt="" className="absolute inset-0 h-full w-full object-cover object-[center_34%] opacity-90" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,hsl(var(--background)/0.96)_0%,hsl(var(--background)/0.76)_23%,hsl(var(--background)/0.12)_44%,transparent_72%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(0deg,hsl(var(--background)/0.42)_0%,transparent_48%)]" />
        <div className="landing-bullet-field absolute inset-0 z-[5]" aria-hidden="true">
          {competitionBulletImpacts.map((impact, index) => (
            <span
              key={`${impact.left}-${impact.top}`}
              className="landing-bullet-hole"
              style={{
                left: impact.left,
                top: impact.top,
                width: impact.size,
                height: impact.size,
                "--impact-delay": impact.delay,
                "--impact-rotation": impact.rotate,
                "--impact-index": index,
              }}
            />
          ))}
        </div>
        <div className={`relative z-10 grid gap-8 p-7 md:p-9 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end ${headerHeight}`}>
          <div>
            <div className={`flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.28em] ${copy.accent}`}><span className={`h-1.5 w-1.5 ${copy.line}`} /> {eyebrowOverride || copy.eyebrow}</div>
            <h1 className="mt-4 max-w-xl font-heading text-4xl font-black uppercase leading-none text-white drop-shadow-[0_4px_18px_rgba(0,0,0,.75)] sm:text-5xl">{titleOverride || copy.title}</h1>
            <p className="mt-4 max-w-xl text-sm leading-6 text-white/75">{descriptionOverride || copy.description}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              <span className="rounded-md border border-white/15 bg-background/55 px-3 py-2 text-[9px] font-black uppercase tracking-[0.14em] text-vapor backdrop-blur-sm">Cross platform</span>
              <span className="rounded-md border border-white/15 bg-background/55 px-3 py-2 text-[9px] font-black uppercase tracking-[0.14em] text-vapor backdrop-blur-sm">{monthLabel()}</span>
              <span className="rounded-md border border-white/15 bg-background/55 px-3 py-2 text-[9px] font-black uppercase tracking-[0.14em] text-vapor backdrop-blur-sm">{playerCount} {mode === "tournaments" ? "events" : "players"}</span>
            </div>
          </div>
          {action && (
            <div className="w-full [&_a]:h-16 [&_a]:w-full [&_a]:rounded-xl [&_a]:shadow-[0_10px_30px_rgba(0,0,0,.4)] [&_button]:h-16 [&_button]:w-full [&_button]:rounded-xl [&_button]:shadow-[0_10px_30px_rgba(0,0,0,.4)] lg:w-[320px]">
              {action}
            </div>
          )}
        </div>
      </section>

      <nav className="grid overflow-hidden rounded-xl border border-white/[0.08] bg-card sm:grid-cols-2 lg:grid-cols-6">
        {navigation.map(({ key, label, to, icon: Icon }) => {
          const active = key === mode;
          return (
            <Link
              key={key}
              to={to}
              aria-current={active ? "page" : undefined}
              className={`relative flex min-h-14 items-center justify-center gap-2 border-b border-white/[0.06] px-4 py-4 text-xs font-black transition-colors sm:border-r lg:border-b-0 ${active ? "bg-secondary text-white" : "text-vapor hover:bg-secondary/70 hover:text-white"}`}
            >
              <Icon className={`h-4 w-4 ${active ? copy.accent : ""}`} /> {label}
              {active && <span className={`absolute inset-x-0 bottom-0 h-0.5 ${copy.line}`} />}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

export default function CompetitionLadder({ mode = "xp", currentUser, openCount = 0, action, matchfinder, headerTitle, headerEyebrow, headerDescription }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [xpRows, setXpRows] = useState([]);
  const [rankedRows, setRankedRows] = useState([]);
  const [eightsRows, setEightsRows] = useState([]);
  const [moneyRows, setMoneyRows] = useState([]);
  const [tournaments, setTournaments] = useState([]);
  const [leaderboardTrophies, setLeaderboardTrophies] = useState({});
  const [loading, setLoading] = useState(true);
  const copy = modeCopy[mode] || modeCopy.xp;
  const activeTab = location.hash === "#matchfinder" ? "matchfinder" : "standings";
  const selectTab = (tab) => navigate(`${location.pathname}${location.search}#${tab}`);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      const [userData, xpData, rankedData, eightsData, moneyData, tournamentData] = await Promise.all([
        base44.entities.User.filter({}, mode === "wagers" ? "-total_wager_earnings" : "-created_date", 500).catch(() => []),
        base44.entities.XPStats.filter({}, "-total_xp", 500).catch(() => []),
        mode === "ranked" ? base44.entities.RankedStats.filter({}, "-elo", 500).catch(() => []) : Promise.resolve([]),
        mode === "eights" ? base44.entities.EightsStats.filter({}, "-monthly_wins", 500).catch(() => []) : Promise.resolve([]),
        mode === "money8s" ? base44.functions.invoke("getMoneyEightsStandings", {}).catch(() => ({ data: { rows: [] } })) : Promise.resolve({ data: { rows: [] } }),
        mode === "eights" ? Promise.resolve([]) : base44.entities.Tournament.filter({}, "start_date", 100).catch(() => []),
      ]);
      if (!active) return;
      setUsers(userData || []);
      setXpRows(xpData || []);
      setRankedRows(rankedData || []);
      setEightsRows(eightsData || []);
      setMoneyRows(moneyData?.data?.rows || []);
      setTournaments((tournamentData || []).filter((row) => ["open", "registration"].includes(row.status)));
      setLoading(false);
    };
    load();
    return () => { active = false; };
  }, [mode]);

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
          xp: number(xpByUser.get(String(user.id))?.total_xp),
          score: number(user.total_wager_earnings),
          trophies: trophyCount(user),
        }))
        .sort((a, b) => b.score - a.score || b.wins - a.wins || b.xp - a.xp)
        .slice(0, 50);
    }

    if (mode === "eights") {
      const currentMonth = new Date().toISOString().slice(0, 7);
      return eightsRows
        .filter((row) => !row.monthly_key || row.monthly_key === currentMonth)
        .map((row) => {
          const user = usersById.get(String(row.user_id));
          return {
            id: row.id || row.user_id,
            userId: row.user_id,
            user,
            name: playerName(user, row),
            slug: playerSlug(user, row),
            wins: number(row.monthly_wins ?? row.wins),
            losses: number(row.monthly_losses ?? row.losses),
            streak: number(row.win_streak ?? user?.current_win_streak),
            xp: number(row.monthly_xp ?? xpByUser.get(String(row.user_id))?.total_xp),
            score: number(row.rating || 1000),
            trophies: trophyCount(user),
          };
        })
        .sort((a, b) => b.wins - a.wins || b.xp - a.xp || b.score - a.score)
        .slice(0, 50);
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
            xp: number(xpByUser.get(String(row.user_id))?.total_xp),
            score: number(row.winnings),
            trophies: trophyCount(user),
          };
        })
        .sort((a, b) => b.score - a.score || b.wins - a.wins || a.losses - b.losses)
        .slice(0, 50);
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
            xp: number(xp.total_xp),
            score: number(xp.total_xp),
            trophies: trophyCount(user),
          };
        })
        .filter((row) => row.wins + row.losses + row.xp > 0)
        .sort((a, b) => b.xp - a.xp || b.wins - a.wins)
        .slice(0, 50);
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
      .sort((a, b) => b.xp - a.xp || b.wins - a.wins || b.score - a.score)
      .slice(0, 50);
  }, [eightsRows, mode, moneyRows, rankedRows, users, usersById, xpByUser, xpRows]);

  const standingsUserIds = useMemo(() => standings.map((row) => String(row.userId || "")).filter(Boolean).join("|"), [standings]);

  useEffect(() => {
    let active = true;
    const userIds = standingsUserIds ? standingsUserIds.split("|") : [];
    if (!userIds.length) {
      setLeaderboardTrophies({});
      return () => { active = false; };
    }

    base44.functions.invoke("getCompetitionTrophyCounts", { user_ids: userIds })
      .then((response) => {
        if (active) setLeaderboardTrophies(response.data?.counts || {});
      })
      .catch(() => {
        if (active) setLeaderboardTrophies({});
      });

    return () => { active = false; };
  }, [standingsUserIds]);

  const me = { ...(usersById.get(String(currentUser?.id)) || {}), ...(currentUser || {}) };
  const nextTournament = tournaments
    .slice()
    .sort((a, b) => new Date(a.start_date || 8640000000000000) - new Date(b.start_date || 8640000000000000))[0];
  const totalScore = standings.reduce((sum, row) => sum + row.score, 0);
  const hasPremium = Boolean(me?.is_premium && (!me?.premium_expires || new Date(me.premium_expires) > new Date()));

  const summary = mode === "wagers" ? [
    { label: "Open wagers", value: openCount, detail: "Ready to accept", icon: Gamepad2, tone: "text-cyan" },
    { label: "Your wallet", value: `$${number(me?.wallet_balance).toFixed(2)}`, detail: "Available balance", icon: Coins, tone: "text-green" },
    { label: "Account", value: hasPremium ? "Premium" : "Standard", detail: `${hasPremium ? 5 : 10}% platform fee`, icon: ShieldCheck, tone: "text-cyan" },
    { label: "Ladder winnings", value: `$${totalScore.toLocaleString()}`, detail: `${standings.length} ranked players`, icon: Trophy, tone: "text-green" },
    { label: "Next tournament", value: formatDate(nextTournament?.start_date), detail: nextTournament?.name || "No event announced", icon: CalendarDays, tone: "text-orange" },
  ] : mode === "eights" ? [
    { label: "Monthly prize", value: "$100", detail: "Winner takes the prize", icon: Trophy, tone: "text-green" },
    { label: "Open lobbies", value: openCount, detail: "4v4 random teams", icon: Gamepad2, tone: "text-cyan" },
    { label: "Players", value: standings.length, detail: "On this month's ladder", icon: Users, tone: "text-purple-300" },
    { label: "Season", value: monthLabel(), detail: "Monthly standings", icon: Clock3, tone: "text-orange" },
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
    <div className="mb-7 space-y-5">
      <CompetitionHeader mode={mode} playerCount={standings.length} action={action} titleOverride={headerTitle} eyebrowOverride={headerEyebrow} descriptionOverride={headerDescription} />

      <div className={`grid gap-3 sm:grid-cols-2 ${mode === "wagers" ? "xl:grid-cols-5" : "xl:grid-cols-4"}`}>
        {summary.map(({ label, value, detail, icon: Icon, tone }) => (
          <div key={label} className="premium-card flex min-h-[82px] items-center gap-4 rounded-xl border border-white/[0.07] p-4">
            <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-white/[0.035] ${tone}`}><Icon className="h-5 w-5" /></div>
            <div className="min-w-0"><p className="text-[8px] font-black uppercase tracking-[0.2em] text-vapor">{label}</p><p className={`mt-1 truncate font-mono text-lg font-black ${tone}`}>{value}</p><p className="mt-0.5 truncate text-[9px] text-vapor/75">{detail}</p></div>
          </div>
        ))}
      </div>

      <section id={activeTab} className="premium-panel scroll-mt-24 overflow-hidden rounded-xl border border-white/[0.08]">
        <div className="flex flex-col gap-3 border-b border-white/[0.07] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div><div className="flex items-center gap-2"><span className={`h-2 w-2 ${copy.line}`} /><h2 className="font-black">{activeTab === "matchfinder" ? `${copy.title} matchfinder` : `${copy.title} standings`}</h2></div><p className="mt-1 text-xs text-vapor">{activeTab === "matchfinder" ? `${openCount} open ${openCount === 1 ? "match" : "matches"} in this competition.` : "A separate leaderboard for this competition."}</p></div>
          <div className="flex rounded-lg border border-white/[0.07] bg-black/15 p-1 text-[9px] font-black uppercase tracking-wider">
            <button type="button" onClick={() => selectTab("standings")} className={`rounded-md px-3 py-2 ${activeTab === "standings" ? `${copy.accent} bg-white/[0.04]` : "text-vapor hover:text-white"}`}><Medal className="mr-1.5 inline h-3 w-3" /> Standings</button>
            <button type="button" onClick={() => selectTab("matchfinder")} className={`rounded-md px-3 py-2 ${activeTab === "matchfinder" ? `${copy.accent} bg-white/[0.04]` : "text-vapor hover:text-white"}`}><Gamepad2 className="mr-1.5 inline h-3 w-3" /> Matchfinder</button>
            <Link to="/rules" className="rounded-md px-3 py-2 text-vapor hover:text-white"><ShieldCheck className="mr-1.5 inline h-3 w-3" /> Rules</Link>
          </div>
        </div>
        {activeTab === "matchfinder" ? matchfinder : <div className="overflow-x-auto">
          <div className="min-w-[1080px]">
            <div className="grid grid-cols-[70px_minmax(220px,1fr)_55px_55px_85px_85px_90px_190px_100px] gap-3 border-b border-white/[0.06] bg-white/[0.015] px-5 py-3 text-[8px] font-black uppercase tracking-[0.16em] text-vapor">
              <span>Rank</span><span>Player</span><span className="text-center">W</span><span className="text-center">L</span><span className="text-center">Win %</span><span className="text-center">Streak</span><span className="text-center">XP</span><span>Trophies</span><span className="text-right">{mode === "wagers" || mode === "money8s" ? "Winnings" : mode === "eights" ? "Rating" : "ELO"}</span>
            </div>
            {loading ? (
              <div className="space-y-px" aria-label={`Loading ${copy.title} standings`}>
                {[0, 1, 2, 3, 4].map((item) => (
                  <div key={item} className="grid min-h-[52px] grid-cols-[70px_minmax(220px,1fr)_55px_55px_85px_85px_90px_190px_100px] items-center gap-3 border-b border-white/[0.035] px-5">
                    <span className="h-2 w-5 rounded-full bg-white/[0.055]" />
                    <span className="h-2.5 w-32 rounded-full bg-white/[0.055]" />
                    {[0, 1, 2, 3, 4, 5, 6].map((cell) => <span key={cell} className="mx-auto h-2 w-7 rounded-full bg-white/[0.045]" />)}
                  </div>
                ))}
              </div>
            ) : standings.length === 0 ? <div className="px-5 py-12 text-center text-sm text-vapor">The standings begin when the first match is completed.</div> : standings.map((row, index) => (
              <div key={row.id} className={`grid grid-cols-[70px_minmax(220px,1fr)_55px_55px_85px_85px_90px_190px_100px] items-center gap-3 border-b border-white/[0.045] px-5 py-3 text-xs transition-colors hover:bg-white/[0.02] ${String(row.userId) === String(currentUser?.id) ? "bg-cyan/[0.035]" : ""}`}>
                <span className={`font-mono font-black ${rankTone(index)}`}>{index < 3 ? <Trophy className="mr-2 inline h-3.5 w-3.5" /> : null}{index + 1}</span>
                <Link to={`/profile/${row.slug}`} className="flex min-w-0 items-center gap-3 font-bold text-white hover:text-cyan"><span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/[0.04] text-[10px] font-black">{row.user?.avatar_url ? <img src={row.user.avatar_url} alt="" className="h-full w-full object-cover" /> : row.name.charAt(0).toUpperCase()}</span><span data-name-effect={row.user?.display_name_color || undefined} style={row.user?.display_name_color ? { "--player-name-color": row.user.display_name_color } : undefined} className={`player-name-wrap ${row.user?.display_name_color ? "player-name-color" : ""}`}>{row.name}</span></Link>
                <span className="text-center font-mono font-black text-green">{row.wins}</span>
                <span className="text-center font-mono font-black text-red-400">{row.losses}</span>
                <span className="text-center font-mono font-black text-white">{pct(row.wins, row.losses)}</span>
                <span className="text-center font-mono font-black"><Flame className="mr-1 inline h-3.5 w-3.5 text-orange" />{row.streak}</span>
                <span className="text-center font-mono font-black text-purple-300">{row.xp.toLocaleString()}</span>
                <TrophyCounts
                  trophies={{
                    gold: number(row.user?.gold_count) + number(leaderboardTrophies[row.userId]?.gold),
                    silver: number(row.user?.silver_count) + number(leaderboardTrophies[row.userId]?.silver),
                    bronze: number(row.user?.bronze_count) + number(leaderboardTrophies[row.userId]?.bronze),
                    premium: number(row.user?.premium_count ?? row.user?.premium_trophies) + number(leaderboardTrophies[row.userId]?.premium),
                  }}
                  className="flex-nowrap"
                />
                <span className={`text-right font-mono font-black ${mode === "wagers" || mode === "money8s" ? "text-green" : "text-cyan"}`}>{mode === "wagers" || mode === "money8s" ? `$${row.score.toFixed(2)}` : row.score.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>}
        {activeTab === "standings" && standings.length > 0 && <div className="flex items-center justify-end px-5 py-3 text-[9px] font-black uppercase tracking-wider text-vapor">Top {standings.length} players <ChevronRight className="ml-1 h-3.5 w-3.5" /></div>}
      </section>
    </div>
  );
}

