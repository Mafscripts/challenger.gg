import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  AlertCircle,
  Award,
  Check,
  Crown,
  Flag,
  Gavel,
  Map as MapIcon,
  Medal,
  RefreshCw,
  Shield,
  ShieldCheck,
  Sparkles,
  Swords,
  Trophy,
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/use-toast";
import MatchChat from "@/components/match/MatchChat";
import UserBadges from "@/components/ui/UserBadges";

const bracketLabels = {
  winner: "Winner Bracket",
  loser: "Loser Bracket",
  grand_final: "Grand Final",
};

const statusLabel = (value) => String(value || "pending").replace(/_/g, " ");
const staffRoles = new Set(["ceo", "super_admin", "admin", "moderator"]);
const adminCorrectionRoles = new Set(["ceo", "super_admin", "admin"]);
const defaultMapPool = ["Hacienda", "Gridlock", "Raid", "Scar", "Den", "Sake", "Colossus"];
const seedLabel = (seed) => seed ? `#${seed}` : "#-";
const cleanKey = (value) => String(value || "").trim().toLowerCase();
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
const emptyTrophyCounts = () => ({ gold: 0, silver: 0, bronze: 0, invitational: 0, premium: 0 });

const trophySlots = [
  { key: "gold", label: "Gold trophies", icon: Trophy, className: "text-yellow-400" },
  { key: "silver", label: "Silver trophies", icon: Medal, className: "text-gray-300" },
  { key: "bronze", label: "Bronze trophies", icon: Award, className: "text-amber-600" },
  { key: "invitational", label: "Invitational trophies", icon: Swords, className: "text-cyan" },
  { key: "premium", label: "Premium trophies", icon: Crown, className: "text-purple-300" },
];

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

    if (text.includes("premium")) counts.premium += 1;
    else if (text.includes("invit") || text.includes("champion")) counts.invitational += 1;
    else if (text.includes("gold")) counts.gold += 1;
    else if (text.includes("silver")) counts.silver += 1;
    else if (text.includes("bronze")) counts.bronze += 1;
    else if (item.item_rarity === "exclusive" || item.item_rarity === "mythic") counts.invitational += 1;
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
    invitational: statNumber(userRow?.invitational_count || userRow?.invitation_count || userRow?.champion_count) + inventoryCounts.invitational,
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
    badges: userRow?.badges || [],
    verified_player: userRow?.verified_player || userRow?.is_verified_player || false,
    streamer_badge: userRow?.streamer_badge || userRow?.is_streamer || false,
    force_stream_required: userRow?.force_stream_required || userRow?.stream_override_required || false,
    monitor_cam_required: userRow?.monitor_cam_required || userRow?.required_monitor_cam || userRow?.moni_cam_required || false,
    wins: Math.max(profileWins, wagerWins),
    losses: Math.max(profileLosses, wagerLosses),
    trophies: trophyCountsFor(userRow, inventoryRows),
    earnings,
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

function BetaBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-green/30 bg-green/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-green shadow-[0_0_18px_rgba(0,255,128,0.35)] animate-pulse">
      <Sparkles className="h-3 w-3" /> Beta
    </span>
  );
}

function TrophyCounts({ trophies }) {
  const counts = trophies || emptyTrophyCounts();
  return (
    <div className="flex justify-end gap-1 overflow-visible">
      {trophySlots.map(({ key, label, icon: Icon, className }) => (
        <span
          key={key}
          aria-label={`${label}: ${statNumber(counts[key])}`}
          className={`group relative inline-flex min-w-[24px] cursor-default select-none items-center justify-center gap-0.5 rounded bg-background/50 px-1.5 py-1 text-[10px] font-black ${className}`}
        >
          <Icon className="h-3 w-3" />
          {statNumber(counts[key])}
          <span className="pointer-events-none invisible absolute bottom-full left-1/2 z-50 mb-2 w-36 -translate-x-1/2 rounded-lg border border-white/10 bg-[#111821] px-3 py-2 text-left opacity-0 shadow-xl transition-all group-hover:visible group-hover:opacity-100">
            <span className={`mb-1 flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider ${className}`}>
              <Icon className="h-3.5 w-3.5" />
              {label}
            </span>
            <span className="block text-lg font-black leading-none text-white">{statNumber(counts[key])}</span>
          </span>
        </span>
      ))}
    </div>
  );
}

function TeamCard({ label, name, color, score, setScore, disabled, seed, isFirstHost, players = [] }) {
  const colorClass = color === "cyan" ? "text-cyan border-cyan/20 bg-cyan/5" : "text-orange border-orange/20 bg-orange/5";
  const scoreId = `${label.toLowerCase().replace(/\s+/g, "-")}-score`;
  const scoreAccent = color === "cyan"
    ? "border-cyan/35 bg-cyan/10 text-cyan focus:border-cyan focus:ring-cyan/25"
    : "border-orange/35 bg-orange/10 text-orange focus:border-cyan focus:ring-cyan/25";

  return (
    <div className={`glass rounded-xl border p-5 ${colorClass}`}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-wider">{label}</p>
        <span className="rounded bg-background/40 px-2 py-1 text-[10px] font-black uppercase tracking-wider">
          Seed {seedLabel(seed)}
        </span>
      </div>
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-lg bg-background/40 border border-white/5 flex items-center justify-center">
          <Shield className="w-6 h-6" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h2 className="text-xl font-black truncate">{name || "Open slot"}</h2>
            {name && <BetaBadge />}
          </div>
          <p className="text-xs text-vapor">{isFirstHost ? "Higher seed - hosts map 1" : "Tournament participant"}</p>
        </div>
        <div className="shrink-0 rounded-xl border border-white/5 bg-background/35 p-2 shadow-inner">
          <label htmlFor={scoreId} className="mb-1 block text-center text-[10px] font-black uppercase tracking-wider text-vapor">
            {disabled ? "Score" : "Enter score"}
          </label>
          <input
            id={scoreId}
            aria-label={`${label} final score`}
            type="number"
            min="0"
            value={score}
            disabled={disabled || !name}
            onChange={(event) => setScore(Number(event.target.value))}
            className={`h-14 w-24 rounded-lg border text-center font-mono text-3xl font-black outline-none transition-all duration-200 focus:ring-2 focus:shadow-[0_0_0_3px_rgba(20,216,255,0.10)] disabled:cursor-not-allowed disabled:opacity-60 ${scoreAccent}`}
          />
        </div>
      </div>
      <div className="mt-5 border-t border-white/5 pt-4">
        <p className="mb-2 text-[10px] font-black uppercase tracking-wider text-vapor">Players</p>
        {players.length === 0 ? (
          <p className="text-xs text-vapor">Roster unavailable</p>
        ) : (
          <div className="overflow-visible">
            <div className="min-w-[560px] space-y-2">
              <div className="grid grid-cols-[minmax(140px,1fr)_58px_44px_190px_64px] items-center gap-2 px-3 text-[9px] font-black uppercase tracking-wider text-vapor">
                <span>Player</span>
                <span>Role</span>
                <span className="text-right">W-L</span>
                <span className="text-right">Trophies</span>
                <span className="text-right">Earnings</span>
              </div>
              {players.map((player, index) => {
                const profileSlug = player.user_id || player.username || player.handle || player.user_name;
                return (
                <div key={player.user_id || `${player.user_name}-${index}`} className="grid grid-cols-[minmax(140px,1fr)_58px_44px_190px_64px] items-center gap-2 rounded-lg border border-white/5 bg-background/30 px-3 py-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-secondary text-[10px] font-black font-mono">
                      {index + 1}
                    </span>
                    {profileSlug ? (
                      <Link
                        to={`/profile/${encodeURIComponent(profileSlug)}`}
                        className="truncate text-sm font-bold text-white transition-colors hover:text-cyan"
                      >
                        {player.user_name}
                      </Link>
                    ) : (
                      <span className="truncate text-sm font-bold text-white">{player.user_name}</span>
                    )}
                    <UserBadges user={player} size="xs" iconOnly showMonitorCam className="min-w-0" />
                  </div>
                  <div className="flex justify-start">
                    {player.role === "captain" ? (
                      <span className="rounded bg-green/10 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-green">
                        Captain
                      </span>
                    ) : (
                      <span className="rounded bg-white/5 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-vapor">
                        Member
                      </span>
                    )}
                  </div>
                  <p className="text-right text-xs font-black text-white">{statNumber(player.wins)}-{statNumber(player.losses)}</p>
                  <TrophyCounts trophies={player.trophies} />
                  <p className="text-right text-xs font-black text-green">{moneyLabel(player.earnings)}</p>
                </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MapSeries({ match }) {
  const maps = Array.isArray(match.maps) ? match.maps : [];
  const pool = Array.isArray(match.map_pool) && match.map_pool.length ? match.map_pool : defaultMapPool;
  const bestOf = Math.max(1, Number(match.best_of || match.map_sequence?.length || maps.length || 3));

  return (
    <div className="glass rounded-xl border border-cyan/20 p-5">
      <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-sm font-black uppercase tracking-wider flex items-center gap-2">
            <MapIcon className="h-4 w-4 text-cyan" /> BO{bestOf} Map Series
          </h2>
          <p className="text-xs text-vapor mt-1">{match.game_mode || `Best of ${bestOf}`}</p>
        </div>
        <div className="text-xs text-vapor">
          First host: <span className="font-bold text-green">{match.first_host_team_name || "TBD"}</span>
          {match.first_host_seed ? <span className="ml-1">({seedLabel(match.first_host_seed)})</span> : null}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {maps.length === 0 ? (
          <div className="rounded-lg border border-white/5 bg-secondary/40 p-4 text-sm text-vapor md:col-span-3">
            Maps are being generated.
          </div>
        ) : maps.map((map) => (
          <div key={`${map.game}-${map.game_mode || map.mode}-${map.map}`} className="rounded-lg border border-white/5 bg-secondary/40 p-4">
            <p className="text-[10px] font-black uppercase tracking-wider text-cyan">Map {map.game}</p>
            <h3 className="mt-1 text-lg font-black">{map.map}</h3>
            <p className="mt-2 text-xs text-vapor">{map.mode || "Search and Destroy"}</p>
            <p className="mt-1 text-xs text-green">
              Host: {map.host_team_name || "TBD"} {map.host_seed ? `(${seedLabel(map.host_seed)})` : ""}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {pool.map((map) => (
          <span key={map} className="rounded-md border border-white/5 bg-background/30 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-vapor">
            {map}
          </span>
        ))}
      </div>
    </div>
  );
}

function BracketPreview({ matches, currentId, tournament }) {
  const grouped = matches
    .slice()
    .sort((a, b) => Number(a.round || 0) - Number(b.round || 0) || Number(a.match_number || 0) - Number(b.match_number || 0))
    .reduce((groups, match) => {
      const key = `${match.bracket || "winner"}-${match.round || 1}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(match);
      return groups;
    }, {});

  const rounds = Object.entries(grouped);
  const finalWinnerName = tournament?.winner_name
    || matches.find((match) => (
      (match.completed || match.status === "completed")
      && match.winner_name
      && !match.next_match_round
      && !match.next_match_number
    ))?.winner_name;

  if (rounds.length === 0) return null;

  return (
    <div className="glass rounded-xl border border-white/5 p-5 mb-6">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-wider">
          <Trophy className="h-4 w-4 text-orange" /> Bracket
        </h2>
        {finalWinnerName && (
          <div className="inline-flex items-center gap-2 rounded-lg border border-green/20 bg-green/10 px-3 py-2 text-xs font-black uppercase tracking-wider text-green">
            <Crown className="h-4 w-4" /> Champion: {finalWinnerName}
          </div>
        )}
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {rounds.map(([key, roundMatches]) => (
          <div key={key} className="rounded-lg border border-white/5 bg-secondary/30 p-3">
            <p className="mb-3 text-[10px] font-black uppercase tracking-wider text-vapor">
              {bracketLabels[roundMatches[0]?.bracket] || "Bracket"} - Round {roundMatches[0]?.round || 1}
            </p>
            <div className="space-y-2">
              {roundMatches.map((roundMatch) => {
                const isCurrent = roundMatch.id === currentId;
                const isComplete = roundMatch.completed || roundMatch.status === "completed";
                const teamAScore = Number(roundMatch.team_a_score || 0);
                const teamBScore = Number(roundMatch.team_b_score || 0);
                const teamAWon = isComplete && (
                  String(roundMatch.winner_id || "") === String(roundMatch.team_a_id || "")
                  || (!roundMatch.winner_id && teamAScore > teamBScore)
                );
                const teamBWon = isComplete && (
                  String(roundMatch.winner_id || "") === String(roundMatch.team_b_id || "")
                  || (!roundMatch.winner_id && teamBScore > teamAScore)
                );
                const teamRowClass = (won) => {
                  if (won) return "border-green/20 bg-green/10 text-white";
                  if (isComplete) return "border-red-400/15 bg-red-500/5 text-vapor";
                  return "border-white/5 bg-background/25 text-vapor";
                };
                const scoreClass = (won) => won ? "bg-green/15 text-green" : "bg-background/50 text-vapor";
                const resultLabel = (won) => {
                  if (!isComplete) return null;
                  return won ? "Win" : "Loss";
                };
                const resultClass = (won) => won ? "text-green" : "text-red-300";
                return (
                  <Link
                    key={roundMatch.id}
                    to={`/tournament-match/${roundMatch.id}`}
                    className={`block rounded-md border px-3 py-2 transition-all ${isCurrent ? "border-green/40 bg-green/10 shadow-[0_0_18px_rgba(0,255,128,0.18)]" : "border-white/5 bg-background/30 hover:border-cyan/20"}`}
                  >
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="text-[10px] font-bold uppercase text-vapor">Match {roundMatch.match_number}</span>
                      <span className="text-[10px] uppercase text-vapor">
                        {statusLabel(roundMatch.status)}{roundMatch.is_forfeit ? " - forfeited" : ""}
                      </span>
                    </div>
                    <div className={`mt-2 flex items-center justify-between gap-2 rounded border px-2 py-1.5 text-xs ${teamRowClass(teamAWon)}`}>
                      <span className="truncate">{seedLabel(roundMatch.team_a_seed)} {roundMatch.team_a_name || "TBD"}</span>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {resultLabel(teamAWon) && <span className={`text-[9px] font-black uppercase ${resultClass(teamAWon)}`}>{resultLabel(teamAWon)}</span>}
                        <span className={`min-w-6 rounded px-1.5 py-0.5 text-center font-mono font-black ${scoreClass(teamAWon)}`}>
                          {isComplete ? teamAScore : "-"}
                        </span>
                      </div>
                    </div>
                    <div className={`mt-1 flex items-center justify-between gap-2 rounded border px-2 py-1.5 text-xs ${teamRowClass(teamBWon)}`}>
                      <span className="truncate">{seedLabel(roundMatch.team_b_seed)} {roundMatch.team_b_name || "TBD"}</span>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {resultLabel(teamBWon) && <span className={`text-[9px] font-black uppercase ${resultClass(teamBWon)}`}>{resultLabel(teamBWon)}</span>}
                        <span className={`min-w-6 rounded px-1.5 py-0.5 text-center font-mono font-black ${scoreClass(teamBWon)}`}>
                          {isComplete ? teamBScore : "-"}
                        </span>
                      </div>
                    </div>
                    {isComplete && roundMatch.winner_name && (
                      <div className="mt-2 rounded border border-green/10 bg-green/5 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-green">
                        Winner: {roundMatch.winner_name}
                      </div>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function TournamentMatchRoom() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [match, setMatch] = useState(null);
  const [tournament, setTournament] = useState(null);
  const [bracketMatches, setBracketMatches] = useState([]);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [requestingAdmin, setRequestingAdmin] = useState(false);
  const [disputing, setDisputing] = useState(false);
  const [resolvingAdmin, setResolvingAdmin] = useState(false);
  const [scoreA, setScoreA] = useState(0);
  const [scoreB, setScoreB] = useState(0);
  const [teamAPlayers, setTeamAPlayers] = useState([]);
  const [teamBPlayers, setTeamBPlayers] = useState([]);
  const joinedAdminRooms = useRef(new Set());

  useEffect(() => {
    loadRoom();
  }, [id]);

  const isComplete = match?.completed || match?.status === "completed";
  const isStaff = staffRoles.has(user?.role);
  const isMatchParticipant = useMemo(() => {
    if (!user?.id) return false;
    return [...teamAPlayers, ...teamBPlayers].some((player) => rosterPlayerMatchesUser(player, user));
  }, [teamAPlayers, teamBPlayers, user]);
  const canStaffSubmitResult = isStaff && !isMatchParticipant;
  const canUseMatchControls = isMatchParticipant || isStaff;
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

  useEffect(() => {
    if (!match?.id || !user?.id || !staffRoles.has(user.role)) return;
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
  }, [match?.id, match?.requested_admin, match?.admin_request_status, match?.admin_request_ticket_id, user?.id, user?.role]);

  const loadRoom = async () => {
    try {
      setLoading(true);
      const [currentUser, matchData] = await Promise.all([
        base44.auth.me().catch(() => null),
        base44.entities.TournamentMatch.get(id),
      ]);
      let activeMatch = matchData;
      const setupStatuses = ["pending", "ready", "in_progress", "awaiting_team_a_report", "awaiting_team_b_report"];
      const expectedMapCount = Math.max(1, Number(activeMatch.best_of || activeMatch.map_sequence?.length || 3));
      if (
        activeMatch.team_a_id &&
        activeMatch.team_b_id &&
        setupStatuses.includes(activeMatch.status) &&
        (!Array.isArray(activeMatch.maps) || activeMatch.maps.length < expectedMapCount || !activeMatch.team_a_seed || !activeMatch.team_b_seed || !activeMatch.first_host_team_id || !activeMatch.map_generation_key)
      ) {
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
    if (scoreA === scoreB) {
      toast({ title: "Invalid score", description: "Scores cannot be tied.", variant: "destructive" });
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
        if (response.data.ready_to_complete === false) {
          toast({
            title: response.data.status === "score_conflict" ? "Score conflict opened" : "Score report submitted",
            description: response.data.message || (response.data.status === "score_conflict" ? "Staff must review the conflicting reports." : "Waiting for the other team to report the same score."),
            variant: response.data.status === "score_conflict" ? "destructive" : undefined,
          });
          await loadRoom();
          return;
        }
        toast({
          title: "Tournament match completed",
          description: response.data.advanced_to ? "Winner advanced automatically." : "Tournament result recorded.",
        });
        if (!response.data.advanced_to && !response.data.loser_sent_to) {
          navigate("/tournaments");
          return;
        }
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
    setRequestingAdmin(true);
    try {
      const response = await base44.functions.invoke("requestAdminAlert", {
        match_type: "tournament",
        match_id: match.id,
        subject: `Tournament match admin request ${match.id}`,
        description: `Admin requested for tournament match ${match.id} in ${tournament?.name || "tournament"}.\n${match.team_a_name || "Open slot"} vs ${match.team_b_name || "Open slot"}`,
        priority: "high",
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
        reported_against: user?.id === match.team_a_id ? match.team_b_id : match.team_a_id,
        reported_against_name: user?.id === match.team_a_id ? match.team_b_name : match.team_a_name,
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-orange/20 border-t-orange rounded-full animate-spin mx-auto mb-4" />
          <p className="text-vapor">Loading tournament match...</p>
        </div>
      </div>
    );
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

  const predictedWinner = scoreA === scoreB ? null : scoreA > scoreB ? match.team_a_name : match.team_b_name;
  const canAdminCorrect = adminCorrectionRoles.has(user?.role) && match?.team_a_id && match?.team_b_id;
  const canAdminResolve = isStaff && canSubmit && !canAdminCorrect;
  const isStreamerMatch = isStreamerTournament(tournament);

  return (
    <div className="min-h-screen bg-obsidian py-6">
      <div className="max-w-[1400px] mx-auto px-4 lg:px-6">
        <div className="glass rounded-xl border border-orange/20 p-6 mb-6">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <Trophy className="w-5 h-5 text-orange" />
                <span className="text-xs font-mono font-semibold text-orange uppercase tracking-wider">
                  {bracketLabels[match.bracket] || "Tournament Match"} - {statusLabel(match.status)}
                </span>
              </div>
              <h1 className="text-2xl font-black">{tournament?.name || "Tournament"}</h1>
              <p className="text-sm text-vapor mt-1">
                Round {match.round} - Match {match.match_number} - ID #{match.id?.slice(-8)}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <a
                href="#tournament-bracket"
                className="inline-flex items-center gap-2 rounded-lg border border-orange/25 bg-orange/10 px-4 py-2 text-xs font-black uppercase tracking-wider text-orange transition-all hover:bg-orange/20"
              >
                <Trophy className="h-4 w-4" /> Bracket
              </a>
              <Link to="/tournaments" className="inline-flex items-center gap-2 rounded-lg bg-secondary px-4 py-2 text-xs font-bold text-vapor transition-all hover:bg-white/10">
                Tournaments
              </Link>
            </div>
          </div>
        </div>

        {isComplete && (
          <div className="glass rounded-xl border border-green/20 bg-green/5 p-5 mb-6 flex items-center gap-3">
            <Trophy className="w-5 h-5 text-green" />
            <div>
              <p className="font-bold text-green">Winner: {match.winner_name}</p>
              <p className="text-xs text-vapor">Final score {match.team_a_score || 0}-{match.team_b_score || 0}</p>
            </div>
          </div>
        )}

        {match.is_forfeit && (
          <div className="mb-6 flex items-center gap-3 rounded-xl border border-orange/25 bg-orange/10 px-5 py-4">
            <Flag className="h-5 w-5 shrink-0 text-orange" />
            <div>
              <p className="text-sm font-black uppercase tracking-wider text-orange">{match.match_result_badge || "Match forfeited"}</p>
              <p className="text-xs text-vapor">{match.match_result_note || `${match.forfeited_by_name || "Losing team"} forfeited the match.`}</p>
            </div>
          </div>
        )}

        {canSubmit && !isComplete && (
          <div className="mb-3 flex items-center gap-3 rounded-lg border border-cyan/20 bg-cyan/5 px-4 py-3 text-xs text-vapor">
            <Flag className="h-4 w-4 shrink-0 text-cyan" />
            <p>
              <span className="font-black uppercase tracking-wider text-cyan">Report final score</span>
              <span className="ml-2">Both teams must submit the same score before the win is awarded. Conflicting reports open staff review.</span>
            </p>
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

        <div className="grid lg:grid-cols-2 gap-5 mb-5">
          <TeamCard
            label="Team A"
            color="cyan"
            name={match.team_a_name}
            seed={match.team_a_seed}
            isFirstHost={match.first_host_team_id === match.team_a_id}
            score={scoreA}
            setScore={setScoreA}
            disabled={!canSubmit}
            players={teamAPlayers}
          />
          <TeamCard
            label="Team B"
            color="orange"
            name={match.team_b_name}
            seed={match.team_b_seed}
            isFirstHost={match.first_host_team_id === match.team_b_id}
            score={scoreB}
            setScore={setScoreB}
            disabled={!canSubmit}
            players={teamBPlayers}
          />
        </div>

        <div className={`grid gap-5 ${canChat ? "xl:grid-cols-[minmax(0,1.35fr)_420px]" : ""}`}>
          <div className="min-w-0 space-y-5">
            <MapSeries match={match} />

        {canUseMatchControls && (
        <div className="glass rounded-xl border border-white/5 p-4">
          {canAdminCorrect && (
            <div className="mb-3 border-b border-white/5 pb-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-[10px] font-black uppercase tracking-wider text-pink-300">Admin correction</p>
                <p className="text-[10px] text-vapor">Tournament only</p>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <button
                  onClick={() => handleAdminCorrection("reset_score")}
                  disabled={resolvingAdmin}
                  className="flex items-center justify-center gap-2 rounded-lg border border-orange/20 bg-orange/10 px-5 py-3 text-xs font-bold uppercase tracking-wider text-orange transition-all hover:bg-orange/20 disabled:opacity-50"
                >
                  <RefreshCw className="h-4 w-4" /> Reset 0-0
                </button>
                <button
                  onClick={() => handleAdminCorrection("grant_team_a")}
                  disabled={resolvingAdmin}
                  className="flex items-center justify-center gap-2 rounded-lg border border-pink-400/20 bg-pink-400/10 px-5 py-3 text-xs font-bold uppercase tracking-wider text-pink-300 transition-all hover:bg-pink-400/20 disabled:opacity-50"
                >
                  <ShieldCheck className="h-4 w-4" /> Give Team A Win
                </button>
                <button
                  onClick={() => handleAdminCorrection("grant_team_b")}
                  disabled={resolvingAdmin}
                  className="flex items-center justify-center gap-2 rounded-lg border border-pink-400/20 bg-pink-400/10 px-5 py-3 text-xs font-bold uppercase tracking-wider text-pink-300 transition-all hover:bg-pink-400/20 disabled:opacity-50"
                >
                  <ShieldCheck className="h-4 w-4" /> Give Team B Win
                </button>
              </div>
            </div>
          )}
          {canAdminResolve && (
            <div className="mb-3 grid gap-3 border-b border-white/5 pb-3 md:grid-cols-2">
              <button
                onClick={() => handleAdminResolve("approve_team_a")}
                disabled={resolvingAdmin}
                className="flex items-center justify-center gap-2 rounded-lg border border-pink-400/20 bg-pink-400/10 px-5 py-3 text-xs font-bold uppercase tracking-wider text-pink-300 transition-all hover:bg-pink-400/20 disabled:opacity-50"
              >
                <ShieldCheck className="h-4 w-4" /> Grant Team A Win
              </button>
              <button
                onClick={() => handleAdminResolve("approve_team_b")}
                disabled={resolvingAdmin}
                className="flex items-center justify-center gap-2 rounded-lg border border-pink-400/20 bg-pink-400/10 px-5 py-3 text-xs font-bold uppercase tracking-wider text-pink-300 transition-all hover:bg-pink-400/20 disabled:opacity-50"
              >
                <ShieldCheck className="h-4 w-4" /> Grant Team B Win
              </button>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleComplete}
              disabled={!canSubmit || submitting}
              className="flex-1 min-w-[200px] py-3 bg-green/10 text-green font-bold text-sm rounded-lg border border-green/20 hover:bg-green/20 transition-all uppercase tracking-wider flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Check className="w-4 h-4" /> {submitting ? "Submitting..." : canStaffSubmitResult ? "Submit Result" : "Submit Score Report"}
            </button>
            {!isStreamerMatch && (
              <button
                onClick={handleRequestAdmin}
                disabled={!isMatchParticipant || requestingAdmin}
                className="px-6 py-3 bg-red-500/10 text-red-400 font-bold text-sm rounded-lg border border-red-500/20 hover:bg-red-500/20 transition-all uppercase tracking-wider flex items-center gap-2 disabled:opacity-50"
              >
                <Gavel className="w-4 h-4" /> {requestingAdmin ? "Requesting..." : "Request Admin"}
              </button>
            )}
            {!isStreamerMatch && (
              <button
                onClick={handleCreateDispute}
                disabled={!isMatchParticipant || disputing}
                className="px-6 py-3 bg-orange/10 text-orange font-bold text-sm rounded-lg border border-orange/20 hover:bg-orange/20 transition-all uppercase tracking-wider disabled:opacity-50"
              >
                {disputing ? "Submitting..." : "Submit Dispute"}
              </button>
            )}
            <button
              onClick={loadRoom}
              className="px-4 py-3 bg-secondary/50 text-vapor font-bold text-sm rounded-lg border border-white/5 hover:bg-secondary transition-all"
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
          {!isStreamerMatch && (match.admin_request_status || match.requested_admin) && (
            <p className="text-xs text-vapor mt-3">
              Admin request: {{
                waiting_for_admin: "Waiting for admin",
                admin_joined: "Admin joined",
                waiting_for_user: "Waiting for user",
                escalated: "Escalated",
                resolved: "Resolved",
                closed: "Closed",
              }[match.admin_request_status || "waiting_for_admin"] || "Waiting for admin"}
            </p>
          )}
          {predictedWinner && canSubmit && (
            <p className="text-xs text-vapor mt-3 flex items-center gap-2">
              <Flag className="w-3.5 h-3.5 text-orange" />
              Matching reports will advance {predictedWinner}.
            </p>
          )}
        </div>
        )}

        <div className="grid md:grid-cols-2 gap-5">
          <div className="glass rounded-xl border border-white/5 p-5">
            <h2 className="font-bold text-sm mb-3 flex items-center gap-2">
              <Swords className="w-4 h-4 text-cyan" />
              Advancement
            </h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <span className="text-vapor">Winner advances to</span>
                <span className="font-mono text-cyan">{match.next_match_id ? `#${match.next_match_id.slice(-8)}` : "Tournament result"}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-vapor">Loser moves to</span>
                <span className="font-mono text-orange">{match.loser_match_id ? `#${match.loser_match_id.slice(-8)}` : "Elimination"}</span>
              </div>
            </div>
          </div>
          <div className="glass rounded-xl border border-white/5 p-5">
            <h2 className="font-bold text-sm mb-3 flex items-center gap-2">
              <Shield className="w-4 h-4 text-orange" />
              Match State
            </h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <span className="text-vapor">Bracket</span>
                <span>{bracketLabels[match.bracket] || match.bracket}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-vapor">Best of</span>
                <span>BO{match.best_of || 3} {match.game_mode || "Series"}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-vapor">First host</span>
                <span>{match.first_host_team_name || "TBD"}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-vapor">Status</span>
                <span className="capitalize">{statusLabel(match.status)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-vapor">Requested Admin</span>
                <span>{match.requested_admin ? "Yes" : "No"}</span>
              </div>
            </div>
          </div>
        </div>
          </div>
          {canChat && (
            <aside className="min-w-0">
              <MatchChat
                conversationId={match.id}
                matchType="tournament"
                accent="orange"
                live
                compact
                sticky={false}
                heightClass="h-[420px] xl:h-[500px]"
              />
            </aside>
          )}
        </div>

        <div id="tournament-bracket" className="mt-5 scroll-mt-6">
          <BracketPreview matches={bracketMatches} currentId={match.id} tournament={tournament} />
        </div>
      </div>
    </div>
  );
}
