import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { animate, AnimatePresence, motion, useMotionValue, useReducedMotion, useTransform } from "framer-motion";
import {
  AlertCircle,
  ChevronDown,
  Check,
  Clock,
  Flame,
  Flag,
  Gavel,
  Percent,
  RefreshCw,
  Swords,
  Ticket,
  Trophy,
  Users,
  X,
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/use-toast";
import MapVetoVertical from "@/components/match/MapVetoVertical";
import MatchRoomChat from "@/components/match/MatchRoomChat";
import MatchTeamTable from "@/components/match/MatchTeamTable";
import MatchRulesPanel from "@/components/match/MatchRulesPanel";
import RankedVoicePanel from "@/components/match/RankedVoicePanel";
import RankBadge from "@/components/ui/RankBadge";
import UserBadges from "@/components/ui/UserBadges";
import ActivisionIdLabel from "@/components/competition/ActivisionIdLabel";
import PageLoader from "@/components/ui/PageLoader";
import { getRankForElo, getRankProgress } from "@/lib/ranks";
import { isStaffUser } from "@/lib/roles";

const playerName = (user, fallback = "Unnamed player") => (
  user?.display_name || user?.full_name || user?.username || user?.email || fallback
);

const formatStatus = (status) => status === "in_progress" ? "LIVE" : String(status || "open").replace(/_/g, " ");

const winsNeededFor = (match) => Math.floor(Math.max(1, Number(match?.best_of) || 1) / 2) + 1;
const validSeriesScore = (match, scoreA, scoreB) => {
  const winsNeeded = winsNeededFor(match);
  return Number.isInteger(scoreA)
    && Number.isInteger(scoreB)
    && scoreA >= 0
    && scoreB >= 0
    && scoreA <= winsNeeded
    && scoreB <= winsNeeded
    && ((scoreA === winsNeeded && scoreB < winsNeeded) || (scoreB === winsNeeded && scoreA < winsNeeded));
};

const slotsPerRankedTeam = (match) => Math.max(1, Number.parseInt(String(match?.team_size || "1v1").split("v")[0], 10) || 1);
const roomRosterIds = (match, side) => {
  const stored = match?.[`team_${side}_player_ids`];
  if (Array.isArray(stored) && stored.length > 0) return stored;
  if (side === "alpha") return match?.host_id ? [match.host_id] : [];
  return match?.challenger_id ? [match.challenger_id] : [];
};
const roomRosterNames = (match, side) => {
  const stored = match?.[`team_${side}_player_names`];
  if (Array.isArray(stored) && stored.length > 0) return stored;
  if (side === "alpha") return match?.host_name ? [match.host_name] : [];
  return match?.challenger_name ? [match.challenger_name] : [];
};
const roomRosterSignature = (match) => [...roomRosterIds(match, "alpha"), "|", ...roomRosterIds(match, "bravo")].join(":");
const roomRosterFull = (match) => roomRosterIds(match, "alpha").length >= slotsPerRankedTeam(match) && roomRosterIds(match, "bravo").length >= slotsPerRankedTeam(match);
const arenaHeightClass = (slots) => ({
  1: "h-[320px]",
  2: "h-[460px]",
  3: "h-[540px]",
  4: "h-[720px]",
}[slots] || "h-[720px]");
const communicationHeightClass = (slots) => ({
  1: "h-[540px]",
  2: "h-[540px]",
  3: "h-[600px]",
  4: "h-[720px]",
}[slots] || "h-[720px]");

function RosterPlayerCard({ player, color, slot, slots }) {
  const rank = getRankForElo(player.elo || 0);
  const rankProgress = getRankProgress(player.elo || 0);
  const matches = Math.max(Number(player.matches_played || 0), Number(player.wins || 0) + Number(player.losses || 0));
  const winRate = matches > 0 ? Math.round((Number(player.wins || 0) / matches) * 100) : 0;
  const isAlpha = color === "cyan";
  // The wide 1v1 presentation needs a full row. In 2v2 it became too tall for
  // the available half-row and clipped the player name and match statistics.
  const roomy = slots === 1;
  const accent = isAlpha
    ? "border-white/[0.08] shadow-[inset_3px_0_0_hsl(var(--cyan)),0_8px_24px_rgba(0,0,0,0.16)]"
    : "border-white/[0.08] shadow-[inset_3px_0_0_hsl(var(--orange)),0_8px_24px_rgba(0,0,0,0.16)]";
  const accentText = isAlpha ? "text-cyan" : "text-orange";
  const accentBg = isAlpha ? "bg-cyan" : "bg-orange";

  if (!roomy) {
    return (
      <div data-testid="ranked-player-card" className={`group/player relative flex h-full min-h-[140px] flex-col justify-between overflow-hidden rounded-xl border bg-gradient-to-br from-[#283440] via-[#202b36] to-[#151d27] p-3 ${accent} transition duration-300 hover:border-white/[0.16] ${player.is_premium ? "hover:-translate-y-0.5" : ""}`}>
        {player.is_premium && <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/4 skew-x-[-18deg] bg-gradient-to-r from-transparent via-purple-300/[0.08] to-transparent opacity-0 transition-all duration-700 group-hover/player:left-[115%] group-hover/player:opacity-100" />}
        <div className="relative flex min-w-0 items-center gap-2.5">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-black/25 shadow-inner">
            <div><RankBadge rank={rank.tier} size="sm" showLabel={false} /></div>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-1.5">
              <p style={player.display_name_color ? { color: player.display_name_color } : undefined} className="truncate text-base font-black tracking-tight text-white">{player.name}</p>
              <UserBadges user={player} size="xs" iconOnly showMonitorCam tooltipPlacement="bottom" className="shrink-0" />
              <span className={`shrink-0 rounded border px-1.5 py-0.5 font-mono text-[6px] font-black uppercase tracking-wider ${accentText} ${isAlpha ? "border-cyan/15 bg-cyan/[0.06]" : "border-orange/15 bg-orange/[0.06]"}`}>S{player.season || 1}</span>
            </div>
            <ActivisionIdLabel user={player} className="mt-1 max-w-full" />
            <div className="mt-1 flex items-center gap-2">
              <span className={`text-[7px] font-black uppercase tracking-wider ${accentText}`}>{rank.name}</span>
              <div className="h-0.5 min-w-8 flex-1 overflow-hidden rounded-full bg-white/[0.07]"><div className={`h-full rounded-full ${accentBg}`} style={{ width: `${rankProgress}%` }} /></div>
            </div>
          </div>
          <div className={`min-w-[66px] shrink-0 rounded-lg border bg-black/25 px-2.5 py-2 text-center ${isAlpha ? "border-cyan/15" : "border-orange/15"}`}>
            <p className={`font-mono text-base font-black ${accentText}`}>{Number(player.elo || 0).toLocaleString()}</p>
            <p className="text-[7px] font-black uppercase tracking-[0.14em] text-vapor/70">Elo</p>
          </div>
        </div>

        <div className="relative mt-2.5 grid grid-cols-3 overflow-hidden rounded-lg border border-white/[0.08] bg-black/25">
          <div className="px-2 py-1.5 text-center">
            <p className="text-[8px] font-black uppercase tracking-[0.13em] text-vapor">Record</p>
            <p className="mt-1 font-mono text-xs font-black text-white">{player.wins || 0}W <span className="text-vapor/45">/</span> {player.losses || 0}L</p>
          </div>
          <div className="border-x border-white/[0.08] px-2 py-1.5 text-center">
            <p className="text-[8px] font-black uppercase tracking-[0.13em] text-vapor">Win rate</p>
            <p className={`mt-1 font-mono text-xs font-black ${accentText}`}>{winRate}%</p>
          </div>
          <div className="px-2 py-1.5 text-center">
            <p className="text-[8px] font-black uppercase tracking-[0.13em] text-vapor">Streak</p>
            <p className="mt-1 font-mono text-xs font-black text-white">{player.win_streak || 0}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="ranked-player-card" className={`group/player relative flex h-full min-w-0 overflow-hidden rounded-lg border bg-gradient-to-br from-[#25303c] via-[#202a35] to-[#151e28] ${accent} transition duration-300 hover:border-white/[0.14] ${player.is_premium ? "hover:-translate-y-0.5" : ""} ${roomy ? "min-h-[108px] p-3" : "min-h-0 p-2"}`}>
      {player.is_premium && <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/4 skew-x-[-18deg] bg-gradient-to-r from-transparent via-purple-300/[0.08] to-transparent opacity-0 transition-all duration-700 group-hover/player:left-[115%] group-hover/player:opacity-100" />}
      <span className="absolute right-3 top-3 font-mono text-[8px] font-bold tracking-[0.14em] text-vapor/40">#{String(slot).padStart(2, "0")}</span>
      <div className={`relative flex min-w-0 flex-1 ${roomy ? "items-center gap-3" : "items-start gap-2.5"}`}>
        <div className={`relative flex shrink-0 items-center justify-center rounded-lg border border-white/[0.07] bg-black/25 ${roomy ? "h-[58px] w-[58px]" : "h-11 w-11"}`}>
          <div className={roomy ? "scale-110" : "scale-95"}><RankBadge rank={rank.tier} size="sm" showLabel={false} /></div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2 pr-7">
            <div className="flex min-w-0 items-center gap-2">
            <p style={player.display_name_color ? { color: player.display_name_color } : undefined} className={`${roomy ? "text-lg" : "text-sm"} truncate font-black tracking-tight text-foreground`}>{player.name}</p>
              <UserBadges user={player} size="xs" iconOnly showMonitorCam tooltipPlacement="bottom" className="shrink-0" />
              <span className={`shrink-0 rounded border px-1.5 py-0.5 font-mono text-[7px] font-black uppercase tracking-wider ${accentText} ${isAlpha ? "border-cyan/15 bg-cyan/[0.06]" : "border-orange/15 bg-orange/[0.06]"}`}>S{player.season || 1}</span>
            </div>
          </div>
          <div className="mt-1 flex items-center justify-between gap-2">
            <ActivisionIdLabel user={player} className={`min-w-0 ${roomy ? "max-w-[55%]" : "max-w-[48%]"}`} />
            <div className={`${roomy ? "w-[72px]" : "w-[62px]"} shrink-0`}>
              <div className={`rounded-md border border-white/[0.07] bg-black/30 text-center font-mono font-black ${accentText} ${roomy ? "px-2.5 py-1.5 text-sm" : "px-1.5 py-1 text-xs"}`}>{Number(player.elo || 0).toLocaleString()} <span className="text-[7px] tracking-wider text-vapor">ELO</span></div>
              <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/[0.06]"><div className={`h-full rounded-full ${accentBg}`} style={{ width: `${rankProgress}%` }} /></div>
              {roomy && <p className="mt-0.5 text-center font-mono text-[7px] text-vapor/60">{rankProgress} / 100</p>}
            </div>
          </div>
          {roomy && <div className="mt-2 flex items-center gap-2"><span className={`text-[8px] font-black uppercase tracking-wider ${accentText}`}>{rank.name}</span><div className="h-px flex-1 overflow-hidden bg-white/[0.06]"><div className={`h-full ${accentBg}`} style={{ width: `${rankProgress}%` }} /></div></div>}
          <div className={`${roomy ? "mt-2" : "mt-1.5"} grid grid-cols-3 border-t border-white/[0.07] pt-1 text-vapor/55`}><Swords className="mx-auto h-2.5 w-2.5" /><Percent className="mx-auto h-2.5 w-2.5" /><Flame className="mx-auto h-2.5 w-2.5" /></div>
          <div className="mt-0.5 grid grid-cols-3 divide-x divide-white/[0.07] text-center">
            <div><p className="text-[9px] font-black uppercase tracking-wide text-vapor">Record</p><p className="mt-1 font-mono text-xs font-black text-foreground">{player.wins || 0}W–{player.losses || 0}L</p></div>
            <div><p className="text-[9px] font-black uppercase tracking-wide text-vapor">Win rate</p><p className={`mt-1 font-mono text-xs font-black ${accentText}`}>{winRate}%</p></div>
            <div><p className="text-[9px] font-black uppercase tracking-wide text-vapor">Streak</p><p className="mt-1 font-mono text-xs font-black text-foreground">{player.win_streak || 0}</p></div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PlayerPanel({ label, teamName, color, players = [], slots = 1, score, isComplete = false, isWinner = false }) {
  const colorClass = color === "cyan" ? "text-cyan" : "text-orange";
  const isAlpha = color === "cyan";
  const accentText = isAlpha ? "text-cyan" : "text-orange";

  return (
    <div data-testid="ranked-roster-panel" className={`glass relative flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-white/[0.08] bg-card p-3 ${colorClass}`}>
      <div aria-hidden="true" className={`absolute inset-x-0 top-0 h-px ${isAlpha ? "bg-cyan/65" : "bg-orange/65"}`} />
      <div className="relative mb-3 flex items-center justify-between gap-3 border-b border-white/[0.06] pb-2.5">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em]">{label}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <p className="truncate text-lg font-black text-white">{teamName || label}</p>
            {isWinner ? <span className="inline-flex items-center gap-1 rounded-md border border-green/25 bg-green/10 px-2 py-1 text-[8px] font-black uppercase tracking-wider text-green"><Trophy className="h-3 w-3" /> Winner</span> : null}
          </div>
          <p className="mt-1 text-[8px] font-bold uppercase tracking-[0.18em] text-vapor">Ranked roster · {slots}v{slots}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className={`rounded-full border bg-background/45 px-2.5 py-1 font-mono text-[10px] font-black ${players.length >= slots ? (isAlpha ? "border-cyan/25 text-cyan" : "border-orange/25 text-orange") : "border-white/10 text-vapor"}`}>{players.length}/{slots}</span>
          {isComplete ? <div className={`min-w-16 rounded-xl border bg-black/20 px-3 py-2 text-center ${isWinner ? "border-green/25" : "border-white/10"}`}><p className="text-[7px] font-black uppercase tracking-wider text-vapor">Final score</p><p className={`mt-1 font-mono text-2xl font-black ${isWinner ? "text-green" : accentText}`}>{score ?? 0}</p></div> : null}
        </div>
      </div>
      <div className="grid min-h-0 flex-1 gap-2.5" style={{ gridTemplateRows: `repeat(${slots}, minmax(${slots >= 3 ? "140px" : "0px"}, 1fr))` }}>
        {Array.from({ length: slots }, (_, index) => {
          const player = players[index];
          if (!player) return <div key={`open-${index}`} className="group/slot flex min-h-[48px] flex-1 items-center justify-center rounded-lg border border-dashed border-white/10 bg-background/15 text-[8px] font-black uppercase tracking-[0.16em] text-vapor/45"><span className={`mr-2 h-1.5 w-1.5 rounded-full ${isAlpha ? "bg-cyan/40" : "bg-orange/40"}`} />Open slot {index + 1}</div>;
          return <RosterPlayerCard key={player.id} player={player} color={color} slot={index + 1} slots={slots} />;
        })}
      </div>
    </div>
  );
}

function RankedAdminTools({ match, busy, onResetDispute, onCancel, onRefresh }) {
  return (
    <details className="group rounded-xl border border-white/[0.08] bg-card p-4">
      <summary className="flex cursor-pointer list-none items-center justify-between rounded-lg border border-blue-400/20 bg-blue-400/[0.07] px-3 py-2.5 text-[9px] font-black uppercase tracking-wider text-blue-300 transition-colors hover:bg-blue-400/15 [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2"><Gavel className="h-3.5 w-3.5" /> Admin tools</span>
        <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
      </summary>
      <div className="mt-2 grid gap-2 rounded-lg border border-white/[0.06] bg-black/15 p-2">
        {["score_conflict", "disputed"].includes(match.status) && (
          <button type="button" onClick={onResetDispute} disabled={busy} className="flex items-center justify-center gap-2 rounded-lg border border-cyan/20 bg-cyan/[0.07] px-3 py-2.5 text-[9px] font-black uppercase tracking-wider text-cyan hover:bg-cyan/15 disabled:opacity-40">
            <RefreshCw className="h-3.5 w-3.5" /> Reset dispute
          </button>
        )}
        <button type="button" onClick={onRefresh} className="flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-secondary/60 px-3 py-2.5 text-[9px] font-black uppercase tracking-wider text-vapor hover:text-white">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh room
        </button>
        {!['completed', 'cancelled'].includes(match.status) && (
          <button type="button" onClick={onCancel} className="flex items-center justify-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-[9px] font-black uppercase tracking-wider text-red-400 hover:bg-red-500/20">
            <Flag className="h-3.5 w-3.5" /> Staff cancel
          </button>
        )}
      </div>
    </details>
  );
}

function RankedResultOverlay({ match, result, onContinue }) {
  const reduceMotion = useReducedMotion();
  const [showContinue, setShowContinue] = useState(Boolean(reduceMotion));
  const previousElo = Number(result.previous_elo || 0);
  const newElo = Number(result.new_elo || 0);
  const delta = Number(result.delta || 0);
  const animatedElo = useMotionValue(previousElo);
  const animatedDelta = useTransform(animatedElo, (value) => {
    const currentDelta = Math.round(value) - previousElo;
    return `${currentDelta > 0 ? "+" : ""}${currentDelta} ELO`;
  });
  const progressScale = useTransform(animatedElo, (value) => (
    Math.max(0, Math.min(1, Math.abs(value - previousElo) / Math.max(Math.abs(delta), 1)))
  ));

  useEffect(() => {
    animatedElo.set(previousElo);
    if (reduceMotion) {
      animatedElo.set(newElo);
      setShowContinue(true);
      return undefined;
    }
    setShowContinue(false);
    const controls = animate(animatedElo, newElo, {
      delay: 0.72,
      duration: 1.05,
      ease: [0.22, 1, 0.36, 1],
      onComplete: () => setShowContinue(true),
    });
    return () => {
      controls.stop();
    };
  }, [animatedElo, newElo, previousElo, reduceMotion]);

  const accent = result.won ? "text-green" : "text-red-400";

  return (
    <motion.div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.18 }}>
      <motion.div
        initial={{ opacity: 0, y: 34, scale: 0.94 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
        className={`relative w-full max-w-md overflow-hidden rounded-3xl border bg-card p-7 text-center shadow-xl will-change-transform ${result.won ? "border-green/30" : "border-red-500/30"}`}
      >
        <motion.div className={`absolute inset-x-0 top-0 h-1 ${result.won ? "bg-green" : "bg-red-500"}`} initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.75, delay: 0.15 }} />
        <motion.div initial={{ scale: 0.75, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.28, delay: 0.12, ease: "easeOut" }} className={`mx-auto flex h-16 w-16 items-center justify-center rounded-2xl will-change-transform ${result.won ? "bg-green/15 text-green" : "bg-red-500/15 text-red-400"}`}>
          <Trophy className="h-8 w-8" />
        </motion.div>
        <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.28, duration: 0.25 }} className={`mt-5 text-xs font-black uppercase tracking-[0.22em] ${accent}`}>{result.won ? "Victory" : "Defeat"}</motion.p>
        <motion.h2 initial={{ opacity: 0, scale: 1.35 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.6, duration: 0.35 }} className="mt-2 text-3xl font-black">{match.confirmed_score_alpha ?? match.winner_score} - {match.confirmed_score_bravo ?? match.loser_score}</motion.h2>
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 }} className="mt-6 rounded-2xl border border-white/5 bg-background/40 p-5">
          <p className="text-[10px] font-black uppercase tracking-wider text-vapor">Your ELO change</p>
          <motion.p className={`mt-2 font-mono text-4xl font-black tabular-nums ${accent}`}>{animatedDelta}</motion.p>
          <p className={`mt-1 text-[10px] font-black uppercase tracking-[0.18em] ${accent}`}>{delta >= 0 ? "ELO gained" : "ELO lost"}</p>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/5"><motion.div className={`h-full origin-left rounded-full will-change-transform ${result.won ? "bg-green" : "bg-red-500"}`} style={{ scaleX: progressScale }} /></div>
          <div className="mt-3 flex items-center justify-center gap-2 text-xs text-vapor"><span>{previousElo.toLocaleString()} ELO</span><span>→</span><span className="font-bold text-white">{newElo.toLocaleString()} ELO total</span></div>
        </motion.div>
        <AnimatePresence>
          {showContinue && <motion.button initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} onClick={onContinue} className="mt-6 w-full rounded-xl bg-cyan px-5 py-3.5 text-sm font-black uppercase tracking-wider text-background">Continue to Ranked</motion.button>}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}

export default function RankedMatchRoom() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [match, setMatch] = useState(null);
  const [user, setUser] = useState(null);
  const [alphaPlayers, setAlphaPlayers] = useState([]);
  const [bravoPlayers, setBravoPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [supporting, setSupporting] = useState(false);
  const [disputing, setDisputing] = useState(false);
  const [cancelVoting, setCancelVoting] = useState(false);
  const [resettingDispute, setResettingDispute] = useState(false);
  const joinedAdminRooms = useRef(new Set());
  const [timeRemaining, setTimeRemaining] = useState(null);
  const [scoreA, setScoreA] = useState(0);
  const [scoreB, setScoreB] = useState(0);
  const [scoreModalOpen, setScoreModalOpen] = useState(false);
  const [readying, setReadying] = useState(false);
  const [startingMatch, setStartingMatch] = useState(false);

  useEffect(() => {
    loadRoom();
  }, [id]);

  useEffect(() => {
    let active = true;
    let refreshing = false;
    const refresh = async () => {
      if (refreshing || document.visibilityState === "hidden") return;
      refreshing = true;
      try {
        const latest = await base44.entities.RankedMatch.getFresh(id);
        if (!active || !latest) return;
        let refreshedMatch = latest;
        if (roomRosterFull(latest) && !latest.final_map_name) {
          const mapResponse = await base44.functions.invoke("ensureRankedMatchMap", { ranked_match_id: id }).catch(() => null);
          if (mapResponse?.data?.match) refreshedMatch = mapResponse.data.match;
        }
        if (active) setMatch(refreshedMatch);
      } catch (error) {
        console.error("Failed to refresh ranked match:", error);
      } finally {
        refreshing = false;
      }
    };
    const interval = setInterval(refresh, 3000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [id]);

  useEffect(() => {
    if (!match) return undefined;
    let active = true;
    const refreshRoster = async () => {
      const rosters = await loadRosterPlayers(match);
      if (!active) return;
      setAlphaPlayers(rosters.alpha);
      setBravoPlayers(rosters.bravo);
    };
    refreshRoster().catch((error) => console.error("Failed to refresh ranked roster:", error));
    return () => {
      active = false;
    };
  }, [roomRosterSignature(match)]);

  useEffect(() => {
    const interval = setInterval(calculateTimeRemaining, 1000);
    calculateTimeRemaining();
    return () => clearInterval(interval);
  }, [match?.match_start_deadline, match?.created_date]);

  useEffect(() => {
    if (match?.status === "cancelled") {
      navigate("/ranked", { replace: true });
    }
  }, [match?.status, navigate]);

  const isParticipant = useMemo(() => (
    user?.id && (roomRosterIds(match, "alpha").includes(user.id) || roomRosterIds(match, "bravo").includes(user.id))
  ), [user?.id, match]);

  const isHost = user?.id === match?.host_id;
  const isOpposingCaptain = user?.id === match?.challenger_id;
  const isStaff = isStaffUser(user);
  const scoreReportOpen = ["in_progress", "awaiting_team_alpha_report", "awaiting_team_bravo_report"].includes(match?.status);
  const ownScoreSubmitted = isHost ? match?.host_reported_score_by === user?.id : isOpposingCaptain ? match?.challenger_reported_score_by === user?.id : false;
  const canSubmitScore = (isHost || isOpposingCaptain || isStaff) && scoreReportOpen && roomRosterFull(match) && !ownScoreSubmitted;
  const scoreIsValid = validSeriesScore(match, scoreA, scoreB);
  const winsNeeded = winsNeededFor(match);
  const joinedOpponentCount = Math.max(0, roomRosterIds(match, "alpha").length + roomRosterIds(match, "bravo").length - 1);
  const emptyLobbyCancelLocked = joinedOpponentCount === 0 && timeRemaining !== "EXPIRED";
  const cancelVoteLocked = joinedOpponentCount > 0 && timeRemaining !== "EXPIRED";
  const cancelVoteUserIds = Array.isArray(match?.cancel_vote_user_ids)
    ? match.cancel_vote_user_ids
    : match?.cancel_vote_requested_by ? [match.cancel_vote_requested_by] : [];
  const cancelVoteRequired = Number(match?.cancel_vote_required || Math.min(5, slotsPerRankedTeam(match) * 2));
  const cancelVoteCount = cancelVoteUserIds.length || Number(match?.cancel_vote_count || 0);
  const currentUserVotedCancel = Boolean(user?.id && cancelVoteUserIds.includes(user.id));
  const personalResult = match?.elo_changes?.[user?.id] || null;
  const readyPlayerIds = Array.isArray(match?.ready_player_ids) ? match.ready_player_ids : [];
  const currentUserReady = Boolean(user?.id && readyPlayerIds.includes(user.id));
  const rankedParticipantIds = [...roomRosterIds(match, "alpha"), ...roomRosterIds(match, "bravo")];
  const everyoneReady = rankedParticipantIds.length > 0 && rankedParticipantIds.every((playerId) => readyPlayerIds.includes(playerId));

  useEffect(() => {
    if (!match?.id || !user?.id || !isStaff) return;
    if (joinedAdminRooms.current.has(match.id)) return;
    const hasOpenRequest = Boolean(match.requested_admin && match.admin_request_ticket_id)
      && !["admin_joined", "resolved", "closed"].includes(match.admin_request_status);

    joinedAdminRooms.current.add(match.id);
    base44.functions.invoke("joinMatchRoomAsAdmin", {
      match_type: "ranked",
      match_id: match.id,
      ...(hasOpenRequest ? { ticket_id: match.admin_request_ticket_id } : {}),
      silent_join: !hasOpenRequest,
    }).then((response) => {
      if (response.data?.success && response.data?.match) setMatch(response.data.match);
    }).catch((error) => {
      joinedAdminRooms.current.delete(match.id);
      console.error("Failed to join ranked room as admin:", error);
    });
  }, [match?.id, match?.requested_admin, match?.admin_request_status, match?.admin_request_ticket_id, user?.id, isStaff]);

  const visibleRosterPlayers = (side, loadedPlayers) => {
    const names = roomRosterNames(match, side);
    return roomRosterIds(match, side).map((playerId, index) => (
      loadedPlayers.find((player) => player.id === playerId) || {
        id: playerId,
        name: names[index] || "Loading player...",
        elo: 0,
        wins: 0,
        losses: 0,
        win_streak: 0,
      }
    ));
  };
  const visibleAlphaPlayers = visibleRosterPlayers("alpha", alphaPlayers);
  const visibleBravoPlayers = visibleRosterPlayers("bravo", bravoPlayers);

  const loadPlayer = async (userId, fallbackName) => {
    if (!userId) return null;

    const [userRows, statsRows, profileRows] = await Promise.all([
      base44.entities.User.getFresh(userId).then((row) => row).catch(() => null),
      base44.entities.RankedStats.filterFresh({ user_id: userId }).catch(() => []),
      base44.entities.PlayerProfile.filterFresh({ user_id: userId }, "-created_date", 1).catch(() => []),
    ]);
    const stats = statsRows?.[0] || {};
    const profile = profileRows?.[0] || {};

    return {
      id: userId,
      name: playerName(userRows, fallbackName),
      avatar_url: userRows?.avatar_url || "",
      display_name_color: userRows?.display_name_color || profile?.display_name_color || "",
      activision_id: userRows?.activision_id || "",
      elo: stats.elo || 0,
      wins: stats.wins || 0,
      losses: stats.losses || 0,
      lifetime_earnings: Math.max(Number(userRows?.lifetime_earnings || 0), Number(userRows?.total_wager_earnings || 0)),
      gold_count: userRows?.gold_count || 0,
      silver_count: userRows?.silver_count || 0,
      bronze_count: userRows?.bronze_count || 0,
      premium_count: userRows?.premium_count || 0,
      champion_count: userRows?.champion_count || userRows?.invitational_count || 0,
      socials: {
        discord: profile.discord || userRows?.discord || "",
        twitter: profile.twitter || profile.x || userRows?.twitter || userRows?.x || "",
        twitch: profile.twitch || userRows?.twitch || "",
        youtube: profile.youtube || userRows?.youtube || "",
        website: profile.website || userRows?.website || "",
      },
      win_streak: stats.win_streak || 0,
      peak_elo: stats.peak_elo || 0,
      matches_played: stats.matches_played || 0,
      season: stats.season || userRows?.ranked_season || 1,
      badges: userRows?.badges || [],
      is_premium: Boolean(userRows?.is_premium),
      premium_expires: userRows?.premium_expires || null,
      verified_player: userRows?.verified_player || userRows?.is_verified_player || false,
      streamer_badge: userRows?.streamer_badge || userRows?.is_streamer || false,
      force_stream_required: userRows?.force_stream_required || userRows?.stream_override_required || false,
      monitor_cam_required: userRows?.monitor_cam_required || userRows?.required_monitor_cam || userRows?.moni_cam_required || false,
    };
  };

  const loadRosterPlayers = async (matchData) => {
    const alphaIds = roomRosterIds(matchData, "alpha");
    const bravoIds = roomRosterIds(matchData, "bravo");
    const alphaNames = roomRosterNames(matchData, "alpha");
    const bravoNames = roomRosterNames(matchData, "bravo");
    const [alpha, bravo] = await Promise.all([
      Promise.all(alphaIds.map((playerId, index) => loadPlayer(playerId, alphaNames[index]))),
      Promise.all(bravoIds.map((playerId, index) => loadPlayer(playerId, bravoNames[index]))),
    ]);
    return { alpha: alpha.filter(Boolean), bravo: bravo.filter(Boolean) };
  };

  const loadRoom = async () => {
    try {
      setLoading(true);
      const [currentUser, loadedMatch] = await Promise.all([
        base44.auth.me().catch(() => null),
        base44.entities.RankedMatch.get(id),
      ]);
      let matchData = loadedMatch;

      if (!matchData.final_map_name && roomRosterFull(matchData)) {
        const mapResponse = await base44.functions.invoke("ensureRankedMatchMap", { ranked_match_id: id }).catch(() => null);
        if (mapResponse?.data?.match) matchData = mapResponse.data.match;
      }

      setUser(currentUser);
      setMatch(matchData);
      setScoreA(matchData.reported_score_alpha || 0);
      setScoreB(matchData.reported_score_bravo || 0);

      const rosters = await loadRosterPlayers(matchData);
      setAlphaPlayers(rosters.alpha);
      setBravoPlayers(rosters.bravo);
    } catch (error) {
      console.error("Failed to load ranked match:", error);
      toast({ title: "Error loading match", description: error.message || "Match not found", variant: "destructive" });
      setMatch(null);
    } finally {
      setLoading(false);
    }
  };

  const calculateTimeRemaining = () => {
    const deadline = match?.match_start_deadline
      ? new Date(match.match_start_deadline)
      : match?.created_date
        ? new Date(new Date(match.created_date).getTime() + 15 * 60 * 1000)
        : null;
    if (!deadline) {
      setTimeRemaining(null);
      return;
    }

    const diff = deadline - new Date();
    if (diff <= 0) {
      setTimeRemaining("EXPIRED");
      return;
    }

    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    setTimeRemaining(`${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`);
  };

  const handleReportScore = async () => {
    if (!canSubmitScore) return;
    if (!scoreIsValid) {
      toast({ title: "Invalid score", description: `This BO${match.best_of || 1} must end when one team reaches ${winsNeeded} map ${winsNeeded === 1 ? "win" : "wins"}.`, variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      const response = await base44.functions.invoke("completeRankedMatch", {
        ranked_match_id: match.id,
        team_alpha_score: scoreA,
        team_bravo_score: scoreB,
        proof_urls: [],
      });

      if (!response.data?.success) {
        toast({ title: "Score rejected", description: response.data?.error || "Could not submit score.", variant: "destructive" });
        return;
      }

      setScoreModalOpen(false);

      if (response.data.status === "score_conflict") {
        toast({ title: "Score conflict", description: "A support ticket was opened for staff review.", variant: "destructive" });
        await loadRoom();
        return;
      }

      if (response.data.winner_id) {
        toast({
          title: "Ranked match completed",
          description: `${response.data.winner_name} won. Review your ELO result.`,
        });
        setMatch(response.data.match || { ...match, status: "completed", elo_changes: response.data.elo_changes });
        return;
      }

      toast({ title: "Score submitted", description: response.data.message || "Waiting for opponent confirmation." });
      await loadRoom();
    } catch (error) {
      console.error("Failed to report ranked score:", error);
      toast({ title: "Error", description: error.message || "Failed to report score.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleReadyUp = async () => {
    if (!isParticipant || currentUserReady || readying) return;
    setReadying(true);
    try {
      const response = await base44.functions.invoke("readyUpRankedMatch", { ranked_match_id: match.id });
      if (!response.data?.success) {
        toast({ title: "Ready check failed", description: response.data?.error || "Could not ready up.", variant: "destructive" });
        return;
      }
      setMatch(response.data.match);
      toast({
        title: response.data.everyone_ready ? "Everyone is ready" : "You are ready",
        description: response.data.everyone_ready ? "Global Voice is now open. The host can start the match." : "Waiting for the remaining players.",
      });
    } catch (error) {
      toast({ title: "Ready check failed", description: error.message || "Could not ready up.", variant: "destructive" });
    } finally {
      setReadying(false);
    }
  };

  const handleStartMatch = async () => {
    if (!isHost || !everyoneReady || startingMatch) return;
    setStartingMatch(true);
    try {
      const response = await base44.functions.invoke("startRankedMatch", { ranked_match_id: match.id });
      if (!response.data?.success) {
        toast({ title: "Could not start match", description: response.data?.error || "The match is not ready.", variant: "destructive" });
        return;
      }
      setMatch(response.data.match);
      toast({ title: "Match is live", description: "Voice has been split into private team channels." });
    } catch (error) {
      toast({ title: "Could not start match", description: error.message || "The match is not ready.", variant: "destructive" });
    } finally {
      setStartingMatch(false);
    }
  };

  const handleSupportTicket = async (reason) => {
    setSupporting(true);
    try {
      const response = await base44.functions.invoke("requestAdminAlert", {
        match_type: "ranked",
        match_id: match.id,
        subject: `Ranked match support ${match.id}`,
        description: `${reason}\n\nMatch: ${match.id}\nStatus: ${match.status}\nParticipants: ${match.host_name || "Host unavailable"} vs ${match.challenger_name || "Opponent pending"}`,
        priority: "high",
      });

      if (response.data?.success) {
        toast({ title: "Admin requested", description: "Staff were notified for this ranked match." });
        await loadRoom();
      } else {
        toast({ title: "Request failed", description: response.data?.error || "Could not request admin.", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Request failed", description: error.message || "Could not request admin.", variant: "destructive" });
    } finally {
      setSupporting(false);
    }
  };

  const handleCreateDispute = async () => {
    const evidenceText = typeof window !== "undefined" ? window.prompt("Evidence URLs (comma or line separated):", "") : "";
    if (evidenceText === null) return;
    const evidenceUrls = evidenceText.split(/[\n,]+/).map((url) => url.trim()).filter(Boolean);
    setDisputing(true);
    try {
      const response = await base44.functions.invoke("createDispute", {
        match_type: "ranked",
        match_id: match.id,
        ranked_match_id: match.id,
        reason: "score_dispute",
        description: `Dispute submitted from ranked match room ${match.id}. ${match.host_name || "Host"} vs ${match.challenger_name || "Opponent"}`,
        reported_against: user?.id === match.host_id ? match.challenger_id : match.host_id,
        reported_against_name: user?.id === match.host_id ? match.challenger_name : match.host_name,
        evidence_urls: evidenceUrls,
        escalated: Boolean(user?.is_premium),
      });

      if (response.data?.success) {
        toast({ title: response.data.escalated ? "Ticket escalated" : "Ticket created", description: "You can follow this dispute under My Tickets." });
        await loadRoom();
      } else {
        toast({ title: "Dispute failed", description: response.data?.error || "Could not create dispute.", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Dispute failed", description: error.message || "Could not create dispute.", variant: "destructive" });
    } finally {
      setDisputing(false);
    }
  };

  const handleCancel = async () => {
    try {
      const response = await base44.functions.invoke("cancelRankedMatch", {
        ranked_match_id: match.id,
        reason: "Cancelled from ranked match room",
      });

      if (response.data?.success) {
        toast({ title: "Ranked match cancelled" });
        navigate("/ranked");
      } else {
        toast({ title: "Cancel failed", description: response.data?.error || "Could not cancel match.", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Cancel failed", description: error.message || "Could not cancel match.", variant: "destructive" });
    }
  };

  const handleAdminResetDispute = async () => {
    const confirmed = typeof window === "undefined" || window.confirm("Reset this dispute, clear both reports, and let the players continue?");
    if (!confirmed) return;
    setResettingDispute(true);
    try {
      const response = await base44.functions.invoke("adminResetMatchDispute", {
        match_type: "ranked",
        match_id: match.id,
      });
      if (!response.data?.success) {
        toast({ title: "Reset failed", description: response.data?.error || "Could not reset dispute.", variant: "destructive" });
        return;
      }
      setScoreA(0);
      setScoreB(0);
      await loadRoom();
      toast({ title: "Dispute reset", description: "The match is live again and both sides can report again." });
    } catch (error) {
      toast({ title: "Reset failed", description: error.message || "Could not reset dispute.", variant: "destructive" });
    } finally {
      setResettingDispute(false);
    }
  };

  const handleCancelVote = async (action) => {
    setCancelVoting(true);
    try {
      const response = await base44.functions.invoke("voteRankedCancellation", {
        ranked_match_id: match.id,
        action,
      });
      if (!response.data?.success) {
        toast({ title: "Cancel vote failed", description: response.data?.error || "Could not update the vote.", variant: "destructive" });
        return;
      }
      setMatch(response.data.match || match);
      const voteCount = Number(response.data.vote_count ?? response.data.match?.cancel_vote_count ?? 0);
      const requiredVotes = Number(response.data.required_votes ?? response.data.match?.cancel_vote_required ?? cancelVoteRequired);
      toast({
        title: response.data.cancelled ? "Ranked match cancelled" : ["reject", "withdraw"].includes(action) ? "Vote withdrawn" : "Cancellation vote counted",
        description: response.data.cancelled ? `${requiredVotes} players agreed to cancel.` : `${voteCount} of ${requiredVotes} players agreed.`,
      });
    } catch (error) {
      toast({ title: "Cancel vote failed", description: error.message || "Could not update the vote.", variant: "destructive" });
    } finally {
      setCancelVoting(false);
    }
  };

  if (loading) {
    return (
      <>
        <PageLoader label="Loading ranked match" />

        {match?.status === "completed" && personalResult && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
            <div className={`w-full max-w-md rounded-3xl border p-7 text-center shadow-2xl ${personalResult.won ? "border-green/30 bg-card" : "border-red-500/30 bg-card"}`}>
              <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-2xl ${personalResult.won ? "bg-green/15 text-green" : "bg-red-500/15 text-red-400"}`}>
                <Trophy className="h-8 w-8" />
              </div>
              <p className={`mt-5 text-xs font-black uppercase tracking-[0.22em] ${personalResult.won ? "text-green" : "text-red-400"}`}>{personalResult.won ? "Victory" : "Defeat"}</p>
              <h2 className="mt-2 text-3xl font-black">{match.confirmed_score_alpha ?? match.winner_score} - {match.confirmed_score_bravo ?? match.loser_score}</h2>
              <div className="mt-6 rounded-2xl border border-white/5 bg-background/40 p-5">
                <p className="text-[10px] font-black uppercase tracking-wider text-vapor">Your ELO change</p>
                <p className={`mt-2 font-mono text-4xl font-black ${personalResult.won ? "text-green" : "text-red-400"}`}>{personalResult.delta > 0 ? "+" : ""}{personalResult.delta} ELO</p>
                <p className="mt-2 text-xs text-vapor">{personalResult.previous_elo} → {personalResult.new_elo} ELO</p>
              </div>
              <button onClick={() => navigate("/ranked", { replace: true })} className="mt-6 w-full rounded-xl bg-cyan px-5 py-3.5 text-sm font-black uppercase tracking-wider text-background">Continue to Ranked</button>
            </div>
          </div>
        )}
      </>
    );
  }

  if (!match) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">Match Not Found</h2>
          <Link to="/ranked" className="text-cyan hover:underline">Back to Ranked</Link>
        </div>
      </div>
    );
  }

  const isComplete = match.status === "completed";
  const alphaWinner = isComplete && String(match.winner_id || "") === String(match.host_id || "");
  const bravoWinner = isComplete && String(match.winner_id || "") === String(match.challenger_id || "");

  return (
    <div className="min-h-screen bg-obsidian py-6">
      <div className="max-w-[1740px] mx-auto px-4 lg:px-6">
        <section className="dark-focus dark-media relative mb-6 overflow-hidden rounded-2xl border border-white/[0.09] bg-[#111821] shadow-[0_24px_70px_-48px_rgba(0,0,0,.95)]">
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-20 top-0 h-px bg-gradient-to-r from-cyan/55 via-white/10 to-orange/55" />
          <div className="flex flex-col gap-4 border-b border-white/[0.06] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.18em] text-cyan"><Swords className="h-4 w-4" /> Ranked match · {formatStatus(match.status)}</p>
              <h1 className="mt-1.5 text-lg font-black">{match.team_size} {match.game_mode_display || match.game_mode}</h1>
              <p className="mt-1 text-[10px] font-mono text-vapor">Map {match.final_map_name || "pending"} · ID #{match.id?.slice(-8)}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {isParticipant && match.status === "ready_check" ? (
                <button type="button" onClick={handleReadyUp} disabled={currentUserReady || readying} className="inline-flex items-center justify-center gap-2 rounded-lg bg-green px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-background hover:bg-green/90 disabled:cursor-default disabled:opacity-55"><Check className="h-4 w-4" /> {currentUserReady ? `Ready · ${readyPlayerIds.length}/${rankedParticipantIds.length}` : readying ? "Readying..." : `Ready Up · ${readyPlayerIds.length}/${rankedParticipantIds.length}`}</button>
              ) : null}
              {isParticipant && match.status === "ready" && isHost ? (
                <button type="button" onClick={handleStartMatch} disabled={!everyoneReady || startingMatch} className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-primary-foreground hover:bg-primary/90 disabled:opacity-45"><Swords className="h-4 w-4" /> {startingMatch ? "Starting..." : "Start Match"}</button>
              ) : null}
              {isParticipant && match.status === "ready" && !isHost ? <span className="rounded-lg border border-green/20 bg-green/[0.08] px-3 py-2.5 text-[9px] font-black uppercase tracking-wider text-green">Ready · waiting for host</span> : null}
              {canSubmitScore ? <button type="button" onClick={() => setScoreModalOpen(true)} className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-primary-foreground hover:bg-primary/90"><Check className="h-4 w-4" /> Submit score</button> : null}
              {timeRemaining ? <div className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 font-mono text-xs font-black ${timeRemaining === "EXPIRED" ? "border-orange/25 bg-orange/10 text-orange" : "border-cyan/20 bg-cyan/10 text-cyan"}`}><Clock className="h-4 w-4" /> {timeRemaining}</div> : null}
              <Link to="/ranked" className="rounded-lg border border-white/[0.08] bg-secondary/60 px-4 py-2.5 text-[10px] font-bold text-vapor hover:text-white">Ranked</Link>
            </div>
          </div>
          <div className="grid gap-5 p-4 xl:grid-cols-[minmax(0,1fr)_410px] xl:p-5">
            <div className="min-w-0 space-y-4">
              <MatchTeamTable label="Team Alpha" name={match.host_name || "Team Alpha"} color="orange" players={visibleAlphaPlayers} captainId={match.host_id} finalScore={match.confirmed_score_alpha ?? scoreA} isComplete={isComplete} isWinner={alphaWinner} />
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-xl border border-white/[0.08] bg-black/15 px-3 py-2">
                <span className="truncate text-right text-[9px] font-black uppercase tracking-wider text-orange">{match.host_name || "Team Alpha"}</span>
                <span className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-card text-[8px] font-black uppercase text-vapor">VS</span>
                <span className="truncate text-[9px] font-black uppercase tracking-wider text-cyan">{match.challenger_name || "Team Bravo"}</span>
              </div>
              <MatchTeamTable label="Team Bravo" name={match.challenger_name || "Opponent pending"} color="cyan" players={visibleBravoPlayers} captainId={match.challenger_id} finalScore={match.confirmed_score_bravo ?? scoreB} isComplete={isComplete} isWinner={bravoWinner} />
            </div>
            <div className="flex min-w-0 flex-col gap-2">
              <RankedVoicePanel match={match} user={user} isParticipant={isParticipant} />
              <MatchRoomChat
                conversationId={match.id}
                matchType="ranked"
                teamAPlayers={visibleAlphaPlayers}
                teamBPlayers={visibleBravoPlayers}
                inputActions={(
                  <details className="group">
                    <summary className="flex cursor-pointer list-none items-center justify-between rounded-lg border border-white/[0.08] bg-black/15 px-3 py-2 text-[8px] font-black uppercase tracking-wider text-vapor hover:text-white [&::-webkit-details-marker]:hidden">
                      <span className="flex items-center gap-2"><Gavel className="h-3 w-3 text-blue-300" /> Match support</span>
                      <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
                    </summary>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <button type="button" onClick={() => handleSupportTicket("I need support for this ranked match.")} disabled={!isParticipant || supporting} className="flex items-center justify-center gap-2 rounded-lg border border-blue-400/20 bg-blue-400/[0.07] px-2 py-2.5 text-[9px] font-black uppercase tracking-wider text-blue-300 hover:bg-blue-400/15 disabled:opacity-40">
                        <Gavel className="h-3.5 w-3.5" /> {supporting ? "Requesting..." : "Request admin"}
                      </button>
                      <button type="button" onClick={handleCreateDispute} disabled={!isParticipant || disputing} className="flex items-center justify-center gap-2 rounded-lg border border-orange/25 bg-orange/[0.08] px-2 py-2.5 text-[9px] font-black uppercase tracking-wider text-orange hover:bg-orange/15 disabled:opacity-40">
                        <Ticket className="h-3.5 w-3.5" /> {disputing ? "Submitting..." : "Submit ticket"}
                      </button>
                      <button type="button" onClick={() => handleSupportTicket("Opponent no-show report.")} disabled={!isParticipant || supporting} className="col-span-2 flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-secondary/60 px-2 py-2 text-[8px] font-black uppercase tracking-wider text-vapor hover:text-white disabled:opacity-40">
                        <Flag className="h-3 w-3" /> Report no show
                      </button>
                      {(match.admin_request_status || match.requested_admin) && <p className="col-span-2 mt-1 text-center text-[8px] font-bold text-blue-300">Admin request: {{ waiting_for_admin: "Waiting for admin", admin_joined: match.assigned_admin_name ? `${match.assigned_admin_name} joined` : "Admin joined", waiting_for_user: "Waiting for you", escalated: "Escalated", resolved: "Resolved", closed: "Closed" }[match.admin_request_status || "waiting_for_admin"] || "Waiting for admin"}</p>}
                    </div>
                  </details>
                )}
              />
            </div>
          </div>
        </section>

        {match.status === "completed" && (
          <div className="glass rounded-xl border border-green/20 bg-green/5 p-5 mb-6 flex items-center gap-3">
            <Trophy className="w-5 h-5 text-green" />
            <div>
              <p className="font-bold text-green">Winner: {match.winner_name}</p>
              <p className="text-xs text-vapor">Final score {match.winner_score}-{match.loser_score}</p>
            </div>
          </div>
        )}

        <div className="mb-6 grid items-start gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.8fr)]">
          <MapVetoVertical wager={match} ranked compact />
          <div className="space-y-4">
            <MatchRulesPanel matchType="ranked" gameMode={match.game_mode_display || match.game_mode} collapsible defaultOpen={false} />

            {isParticipant && !["completed", "cancelled"].includes(match.status) && (
              <section className="rounded-xl border border-red-500/15 bg-card p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-red-300"><Users className="h-4 w-4" /> Vote to cancel</p>
                    <p className="mt-1 text-xs leading-5 text-vapor">The match is cancelled only when enough players agree.</p>
                  </div>
                  <span className="shrink-0 rounded-lg border border-red-500/15 bg-red-500/[0.07] px-3 py-2 font-mono text-xs font-black text-red-300">{cancelVoteCount}/{cancelVoteRequired}</span>
                </div>
                <div className="my-3 h-1.5 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full rounded-full bg-red-400 transition-all" style={{ width: `${Math.min(100, (cancelVoteCount / Math.max(cancelVoteRequired, 1)) * 100)}%` }} /></div>
                {joinedOpponentCount === 0 && isHost ? (
                  <button type="button" onClick={handleCancel} disabled={emptyLobbyCancelLocked} className="w-full rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-red-300 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-40">
                    {emptyLobbyCancelLocked ? `Available in ${timeRemaining || "15:00"}` : "Cancel empty lobby"}
                  </button>
                ) : (
                  <button type="button" onClick={() => handleCancelVote(currentUserVotedCancel ? "withdraw" : match.cancel_vote_status === "pending" ? "approve" : "request")} disabled={cancelVoting || cancelVoteLocked} className="w-full rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-red-300 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-40">
                    {cancelVoteLocked ? `Voting opens in ${timeRemaining || "15:00"}` : cancelVoting ? "Updating..." : currentUserVotedCancel ? "Withdraw my vote" : "Vote to cancel"}
                  </button>
                )}
              </section>
            )}

            {isStaff && <RankedAdminTools match={match} busy={resettingDispute} onResetDispute={handleAdminResetDispute} onCancel={handleCancel} onRefresh={loadRoom} />}
          </div>
        </div>

        {match.reported_score_by && !["completed", "score_conflict"].includes(match.status) && (
          <p className="mb-6 rounded-lg border border-yellow-400/15 bg-yellow-400/[0.05] px-4 py-3 text-center text-xs text-yellow-300">A score has been submitted. The opponent must submit the same score to complete the match.</p>
        )}
      </div>

      {scoreModalOpen && canSubmitScore && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 px-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="ranked-score-title">
          <button type="button" className="absolute inset-0 cursor-default" onClick={() => setScoreModalOpen(false)} aria-label="Close score dialog" />
          <div className="dark-focus dark-media relative z-10 w-full max-w-md rounded-2xl border border-white/[0.1] bg-[#111821] p-5 shadow-[0_30px_100px_rgba(0,0,0,.75)] sm:p-6">
            <div className="flex items-start justify-between gap-4 border-b border-white/[0.06] pb-4">
              <div><p className="text-[9px] font-black uppercase tracking-[0.18em] text-cyan">BO{match.best_of || 1}</p><h2 id="ranked-score-title" className="mt-1 text-lg font-black">Submit final score</h2><p className="mt-1 text-xs text-vapor">Both teams must submit the same result.</p></div>
              <button type="button" onClick={() => setScoreModalOpen(false)} className="rounded-lg border border-white/[0.08] bg-black/20 p-2 text-vapor hover:text-white" aria-label="Close"><X className="h-4 w-4" /></button>
            </div>
            <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-end gap-3">
              <label className="min-w-0 text-center"><span className="block truncate text-[9px] font-black uppercase tracking-wider text-cyan">{match.host_name || "Team Alpha"}</span><input type="number" value={scoreA} min="0" max={winsNeeded} onChange={(event) => setScoreA(event.target.value === "" ? "" : Math.min(winsNeeded, Math.max(0, Number(event.target.value))))} onBlur={() => scoreA === "" && setScoreA(0)} className="mt-2 w-full rounded-xl border border-cyan/20 bg-black/20 px-3 py-3 text-center font-mono text-4xl font-black text-cyan outline-none focus:border-cyan/50" /></label>
              <span className="mb-4 rounded-full border border-white/10 bg-black/25 px-2 py-1 text-[8px] font-black uppercase text-vapor">VS</span>
              <label className="min-w-0 text-center"><span className="block truncate text-[9px] font-black uppercase tracking-wider text-orange">{match.challenger_name || "Team Bravo"}</span><input type="number" value={scoreB} min="0" max={winsNeeded} onChange={(event) => setScoreB(event.target.value === "" ? "" : Math.min(winsNeeded, Math.max(0, Number(event.target.value))))} onBlur={() => scoreB === "" && setScoreB(0)} className="mt-2 w-full rounded-xl border border-orange/20 bg-black/20 px-3 py-3 text-center font-mono text-4xl font-black text-orange outline-none focus:border-orange/50" /></label>
            </div>
            <button type="button" onClick={handleReportScore} disabled={!scoreIsValid || submitting} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3.5 text-xs font-black uppercase tracking-wider text-primary-foreground disabled:cursor-not-allowed disabled:opacity-45"><Check className="h-4 w-4" /> {submitting ? "Submitting..." : "Submit result"}</button>
            {!scoreIsValid ? <p className="mt-2 text-center text-[9px] text-orange">One team must reach {winsNeeded} map {winsNeeded === 1 ? "win" : "wins"}.</p> : null}
          </div>
        </div>
      )}

      {match.status === "completed" && personalResult && (
        <RankedResultOverlay match={match} result={personalResult} onContinue={() => navigate("/ranked", { replace: true })} />
      )}

      {false && match.status === "completed" && personalResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className={`w-full max-w-md rounded-3xl border p-7 text-center shadow-2xl ${personalResult.won ? "border-green/30 bg-card" : "border-red-500/30 bg-card"}`}>
            <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-2xl ${personalResult.won ? "bg-green/15 text-green" : "bg-red-500/15 text-red-400"}`}>
              <Trophy className="h-8 w-8" />
            </div>
            <p className={`mt-5 text-xs font-black uppercase tracking-[0.22em] ${personalResult.won ? "text-green" : "text-red-400"}`}>{personalResult.won ? "Victory" : "Defeat"}</p>
            <h2 className="mt-2 text-3xl font-black">{match.confirmed_score_alpha ?? match.winner_score} - {match.confirmed_score_bravo ?? match.loser_score}</h2>
            <div className="mt-6 rounded-2xl border border-white/5 bg-background/40 p-5">
              <p className="text-[10px] font-black uppercase tracking-wider text-vapor">Your ELO change</p>
              <p className={`mt-2 font-mono text-4xl font-black ${personalResult.won ? "text-green" : "text-red-400"}`}>{personalResult.delta > 0 ? "+" : ""}{personalResult.delta} ELO</p>
              <p className="mt-2 text-xs text-vapor">{personalResult.previous_elo} → {personalResult.new_elo} ELO</p>
            </div>
            <button onClick={() => navigate("/ranked", { replace: true })} className="mt-6 w-full rounded-xl bg-cyan px-5 py-3.5 text-sm font-black uppercase tracking-wider text-background">Continue to Ranked</button>
          </div>
        </div>
      )}
    </div>
  );
}
