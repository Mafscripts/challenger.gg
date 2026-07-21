import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  AlertCircle,
  Award,
  Check,
  Clock3,
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
  Unlock,
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/use-toast";
import MatchChat from "@/components/match/MatchChat";
import UserBadges from "@/components/ui/UserBadges";
import ActivisionIdLabel from "@/components/competition/ActivisionIdLabel";
import TournamentBracket from "@/components/tournaments/TournamentBracket";

const bracketLabels = {
  winner: "Winner Bracket",
  loser: "Lower Bracket",
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
    avatar_url: userRow?.avatar_url || profileRow?.avatar_url || player?.avatar_url || "",
    activision_id: userRow?.activision_id || player?.activision_id || "",
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

function teamMonogram(name) {
  const words = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (words.length > 1) return words.slice(0, 2).map((word) => word.charAt(0)).join("").toUpperCase();
  return String(words[0] || "--").slice(0, 2).toUpperCase();
}

function BetaBadge() {
  return (
    <span className="beta-glow-pulse inline-flex items-center gap-1 rounded-md border border-red-400/35 bg-red-500/10 px-2 py-0.5 text-[8px] font-black uppercase tracking-wider text-red-400">
      <Sparkles className="h-3 w-3" /> Beta
    </span>
  );
}

function TrophyCounts({ trophies }) {
  const counts = trophies || emptyTrophyCounts();
  return (
    <div className="flex flex-wrap justify-end gap-1.5 overflow-visible">
      {trophySlots.map(({ key, label, icon: Icon, className }) => (
        <span
          key={key}
          aria-label={`${label}: ${statNumber(counts[key])}`}
          className={`group relative inline-flex min-w-[30px] cursor-default select-none items-center justify-center gap-1 rounded-md bg-background/50 px-2 py-1.5 text-[11px] font-black ${className}`}
        >
          <Icon className="h-3.5 w-3.5" />
          {statNumber(counts[key])}
          <span className="pointer-events-none invisible absolute bottom-full left-1/2 z-50 mb-2 w-36 -translate-x-1/2 rounded-lg border border-white/10 bg-popover px-3 py-2 text-left opacity-0 shadow-xl transition-all group-hover:visible group-hover:opacity-100">
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

function TeamCard({ label, name, color, score, setScore, disabled, seed, isFirstHost, maxScore, players = [], currentUser }) {
  const isCyan = color === "cyan";
  const colorClass = isCyan ? "border-cyan/20" : "border-orange/20";
  const toneClass = isCyan ? "text-cyan" : "text-orange";
  const tintClass = isCyan ? "bg-cyan/10 border-cyan/20" : "bg-orange/10 border-orange/20";
  const scoreId = `${label.toLowerCase().replace(/\s+/g, "-")}-score`;
  const scoreAccent = isCyan
    ? "border-cyan/35 bg-cyan/10 text-cyan focus:border-cyan focus:ring-cyan/25"
    : "border-orange/35 bg-orange/10 text-orange focus:border-cyan focus:ring-cyan/25";

  return (
    <section className={`relative min-w-0 overflow-hidden rounded-2xl border bg-card/80 shadow-[0_20px_50px_-42px_rgba(0,0,0,.95)] ${colorClass}`}>
      <div className={`absolute inset-x-0 top-0 h-px ${isCyan ? "bg-gradient-to-r from-cyan via-cyan/40 to-transparent" : "bg-gradient-to-l from-orange via-orange/40 to-transparent"}`} />
      <div className="flex flex-col gap-5 border-b border-white/[0.06] p-5 sm:flex-row sm:items-center sm:p-6">
        <span className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border font-mono text-lg font-black ${tintClass} ${toneClass}`}>{teamMonogram(name)}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><p className={`text-[9px] font-black uppercase tracking-[0.18em] ${toneClass}`}>{label} roster</p><span className="rounded-md border border-white/[0.06] bg-background/40 px-2 py-0.5 text-[8px] font-black uppercase tracking-wider text-vapor">Seed {seedLabel(seed)}</span>{isFirstHost && <span className={`rounded-md border px-2 py-0.5 text-[8px] font-black uppercase tracking-wider ${tintClass} ${toneClass}`}>Hosts map 1</span>}</div>
          <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-2.5"><h3 className="truncate text-xl font-black sm:text-2xl">{name || "Open slot"}</h3>{name && <BetaBadge />}</div>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-vapor">{players.length} confirmed player{players.length === 1 ? "" : "s"}</p>
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
            max={maxScore}
            step="1"
            value={score}
            disabled={disabled || !name}
            onChange={(event) => {
              const nextScore = Number(event.target.value);
              setScore(Number.isFinite(nextScore) ? Math.min(maxScore, Math.max(0, Math.trunc(nextScore))) : 0);
            }}
            className={`h-16 w-24 rounded-lg border text-center font-mono text-3xl font-black outline-none transition-all duration-200 focus:ring-2 focus:shadow-[0_0_0_3px_rgba(20,216,255,0.10)] disabled:cursor-not-allowed disabled:opacity-60 sm:w-28 ${scoreAccent}`}
          />
        </div>
      </div>
      <div className="p-5 sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-3"><p className="text-[11px] font-black uppercase tracking-[0.16em] text-vapor">Confirmed lineup</p><p className="text-[10px] font-bold uppercase tracking-wider text-vapor/60">Identity & stats</p></div>
        {players.length === 0 ? (
          <div className="flex min-h-24 items-center justify-center rounded-xl border border-dashed border-white/10 bg-background/20 text-xs text-vapor">Roster unavailable</div>
        ) : (
          <div className="space-y-3">
            {players.map((player, index) => {
              const profileSlug = player.user_id || player.username || player.handle || player.user_name;
              const isCurrentUser = rosterPlayerMatchesUser(player, currentUser);
              return (
                <article key={player.user_id || `${player.user_name}-${index}`} className={`rounded-xl border p-4 ${isCurrentUser ? (isCyan ? "border-cyan/25 bg-cyan/[0.055]" : "border-orange/25 bg-orange/[0.055]") : "border-white/[0.055] bg-background/30"}`}>
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-center">
                    <div className="flex min-w-0 flex-1 items-center gap-3.5">
                      <span className={`flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border font-mono text-sm font-black ${tintClass} ${toneClass}`}>{player.avatar_url ? <img src={player.avatar_url} alt="" className="h-full w-full object-cover" /> : String(player.user_name || "?").charAt(0).toUpperCase()}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {profileSlug ? <Link to={`/profile/${encodeURIComponent(profileSlug)}`} className="truncate text-base font-black text-white transition-colors hover:text-cyan">{player.user_name}</Link> : <span className="truncate text-base font-black text-white">{player.user_name}</span>}
                          {isCurrentUser && <span className={`rounded px-2 py-0.5 text-[8px] font-black uppercase ${isCyan ? "bg-cyan text-background" : "bg-orange text-background"}`}>You</span>}
                          <UserBadges user={player} size="xs" iconOnly showMonitorCam className="min-w-0" />
                        </div>
                        <ActivisionIdLabel user={player} className="mt-1 max-w-full" />
                      </div>
                    </div>
                    <div className="grid shrink-0 grid-cols-3 gap-2.5 xl:min-w-[240px]">
                      <div className="rounded-lg border border-white/[0.05] bg-black/15 px-3 py-2.5"><p className="text-[8px] font-black uppercase tracking-wider text-vapor">Role</p><p className={`mt-1 text-[10px] font-black uppercase ${player.role === "captain" ? "text-green" : "text-white"}`}>{player.role === "captain" ? "Captain" : "Member"}</p></div>
                      <div className="rounded-lg border border-white/[0.05] bg-black/15 px-3 py-2.5"><p className="text-[8px] font-black uppercase tracking-wider text-vapor">Record</p><p className="mt-1 font-mono text-sm font-black text-white">{statNumber(player.wins)}-{statNumber(player.losses)}</p></div>
                      <div className="rounded-lg border border-white/[0.05] bg-black/15 px-3 py-2.5"><p className="text-[8px] font-black uppercase tracking-wider text-vapor">Earned</p><p className="mt-1 font-mono text-sm font-black text-green">{moneyLabel(player.earnings)}</p></div>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-4 border-t border-white/[0.05] pt-3"><p className="text-[9px] font-black uppercase tracking-[0.16em] text-vapor/70">Trophies</p><TrophyCounts trophies={player.trophies} /></div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

function MapSeries({ match }) {
  const maps = Array.isArray(match.maps) ? match.maps : [];
  const pool = Array.isArray(match.map_pool) && match.map_pool.length ? match.map_pool : defaultMapPool;
  const bestOf = Math.max(1, Number(match.best_of || match.map_sequence?.length || maps.length || 3));

  return (
    <div className="glass rounded-xl border border-cyan/20 p-5 sm:p-6">
      <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
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

      <div className="grid gap-4 md:grid-cols-3">
        {maps.length === 0 ? (
          <div className="rounded-lg border border-white/5 bg-secondary/40 p-4 text-sm text-vapor md:col-span-3">
            Maps are being generated.
          </div>
        ) : maps.map((map) => (
          <div key={`${map.game}-${map.game_mode || map.mode}-${map.map}`} className="rounded-xl border border-white/5 bg-secondary/40 p-5">
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
  if (matches.length === 0) return null;
  return <TournamentBracket matches={matches} currentId={currentId} tournament={tournament} />;
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
  const [clockNow, setClockNow] = useState(Date.now());
  const [teamAPlayers, setTeamAPlayers] = useState([]);
  const [teamBPlayers, setTeamBPlayers] = useState([]);
  const joinedAdminRooms = useRef(new Set());

  useEffect(() => {
    loadRoom();
  }, [id]);

  // A completed flag without a winner is a stale/reset record, not a result.
  // Treating that state as complete produced the misleading "Winner:" / 0-0
  // banner and also hid all score controls after an admin reset.
  const isComplete = Boolean(match?.winner_id && (match?.completed || match?.status === "completed"));
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

  useEffect(() => {
    setClockNow(Date.now());
    if (!match?.start_deadline || isComplete) return undefined;
    const timer = window.setInterval(() => setClockNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [match?.start_deadline, isComplete]);

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
      const expectedMapCount = Math.max(1, Number(activeMatch.best_of || activeMatch.map_sequence?.length || 3));
      if (
        activeMatch.team_a_id &&
        activeMatch.team_b_id &&
        (!Array.isArray(activeMatch.maps) || activeMatch.maps.length < expectedMapCount || !activeMatch.team_a_seed || !activeMatch.team_b_seed || !activeMatch.first_host_team_id || !activeMatch.map_generation_key || (!(activeMatch.completed || activeMatch.status === "completed") && !activeMatch.start_deadline))
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
    if (!supportWindowUnlocked) {
      toast({
        title: "Admin support is still locked",
        description: "You can call an admin after the 15-minute match start timer reaches 00:00.",
      });
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

  const predictedWinner = scoreIsValid ? (scoreA > scoreB ? match.team_a_name : match.team_b_name) : null;
  const canAdminCorrect = adminCorrectionRoles.has(user?.role) && match?.team_a_id && match?.team_b_id;
  const canAdminResolve = isStaff && canSubmit && !canAdminCorrect;
  const isStreamerMatch = isStreamerTournament(tournament);

  return (
    <div className="min-h-screen bg-obsidian py-6 sm:py-8">
      <div className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8">
        <div className="glass mb-6 rounded-xl border border-orange/20 p-6 sm:p-7">
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

        {!isComplete && match.team_a_id && match.team_b_id && (
          <div className={`relative mb-6 overflow-hidden rounded-2xl p-[1px] ${
            startWindowExpired
              ? "bg-gradient-to-r from-orange/45 via-red-400/20 to-orange/45"
              : "bg-gradient-to-r from-cyan/45 via-blue-400/15 to-cyan/45"
          }`}>
            <div className="relative overflow-hidden rounded-[15px] bg-[linear-gradient(135deg,rgba(18,26,37,0.97),rgba(10,14,21,0.94))] px-5 py-5 sm:px-6">
              <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-start gap-4">
                  <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${
                    startWindowExpired ? "bg-orange/12 text-orange" : "bg-cyan/12 text-cyan"
                  }`}>
                    {startWindowExpired ? <Unlock className="h-5 w-5" /> : <Clock3 className="h-5 w-5" />}
                  </span>
                  <div>
                    <p className={`text-[10px] font-black uppercase tracking-[0.22em] ${
                      startWindowExpired ? "text-orange" : "text-cyan"
                    }`}>
                      {startWindowExpired ? "Start window expired" : "Match start window"}
                    </p>
                    <h2 className="mt-1 text-lg font-black text-white">
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
                <div className="shrink-0 rounded-xl bg-black/25 px-6 py-4 text-center shadow-inner ring-1 ring-white/5">
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
              <span className="font-black uppercase tracking-wider text-cyan">BO{bestOf} · First to {winsNeeded}</span>
              <span className="ml-2">Valid final scores: {seriesScoreExamples(match)}. Both teams must report the same result.</span>
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

        <div className="mb-6 grid gap-6 lg:grid-cols-2">
          <TeamCard
            label="Team A"
            color="cyan"
            name={match.team_a_name}
            seed={match.team_a_seed}
            isFirstHost={match.first_host_team_id === match.team_a_id}
            score={scoreA}
            setScore={setScoreA}
            disabled={!canSubmit}
            maxScore={winsNeeded}
            players={teamAPlayers}
            currentUser={user}
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
            maxScore={winsNeeded}
            players={teamBPlayers}
            currentUser={user}
          />
        </div>

        <div className={`grid gap-6 ${canChat ? "xl:grid-cols-[minmax(0,1fr)_460px]" : ""}`}>
          <div className="min-w-0 space-y-6">
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
              disabled={!canSubmit || !scoreIsValid || submitting}
              className="flex-1 min-w-[200px] py-3 bg-green/10 text-green font-bold text-sm rounded-lg border border-green/20 hover:bg-green/20 transition-all uppercase tracking-wider flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Check className="w-4 h-4" /> {submitting ? "Submitting..." : canStaffSubmitResult ? "Submit Result" : "Submit Score Report"}
            </button>
            {!isStreamerMatch && (
              <button
                onClick={handleRequestAdmin}
                disabled={!isMatchParticipant || !supportWindowUnlocked || requestingAdmin}
                title={!supportWindowUnlocked ? "Available after the 15-minute start timer expires" : undefined}
                className="px-6 py-3 bg-red-500/10 text-red-400 font-bold text-sm rounded-lg border border-red-500/20 hover:bg-red-500/20 transition-all uppercase tracking-wider flex items-center gap-2 disabled:opacity-50"
              >
                <Gavel className="w-4 h-4" /> {requestingAdmin ? "Requesting..." : "Request Admin"}
              </button>
            )}
            {!isStreamerMatch && (
              <button
                onClick={handleCreateDispute}
                disabled={!isMatchParticipant || !supportWindowUnlocked || disputing}
                title={!supportWindowUnlocked ? "Available after the 15-minute start timer expires" : undefined}
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
          {canSubmit && !scoreIsValid && (
            <p className="mt-3 flex items-center gap-2 text-xs text-orange">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {scoreValidationError}
            </p>
          )}
        </div>
        )}

        <div className="grid gap-6 md:grid-cols-2">
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
                heightClass="h-[440px] xl:h-[540px]"
              />
            </aside>
          )}
        </div>

        <div id="tournament-bracket" className="mt-6 scroll-mt-6">
          <BracketPreview matches={bracketMatches} currentId={match.id} tournament={tournament} />
        </div>
      </div>
    </div>
  );
}
