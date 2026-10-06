import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  AlertCircle,
  AtSign,
  Award,
  Check,
  ChevronDown,
  Clock3,
  Crown,
  Flag,
  Gavel,
  Globe2,
  LayoutGrid,
  Map as MapIcon,
  Medal,
  MessageCircle,
  RefreshCw,
  Shield,
  ShieldCheck,
  Swords,
  Trophy,
  Twitch,
  Unlock,
  X,
  Youtube,
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/use-toast";
import MatchRoomChat from "@/components/match/MatchRoomChat";
import MatchTeamTable from "@/components/match/MatchTeamTable";
import MatchRulesPanel from "@/components/match/MatchRulesPanel";
import UserBadges from "@/components/ui/UserBadges";
import ActivisionIdLabel from "@/components/competition/ActivisionIdLabel";
import PageLoader from "@/components/ui/PageLoader";
import TournamentBracket from "@/components/tournaments/TournamentBracket";
import { effectiveRoleForUser, isStaffUser } from "@/lib/roles";

const bracketLabels = {
  winner: "Winner Bracket",
  loser: "Lower Bracket",
  grand_final: "Grand Final",
};

const statusLabel = (value) => String(value || "pending").replace(/_/g, " ");
const adminCorrectionRoles = new Set(["ceo", "super_admin", "admin"]);
const defaultMapPool = ["Hacienda", "Gridlock", "Raid", "Scar", "Den", "Sake", "Colossus"];
const seedLabel = (seed) => seed ? `#${seed}` : "#-";
const cleanKey = (value) => String(value || "").trim().toLowerCase();
const tournamentMapImages = {
  colossus: "/assets/maps/colossus.jpg",
  colosses: "/assets/maps/colossus.jpg",
  den: "/assets/maps/den.jpg",
  raid: "/assets/maps/raid.jpg",
  fringe: "/assets/maps/fringe.jpg",
  scar: "/assets/maps/scar.jpg",
  gridlock: "/assets/maps/gridlock.jpg",
  hacienda: "/assets/maps/hacienda.jpg",
  sake: "/assets/maps/sake.png",
};
const tournamentMapImage = (name) => tournamentMapImages[cleanKey(name).replace(/[^a-z0-9]/g, "")] || null;
const isStreamerTournament = (tournament) => Boolean(
  tournament?.is_streamer_tournament
  || ["streamer", "streamer_tournament"].includes(String(tournament?.tournament_type || "").toLowerCase())
  || ["streamer", "streamer_tournament"].includes(String(tournament?.source || "").toLowerCase())
);
const playerName = (player) => player?.user_name || player?.username || player?.display_name || player?.full_name || player?.email || "Unknown player";
const identityKeys = (value) => [
  value?.id,
  value?.user_id,
  value?.captain_id,
  value?.team_id,
  value?.username,
  value?.handle,
  value?.display_name,
  value?.full_name,
  value?.email,
  value?.user_name,
  value?.name,
].filter(Boolean);
const statNumber = (value) => {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
};
const moneyLabel = (value) => `$${statNumber(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const emptyTrophyCounts = () => ({ gold: 0, silver: 0, bronze: 0, premium: 0 });
const tournamentBestOf = (match) => {
  const bestOf = Math.trunc(Number(match?.best_of || match?.map_sequence?.length || 3));
  return Number.isFinite(bestOf) && bestOf > 0 ? bestOf : 3;
};
const tournamentRequiredWins = (match) => Math.floor(tournamentBestOf(match) / 2) + 1;
const tournamentScoreError = (match, teamAScore, teamBScore) => {
  const bestOf = tournamentBestOf(match);
  const winsNeeded = tournamentRequiredWins(match);
  const label = `BO${bestOf} must finish ${winsNeeded}–0 through ${winsNeeded}–${winsNeeded - 1}`;
  if (
    !Number.isInteger(teamAScore)
    || !Number.isInteger(teamBScore)
    || teamAScore < 0
    || teamBScore < 0
  ) {
    return `Use whole, non-negative map scores. ${label}.`;
  }
  if (Math.max(teamAScore, teamBScore) !== winsNeeded || Math.min(teamAScore, teamBScore) >= winsNeeded) {
    return `${label}.`;
  }
  return "";
};
const seriesScoreExamples = (match) => {
  const winsNeeded = tournamentRequiredWins(match);
  return Array.from({ length: winsNeeded }, (_, score) => `${winsNeeded}–${score}`).join(" or ");
};
const formatCountdown = (seconds) => {
  const safeSeconds = Math.max(0, Number(seconds || 0));
  const minutes = Math.floor(safeSeconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(safeSeconds % 60).padStart(2, "0")}`;
};

const trophySlots = [
  { key: "gold", label: "Gold trophies", icon: Trophy, className: "border-yellow-400/20 bg-yellow-400/[0.08] text-yellow-300 hover:border-yellow-400/45 hover:bg-yellow-400/[0.14] hover:shadow-[0_0_16px_rgba(250,204,21,.12)]" },
  { key: "silver", label: "Silver trophies", icon: Medal, className: "border-slate-300/20 bg-slate-300/[0.07] text-slate-200 hover:border-slate-200/40 hover:bg-slate-200/[0.12] hover:shadow-[0_0_16px_rgba(203,213,225,.1)]" },
  { key: "bronze", label: "Bronze trophies", icon: Award, className: "border-amber-600/25 bg-amber-600/[0.09] text-amber-500 hover:border-amber-500/45 hover:bg-amber-500/[0.14] hover:shadow-[0_0_16px_rgba(217,119,6,.12)]" },
  { key: "premium", label: "Premium trophies", icon: Crown, className: "border-purple-300/20 bg-purple-300/[0.07] text-purple-300 hover:border-purple-300/40 hover:bg-purple-300/[0.12] hover:shadow-[0_0_16px_rgba(216,180,254,.12)]" },
];

const tournamentRankFor = (goldTrophies) => {
  const gold = statNumber(goldTrophies);
  if (gold < 3) return null;
  if (gold > 5) return { label: "Pro", className: "border-yellow-300/30 bg-yellow-300/[0.1] text-yellow-300" };
  if (gold === 5) return { label: "Semi Pro", className: "border-cyan/25 bg-cyan/[0.08] text-cyan" };
  if (gold >= 3) return { label: "Amateur", className: "border-amber-500/25 bg-amber-500/[0.08] text-amber-400" };
  return null;
};

const participantIds = (participant) => [
  participant?.id,
  participant?.team_id,
  participant?.user_id,
  participant?.captain_id,
].filter(Boolean).map(String);

function participantMatchesSlot(participant, match, slot) {
  const slotIds = slot === "a"
    ? [match?.team_a_participant_id, match?.team_a_id]
    : [match?.team_b_participant_id, match?.team_b_id];
  const ids = new Set(participantIds(participant));
  if (slotIds.some((value) => value && ids.has(String(value)))) return true;

  const participantName = cleanKey(participant?.team_name || participant?.user_name || participant?.name);
  const slotName = cleanKey(slot === "a" ? match?.team_a_name : match?.team_b_name);
  return Boolean(participantName && slotName && participantName === slotName);
}

function normalizeRoster(participant, fallbackMembers = []) {
  const source = [];
  if (participant?.captain_id) {
    source.push({
      user_id: participant.captain_id,
      user_name: participant.captain_name,
      role: "captain",
    });
  }
  if (participant?.user_id && participant.user_id !== participant.captain_id) {
    source.push({
      user_id: participant.user_id,
      user_name: participant.user_name || participant.captain_name || participant.team_name,
      role: "captain",
    });
  }
  if (Array.isArray(participant?.members)) {
    source.push(...participant.members);
  }
  source.push(...fallbackMembers);

  const seen = new Set();
  return source.reduce((players, member) => {
    const name = playerName(member);
    if (!member?.user_id && name === "Unknown player") return players;
    const key = member?.user_id || cleanKey(name);
    if (seen.has(key)) return players;
    seen.add(key);
    players.push({
      id: member?.id,
      user_id: member?.user_id || key,
      user_name: name,
      username: member?.username,
      handle: member?.handle,
      display_name: member?.display_name,
      full_name: member?.full_name,
      email: member?.email,
      participant_id: participant?.id,
      participant_user_id: participant?.user_id,
      team_id: participant?.team_id,
      captain_id: participant?.captain_id,
      participant_name: participant?.team_name || participant?.user_name || participant?.name,
      role: member?.role || (participant?.captain_id && member?.user_id === participant.captain_id ? "captain" : "member"),
    });
    return players;
  }, []);
}

function rosterPlayerMatchesUser(player, user) {
  if (!player || !user?.id) return false;

  const userId = String(user.id);
  const directIds = [
    player.user_id,
    player.id,
    player.captain_id,
    player.participant_user_id,
    player.team_id,
  ].filter(Boolean).map(String);

  if (directIds.includes(userId)) return true;

  const userKeys = new Set(identityKeys(user).map(cleanKey).filter(Boolean));
  return identityKeys(player).some((key) => userKeys.has(cleanKey(key)));
}

function countInventoryTrophies(items = []) {
  const counts = emptyTrophyCounts();
  (items || []).forEach((item) => {
    const text = cleanKey([item.item_name, item.unlock_key, item.item_rarity, item.purchase_method].filter(Boolean).join(" "));
    if (item.item_category !== "trophy" && !text.includes("trophy")) return;

    if (text.includes("invit") || text.includes("champion")) return;
    if (text.includes("premium")) counts.premium += 1;
    else if (text.includes("gold")) counts.gold += 1;
    else if (text.includes("silver")) counts.silver += 1;
    else if (text.includes("bronze")) counts.bronze += 1;
    else if (item.item_rarity === "exclusive" || item.item_rarity === "mythic") return;
    else if (item.item_rarity === "legendary" || item.item_rarity === "epic") counts.gold += 1;
    else if (item.item_rarity === "rare") counts.silver += 1;
    else counts.bronze += 1;
  });
  return counts;
}

function trophyCountsFor(userRow, inventoryRows) {
  const inventoryCounts = countInventoryTrophies(inventoryRows);
  return {
    gold: statNumber(userRow?.gold_count) + inventoryCounts.gold,
    silver: statNumber(userRow?.silver_count) + inventoryCounts.silver,
    bronze: statNumber(userRow?.bronze_count) + inventoryCounts.bronze,
    premium: statNumber(userRow?.premium_count) + inventoryCounts.premium,
  };
}

function playerWithStats(player, userRow, profileRow, inventoryRows = []) {
  const wagerWins = statNumber(userRow?.wager_wins);
  const wagerLosses = statNumber(userRow?.wager_losses);
  const profileWins = statNumber(profileRow?.total_wins);
  const profileLosses = statNumber(profileRow?.total_losses);
  const earnings = Math.max(statNumber(userRow?.lifetime_earnings), statNumber(userRow?.total_wager_earnings));

  return {
    ...player,
    user_name: playerName(userRow || profileRow || player),
    username: userRow?.username || profileRow?.username || player?.username,
    handle: userRow?.handle || profileRow?.handle || player?.handle,
    display_name_color: userRow?.display_name_color || profileRow?.display_name_color || player?.display_name_color || "",
    avatar_url: userRow?.avatar_url || profileRow?.avatar_url || player?.avatar_url || "",
    activision_id: userRow?.activision_id || player?.activision_id || "",
    badges: userRow?.badges || [],
    verified_player: userRow?.verified_player || userRow?.is_verified_player || false,
    streamer_badge: userRow?.streamer_badge || userRow?.is_streamer || false,
    is_premium: Boolean(userRow?.is_premium),
    premium_expires: userRow?.premium_expires || null,
    force_stream_required: userRow?.force_stream_required || userRow?.stream_override_required || false,
    monitor_cam_required: userRow?.monitor_cam_required || userRow?.required_monitor_cam || userRow?.moni_cam_required || false,
    wins: Math.max(profileWins, wagerWins),
    losses: Math.max(profileLosses, wagerLosses),
    trophies: trophyCountsFor(userRow, inventoryRows),
    earnings,
    socials: {
      discord: profileRow?.discord || userRow?.discord || "",
      twitter: profileRow?.twitter || profileRow?.x || userRow?.twitter || userRow?.x || userRow?.twitter_url || "",
      twitch: profileRow?.twitch || userRow?.twitch || userRow?.twitch_url || "",
      youtube: profileRow?.youtube || userRow?.youtube || userRow?.youtube_url || "",
      website: profileRow?.website || userRow?.website || userRow?.website_url || "",
    },
  };
}

async function enrichRosterPlayers(players) {
  return Promise.all((players || []).map(async (player) => {
    if (!player.user_id) return playerWithStats(player, null, null, []);
    const [userRow, profileRows, inventoryRows] = await Promise.all([
      base44.entities.User.get(player.user_id).catch(() => null),
      base44.entities.PlayerProfile.filterFresh({ user_id: player.user_id }, "-created_date", 1).catch(() => []),
      base44.entities.UserInventory.filterFresh({ user_id: player.user_id }, "-acquired_date", 100).catch(() => []),
    ]);
    return playerWithStats(player, userRow, profileRows?.[0] || null, inventoryRows);
  }));
}

async function activeMembersForTeam(teamId) {
  if (!teamId) return [];
  const members = await base44.entities.TeamMember.filterFresh({ team_id: teamId }, "-joined_date", 50).catch(() => []);
  return (members || []).filter((member) => member.is_active !== false);
}

async function matchRosters(match) {
  if (!match?.tournament_id) return { teamA: [], teamB: [] };

  const participants = await base44.entities.TournamentParticipant
    .filterFresh({ tournament_id: match.tournament_id }, "seed", 500)
    .catch(() => []);
  const participantA = (participants || []).find((participant) => participantMatchesSlot(participant, match, "a"));
  const participantB = (participants || []).find((participant) => participantMatchesSlot(participant, match, "b"));

  const [fallbackA, fallbackB] = await Promise.all([
    participantA?.members?.length ? Promise.resolve([]) : activeMembersForTeam(participantA?.team_id || match.team_a_id),
    participantB?.members?.length ? Promise.resolve([]) : activeMembersForTeam(participantB?.team_id || match.team_b_id),
  ]);

  const [teamA, teamB] = await Promise.all([
    enrichRosterPlayers(normalizeRoster(participantA, fallbackA)),
    enrichRosterPlayers(normalizeRoster(participantB, fallbackB)),
  ]);

  return { teamA, teamB };
}

function teamMonogram(name) {
  const words = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (words.length > 1) return words.slice(0, 2).map((word) => word.charAt(0)).join("").toUpperCase();
  return String(words[0] || "--").slice(0, 2).toUpperCase();
}

function TrophyCounts({ trophies, align = "end", compact = false }) {
  const counts = trophies || emptyTrophyCounts();
  return (
    <div className={`flex flex-wrap gap-1.5 overflow-visible ${align === "start" ? "justify-start" : "justify-end"}`}>
      {trophySlots.map(({ key, label, icon: Icon, className }) => {
        const count = statNumber(counts[key]);
        return (
          <span
            key={key}
            aria-label={`${label}: ${count}`}
            className={`group/trophy relative inline-flex cursor-default select-none items-center justify-center rounded-md border font-black transition-all duration-200 hover:-translate-y-0.5 ${compact ? "h-8 min-w-10 gap-1.5 px-2 text-[11px]" : "h-8 min-w-10 gap-1.5 px-2 text-[11px]"} ${count === 0 ? "opacity-70" : "ring-1 ring-current/10 shadow-[inset_0_1px_0_rgba(255,255,255,.08),0_5px_18px_-10px_currentColor]"} ${className}`}
          >
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-current/10">
              <Icon className="h-3.5 w-3.5" strokeWidth={2.25} />
            </span>
            <span className={count === 0 ? "text-vapor/65" : "text-white"}>{count}</span>
            <span className="pointer-events-none invisible absolute bottom-[calc(100%+8px)] left-1/2 z-[70] flex -translate-x-1/2 translate-y-1 items-center gap-2 whitespace-nowrap rounded-lg border border-white/[0.12] bg-[#111821] px-2.5 py-2 text-[10px] font-bold text-white opacity-0 shadow-[0_14px_36px_rgba(0,0,0,.65)] transition-all duration-150 group-hover/trophy:visible group-hover/trophy:translate-y-0 group-hover/trophy:opacity-100">
              <span className="text-vapor">{label}</span>
              <span className="font-mono text-white">{count}</span>
            </span>
          </span>
        );
      })}
    </div>
  );
}

function TournamentRankBadge({ goldTrophies }) {
  const gold = statNumber(goldTrophies);
  const rank = tournamentRankFor(gold);
  if (!rank) return null;

  return (
    <span
      title={`${gold} gold ${gold === 1 ? "trophy" : "trophies"}`}
      aria-label={`Tournament rank: ${rank.label}. ${gold} gold ${gold === 1 ? "trophy" : "trophies"}.`}
      className={`inline-flex shrink-0 cursor-default select-none items-center gap-1 rounded-md border px-1.5 py-1 text-[8px] font-black uppercase tracking-[0.1em] ${rank.className}`}
    >
      <Trophy className="h-2.5 w-2.5" strokeWidth={2.5} />
      {rank.label}
    </span>
  );
}

function MatchupScore({
  scoreA,
  scoreB,
  setScoreA,
  setScoreB,
  disabled,
  maxScore,
  teamAName,
  teamBName,
  onSubmit,
  submitting,
  scoreIsValid,
  validationMessage,
  validScoreExamples,
  predictedWinner,
  staffSubmission,
}) {
  const updateScore = (setter) => (event) => {
    if (event.target.value === "") {
      setter("");
      return;
    }
    const nextScore = Number(event.target.value);
    setter(Number.isFinite(nextScore) ? Math.min(maxScore, Math.max(0, Math.trunc(nextScore))) : 0);
  };

  const scoreField = ({ id, label, name, score, setter, tone }) => (
    <div className="min-w-0 text-center">
      <p className={`truncate text-[8px] font-black uppercase tracking-[0.16em] ${tone}`} title={name || "Waiting for opponent"}>
        {name ? teamMonogram(name) : "Waiting"}
      </p>
      {name ? (
        <label className="mt-1 block">
          <span className="sr-only">{label}</span>
          <input
            id={id}
            aria-label={label}
            type="number"
            min="0"
            max={maxScore}
            step="1"
            value={score}
            disabled={disabled}
            onChange={updateScore(setter)}
            onBlur={() => score === "" && setter(0)}
            className={`h-16 w-full appearance-none bg-transparent text-center text-5xl font-black tabular-nums outline-none transition-all duration-200 [font-family:inherit] focus:scale-105 disabled:cursor-default disabled:opacity-100 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${tone}`}
          />
        </label>
      ) : (
        <div className="mt-1 flex h-16 items-center justify-center text-4xl font-black text-vapor/25" aria-label={`${label}: waiting for opponent`}>
          &mdash;
        </div>
      )}
    </div>
  );

  return (
    <div className="relative z-10 flex items-center justify-center px-4 py-7 lg:px-2 lg:py-10">
      <div className="relative w-full max-w-[250px] overflow-hidden rounded-2xl border border-white/[0.11] bg-gradient-to-b from-white/[0.055] to-black/15 p-4 text-center shadow-[0_20px_55px_-24px_rgba(0,0,0,.95)]">
        <div aria-hidden="true" className="absolute inset-x-0 top-0 flex h-px">
          <span className="w-1/2 bg-gradient-to-r from-transparent to-accent/70" />
          <span className="w-1/2 bg-gradient-to-r from-cyan/70 to-transparent" />
        </div>
        <div className="flex items-center justify-center gap-2 text-vapor/70">
          <Swords className="h-3 w-3" strokeWidth={2.5} />
          <p className="text-[9px] font-black uppercase tracking-[0.22em]">{disabled ? "Match score" : "Enter score"}</p>
        </div>
        <div className="mt-3 grid grid-cols-[minmax(0,1fr)_28px_minmax(0,1fr)] items-center gap-1">
          {scoreField({ id: "team-a-score", label: "Team A final score", name: teamAName, score: scoreA, setter: setScoreA, tone: "text-accent" })}
          <span className="flex h-7 w-7 items-center justify-center rounded-full border border-white/[0.08] bg-black/20 text-[8px] font-black uppercase tracking-wider text-vapor/50">vs</span>
          {scoreField({ id: "team-b-score", label: "Team B final score", name: teamBName, score: scoreB, setter: setScoreB, tone: "text-cyan" })}
        </div>
        {!disabled && (
          <>
            <button
              type="button"
              onClick={onSubmit}
              disabled={!scoreIsValid || submitting}
              title={!scoreIsValid ? validationMessage : undefined}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-3 text-[11px] font-black uppercase tracking-wider text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Check className="h-4 w-4" />
              {submitting ? "Submitting..." : staffSubmission ? "Submit result" : "Submit score"}
            </button>
            {predictedWinner && scoreIsValid ? (
              <p className="mt-2 truncate text-[9px] text-vapor" title={predictedWinner}>
                Winner: <span className="font-bold text-white">{predictedWinner}</span>
              </p>
            ) : (
              <p className="mt-2 text-[9px] leading-4 text-orange/90">Valid score: {validScoreExamples}</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function TeamCard({ label, name, color, seed, isFirstHost, players = [], isComplete = false, isWinner = false, finalScore = 0 }) {
  const isOrange = color === "orange";
  const toneClass = isOrange ? "text-accent" : "text-cyan";
  const tintClass = isOrange ? "bg-accent/10 border-accent/30" : "bg-cyan/10 border-cyan/30";
  const hoverToneClass = isOrange ? "hover:text-accent" : "hover:text-cyan";

  return (
    <section className="relative min-w-0 px-4 py-5 sm:p-6">
      <div className={`absolute inset-x-6 top-0 h-px ${isOrange ? "bg-gradient-to-r from-transparent via-accent/65 to-transparent" : "bg-gradient-to-r from-transparent via-cyan/65 to-transparent"}`} />
      <div className="flex items-center gap-4 border-b border-white/[0.06] pb-4">
        <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border font-mono text-base font-black shadow-[inset_0_1px_0_rgba(255,255,255,.05)] ${tintClass} ${toneClass}`}>{teamMonogram(name)}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className={`text-[9px] font-black uppercase tracking-[0.18em] ${toneClass}`}>{label} roster</p>
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              <span className="rounded-md border border-white/[0.06] bg-background/40 px-2 py-0.5 text-[8px] font-black uppercase tracking-wider text-vapor">Seed {seedLabel(seed)}</span>
              {isFirstHost && <span className={`rounded-md border px-2 py-0.5 text-[8px] font-black uppercase tracking-wider ${tintClass} ${toneClass}`}>Hosts map 1</span>}
            </div>
          </div>
          <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-2.5">
            <h3 className="truncate text-xl font-black sm:text-2xl">{name || "Open slot"}</h3>
            {isWinner && <span className="inline-flex items-center gap-1 rounded-md border border-green/25 bg-green/[0.09] px-2 py-1 text-[8px] font-black uppercase tracking-wider text-green"><Trophy className="h-3 w-3" /> Winner</span>}
          </div>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-vapor">{players.length} confirmed player{players.length === 1 ? "" : "s"}</p>
        </div>
        {isComplete && name && (
          <div className="w-[100px] shrink-0 rounded-xl border border-white/[0.08] bg-black/20 px-4 py-2.5 text-center shadow-[inset_0_1px_0_rgba(255,255,255,.035)]">
            <p className="text-[8px] font-black uppercase tracking-[0.16em] text-vapor">Final score</p>
            <p className={`mt-1 font-mono text-2xl font-black tabular-nums ${toneClass}`}>{finalScore ?? 0}</p>
          </div>
        )}
      </div>
      <div className="pt-4">
        <div className="mb-2 flex items-center justify-between gap-3 px-1"><p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/70">Confirmed lineup</p><p className="text-[8px] font-black uppercase tracking-[0.16em] text-vapor/65">Performance</p></div>
        {players.length === 0 ? (
          <div className="flex min-h-24 items-center justify-center rounded-xl border border-dashed border-white/10 bg-white/[0.03] text-xs text-vapor">Roster unavailable</div>
        ) : (
          <div className="space-y-2">
            {players.map((player, index) => {
              const profileSlug = player.user_id || player.username || player.handle || player.user_name;
              const displayName = playerName(player);
              return (
                <article key={player.user_id || `${displayName}-${index}`} className="group/player relative overflow-visible rounded-xl border border-white/[0.065] bg-white/[0.025] p-3 transition-all duration-200 hover:z-20 hover:border-white/[0.12] hover:bg-white/[0.04]">
                  <div className="flex flex-col gap-2.5 xl:flex-row xl:items-center">
                    <div className="flex w-full min-w-0 flex-none items-center gap-3 xl:flex-1">
                      <span className={`flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border font-mono text-sm font-black shadow-[inset_0_1px_0_rgba(255,255,255,.05)] ${tintClass} ${toneClass}`}>{player.avatar_url ? <img src={player.avatar_url} alt="" className="h-full w-full object-cover" /> : displayName.charAt(0).toUpperCase()}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {profileSlug ? <Link to={`/profile/${encodeURIComponent(profileSlug)}`} data-name-effect={player.display_name_color || undefined} style={player.display_name_color ? { "--player-name-color": player.display_name_color } : undefined} className={`player-name-wrap text-base font-black text-foreground transition-colors ${hoverToneClass} ${player.display_name_color ? "player-name-color" : ""}`}>{displayName}</Link> : <span data-name-effect={player.display_name_color || undefined} style={player.display_name_color ? { "--player-name-color": player.display_name_color } : undefined} className={`player-name-wrap text-base font-black text-foreground ${player.display_name_color ? "player-name-color" : ""}`}>{displayName}</span>}
                          <TournamentRankBadge goldTrophies={player.trophies?.gold} />
                          <UserBadges user={player} size="xs" iconOnly showMonitorCam className="min-w-0" />
                        </div>
                        <ActivisionIdLabel user={player} className="mt-1 max-w-full" />
                      </div>
                    </div>
                    <div className="grid w-full shrink-0 grid-cols-3 divide-x divide-white/[0.06] overflow-hidden rounded-lg border border-white/[0.04] bg-black/20 xl:w-[270px]">
                      <div className="min-w-0 px-2.5 py-2">
                        <p className="text-[8px] font-black uppercase tracking-[0.14em] text-vapor/75">Role</p>
                        <p className={`mt-1 flex items-center gap-1 text-[9px] font-black uppercase ${player.role === "captain" ? "text-cyan" : "text-vapor"}`}>
                          {player.role === "captain" ? <Crown className="h-3 w-3 shrink-0" /> : <Shield className="h-3 w-3 shrink-0" />}
                          <span className="truncate">{player.role === "captain" ? "Captain" : "Member"}</span>
                        </p>
                      </div>
                      <div className="px-3 py-2">
                        <p className="text-[8px] font-black uppercase tracking-[0.14em] text-vapor/75">Record</p>
                        <p className="mt-1 flex items-baseline gap-1.5 font-mono text-sm font-black"><span className="text-white">{statNumber(player.wins)}W</span><span className="text-vapor/35">/</span><span className="text-vapor">{statNumber(player.losses)}L</span></p>
                      </div>
                      <div className="bg-green/[0.04] px-3 py-2">
                        <p className="text-[8px] font-black uppercase tracking-[0.14em] text-green/70">Earned</p>
                        <p className="mt-1 font-mono text-sm font-black text-green">{moneyLabel(player.earnings)}</p>
                      </div>
                    </div>
                  </div>
                  <div className="mt-2.5 flex items-center justify-between gap-4 rounded-lg border border-white/[0.045] bg-black/15 px-2.5 py-2">
                    <p className="flex items-center gap-1.5 text-[8px] font-black uppercase tracking-[0.18em] text-white/65"><Trophy className="h-3 w-3 text-yellow-300" /> Trophies</p>
                    <TrophyCounts trophies={player.trophies} />
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

const rosterSocialDefinitions = [
  { key: "discord", label: "Discord", icon: MessageCircle },
  { key: "twitter", label: "X", icon: AtSign },
  { key: "twitch", label: "Twitch", icon: Twitch },
  { key: "youtube", label: "YouTube", icon: Youtube },
  { key: "website", label: "Website", icon: Globe2 },
];

const rosterSocialUrl = (key, value) => {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^https?:\/\//i.test(text)) return text;
  if (key === "discord") {
    const invite = text.replace(/^discord\.gg\//i, "").replace(/^discord\.com\/invite\//i, "");
    return invite !== text ? `https://discord.gg/${invite}` : "";
  }
  const handle = text.replace(/^@/, "");
  if (key === "twitter") return `https://x.com/${handle}`;
  if (key === "twitch") return `https://twitch.tv/${handle}`;
  if (key === "youtube") return `https://youtube.com/${handle}`;
  if (key === "website") return `https://${text}`;
  return "";
};

function RosterSocials({ socials }) {
  const available = rosterSocialDefinitions.filter(({ key }) => socials?.[key]);
  if (available.length === 0) return <span className="text-xs text-vapor/45">&mdash;</span>;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {available.map(({ key, label, icon: Icon }) => {
        const value = socials[key];
        const href = rosterSocialUrl(key, value);
        const classes = "inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.08] bg-black/20 text-vapor transition-colors hover:border-cyan/30 hover:text-cyan";
        return href ? (
          <a key={key} href={href} target="_blank" rel="noreferrer" title={label} aria-label={label} className={classes}>
            <Icon className="h-3.5 w-3.5" />
          </a>
        ) : (
          <span key={key} title={`${label}: ${value}`} aria-label={`${label}: ${value}`} className={classes}>
            <Icon className="h-3.5 w-3.5" />
          </span>
        );
      })}
    </div>
  );
}

function TournamentTeamTable({ label, name, color, seed, isFirstHost, players = [], isComplete = false, isWinner = false, finalScore = 0 }) {
  const isOrange = color === "orange";
  const toneClass = isOrange ? "text-orange" : "text-cyan";
  const tintClass = isOrange ? "border-orange/30 bg-orange/10" : "border-cyan/30 bg-cyan/10";
  const hoverToneClass = isOrange ? "hover:text-orange" : "hover:text-cyan";

  return (
    <section className="relative overflow-visible rounded-xl border border-white/[0.075] bg-white/[0.018]">
      <div className={`absolute inset-x-10 top-0 h-px ${isOrange ? "bg-gradient-to-r from-transparent via-orange/70 to-transparent" : "bg-gradient-to-r from-transparent via-cyan/70 to-transparent"}`} />
      <header className="flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:px-5">
        <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border font-mono text-base font-black ${tintClass} ${toneClass}`}>{teamMonogram(name)}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className={`text-[9px] font-black uppercase tracking-[0.2em] ${toneClass}`}>{label}</p>
            <span className="rounded-md border border-white/[0.06] bg-black/20 px-2 py-0.5 text-[8px] font-black uppercase tracking-wider text-vapor">Seed {seedLabel(seed)}</span>
            {isFirstHost && <span className={`rounded-md border px-2 py-0.5 text-[8px] font-black uppercase tracking-wider ${tintClass} ${toneClass}`}>Hosts map 1</span>}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2.5">
            <h3 className="truncate text-xl font-black sm:text-2xl">{name || "Open slot"}</h3>
            {isWinner && <span className="inline-flex items-center gap-1 rounded-md border border-green/25 bg-green/[0.09] px-2 py-1 text-[8px] font-black uppercase tracking-wider text-green"><Trophy className="h-3 w-3" /> Winner</span>}
          </div>
          <p className="mt-1 text-[9px] font-bold uppercase tracking-wider text-vapor">{players.length} confirmed player{players.length === 1 ? "" : "s"}</p>
        </div>
        {isComplete && name && (
          <div className="min-w-28 shrink-0 rounded-xl border border-white/[0.08] bg-black/20 px-5 py-2.5 text-center">
            <p className="text-[8px] font-black uppercase tracking-[0.16em] text-vapor">Final score</p>
            <p className={`mt-1 font-mono text-2xl font-black tabular-nums ${toneClass}`}>{finalScore ?? 0}</p>
          </div>
        )}
      </header>

      <div className="hidden grid-cols-[minmax(210px,1.25fr)_minmax(170px,.9fr)_90px_minmax(210px,1fr)_86px] gap-3 border-y border-white/[0.06] bg-white/[0.035] px-5 py-3 text-[8px] font-black uppercase tracking-[0.18em] text-vapor lg:grid">
        <span>User</span>
        <span>Gamertag</span>
        <span>Record</span>
        <span>Trophies</span>
        <span>Socials</span>
      </div>

      {players.length === 0 ? (
        <div className="flex min-h-28 items-center justify-center border-t border-white/[0.06] text-xs text-vapor">Roster unavailable</div>
      ) : (
        <div className="divide-y divide-white/[0.055]">
          {players.map((player, index) => {
            const profileSlug = player.user_id || player.username || player.handle || player.user_name;
            const displayName = playerName(player);
            return (
              <article key={player.user_id || `${displayName}-${index}`} className="grid gap-4 px-4 py-4 transition-colors hover:bg-white/[0.025] sm:px-5 lg:grid-cols-[minmax(210px,1.25fr)_minmax(170px,.9fr)_90px_minmax(210px,1fr)_86px] lg:items-center lg:gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className={`flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border font-mono text-sm font-black ${tintClass} ${toneClass}`}>
                    {player.avatar_url ? <img src={player.avatar_url} alt="" className="h-full w-full object-cover" /> : displayName.charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      {profileSlug ? <Link to={`/profile/${encodeURIComponent(profileSlug)}`} data-name-effect={player.display_name_color || undefined} style={player.display_name_color ? { "--player-name-color": player.display_name_color } : undefined} className={`player-name-wrap text-sm font-black text-white transition-colors ${hoverToneClass} ${player.display_name_color ? "player-name-color" : ""}`}>{displayName}</Link> : <span data-name-effect={player.display_name_color || undefined} style={player.display_name_color ? { "--player-name-color": player.display_name_color } : undefined} className={`player-name-wrap text-sm font-black text-white ${player.display_name_color ? "player-name-color" : ""}`}>{displayName}</span>}
                      <TournamentRankBadge goldTrophies={player.trophies?.gold} />
                      <UserBadges user={player} size="xs" iconOnly showMonitorCam className="min-w-0" />
                    </div>
                    <p className="mt-1 text-[9px] text-vapor"><span className={`font-black uppercase ${player.role === "captain" ? "text-cyan" : "text-vapor"}`}>{player.role === "captain" ? "Captain" : "Member"}</span><span className="mx-1.5 text-white/20">&bull;</span>Earned <span className="font-mono font-black text-green">{moneyLabel(player.earnings)}</span></p>
                  </div>
                </div>

                <div className="min-w-0">
                  <p className="mb-1 text-[8px] font-black uppercase tracking-wider text-vapor lg:hidden">Gamertag</p>
                  <div className="inline-flex max-w-full rounded-lg border border-white/[0.07] bg-black/20 px-3 py-2">
                    <ActivisionIdLabel user={player} className="max-w-full" />
                  </div>
                </div>

                <div>
                  <p className="mb-1 text-[8px] font-black uppercase tracking-wider text-vapor lg:hidden">Record</p>
                  <p className="font-mono text-sm font-black"><span className="text-white">{statNumber(player.wins)}W</span><span className="mx-1.5 text-white/20">/</span><span className="text-vapor">{statNumber(player.losses)}L</span></p>
                </div>

                <div>
                  <p className="mb-1 text-[8px] font-black uppercase tracking-wider text-vapor lg:hidden">Trophies</p>
                  <TrophyCounts trophies={player.trophies} align="start" compact />
                </div>

                <div>
                  <p className="mb-1 text-[8px] font-black uppercase tracking-wider text-vapor lg:hidden">Socials</p>
                  <RosterSocials socials={player.socials} />
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function TournamentChatColumn({
  match,
  teamAPlayers,
  teamBPlayers,
  isStreamerMatch,
  isMatchParticipant,
  adminSupportUnlocked,
  supportWindowUnlocked,
  requestingAdmin,
  disputing,
  onRequestAdmin,
  onCreateDispute,
}) {
  return (
    <aside className="min-w-0 xl:h-full">
      <MatchRoomChat
        conversationId={match.id}
        matchType="tournament"
        teamAPlayers={teamAPlayers}
        teamBPlayers={teamBPlayers}
        inputActions={!isStreamerMatch ? (
          <div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onRequestAdmin}
                disabled={!isMatchParticipant || !adminSupportUnlocked || requestingAdmin}
                title={!adminSupportUnlocked ? "Available when both teams are assigned" : "Request help from tournament staff"}
                className="flex items-center justify-center gap-2 rounded-lg border border-blue-400/20 bg-blue-400/[0.07] px-2 py-2.5 text-[10px] font-black uppercase tracking-wider text-blue-300 transition-all hover:bg-blue-400/15 disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Gavel className="h-3.5 w-3.5" /> {requestingAdmin ? "Requesting..." : "Request admin"}
              </button>
              <button
                type="button"
                onClick={onCreateDispute}
                disabled={!isMatchParticipant || !supportWindowUnlocked || disputing}
                title={!supportWindowUnlocked ? "Available after the 15-minute start timer expires" : "Open a dispute with evidence"}
                className="flex items-center justify-center gap-2 rounded-lg border border-orange/25 bg-orange/[0.08] px-2 py-2.5 text-[10px] font-black uppercase tracking-wider text-orange transition-all hover:bg-orange/15 disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Flag className="h-3.5 w-3.5" /> {disputing ? "Submitting..." : "Dispute"}
              </button>
            </div>
            {!supportWindowUnlocked && isMatchParticipant && (
              <p className="mt-2 text-center text-[9px] leading-4 text-vapor">Admin help is available now. Disputes unlock when the start timer reaches 00:00.</p>
            )}
            {(match.admin_request_status || match.requested_admin) && (
              <p className="mt-2 text-center text-[9px] font-bold text-blue-300">
                Admin request: {{
                  waiting_for_admin: "Waiting for admin",
                  admin_joined: match.assigned_admin_name ? `${match.assigned_admin_name} joined` : "Admin joined",
                  waiting_for_user: "Waiting for you",
                  escalated: "Escalated",
                  resolved: "Resolved",
                  closed: "Closed",
                }[match.admin_request_status || "waiting_for_admin"] || "Waiting for admin"}
              </p>
            )}
          </div>
        ) : null}
      />
    </aside>
  );
}

function MapSeries({ match, stacked = false }) {
  const maps = Array.isArray(match.maps) ? match.maps : [];
  const pool = Array.isArray(match.map_pool) && match.map_pool.length ? match.map_pool : defaultMapPool;
  const bestOf = Math.max(1, Number(match.best_of || match.map_sequence?.length || maps.length || 3));

  return (
    <section className="dark-focus dark-media rounded-xl border border-white/[0.09] p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-white">
          <MapIcon className="h-4 w-4 text-cyan" /> Map Series
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-lg border border-cyan/20 bg-cyan/[0.07] px-3 py-2 text-[9px] font-black uppercase tracking-wider text-cyan">
            BO{bestOf} · {match.game_mode || `Best of ${bestOf}`}
          </span>
          <span className="rounded-lg border border-white/[0.07] bg-black/15 px-3 py-2 text-[9px] font-bold text-vapor">
            First host <strong className="ml-1 text-white">{match.first_host_team_name || "TBD"}</strong>
            {match.first_host_seed ? <span className="ml-1 text-cyan">{seedLabel(match.first_host_seed)}</span> : null}
          </span>
        </div>
      </div>

      <div className={`mt-4 grid gap-2 ${stacked ? "grid-cols-1" : "sm:grid-cols-3"}`}>
        {maps.length === 0 ? (
          <div className={`rounded-lg border border-white/[0.06] bg-black/15 p-4 text-sm text-vapor ${stacked ? "" : "sm:col-span-3"}`}>
            Maps are being generated.
          </div>
        ) : maps.map((map) => {
          const image = tournamentMapImage(map.map);

          return (
            <article
              key={`${map.game}-${map.game_mode || map.mode}-${map.map}`}
              className={`group relative isolate overflow-hidden rounded-xl border border-white/[0.1] bg-black/25 shadow-[0_12px_28px_rgba(0,0,0,0.2)] ${stacked ? "min-h-[112px]" : "min-h-[156px]"}`}
            >
              {image ? (
                <img
                  src={image}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.035]"
                />
              ) : null}
              <div className="absolute inset-0 bg-gradient-to-t from-[#070b11] via-[#070b11]/45 to-[#070b11]/60" />
              <div className={`relative flex flex-col justify-between p-3.5 ${stacked ? "min-h-[112px]" : "min-h-[156px]"}`}>
                <div className="flex items-start justify-between gap-2">
                  <p className="rounded-md border border-cyan/25 bg-[#07121b]/85 px-2 py-1 text-[8px] font-black uppercase tracking-[0.16em] text-cyan backdrop-blur-sm">
                    Map {map.game}
                  </p>
                  <span className="max-w-[68%] truncate rounded-md border border-white/15 bg-[#080c12]/80 px-2 py-1 text-[7px] font-black uppercase tracking-wider text-white/85 backdrop-blur-sm">
                    {map.mode || "Search and Destroy"}
                  </span>
                </div>

                <div>
                  <h3
                    className="inline-block max-w-full truncate rounded-md border border-white/10 bg-[#080c12]/85 px-2 py-1 text-lg font-black leading-none text-white shadow-lg backdrop-blur-sm"
                    title={map.map}
                  >
                    {map.map}
                  </h3>
                  <p className="mt-1.5 inline-flex max-w-full items-center rounded-md border border-white/10 bg-[#080c12]/80 px-2 py-1 text-[9px] text-white/75 backdrop-blur-sm">
                    <span>Host</span>
                    <strong className="ml-1.5 truncate text-cyan">{map.host_team_name || "TBD"}</strong>
                    {map.host_seed ? <span className="ml-1 text-white/60">{seedLabel(map.host_seed)}</span> : null}
                  </p>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <div className="mt-4 border-t border-white/[0.06] pt-3">
        <p className="mb-2 text-[8px] font-black uppercase tracking-[0.16em] text-vapor/65">Available map pool</p>
        <div className="flex flex-wrap gap-1.5">
          {pool.map((map) => (
            <span key={map} className="rounded-md border border-white/[0.06] bg-black/15 px-2 py-1 text-[8px] font-black uppercase tracking-wider text-vapor">
              {map}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function BracketPreview({ matches, currentId, tournament }) {
  if (matches.length === 0) return null;
  return <TournamentBracket matches={matches} currentId={currentId} tournament={tournament} />;
}

function AdminTools({ match, canAdminCorrect, canAdminResolve, resolving, onResetDispute, onCorrection, onResolve }) {
  const hasDisputeAction = ["score_conflict", "disputed"].includes(match.status);
  if (!hasDisputeAction && !canAdminCorrect && !canAdminResolve) return null;

  const actionClass = "flex w-full items-center justify-center gap-2 rounded-lg border border-blue-400/20 bg-blue-400/[0.07] px-3 py-2.5 text-[9px] font-black uppercase tracking-wider text-blue-300 transition-colors hover:bg-blue-400/15 disabled:opacity-50";

  return (
    <details className="group mt-4 border-t border-white/[0.06] pt-3">
      <summary className="flex cursor-pointer list-none items-center justify-between rounded-lg border border-blue-400/15 bg-blue-400/[0.05] px-3 py-2.5 text-[10px] font-black uppercase tracking-wider text-blue-300 transition-colors hover:bg-blue-400/10 [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2"><Gavel className="h-3.5 w-3.5" /> Admin tools</span>
        <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
      </summary>
      <div className="mt-2 grid gap-2">
        {hasDisputeAction && (
          <button type="button" onClick={onResetDispute} disabled={resolving} className={actionClass}>
            <RefreshCw className="h-3.5 w-3.5" /> Reset dispute
          </button>
        )}
        {canAdminCorrect && (
          <>
            <button type="button" onClick={() => onCorrection("reset_score")} disabled={resolving} className={actionClass}>
              <RefreshCw className="h-3.5 w-3.5" /> Reset 0-0
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => onCorrection("grant_team_a")} disabled={resolving} className={actionClass}>
                <ShieldCheck className="h-3.5 w-3.5" /> Team A win
              </button>
              <button type="button" onClick={() => onCorrection("grant_team_b")} disabled={resolving} className={actionClass}>
                <ShieldCheck className="h-3.5 w-3.5" /> Team B win
              </button>
            </div>
          </>
        )}
        {canAdminResolve && (
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => onResolve("approve_team_a")} disabled={resolving} className={actionClass}>
              <ShieldCheck className="h-3.5 w-3.5" /> Approve A
            </button>
            <button type="button" onClick={() => onResolve("approve_team_b")} disabled={resolving} className={actionClass}>
              <ShieldCheck className="h-3.5 w-3.5" /> Approve B
            </button>
          </div>
        )}
      </div>
    </details>
  );
}

function MatchStateBar({ match, onRefresh, onOpenBracket, adminTools = null }) {
  const items = [
    { label: "Status", value: statusLabel(match.status), valueClass: "capitalize text-cyan" },
    { label: "Bracket", value: bracketLabels[match.bracket] || match.bracket || "Tournament" },
    { label: "Format", value: `BO${match.best_of || 3} ${match.game_mode || "Series"}` },
    { label: "First host", value: match.first_host_team_name || "TBD" },
    { label: "Admin", value: match.requested_admin ? "Requested" : "Not requested", valueClass: match.requested_admin ? "text-orange" : "" },
  ];

  return (
    <section className="dark-focus dark-media h-full rounded-xl border border-white/[0.09] p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-white">
          <Shield className="h-4 w-4 text-orange" /> Match State
        </h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenBracket}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-cyan/25 bg-cyan/10 px-3 py-2 text-[9px] font-black uppercase tracking-wider text-cyan transition-colors hover:bg-cyan/20"
          >
            <LayoutGrid className="h-3.5 w-3.5" /> Bracket
          </button>
          <button
            type="button"
            onClick={onRefresh}
            className="inline-flex items-center justify-center rounded-lg border border-white/10 bg-secondary/50 p-2 text-vapor transition-colors hover:bg-secondary hover:text-white"
            title="Refresh match"
            aria-label="Refresh match"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-2">
        {items.map((item) => (
          <div key={item.label} className={`rounded-lg border border-white/[0.06] bg-black/15 px-3 py-2 ${item.label === "Admin" ? "col-span-2" : ""}`}>
            <dt className="text-[8px] font-black uppercase tracking-[0.16em] text-vapor/65">{item.label}</dt>
            <dd className={`mt-1 truncate text-[11px] font-bold ${item.valueClass || "text-white"}`} title={item.value}>
              {item.value}
            </dd>
          </div>
        ))}
      </dl>
      <div className="mt-4 border-t border-white/[0.06] pt-3">
        <p className="mb-2 flex items-center gap-2 text-[9px] font-black uppercase tracking-wider text-vapor">
          <Swords className="h-3.5 w-3.5 text-cyan" /> Advancement
        </p>
        <div className="space-y-1.5 text-[11px]">
          <div className="flex items-center justify-between gap-3"><span className="text-vapor">Winner</span><span className="truncate font-mono text-cyan">{match.next_match_id ? `#${match.next_match_id.slice(-8)}` : "Tournament result"}</span></div>
          <div className="flex items-center justify-between gap-3"><span className="text-vapor">Loser</span><span className="truncate font-mono text-orange">{match.loser_match_id ? `#${match.loser_match_id.slice(-8)}` : "Elimination"}</span></div>
        </div>
      </div>
      {adminTools}
    </section>
  );
}

export default function TournamentMatchRoom() {
  const { id } = useParams();
  const [match, setMatch] = useState(null);
  const [tournament, setTournament] = useState(null);
  const [bracketMatches, setBracketMatches] = useState([]);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [requestingAdmin, setRequestingAdmin] = useState(false);
  const [disputing, setDisputing] = useState(false);
  const [resolvingAdmin, setResolvingAdmin] = useState(false);
  const [scoreModalOpen, setScoreModalOpen] = useState(false);
  const [championResult, setChampionResult] = useState(null);
  const [scoreA, setScoreA] = useState(0);
  const [scoreB, setScoreB] = useState(0);
  const [clockNow, setClockNow] = useState(Date.now());
  const [teamAPlayers, setTeamAPlayers] = useState([]);
  const [teamBPlayers, setTeamBPlayers] = useState([]);
  const joinedAdminRooms = useRef(new Set());
  const bracketRef = useRef(null);

  useEffect(() => {
    loadRoom();
  }, [id]);

  // A completed flag without a winner is a stale/reset record, not a result.
  // Treating that state as complete produced the misleading "Winner:" / 0-0
  // banner and also hid all score controls after an admin reset.
  const isComplete = Boolean(match?.winner_id && (match?.completed || match?.status === "completed"));
  const isStaff = isStaffUser(user);
  const isMatchParticipant = useMemo(() => {
    if (!user?.id) return false;
    return [...teamAPlayers, ...teamBPlayers].some((player) => rosterPlayerMatchesUser(player, user));
  }, [teamAPlayers, teamBPlayers, user]);
  const canStaffSubmitResult = isStaff && !isMatchParticipant;
  const canChat = isMatchParticipant || isStaff;
  const canSubmit = useMemo(() => (
    Boolean(
      match?.team_a_id
      && match?.team_b_id
      && !isComplete
      && (isMatchParticipant || canStaffSubmitResult)
      && (!["disputed", "score_conflict"].includes(match?.status) || canStaffSubmitResult)
    )
  ), [match?.team_a_id, match?.team_b_id, match?.status, isMatchParticipant, canStaffSubmitResult, isComplete]);
  const bestOf = tournamentBestOf(match);
  const winsNeeded = tournamentRequiredWins(match);
  const scoreValidationError = tournamentScoreError(match, scoreA, scoreB);
  const scoreIsValid = !scoreValidationError;
  const startDeadlineMs = new Date(match?.start_deadline || "").getTime();
  const hasStartDeadline = Number.isFinite(startDeadlineMs);
  const startSecondsRemaining = hasStartDeadline
    ? Math.max(0, Math.ceil((startDeadlineMs - clockNow) / 1000))
    : null;
  const startWindowExpired = hasStartDeadline && startSecondsRemaining === 0;
  const supportWindowUnlocked = isStaff || startWindowExpired;
  const adminSupportUnlocked = Boolean(match?.team_a_id && match?.team_b_id && !isComplete);

  const handleOpenBracket = () => {
    if (!bracketRef.current) return;
    bracketRef.current.open = true;
    window.requestAnimationFrame(() => bracketRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  useEffect(() => {
    setClockNow(Date.now());
    if (!match?.start_deadline || isComplete) return undefined;
    const timer = window.setInterval(() => setClockNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [match?.start_deadline, isComplete]);

  useEffect(() => {
    if (!match?.id || !user?.id || !isStaffUser(user)) return;
    if (!match.requested_admin || !match.admin_request_ticket_id) return;
    if (["admin_joined", "resolved", "closed"].includes(match.admin_request_status)) return;
    if (joinedAdminRooms.current.has(match.id)) return;

    joinedAdminRooms.current.add(match.id);
    base44.functions.invoke("joinMatchRoomAsAdmin", {
      match_type: "tournament",
      match_id: match.id,
      ticket_id: match.admin_request_ticket_id,
    }).then((response) => {
      if (response.data?.success && response.data?.match) {
        setMatch(response.data.match);
      }
    }).catch((error) => {
      console.error("Failed to join tournament room as admin:", error);
    });
  }, [match?.id, match?.requested_admin, match?.admin_request_status, match?.admin_request_ticket_id, user]);

  const loadRoom = async () => {
    try {
      setLoading(true);
      const [currentUser, matchData] = await Promise.all([
        base44.auth.me().catch(() => null),
        base44.entities.TournamentMatch.get(id),
      ]);
      let activeMatch = matchData;
      if (activeMatch.team_a_id && activeMatch.team_b_id) {
        // Always re-sync the match setup when both teams are assigned. The
        // backend keeps matching generation keys stable, while this also fixes
        // older bracket matches that were generated with a stale game mode
        // (for example 3x S&D after the tournament was configured for HP).
        const setup = await base44.functions.invoke("ensureTournamentMatchSetup", {
          tournament_match_id: activeMatch.id,
        }).catch(() => null);
        if (setup?.data?.success && setup.data.match) {
          activeMatch = setup.data.match;
        }
      }
      const [tournamentData, matchesData, rosters] = await Promise.all([
        base44.entities.Tournament.get(activeMatch.tournament_id),
        base44.entities.TournamentMatch.filterFresh({ tournament_id: activeMatch.tournament_id }, "round", 500).catch(() => []),
        matchRosters(activeMatch),
      ]);

      setUser(currentUser);
      setMatch(activeMatch);
      setTournament(tournamentData);
      setBracketMatches((matchesData || []).map((row) => row.id === activeMatch.id ? activeMatch : row));
      setTeamAPlayers(rosters.teamA);
      setTeamBPlayers(rosters.teamB);
      setScoreA(activeMatch.team_a_score ?? activeMatch.reported_score_alpha ?? 0);
      setScoreB(activeMatch.team_b_score ?? activeMatch.reported_score_bravo ?? 0);
    } catch (error) {
      console.error("Failed to load tournament match:", error);
      toast({ title: "Error loading match", description: error.message || "Match not found.", variant: "destructive" });
      setMatch(null);
      setTeamAPlayers([]);
      setTeamBPlayers([]);
    } finally {
      setLoading(false);
    }
  };

  const handleComplete = async () => {
    if (!canSubmit) return;
    if (scoreValidationError) {
      toast({ title: "Invalid series score", description: scoreValidationError, variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      const response = await base44.functions.invoke("completeTournamentMatch", {
        tournament_match_id: match.id,
        team_a_score: scoreA,
        team_b_score: scoreB,
        proof_urls: [],
      });

      if (response.data?.success) {
        setScoreModalOpen(false);
        if (response.data.ready_to_complete === false) {
          toast({
            title: response.data.status === "score_conflict" ? "Score conflict opened" : "Score report submitted",
            description: response.data.message || (response.data.status === "score_conflict" ? "Staff must review the conflicting reports." : "Waiting for the other team to report the same score."),
            variant: response.data.status === "score_conflict" ? "destructive" : undefined,
          });
          await loadRoom();
          return;
        }

        const completedMatch = response.data.match || match;
        const tournamentFinished = Boolean(
          response.data.tournament_completed
          || (
            cleanKey(match.bracket) === "grand_final"
            && completedMatch?.completed
            && !response.data.advanced_to
            && !response.data.loser_sent_to
            && !response.data.grand_final_reset
          )
        );

        if (tournamentFinished) {
          await loadRoom();
          setChampionResult({
            winnerName: completedMatch.winner_name || predictedWinner || "Tournament winner",
            tournamentName: response.data.tournament?.name || tournament?.name || "the tournament",
            teamAName: completedMatch.team_a_name || match.team_a_name || "Team A",
            teamBName: completedMatch.team_b_name || match.team_b_name || "Team B",
            teamAScore: completedMatch.team_a_score ?? scoreA,
            teamBScore: completedMatch.team_b_score ?? scoreB,
          });
          return;
        }

        toast({
          title: "Tournament match completed",
          description: response.data.advanced_to ? "Winner advanced automatically." : "Tournament result recorded.",
        });
        await loadRoom();
      } else {
        toast({ title: "Completion failed", description: response.data?.error || "Could not complete match.", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Completion failed", description: error.message || "Could not complete match.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleRequestAdmin = async () => {
    if (isStreamerTournament(tournament)) {
      toast({ title: "Streamer lobby moderation", description: "Streamer tournaments use host chat moderation instead of admin tickets." });
      return;
    }
    if (!adminSupportUnlocked) {
      toast({ title: "Admin support is not available yet", description: "Wait until both teams are assigned to this match." });
      return;
    }
    setRequestingAdmin(true);
    try {
      const response = await base44.functions.invoke("requestAdminAlert", {
        match_type: "tournament",
        match_id: match.id,
        subject: `Tournament match admin request ${match.id}`,
        description: `Admin requested for tournament match ${match.id} in ${tournament?.name || "tournament"}.\n${match.team_a_name || "Open slot"} vs ${match.team_b_name || "Open slot"}`,
        priority: user?.is_premium ? "critical" : "high",
      });

      if (response.data?.success) {
        toast({ title: "Admin requested", description: "A staff alert and ticket were created." });
        await loadRoom();
      } else {
        toast({ title: "Request failed", description: response.data?.error || "Could not request admin.", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Request failed", description: error.message || "Could not request admin.", variant: "destructive" });
    } finally {
      setRequestingAdmin(false);
    }
  };

  const handleCreateDispute = async () => {
    if (isStreamerTournament(tournament)) {
      toast({ title: "Disputes disabled", description: "Streamer tournaments do not create dispute cases." });
      return;
    }
    if (!supportWindowUnlocked) {
      toast({
        title: "Disputes are still locked",
        description: "You can open a dispute after the 15-minute match start timer reaches 00:00.",
      });
      return;
    }
    const evidenceText = typeof window !== "undefined" ? window.prompt("Evidence URLs (comma or line separated):", "") : "";
    if (evidenceText === null) return;
    const evidenceUrls = evidenceText.split(/[\n,]+/).map((url) => url.trim()).filter(Boolean);
    setDisputing(true);
    try {
      const response = await base44.functions.invoke("createDispute", {
        match_type: "tournament",
        match_id: match.id,
        tournament_match_id: match.id,
        reason: "score_dispute",
        description: `Dispute submitted from tournament match room ${match.id} in ${tournament?.name || "tournament"}. ${match.team_a_name || "Team A"} vs ${match.team_b_name || "Team B"}`,
        // team_a_id/team_b_id are tournament participant/team ids, not user ids.
        // Resolve the current side from the loaded roster so disputes target the
        // actual opposing team even when the user is a team member/captain.
        reported_against: teamAPlayers.some((player) => rosterPlayerMatchesUser(player, user))
          ? match.team_b_id
          : teamBPlayers.some((player) => rosterPlayerMatchesUser(player, user))
            ? match.team_a_id
            : undefined,
        reported_against_name: teamAPlayers.some((player) => rosterPlayerMatchesUser(player, user))
          ? match.team_b_name
          : teamBPlayers.some((player) => rosterPlayerMatchesUser(player, user))
            ? match.team_a_name
            : undefined,
        evidence_urls: evidenceUrls,
        escalated: Boolean(user?.is_premium),
      });

      if (response.data?.success) {
        toast({ title: response.data.escalated ? "Dispute escalated" : "Dispute submitted", description: "A review case was created for staff." });
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

  const handleAdminResolve = async (action) => {
    const teamName = action === "approve_team_a"
      ? (match.team_a_name || "Team A")
      : (match.team_b_name || "Team B");
    const confirmed = typeof window === "undefined"
      ? true
      : window.confirm(`Grant win to ${teamName} and auto-loss the other team?`);
    if (!confirmed) return;

    setResolvingAdmin(true);
    try {
      const response = await base44.functions.invoke("adminResolveMatchRoom", {
        match_type: "tournament",
        match_id: match.id,
        ticket_id: match.admin_request_ticket_id,
        action,
        reason: `Admin granted ${teamName} the win.`,
      });

      if (response.data?.success) {
        toast({ title: "Tournament match resolved", description: response.data.message || `${teamName} was granted the win.` });
        await loadRoom();
      } else {
        toast({ title: "Resolve failed", description: response.data?.error || "Could not resolve match.", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Resolve failed", description: error.message || "Could not resolve match.", variant: "destructive" });
    } finally {
      setResolvingAdmin(false);
    }
  };

  const handleAdminCorrection = async (action) => {
    const labels = {
      reset_score: "Reset this match to 0-0",
      grant_team_a: `Give ${match.team_a_name || "Team A"} the win`,
      grant_team_b: `Give ${match.team_b_name || "Team B"} the win`,
    };
    const label = labels[action] || "Correct tournament result";
    const confirmed = typeof window === "undefined"
      ? true
      : window.confirm(`${label}? This can change bracket advancement.`);
    if (!confirmed) return;

    const reason = typeof window === "undefined"
      ? "Admin tournament result correction"
      : window.prompt("Reason for correction:", "Admin tournament result correction");
    if (reason === null) return;

    setResolvingAdmin(true);
    try {
      const response = await base44.functions.invoke("adminResolveMatchRoom", {
        match_type: "tournament",
        match_id: match.id,
        tournament_match_id: match.id,
        ticket_id: match.admin_request_ticket_id,
        action,
        reason: reason || "Admin tournament result correction",
      });

      if (response.data?.success) {
        toast({ title: "Tournament result corrected", description: response.data.message || label });
        await loadRoom();
      } else {
        toast({ title: "Correction failed", description: response.data?.error || "Could not correct tournament result.", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Correction failed", description: error.message || "Could not correct tournament result.", variant: "destructive" });
    } finally {
      setResolvingAdmin(false);
    }
  };

  const handleAdminResetDispute = async () => {
    const confirmed = typeof window === "undefined" || window.confirm("Reset this dispute, clear both reports, and let the teams continue?");
    if (!confirmed) return;
    setResolvingAdmin(true);
    try {
      const response = await base44.functions.invoke("adminResetMatchDispute", {
        match_type: "tournament",
        match_id: match.id,
      });
      if (!response.data?.success) {
        toast({ title: "Reset failed", description: response.data?.error || "Could not reset dispute.", variant: "destructive" });
        return;
      }
      setScoreA(0);
      setScoreB(0);
      await loadRoom();
      toast({ title: "Dispute reset", description: "The teams can continue and report again." });
    } catch (error) {
      toast({ title: "Reset failed", description: error.message || "Could not reset dispute.", variant: "destructive" });
    } finally {
      setResolvingAdmin(false);
    }
  };

  if (loading) {
    return <PageLoader label="Loading tournament match" />;
  }

  if (!match) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">Tournament Match Not Found</h2>
          <Link to="/tournaments" className="text-cyan hover:underline">Back to Tournaments</Link>
        </div>
      </div>
    );
  }

  const predictedWinner = scoreIsValid ? (scoreA > scoreB ? match.team_a_name : match.team_b_name) : null;
  const canAdminCorrect = adminCorrectionRoles.has(effectiveRoleForUser(user)) && match?.team_a_id && match?.team_b_id;
  const canAdminResolve = isStaff && canSubmit && !canAdminCorrect;
  const isStreamerMatch = isStreamerTournament(tournament);
  const isTeamAWinner = isComplete && (
    String(match.winner_id || "") === String(match.team_a_id || "")
    || cleanKey(match.winner_name) === cleanKey(match.team_a_name)
  );
  const isTeamBWinner = isComplete && (
    String(match.winner_id || "") === String(match.team_b_id || "")
    || cleanKey(match.winner_name) === cleanKey(match.team_b_name)
  );
  return (
    <div className="match-room-theme min-h-screen bg-obsidian py-6 sm:py-8">
      <div className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8">
        {!isComplete && match.team_a_id && match.team_b_id && (
          <div className={`relative mb-6 overflow-hidden rounded-xl border ${startWindowExpired ? "border-orange/35" : "border-border"}`}>
            <div className="relative overflow-hidden bg-card px-5 py-5 sm:px-6">
              <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-start gap-4">
                  <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${
                    startWindowExpired ? "bg-orange/12 text-orange" : "bg-cyan/12 text-cyan"
                  }`}>
                    {startWindowExpired ? <Unlock className="h-5 w-5" /> : <Clock3 className="h-5 w-5" />}
                  </span>
                  <div>
                    {!startWindowExpired && (
                      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan">Match start window</p>
                    )}
                    <h2 className="mt-1 text-lg font-black text-foreground">
                      {startWindowExpired
                        ? "Admin support is now available"
                        : "Your match is ready — start now"}
                    </h2>
                    {!startWindowExpired && (
                      <p className="mt-1 max-w-2xl text-sm leading-relaxed text-vapor">
                        You have 15 minutes to enter the lobby and begin. Admin support and disputes unlock only when this timer reaches 00:00.
                      </p>
                    )}
                  </div>
                </div>
                <div className="shrink-0 rounded-xl border border-border bg-secondary px-6 py-4 text-center">
                  <p className="text-[9px] font-black uppercase tracking-[0.2em] text-vapor">
                    {hasStartDeadline ? "Time remaining" : "Waiting for schedule"}
                  </p>
                  <p className={`mt-1 font-mono text-3xl font-black tabular-nums ${
                    startWindowExpired ? "text-orange" : "text-cyan"
                  }`}>
                    {hasStartDeadline ? formatCountdown(startSecondsRemaining) : "--:--"}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {!isComplete && ["awaiting_team_a_report", "awaiting_team_b_report"].includes(match.status) && (
          <div className="mb-3 rounded-lg border border-orange/20 bg-orange/5 px-4 py-3 text-xs text-vapor">
            <span className="font-black uppercase tracking-wider text-orange">Waiting on confirmation</span>
            <span className="ml-2">
              {match.status === "awaiting_team_a_report" ? "Team A" : "Team B"} still needs to report the matching score.
            </span>
          </div>
        )}

        <section className="dark-focus dark-media relative mb-6 overflow-visible rounded-2xl border border-white/[0.09] bg-[#111821] shadow-[0_24px_70px_-48px_rgba(0,0,0,.95)]">
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-20 top-0 h-px bg-gradient-to-r from-accent/40 via-white/10 to-cyan/40" />
          <div className="match-room-header flex flex-col gap-4 border-b border-white/[0.06] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.18em] text-orange">
                <Trophy className="h-4 w-4" /> Tournament match
              </div>
              <h1 className="mt-1.5 truncate text-lg font-black" title={tournament?.name || "Tournament"}>{tournament?.name || "Tournament"}</h1>
              <p className="mt-1 text-[10px] font-mono text-vapor">
                Round {match.round} · Match {match.match_number} · ID #{match.id?.slice(-8)}
              </p>
              {match.is_forfeit && (
                <p className="mt-2 flex items-center gap-2 truncate text-[9px] text-vapor">
                  <Flag className="h-3 w-3 shrink-0 text-orange" />
                  <span className="font-black uppercase tracking-wider text-orange">{match.match_result_badge || "Match forfeited"}</span>
                  <span className="truncate">{match.match_result_note || `${match.forfeited_by_name || "Losing team"} forfeited the match.`}</span>
                </p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {canSubmit && (
                <button type="button" onClick={() => setScoreModalOpen(true)} className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-primary-foreground transition-colors hover:bg-primary/90 sm:flex-none">
                  <Check className="h-4 w-4" /> Submit score
                </button>
              )}
              <button type="button" onClick={handleOpenBracket} className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-orange/25 bg-orange/10 px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-orange transition-colors hover:bg-orange/20 sm:flex-none">
                <LayoutGrid className="h-4 w-4" /> Bracket
              </button>
              <Link to="/tournaments" className="inline-flex flex-1 items-center justify-center rounded-lg border border-white/[0.06] bg-secondary/60 px-4 py-2.5 text-[10px] font-bold text-vapor transition-colors hover:bg-white/10 hover:text-white sm:flex-none">
                Tournaments
              </Link>
              <Link to="/rules" className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border border-cyan/25 bg-cyan/[0.07] px-4 py-2.5 text-[9px] font-black uppercase tracking-[0.12em] text-cyan transition-colors hover:border-cyan/45 hover:bg-cyan/[0.12] sm:flex-none">
                <ShieldCheck className="h-3.5 w-3.5" /> Rules
              </Link>
            </div>
          </div>
          <div className={`grid gap-4 p-3 sm:p-4 ${canChat ? "xl:grid-cols-[minmax(0,1fr)_410px]" : ""}`}>
            <div className="min-w-0 space-y-4">
              <MatchTeamTable
                label="Team A"
                color="orange"
                name={match.team_a_name}
                seed={match.team_a_seed}
                isFirstHost={String(match.first_host_team_id || "") === String(match.team_a_id || "")}
                players={teamAPlayers}
                isComplete={isComplete}
                isWinner={isTeamAWinner}
                finalScore={match.team_a_score || 0}
              />
              <div className="flex items-center gap-4 px-2" aria-hidden="true">
                <span className="h-px flex-1 bg-gradient-to-r from-transparent via-orange/55 to-white/15" />
                <span className="flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.09] bg-black/25 text-[8px] font-black uppercase tracking-wider text-vapor">VS</span>
                <span className="h-px flex-1 bg-gradient-to-r from-white/15 via-cyan/55 to-transparent" />
              </div>
              <MatchTeamTable
                label="Team B"
                color="cyan"
                name={match.team_b_name}
                seed={match.team_b_seed}
                isFirstHost={String(match.first_host_team_id || "") === String(match.team_b_id || "")}
                players={teamBPlayers}
                isComplete={isComplete}
                isWinner={isTeamBWinner}
                finalScore={match.team_b_score || 0}
              />
            </div>
            {canChat && (
              <div className="min-w-0 space-y-4">
                <TournamentChatColumn
                  match={match}
                  teamAPlayers={teamAPlayers}
                  teamBPlayers={teamBPlayers}
                  isStreamerMatch={isStreamerMatch}
                  isMatchParticipant={isMatchParticipant}
                  adminSupportUnlocked={adminSupportUnlocked}
                  supportWindowUnlocked={supportWindowUnlocked}
                  requestingAdmin={requestingAdmin}
                  disputing={disputing}
                  onRequestAdmin={handleRequestAdmin}
                  onCreateDispute={handleCreateDispute}
                />
                <MapSeries match={match} stacked />
              </div>
            )}
            {!canChat && <MapSeries match={match} stacked />}
          </div>
        </section>

        {scoreModalOpen && canSubmit && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 px-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="submit-score-title">
            <button type="button" className="absolute inset-0 cursor-default" onClick={() => setScoreModalOpen(false)} aria-label="Close score dialog" />
            <div className="dark-focus dark-media relative z-10 w-full max-w-md rounded-2xl border border-white/[0.1] bg-[#111821] p-5 shadow-[0_30px_100px_rgba(0,0,0,.75)] sm:p-6">
              <div className="flex items-start justify-between gap-4 border-b border-white/[0.06] pb-4">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-[0.18em] text-cyan">BO{bestOf}</p>
                  <h2 id="submit-score-title" className="mt-1 text-lg font-black">Submit final score</h2>
                  <p className="mt-1 text-xs text-vapor">Valid scores: {seriesScoreExamples(match)}. Your opponent must confirm the same result.</p>
                </div>
                <button type="button" onClick={() => setScoreModalOpen(false)} className="rounded-lg border border-white/[0.08] bg-black/20 p-2 text-vapor transition-colors hover:text-white" aria-label="Close">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <MatchupScore
                scoreA={scoreA}
                scoreB={scoreB}
                setScoreA={setScoreA}
                setScoreB={setScoreB}
                disabled={false}
                maxScore={winsNeeded}
                teamAName={match.team_a_name}
                teamBName={match.team_b_name}
                onSubmit={handleComplete}
                submitting={submitting}
                scoreIsValid={scoreIsValid}
                validationMessage={scoreValidationError}
                validScoreExamples={seriesScoreExamples(match)}
                predictedWinner={predictedWinner}
                staffSubmission={canStaffSubmitResult}
              />
            </div>
          </div>
        )}

        {championResult && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 px-4 backdrop-blur-md" role="dialog" aria-modal="true" aria-labelledby="champion-title">
            <button type="button" className="absolute inset-0 cursor-default" onClick={() => setChampionResult(null)} aria-label="Close congratulations dialog" />
            <div className="dark-focus dark-media relative z-10 w-full max-w-lg overflow-hidden rounded-2xl border border-green/25 bg-[#111821] p-6 text-center shadow-[0_35px_120px_rgba(0,0,0,.85)] sm:p-8">
              <div aria-hidden="true" className="pointer-events-none absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-green/80 to-transparent" />
              <button type="button" onClick={() => setChampionResult(null)} className="absolute right-4 top-4 rounded-lg border border-white/[0.08] bg-black/20 p-2 text-vapor transition-colors hover:text-white" aria-label="Close">
                <X className="h-4 w-4" />
              </button>

              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-green/25 bg-green/10 text-green shadow-[0_0_40px_rgba(52,211,153,.16)]">
                <Trophy className="h-8 w-8" />
              </div>
              <p className="mt-5 text-[9px] font-black uppercase tracking-[0.24em] text-green">Tournament completed</p>
              <h2 id="champion-title" className="mt-2 text-2xl font-black text-white sm:text-3xl">Congratulations!</h2>
              <p className="mt-2 text-sm text-vapor">
                <strong className="text-white">{championResult.winnerName}</strong> are the champions of {championResult.tournamentName}.
              </p>

              <div className="mx-auto mt-6 grid max-w-sm grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-xl border border-white/[0.08] bg-black/20 p-3">
                <div className="min-w-0">
                  <p className="truncate text-[9px] font-black uppercase tracking-wider text-orange">{championResult.teamAName}</p>
                  <p className="mt-1 font-mono text-3xl font-black text-white">{championResult.teamAScore}</p>
                </div>
                <span className="rounded-full border border-white/[0.08] bg-[#111821] px-2 py-1 text-[8px] font-black uppercase text-vapor">Final</span>
                <div className="min-w-0">
                  <p className="truncate text-[9px] font-black uppercase tracking-wider text-cyan">{championResult.teamBName}</p>
                  <p className="mt-1 font-mono text-3xl font-black text-white">{championResult.teamBScore}</p>
                </div>
              </div>

              <div className="mt-6 grid gap-2 sm:grid-cols-2">
                <button type="button" onClick={() => setChampionResult(null)} className="inline-flex items-center justify-center gap-2 rounded-lg bg-green px-4 py-3 text-[10px] font-black uppercase tracking-wider text-black transition-colors hover:bg-green/90">
                  <Award className="h-4 w-4" /> Stay in match room
                </button>
                <button type="button" onClick={() => { setChampionResult(null); handleOpenBracket(); }} className="inline-flex items-center justify-center gap-2 rounded-lg border border-orange/25 bg-orange/10 px-4 py-3 text-[10px] font-black uppercase tracking-wider text-orange transition-colors hover:bg-orange/20">
                  <LayoutGrid className="h-4 w-4" /> View final bracket
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="min-w-0 space-y-6">
          <MatchStateBar
                match={match}
                onRefresh={loadRoom}
                onOpenBracket={handleOpenBracket}
                adminTools={isStaff ? (
                  <AdminTools
                    match={match}
                    canAdminCorrect={canAdminCorrect}
                    canAdminResolve={canAdminResolve}
                    resolving={resolvingAdmin}
                    onResetDispute={handleAdminResetDispute}
                    onCorrection={handleAdminCorrection}
                    onResolve={handleAdminResolve}
                  />
                ) : null}
          />

            <MatchRulesPanel
              matchType="tournament"
              gameMode={match.game_mode_display || match.game_mode}
              playRule=""
              customRules={tournament?.rules || tournament?.rules_text || ""}
              collapsible
              defaultOpen={false}
            />
        </div>

        {bracketMatches.length > 0 && (
          <details ref={bracketRef} id="tournament-bracket" className="group dark-focus dark-media mt-6 scroll-mt-6 rounded-xl border border-white/[0.09]">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 [&::-webkit-details-marker]:hidden">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-orange/20 bg-orange/10 text-orange">
                  <LayoutGrid className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-[8px] font-black uppercase tracking-[0.18em] text-orange">Tournament flow</p>
                  <h2 className="mt-0.5 text-sm font-black">Tournament bracket</h2>
                </div>
              </div>
              <span className="flex items-center gap-2 text-[9px] font-black uppercase tracking-wider text-vapor group-hover:text-white">
                <span className="group-open:hidden">Show bracket</span>
                <span className="hidden group-open:inline">Hide bracket</span>
                <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
              </span>
            </summary>
            <div className="border-t border-white/[0.06] p-4 sm:p-5">
              <BracketPreview matches={bracketMatches} currentId={match.id} tournament={tournament} />
            </div>
          </details>
        )}
      </div>
    </div>
  );
}
