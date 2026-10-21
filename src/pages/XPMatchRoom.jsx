import { consoleRestrictedFor } from "@/lib/playerRestrictions";
import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { animate, AnimatePresence, motion, useMotionValue, useReducedMotion, useTransform } from "framer-motion";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  AlertCircle,
  Check,
  Clock,
  Flame,
  Flag,
  Percent,
  RefreshCw,
  Swords,
  ShieldCheck,
  Ticket,
  Trophy,
  Users,
  X,
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/use-toast";
import MapVetoVertical from "@/components/match/MapVetoVertical";
import MatchRoomChat from "@/components/match/MatchRoomChat";
import MatchRoomShell from "@/components/match/MatchRoomShell";
import MatchRoomHeader, { MatchRoomTitle, matchRoomTeamName } from "@/components/match/MatchRoomHeader";
import MatchDisputeDialog from "@/components/match/MatchDisputeDialog";
import CancelledMatchRedirect from "@/components/match/CancelledMatchRedirect";
import { useRoomRecord } from "@/components/match/useRoomRecord";
import MatchTeamTable from "@/components/match/MatchTeamTable";
import RankBadge from "@/components/ui/RankBadge";
import UserBadges from "@/components/ui/UserBadges";
import ActivisionIdLabel from "@/components/competition/ActivisionIdLabel";
import PageLoader from "@/components/ui/PageLoader";
import { getRankForElo, getRankProgress } from "@/lib/ranks";
import { trophyCountsFor, trophyFields } from "@/lib/trophyCounts";
import { xpMatchOutcome } from "@/lib/xpMatchRating";

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
              <p data-name-effect={player.display_name_color || undefined} style={player.display_name_color ? { "--player-name-color": player.display_name_color } : undefined} className={`player-name-wrap text-base font-black tracking-tight text-white ${player.display_name_color ? "player-name-color" : ""}`}>{player.name}</p>
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
              <p data-name-effect={player.display_name_color || undefined} style={player.display_name_color ? { "--player-name-color": player.display_name_color } : undefined} className={`${roomy ? "text-lg" : "text-sm"} player-name-wrap font-black tracking-tight text-foreground ${player.display_name_color ? "player-name-color" : ""}`}>{player.name}</p>
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

function RankedResultOverlay({ match, result, onContinue, onDismiss }) {
  const reduceMotion = useReducedMotion();
  const [showContinue, setShowContinue] = useState(Boolean(reduceMotion));
  const previousElo = Number(result.previous_xp ?? result.previous_elo ?? 0);
  const newElo = Number(result.new_xp ?? result.new_elo ?? 0);
  const delta = Number(result.delta || 0);
  const animatedElo = useMotionValue(previousElo);
  const animatedDelta = useTransform(animatedElo, (value) => {
    const currentDelta = Math.round(value) - previousElo;
    return `${currentDelta > 0 ? "+" : ""}${currentDelta} XP`;
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
    <DialogPrimitive.Root open onOpenChange={(open) => { if (!open) onDismiss(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay asChild>
          <motion.div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/90 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.18 }}>
            <DialogPrimitive.Content asChild aria-describedby={undefined}>
              <motion.div
                initial={{ opacity: 0, y: 34, scale: 0.94 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                className={`relative w-full max-w-md overflow-hidden rounded-3xl border bg-card p-7 text-center shadow-xl will-change-transform ${result.won ? "border-green/30" : "border-red-500/30"}`}
              >
                <DialogPrimitive.Title className="sr-only">XP match result</DialogPrimitive.Title>
                <DialogPrimitive.Close asChild>
                  <button type="button" aria-label="Close result and stay in match room" className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-background/40 text-vapor transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan">
                    <X className="h-4 w-4" />
                  </button>
                </DialogPrimitive.Close>
                <motion.div className={`absolute inset-x-0 top-0 h-1 ${result.won ? "bg-green" : "bg-red-500"}`} initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.75, delay: 0.15 }} />
                <motion.div initial={{ scale: 0.75, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.28, delay: 0.12, ease: "easeOut" }} className={`mx-auto flex h-16 w-16 items-center justify-center rounded-2xl will-change-transform ${result.won ? "bg-green/15 text-green" : "bg-red-500/15 text-red-400"}`}>
                  <Trophy className="h-8 w-8" />
                </motion.div>
                <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.28, duration: 0.25 }} className={`mt-5 text-xs font-black uppercase tracking-[0.22em] ${accent}`}>{result.won ? "Victory" : "Defeat"}</motion.p>
                <motion.h2 initial={{ opacity: 0, scale: 1.35 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.6, duration: 0.35 }} className="mt-2 text-3xl font-black">{match.confirmed_score_alpha ?? match.winner_score} - {match.confirmed_score_bravo ?? match.loser_score}</motion.h2>
                <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 }} className="mt-6 rounded-2xl border border-white/5 bg-background/40 p-5">
                  <p className="text-[10px] font-black uppercase tracking-wider text-vapor">Your XP change</p>
                  <motion.p className={`mt-2 font-mono text-4xl font-black tabular-nums ${accent}`}>{animatedDelta}</motion.p>
                  <p className={`mt-1 text-[10px] font-black uppercase tracking-[0.18em] ${accent}`}>{delta >= 0 ? "XP gained" : "XP lost"}</p>
                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/5"><motion.div className={`h-full origin-left rounded-full will-change-transform ${result.won ? "bg-green" : "bg-red-500"}`} style={{ scaleX: progressScale }} /></div>
                  <div className="mt-3 flex items-center justify-center gap-2 text-xs text-vapor"><span>{previousElo.toLocaleString()} XP</span><span>→</span><span className="font-bold text-white">{newElo.toLocaleString()} XP total</span></div>
                </motion.div>
                <AnimatePresence>
                  {showContinue && <motion.button initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} onClick={onContinue} className="mt-6 w-full rounded-xl bg-cyan px-5 py-3.5 text-sm font-black uppercase tracking-wider text-background">Continue to XP</motion.button>}
                </AnimatePresence>
              </motion.div>
            </DialogPrimitive.Content>
          </motion.div>
        </DialogPrimitive.Overlay>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export default function XPMatchRoom() {
  const { id } = useParams();
  return <XPMatchRoomView key={id} />;
}

function XPMatchRoomView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [match, setMatch] = useRoomRecord();
  const [user, setUser] = useState(null);
  const [alphaPlayers, setAlphaPlayers] = useState([]);
  const [bravoPlayers, setBravoPlayers] = useState([]);
  const [tpRanks, setTpRanks] = useState({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [disputing, setDisputing] = useState(false);
  const [cancelVoting, setCancelVoting] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(null);
  const [scoreA, setScoreA] = useState(0);
  const [scoreB, setScoreB] = useState(0);
  const [scoreModalOpen, setScoreModalOpen] = useState(false);
  const [readying, setReadying] = useState(false);
  const [startingMatch, setStartingMatch] = useState(false);
  const [resultDismissed, setResultDismissed] = useState(false);

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
        const latest = await base44.entities.XPMatch.getFresh(id);
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
  }, [roomRosterSignature(match), match?.match_completed_date]);

  useEffect(() => {
    if (!match?.id) return;
    setTpRanks({});
    let active = true;
    let refreshing = false;
    const refreshRanks = async () => {
      if (refreshing || document.visibilityState === "hidden") return;
      refreshing = true;
      try {
        const response = await base44.functions.invoke("getXPMatchPlayerRanks", { xp_match_id: id });
        if (active && response.data?.success) setTpRanks(response.data.tp_ranks || {});
      } catch (error) {
        console.error("Could not load XP leaderboard positions:", error);
      } finally { refreshing = false; }
    };
    void refreshRanks();
    window.addEventListener("focus", refreshRanks);
    document.addEventListener("visibilitychange", refreshRanks);
    return () => {
      active = false;
      window.removeEventListener("focus", refreshRanks);
      document.removeEventListener("visibilitychange", refreshRanks);
    };
  }, [id, match?.id, roomRosterSignature(match), match?.match_completed_date]);

  useEffect(() => {
    const interval = setInterval(calculateTimeRemaining, 1000);
    calculateTimeRemaining();
    return () => clearInterval(interval);
  }, [match?.match_start_deadline, match?.created_date]);

  const isParticipant = useMemo(() => (
    user?.id && (roomRosterIds(match, "alpha").includes(user.id) || roomRosterIds(match, "bravo").includes(user.id))
  ), [user?.id, match]);

  const isHost = user?.id === match?.host_id;
  const isOpposingCaptain = user?.id === match?.challenger_id;
  const scoreReportOpen = ["accepted", "in_progress", "awaiting_host_report", "awaiting_challenger_report", "awaiting_team_alpha_report", "awaiting_team_bravo_report"].includes(match?.status);
  const ownScoreSubmitted = (isHost || isOpposingCaptain) && match?.reported_score_by === user?.id;
  const canSubmitScore = (isHost || isOpposingCaptain) && scoreReportOpen && roomRosterFull(match) && !ownScoreSubmitted;
  const scoreIsValid = validSeriesScore(match, scoreA, scoreB);
  const winsNeeded = winsNeededFor(match);
  const cancelRequest = match?.xp_cancel_request;
  const isCaptain = isHost || isOpposingCaptain;
  const canAnswerCancel = isCaptain && cancelRequest?.status === "pending" && cancelRequest.recipient_id === user?.id;
  const personalResult = match?.xp_changes?.[user?.id] || null;
  const ownSide = roomRosterIds(match, "alpha").includes(user?.id) ? "alpha" : "bravo";
  const xpStake = match?.xp_strength_snapshot && isParticipant ? {
    win: xpMatchOutcome(match.xp_strength_snapshot, ownSide).change,
    loss: xpMatchOutcome(match.xp_strength_snapshot, ownSide === "alpha" ? "bravo" : "alpha").change,
  } : null;
  const readyPlayerIds = Array.isArray(match?.ready_player_ids) ? match.ready_player_ids : [];
  const currentUserReady = Boolean(user?.id && readyPlayerIds.includes(user.id));
  const rankedParticipantIds = [...roomRosterIds(match, "alpha"), ...roomRosterIds(match, "bravo")];
  const everyoneReady = rankedParticipantIds.length > 0 && rankedParticipantIds.every((playerId) => readyPlayerIds.includes(playerId));

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
  const visibleAlphaPlayers = visibleRosterPlayers("alpha", alphaPlayers).map((player) => ({ ...player, tp_rank: tpRanks[player.id] }));
  const visibleBravoPlayers = visibleRosterPlayers("bravo", bravoPlayers).map((player) => ({ ...player, tp_rank: tpRanks[player.id] }));

  const loadPlayer = async (userId, fallbackName) => {
    if (!userId) return null;

    const [userRows, statsRows, profileRows] = await Promise.all([
      base44.entities.User.getFresh(userId).then((row) => row).catch(() => null),
      base44.entities.XPStats.filterFresh({ user_id: userId }, "-created_date", 1).catch(() => []),
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
      total_xp: Number(stats.total_xp || 0),
      wins: stats.wins || 0,
      losses: stats.losses || 0,
      lifetime_earnings: Math.max(Number(userRows?.lifetime_earnings || 0), Number(userRows?.total_wager_earnings || 0)),
      ...trophyFields(trophyCountsFor(userRows, profile)),
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
      console_restricted: consoleRestrictedFor(userRows),
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
    const [alpha, bravo, counts] = await Promise.all([
      Promise.all(alphaIds.map((playerId, index) => loadPlayer(playerId, alphaNames[index]))),
      Promise.all(bravoIds.map((playerId, index) => loadPlayer(playerId, bravoNames[index]))),
      base44.profile.trophyCounts([...alphaIds, ...bravoIds]).catch(() => ({})),
    ]);
    const withTrophies = (players) => players.filter(Boolean).map((player) => counts[player.id]
      ? { ...player, trophies: counts[player.id], ...trophyFields(counts[player.id]) }
      : player);
    return { alpha: withTrophies(alpha), bravo: withTrophies(bravo) };
  };

  const loadRoom = async () => {
    try {
      setLoading(true);
      const [currentUser, loadedMatch] = await Promise.all([
        base44.auth.me().catch(() => null),
        base44.entities.XPMatch.getFresh(id),
      ]);
      let matchData = loadedMatch;
      if (matchData.status === "cancelled") {
        setMatch(matchData);
        return;
      }

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
      const response = await base44.functions.invoke("completeXPMatch", {
        xp_match_id: match.id,
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
        toast({ title: "Score conflict", description: "The captains submitted different scores. Request staff review from this room.", variant: "destructive" });
        await loadRoom();
        return;
      }

      if (response.data.winner_id) {
        toast({
          title: "XP match completed",
          description: `${response.data.winner_name} won. Review your XP result.`,
        });
        setMatch(response.data.match || { ...match, status: "completed", xp_changes: response.data.xp_changes });
        return;
      }

      toast({ title: "Score submitted", description: response.data.message || "Waiting for opponent confirmation." });
      await loadRoom();
    } catch (error) {
      console.error("Failed to report XP score:", error);
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

  const handleCreateDispute = async (payload) => {
    setDisputing(true);
    try {
      const response = await base44.functions.invoke("createDispute", {
        match_type: "xp", match_id: match.id, xp_match_id: match.id,
        ...payload, escalated: Boolean(user?.is_premium),
      });
      if (!response.data?.success || !response.data.ticket?.id) throw new Error(response.data?.error || "Could not create your support ticket.");
      toast({ title: "Ticket submitted", description: "Follow staff replies and the decision in My Tickets." });
      await loadRoom();
      return response.data;
    } finally { setDisputing(false); }
  };

  const handleCancel = async (staffOverride = false) => {
    try {
      const response = await base44.functions.invoke("cancelXPMatch", {
        xp_match_id: match.id, staff_override: staffOverride === true,
      });

      if (response.data?.success) {
        toast({ title: "XP match cancelled" });
        navigate("/xp", { replace: true });
      } else {
        toast({ title: "Cancel failed", description: response.data?.error || "Could not cancel match.", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Cancel failed", description: error.message || "Could not cancel match.", variant: "destructive" });
    }
  };

  const handleCancellation = async (decision) => {
    setCancelVoting(true);
    try {
      const response = await base44.functions.invoke(decision ? "respondXPCancellation" : "requestXPCancellation", {
        xp_match_id: match.id, request_id: cancelRequest?.id, decision,
      });
      if (!response.data?.success) throw new Error(response.data?.error || "Could not update cancellation request.");
      setMatch(response.data.match);
      toast({ title: response.data.cancelled ? "Match cancelled by agreement" : decision === "decline" ? "Cancellation declined" : "Cancellation requested",
        description: response.data.cancelled ? "No XP was changed." : decision === "decline" ? "The match must be played." : "The opposing captain must accept. Until then, the match must be played." });
    } catch (error) {
      toast({ title: "Cancellation failed", description: error.message, variant: "destructive" });
    } finally { setCancelVoting(false); }
  };

  if (match?.status === "cancelled") return <CancelledMatchRedirect match={match} matchType="xp" />;
  if (loading && !match) return <PageLoader label="Loading XP match" />;

  if (!match) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">Match Not Found</h2>
          <Link to="/xp" className="text-cyan hover:underline">Back to XP</Link>
        </div>
      </div>
    );
  }

  const isComplete = match.status === "completed";
  const alphaWinner = isComplete && String(match.winner_id || "") === String(match.host_id || "");
  const bravoWinner = isComplete && String(match.winner_id || "") === String(match.challenger_id || "");
  const alphaName = matchRoomTeamName(match, "alpha");
  const bravoName = matchRoomTeamName(match, "bravo");

  return (
    <div className="match-room-theme matchroom-refresh min-h-screen py-6" data-room-mode="xp">
      <MatchDisputeDialog open={disputeOpen} onOpenChange={setDisputeOpen} match={{ ...match, match_type: "xp" }} players={[
        ...visibleAlphaPlayers.map((player) => ({ ...player, user_id: player.id, user_name: player.name, team: "host" })),
        ...visibleBravoPlayers.map((player) => ({ ...player, user_id: player.id, user_name: player.name, team: "challenger" })),
      ]} userId={user?.id} submitting={disputing} onSubmit={handleCreateDispute} />
      <div className="max-w-[1600px] mx-auto px-4 lg:px-6">
        <MatchRoomShell header={(
          <MatchRoomHeader
            label="XP match room"
            title={<MatchRoomTitle alpha={alphaName} bravo={bravoName} />}
            subtitle={match.game_mode_display || match.game_mode}
            status={formatStatus(match.status)} complete={isComplete}
            metadata={[
              { label: "Format", value: match.team_size },
              { label: "Series", value: `Best of ${match.best_of || 1}` },
              { label: "Map", value: match.final_map_name },
              { label: "Match ID", value: `#${String(match.id).slice(-8).toUpperCase()}` },
            ]}
            actions={<>
              {canSubmitScore ? <button type="button" onClick={() => setScoreModalOpen(true)} className="room-primary-action inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-primary-foreground hover:bg-primary/90"><Check className="h-4 w-4" /> Submit score</button> : null}
              {timeRemaining ? <div className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 font-mono text-xs font-black ${timeRemaining === "EXPIRED" ? "border-orange/25 bg-orange/10 text-orange" : "border-cyan/20 bg-cyan/10 text-cyan"}`}><Clock className="h-4 w-4" /> {timeRemaining}</div> : null}
              <Link to="/xp" className="rounded-lg border border-white/[0.08] bg-secondary/60 px-4 py-2.5 text-[10px] font-bold text-vapor hover:text-white">XP</Link>
              <Link to="/rules" className="match-rules-link"><ShieldCheck className="h-4 w-4" /> Match Rules</Link>
            </>}
          />
        )} teams={(<>
              <MatchTeamTable xpMatch label="Team Alpha" name={alphaName} color="orange" players={visibleAlphaPlayers} captainId={match.host_id} finalScore={match.confirmed_score_alpha ?? scoreA} isComplete={isComplete} isWinner={alphaWinner} />
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-xl border border-white/[0.08] bg-black/15 px-3 py-2">
                <span className="truncate text-right text-[9px] font-black uppercase tracking-wider text-orange">{alphaName}</span>
                <span className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-card text-[8px] font-black uppercase text-vapor">VS</span>
                <span className="truncate text-[9px] font-black uppercase tracking-wider text-cyan">{bravoName}</span>
              </div>
              <MatchTeamTable xpMatch label="Team Bravo" name={bravoName} color="cyan" players={visibleBravoPlayers} captainId={match.challenger_id} finalScore={match.confirmed_score_bravo ?? scoreB} isComplete={isComplete} isWinner={bravoWinner} />
          </>)} sidebar={(<>
              <MatchRoomChat
                conversationId={match.id}
                matchType="xp"
                teamAPlayers={visibleAlphaPlayers}
                teamBPlayers={visibleBravoPlayers}
                inputActions={(
                  <div className="flex items-center justify-between gap-3">
                    <Link to="/my-tickets" className="text-[10px] font-bold text-vapor transition-colors hover:text-cyan">My Tickets</Link>
                    <button type="button" onClick={() => setDisputeOpen(true)} disabled={!isParticipant || disputing || ["completed", "cancelled"].includes(match.status)} className="inline-flex items-center justify-center gap-2 rounded-lg border border-orange/25 bg-orange/[0.08] px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-orange transition-colors hover:bg-orange/15 disabled:opacity-40"><Ticket className="h-3.5 w-3.5" />Submit ticket</button>
                  </div>
                )}
              />
          </>)} />

        {match.status === "completed" && (
          <div className="glass rounded-xl border border-green/20 bg-green/5 p-5 mb-6 flex flex-wrap items-center gap-3">
            <Trophy className="w-5 h-5 text-green" />
            <div>
              <p className="font-bold text-green">Winner: {match.winner_name}</p>
              <p className="text-xs text-vapor">Final score {match.winner_score}-{match.loser_score}</p>
            </div>
            {personalResult && <button type="button" onClick={() => setResultDismissed(false)} className="ml-auto rounded-lg border border-cyan/20 bg-cyan/10 px-4 py-2 text-xs font-bold text-cyan transition-colors hover:bg-cyan/20">View XP result</button>}
          </div>
        )}

        <div className="mb-6 grid items-start gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
          <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-card">
            <div className="aspect-[16/6] min-h-[220px] overflow-hidden [&>*]:h-full [&>*]:min-h-0">
              <MapVetoVertical wager={match} ranked compact />
            </div>
          </div>
          <div className="space-y-4">
            <section className="rounded-2xl border border-white/[0.08] bg-card p-4">
              <p className="text-[9px] font-black uppercase tracking-[0.18em] text-cyan">Match summary</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {[
                  ["Mode", match.game_mode_display || match.game_mode || "XP"],
                  ["Series", `Best of ${match.best_of || 1}`],
                  ["Map", match.final_map_name || "Pending"],
                  ["Team size", match.team_size || "1v1"],
                  ["Team Alpha", alphaName],
                  ["Team Bravo", bravoName],
                  ["Input", String(match.play_rule || "controller_only").replace(/_/g, " ")],
                  ["Status", formatStatus(match.status)],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl border border-white/[0.06] bg-background/30 p-3">
                    <p className="text-[8px] font-black uppercase tracking-[0.14em] text-vapor">{label}</p>
                    <p className="mt-1 truncate text-xs font-black text-white">{value}</p>
                  </div>
                ))}
              </div>
            </section>
            {xpStake && !["completed", "cancelled"].includes(match.status) && (
              <section className="rounded-xl border border-cyan/15 bg-card p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-cyan">XP at stake</p>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div><p className="text-[9px] text-vapor">Win</p><p className="mt-1 font-mono text-lg font-black text-green">+{xpStake.win} XP</p></div>
                  <div><p className="text-[9px] text-vapor">Loss, up to</p><p className="mt-1 font-mono text-lg font-black text-red-300">−{xpStake.loss} XP</p></div>
                </div>
                <p className="mt-3 text-xs leading-5 text-vapor">Based on both teams’ average XP when the rosters filled. Beat a stronger team to earn more; losing to a weaker team costs more. XP stays at or above 0.</p>
              </section>
            )}
            {isParticipant && !["completed", "cancelled"].includes(match.status) && (
              <section className="rounded-xl border border-white/10 bg-card p-4">
                <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-white"><Users className="h-4 w-4 text-orange" /> Match cancellation</p>
                <p className="mt-2 text-xs leading-5 text-vapor">Both captains must agree. Declining or leaving a request unanswered means the match must be played. A cancellation changes no XP.</p>
                {cancelRequest?.status === "declined" ? <p role="status" className="mt-3 rounded-lg border border-orange/20 bg-orange/[0.06] p-3 text-xs font-bold text-orange">Cancellation declined. This match must be played.</p> : cancelRequest?.status === "pending" ? (
                  <div className="mt-3 rounded-lg border border-orange/20 bg-orange/[0.04] p-3">
                    <p role="status" className="text-xs font-bold text-white">{canAnswerCancel ? "The opposing captain requested cancellation." : "Waiting for the opposing captain to accept or decline."}</p>
                    <p className="mt-1 text-[11px] leading-5 text-vapor">The match remains active until both captains agree.</p>
                    {canAnswerCancel && <div className="mt-3 grid grid-cols-2 gap-2"><button type="button" disabled={cancelVoting} onClick={() => handleCancellation("accept")} className="rounded-lg border border-cyan/25 bg-cyan/10 px-3 py-2.5 text-[10px] font-black text-cyan disabled:opacity-40">Accept cancellation</button><button type="button" disabled={cancelVoting} onClick={() => handleCancellation("decline")} className="rounded-lg border border-orange/25 bg-orange/10 px-3 py-2.5 text-[10px] font-black text-orange disabled:opacity-40">Decline &amp; play</button></div>}
                  </div>
                ) : isCaptain ? (
                  <button type="button" onClick={() => match.challenger_id ? handleCancellation() : handleCancel()} disabled={cancelVoting || ["score_conflict", "disputed"].includes(match.status)} className="mt-3 w-full rounded-lg border border-red-400/20 bg-red-400/[0.06] px-4 py-2.5 text-[10px] font-black text-red-300 transition-colors hover:bg-red-400/10 disabled:opacity-40">{cancelVoting ? "Sending..." : match.challenger_id ? "Request cancellation" : "Remove open post"}</button>
                ) : <p className="mt-3 text-[11px] text-vapor">Your captain can send or answer a cancellation request.</p>}
              </section>
            )}

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

      {match.status === "completed" && personalResult && !resultDismissed && (
        <RankedResultOverlay match={match} result={personalResult} onDismiss={() => setResultDismissed(true)} onContinue={() => navigate("/xp", { replace: true })} />
      )}
    </div>
  );
}

