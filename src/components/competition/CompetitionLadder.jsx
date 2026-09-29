import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  CalendarDays,
  ChevronRight,
  Clock3,
  Coins,
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

const navigation = [
  { key: "xp", label: "XP Matches", to: "/ranked", icon: Zap },
  { key: "wagers", label: "Wagers", to: "/wagers", icon: Coins },
  { key: "eights", label: "8s", to: "/ranked/8s", icon: Users },
  { key: "tournaments", label: "Upcoming Tournaments", to: "/tournaments", icon: Trophy },
];

const modeCopy = {
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
};

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
const emptyInventoryTrophies = () => ({ gold: 0, silver: 0, bronze: 0, premium: 0, topfragg: 0, hosted: 0 });

const countInventoryTrophies = (items = []) => {
  const counts = emptyInventoryTrophies();
  items.forEach((item) => {
    const text = [item.item_category, item.item_name, item.unlock_key, item.item_rarity, item.purchase_method]
      .filter(Boolean)
      .join(" ")
      .trim()
      .toLowerCase();
    if (item.item_category !== "trophy" && !text.includes("trophy")) return;

    if (text.includes("topfrag") || text.includes("topfragg")) counts.topfragg += 1;
    else if (text.includes("hosted") || text.includes("host trophy")) counts.hosted += 1;
    else if (text.includes("premium")) counts.premium += 1;
    else if (text.includes("gold")) counts.gold += 1;
    else if (text.includes("silver")) counts.silver += 1;
    else if (text.includes("bronze")) counts.bronze += 1;
    else if (["exclusive", "mythic"].includes(item.item_rarity)) counts.premium += 1;
    else if (["legendary", "epic"].includes(item.item_rarity)) counts.gold += 1;
    else if (item.item_rarity === "rare") counts.silver += 1;
    else counts.bronze += 1;
  });
  return counts;
};

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

export default function CompetitionLadder({ mode = "xp", currentUser, openCount = 0, action }) {
  const [users, setUsers] = useState([]);
  const [xpRows, setXpRows] = useState([]);
  const [rankedRows, setRankedRows] = useState([]);
  const [eightsRows, setEightsRows] = useState([]);
  const [tournaments, setTournaments] = useState([]);
  const [inventoryTrophies, setInventoryTrophies] = useState(emptyInventoryTrophies);
  const [loading, setLoading] = useState(true);
  const copy = modeCopy[mode] || modeCopy.xp;

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      const [userData, xpData, rankedData, eightsData, tournamentData] = await Promise.all([
        base44.entities.User.filter({}, mode === "wagers" ? "-total_wager_earnings" : "-created_date", 500).catch(() => []),
        base44.entities.XPStats.filter({}, "-total_xp", 500).catch(() => []),
        mode === "xp" ? base44.entities.RankedStats.filter({}, "-elo", 500).catch(() => []) : Promise.resolve([]),
        mode === "eights" ? base44.entities.EightsStats.filter({}, "-monthly_wins", 500).catch(() => []) : Promise.resolve([]),
        base44.entities.Tournament.filter({}, "start_date", 100).catch(() => []),
      ]);
      if (!active) return;
      setUsers(userData || []);
      setXpRows(xpData || []);
      setRankedRows(rankedData || []);
      setEightsRows(eightsData || []);
      setTournaments((tournamentData || []).filter((row) => ["open", "registration"].includes(row.status)));
      setLoading(false);
    };
    load();
    return () => { active = false; };
  }, [mode]);

  useEffect(() => {
    let active = true;
    if (!currentUser?.id) {
      setInventoryTrophies(emptyInventoryTrophies());
      return () => { active = false; };
    }

    base44.entities.UserInventory
      .filter({ user_id: currentUser.id }, "-acquired_date", 500)
      .then((items) => {
        if (active) setInventoryTrophies(countInventoryTrophies(items || []));
      })
      .catch(() => {
        if (active) setInventoryTrophies(emptyInventoryTrophies());
      });

    return () => { active = false; };
  }, [currentUser?.id]);

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

    const rowsByUser = new Map(rankedRows.map((row) => [String(row.user_id), row]));
    const ids = new Set([...rankedRows.map((row) => String(row.user_id)), ...xpRows.map((row) => String(row.user_id))]);
    return [...ids]
      .map((id) => {
        const row = rowsByUser.get(id) || {};
        const xp = xpByUser.get(id) || {};
        const user = usersById.get(id);
        return {
          id: row.id || xp.id || id,
          userId: id,
          user,
          name: playerName(user, row),
          slug: playerSlug(user, row),
          wins: number(row.wins),
          losses: number(row.losses),
          streak: number(row.win_streak ?? user?.current_win_streak),
          xp: number(xp.total_xp ?? xp.xp),
          score: number(row.elo),
          trophies: trophyCount(user),
        };
      })
      .filter((row) => row.wins + row.losses + row.xp + row.score > 0)
      .sort((a, b) => b.xp - a.xp || b.wins - a.wins || b.score - a.score)
      .slice(0, 50);
  }, [eightsRows, mode, rankedRows, users, usersById, xpByUser, xpRows]);

  const me = { ...(usersById.get(String(currentUser?.id)) || {}), ...(currentUser || {}) };
  const myXp = xpByUser.get(String(currentUser?.id)) || {};
  const myTrophies = trophyTypes.map((trophy) => ({
    ...trophy,
    value: trophy.fields.reduce((best, field) => Math.max(best, number(me?.[field])), 0) + number(inventoryTrophies[trophy.key]),
  }));
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
  ] : [
    { label: "Total XP", value: standings.reduce((sum, row) => sum + row.xp, 0).toLocaleString(), detail: "Across the XP ladder", icon: Sparkles, tone: "text-purple-300" },
    { label: "Open matches", value: openCount, detail: "Ready to join", icon: Gamepad2, tone: "text-cyan" },
    { label: "Players", value: standings.length, detail: "On the XP ladder", icon: Users, tone: "text-green" },
    { label: "Next tournament", value: formatDate(nextTournament?.start_date), detail: nextTournament?.name || "No event announced", icon: CalendarDays, tone: "text-orange" },
  ];

  return (
    <div className="mb-7 space-y-5">
      <section className="premium-panel relative overflow-hidden rounded-2xl border border-white/[0.07]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_35%,hsl(var(--cyan)/0.08),transparent_34%),linear-gradient(90deg,hsl(var(--card))_0%,hsl(var(--card)/0.94)_48%,hsl(var(--background)/0.72)_100%)]" />
        <div className="absolute inset-y-0 right-0 w-1/2 bg-gradient-to-r from-transparent to-background/40" />
        <div className="relative grid min-h-[250px] gap-8 p-7 md:p-9 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div>
            <div className={`flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.28em] ${copy.accent}`}><span className={`h-1.5 w-1.5 ${copy.line}`} /> Ladder</div>
            <img src="/assets/black-ops-7-logo.png" alt="Call of Duty Black Ops 7" className="mt-4 h-auto w-[290px] max-w-full object-contain object-left" />
            <h1 className="sr-only">{copy.title}</h1>
            <p className="mt-5 max-w-xl text-sm leading-6 text-vapor">{copy.description}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              <span className="rounded-md border border-white/10 bg-white/[0.035] px-3 py-2 text-[9px] font-black uppercase tracking-[0.14em] text-vapor">Cross platform</span>
              <span className="rounded-md border border-white/10 bg-white/[0.035] px-3 py-2 text-[9px] font-black uppercase tracking-[0.14em] text-vapor">{monthLabel()}</span>
              <span className="rounded-md border border-white/10 bg-white/[0.035] px-3 py-2 text-[9px] font-black uppercase tracking-[0.14em] text-vapor">{standings.length} players</span>
            </div>
          </div>
          <div className="w-full lg:w-[300px]">{action}</div>
        </div>
      </section>

      <nav className="grid overflow-hidden rounded-xl border border-white/[0.08] bg-card sm:grid-cols-2 lg:grid-cols-4">
        {navigation.map(({ key, label, to, icon: Icon }) => {
          const active = key === mode;
          return (
            <Link key={key} to={to} className={`relative flex min-h-14 items-center justify-center gap-2 border-b border-white/[0.06] px-4 py-4 text-xs font-black transition-colors sm:border-r lg:border-b-0 ${active ? "bg-secondary text-white" : "text-vapor hover:bg-secondary/70 hover:text-white"}`}>
              <Icon className={`h-4 w-4 ${active ? copy.accent : ""}`} /> {label}
              {active && <span className={`absolute inset-x-0 bottom-0 h-0.5 ${copy.line}`} />}
            </Link>
          );
        })}
      </nav>

      <div className={`grid gap-3 sm:grid-cols-2 ${mode === "wagers" ? "xl:grid-cols-5" : "xl:grid-cols-4"}`}>
        {summary.map(({ label, value, detail, icon: Icon, tone }) => (
          <div key={label} className="premium-card flex min-h-[82px] items-center gap-4 rounded-xl border border-white/[0.07] p-4">
            <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-white/[0.035] ${tone}`}><Icon className="h-5 w-5" /></div>
            <div className="min-w-0"><p className="text-[8px] font-black uppercase tracking-[0.2em] text-vapor">{label}</p><p className={`mt-1 truncate font-mono text-lg font-black ${tone}`}>{value}</p><p className="mt-0.5 truncate text-[9px] text-vapor/75">{detail}</p></div>
          </div>
        ))}
      </div>

      <section className="premium-panel grid gap-4 rounded-xl border border-white/[0.07] p-4 lg:grid-cols-[260px_minmax(0,1fr)] lg:items-center">
        <div className="flex items-center gap-4 border-white/[0.07] lg:border-r lg:pr-5">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-purple-300/20 bg-purple-300/10 text-purple-300"><Sparkles className="h-6 w-6" /></div>
          <div><p className="text-[8px] font-black uppercase tracking-[0.2em] text-vapor">Your progression</p><p className="mt-1 font-mono text-xl font-black text-purple-300">{number(myXp.total_xp ?? myXp.xp).toLocaleString()} XP</p><p className="text-[9px] text-vapor">Level {number(myXp.level || me.xp_level || 1)}</p></div>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {myTrophies.map((trophy) => (
            <div key={trophy.key} className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-black/10 px-2.5 py-2">
              <img src={trophy.image} alt="" className="h-8 w-8 object-contain" />
              <div><p className="font-mono text-sm font-black text-white">{trophy.value}</p><p className="text-[7px] font-black uppercase tracking-wider text-vapor">{trophy.label}</p></div>
            </div>
          ))}
        </div>
      </section>

      <section id="standings" className="premium-panel scroll-mt-24 overflow-hidden rounded-xl border border-white/[0.08]">
        <div className="flex flex-col gap-3 border-b border-white/[0.07] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div><div className="flex items-center gap-2"><span className={`h-2 w-2 ${copy.line}`} /><h2 className="font-black">{copy.title} standings</h2></div><p className="mt-1 text-xs text-vapor">A separate leaderboard for this competition.</p></div>
          <div className="flex rounded-lg border border-white/[0.07] bg-black/15 p-1 text-[9px] font-black uppercase tracking-wider">
            <span className={`rounded-md px-3 py-2 ${copy.accent} bg-white/[0.04]`}><Medal className="mr-1.5 inline h-3 w-3" /> Standings</span>
            <a href="#matchfinder" className="rounded-md px-3 py-2 text-vapor hover:text-white"><Gamepad2 className="mr-1.5 inline h-3 w-3" /> Matchfinder</a>
            <Link to="/rules" className="rounded-md px-3 py-2 text-vapor hover:text-white"><ShieldCheck className="mr-1.5 inline h-3 w-3" /> Rules</Link>
          </div>
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[1080px]">
            <div className="grid grid-cols-[70px_minmax(220px,1fr)_55px_55px_85px_85px_90px_190px_100px] gap-3 border-b border-white/[0.06] bg-white/[0.015] px-5 py-3 text-[8px] font-black uppercase tracking-[0.16em] text-vapor">
              <span>Rank</span><span>Player</span><span className="text-center">W</span><span className="text-center">L</span><span className="text-center">Win %</span><span className="text-center">Streak</span><span className="text-center">XP</span><span>Trophies</span><span className="text-right">{mode === "wagers" ? "Winnings" : mode === "eights" ? "Rating" : "ELO"}</span>
            </div>
            {loading ? <div className="px-5 py-12 text-center text-sm text-vapor">Loading standings...</div> : standings.length === 0 ? <div className="px-5 py-12 text-center text-sm text-vapor">The standings begin when the first match is completed.</div> : standings.map((row, index) => (
              <div key={row.id} className={`grid grid-cols-[70px_minmax(220px,1fr)_55px_55px_85px_85px_90px_190px_100px] items-center gap-3 border-b border-white/[0.045] px-5 py-3 text-xs transition-colors hover:bg-white/[0.02] ${String(row.userId) === String(currentUser?.id) ? "bg-cyan/[0.035]" : ""}`}>
                <span className={`font-mono font-black ${rankTone(index)}`}>{index < 3 ? <Trophy className="mr-2 inline h-3.5 w-3.5" /> : null}{index + 1}</span>
                <Link to={`/profile/${row.slug}`} className="flex min-w-0 items-center gap-3 font-bold text-white hover:text-cyan"><span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/[0.04] text-[10px] font-black">{row.user?.avatar_url ? <img src={row.user.avatar_url} alt="" className="h-full w-full object-cover" /> : row.name.charAt(0).toUpperCase()}</span><span className="truncate underline decoration-white/15 underline-offset-2">{row.name}</span></Link>
                <span className="text-center font-mono font-black text-green">{row.wins}</span>
                <span className="text-center font-mono font-black text-red-400">{row.losses}</span>
                <span className="text-center font-mono font-black text-white">{pct(row.wins, row.losses)}</span>
                <span className="text-center font-mono font-black"><Flame className="mr-1 inline h-3.5 w-3.5 text-orange" />{row.streak}</span>
                <span className="text-center font-mono font-black text-purple-300">{row.xp.toLocaleString()}</span>
                <span className="flex items-center gap-2">{trophyTypes.map((trophy) => <span key={trophy.key} title={trophy.label} className="inline-flex items-center gap-0.5"><img src={trophy.image} alt="" className="h-4 w-4 object-contain" /><b className="font-mono text-[8px] text-vapor">{trophy.fields.reduce((best, field) => Math.max(best, number(row.user?.[field])), 0) + (String(row.userId) === String(currentUser?.id) ? number(inventoryTrophies[trophy.key]) : 0)}</b></span>)}</span>
                <span className={`text-right font-mono font-black ${mode === "wagers" ? "text-green" : "text-cyan"}`}>{mode === "wagers" ? `$${row.score.toLocaleString()}` : row.score.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
        {standings.length > 0 && <div className="flex items-center justify-end px-5 py-3 text-[9px] font-black uppercase tracking-wider text-vapor">Top {standings.length} players <ChevronRight className="ml-1 h-3.5 w-3.5" /></div>}
      </section>
    </div>
  );
}
