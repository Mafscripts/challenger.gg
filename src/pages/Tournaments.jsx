import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowRight,
  ChevronDown,
  Clock,
  Loader2,
  LogOut,
  Medal,
  Plus,
  Trophy,
  Users,
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { CompetitionHeader } from "@/components/competition/CompetitionLadder";
import { HalloweenEventBadge } from "@/components/halloween/HalloweenSeason";
import PageLoader from "@/components/ui/PageLoader";
import { toast } from "@/components/ui/use-toast";
import ActivisionIdNotice from "@/components/competition/ActivisionIdNotice";
import CreateTeamModal from "@/components/teams/CreateTeamModal";
import TournamentJoinModal from "@/components/tournaments/TournamentJoinModal";
import { activisionIdRequiredMessage, hasActivisionId } from "@/lib/activision";
import { teamRosterFormat } from "@/lib/teamFormats";

const staffRoles = new Set(["ceo", "super_admin", "admin", "moderator"]);
const adminRoles = new Set(["ceo", "super_admin", "admin"]);
const blackOps7Artwork = "/assets/tournaments/black-ops-7.webp";

const statusLabels = {
  draft: "Draft",
  open: "Open",
  live: "Live",
  registration: "Registration",
  closed: "Closed",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

const modeLabels = {
  bo1_snd: "BO1 SND",
  snd_hp_snd: "BO3 SND / HP / SND",
  bo3_hp_overload_snd: "BO3 HP / Overload / SND",
  bo5_hp_overload_snd_hp_snd: "BO5 HP / Overload / SND / HP / SND",
  snd: "BO3 Search & Destroy",
  overload: "BO3 Overload",
  hp: "BO3 Hardpoint",
};

const formatDate = (value) => {
  if (!value) return "Not scheduled";
  return new Date(value).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
};

const formatMoney = (value) => `$${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const formatCredits = (value) => `${Number(value || 0).toLocaleString()} Credits`;
const padCountdownUnit = (value) => String(value).padStart(2, "0");
const countdownUntil = (value, now = Date.now()) => {
  if (!value) return null;
  const diff = new Date(value).getTime() - now;
  if (!Number.isFinite(diff) || diff <= 0) return { expired: true, hours: 0, minutes: 0, seconds: 0 };
  const totalSeconds = Math.floor(diff / 1000);
  return {
    expired: false,
    hours: Math.floor(totalSeconds / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
};
const timeUntil = (value, now = Date.now()) => {
  if (!value) return "TBD";
  const diff = new Date(value).getTime() - now;
  if (diff <= 0) return "Completed";
  const totalSeconds = Math.floor(diff / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (days > 0) return `${days}d ${padCountdownUnit(hours)}h ${padCountdownUnit(minutes)}m ${padCountdownUnit(seconds)}s`;
  if (hours > 0) return `${padCountdownUnit(hours)}h ${padCountdownUnit(minutes)}m ${padCountdownUnit(seconds)}s`;
  return `${padCountdownUnit(minutes)}m ${padCountdownUnit(seconds)}s`;
};
const matchStartWindow = (match, now = Date.now()) => {
  const deadline = new Date(match?.start_deadline || "").getTime();
  if (!Number.isFinite(deadline)) return null;
  const seconds = Math.max(0, Math.ceil((deadline - now) / 1000));
  if (seconds === 0) return { expired: true, label: "Admin support unlocked" };
  return {
    expired: false,
    label: `Start within ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`,
  };
};
const statusTone = (status) => {
  if (status === "completed") return "text-green border-green/20 bg-green/10";
  if (["live", "in_progress"].includes(status)) return "text-orange border-orange/20 bg-orange/10";
  if (["open", "registration"].includes(status)) return "text-cyan border-cyan/20 bg-cyan/10";
  if (status === "cancelled") return "text-red-300 border-red-500/20 bg-red-500/10";
  return "text-vapor border-white/5 bg-secondary";
};
const tournamentSchedulePriority = (status) => ({
  live: 5,
  in_progress: 5,
  open: 4,
  registration: 4,
  closed: 3,
  completed: 2,
  cancelled: 1,
  draft: 0,
}[status] ?? 0);
const tournamentScheduleDate = (tournament) => new Date(
  tournament?.created_date || tournament?.updated_date || tournament?.start_date || 0,
).getTime();
const compactModeLabel = (tournament) => `${tournament?.team_size || "1v1"} - ${modeLabels[tournament?.game_mode] || tournament?.game_mode || "Mode TBD"}`;
const usesBlackOps7Artwork = (tournament) => {
  const identity = `${tournament?.name || ""} ${tournament?.game || ""} ${tournament?.game_name || ""}`.toLowerCase();
  return identity.includes("black ops 7") || identity.includes("test tournament");
};
const tournamentImageUrl = (tournament) => usesBlackOps7Artwork(tournament)
  ? blackOps7Artwork
  : tournament?.image_url || tournament?.banner_url || tournament?.cover_image_url || "";
const tournamentBannerUrl = (tournament) => usesBlackOps7Artwork(tournament)
  ? blackOps7Artwork
  : tournament?.banner_url || tournament?.cover_image_url || tournament?.image_url || "";
const isStreamerTournament = (tournament) => Boolean(
  tournament?.is_streamer_tournament
  || ["streamer", "streamer_tournament"].includes(String(tournament?.tournament_type || "").toLowerCase())
  || ["streamer", "streamer_tournament"].includes(String(tournament?.source || "").toLowerCase())
);
const tournamentEntryType = (tournament) => String(
  tournament?.entry_type
  || (tournament?.is_premium_only ? "premium" : (Number(tournament?.entry_fee || 0) > 0 ? "credits" : "free")),
).toLowerCase();
const tournamentEntryInfo = (tournament) => {
  const entryType = tournamentEntryType(tournament);
  const entryFee = Number(tournament?.entry_fee || 0);
  if (entryType === "invitational" || tournament?.invite_only) {
    return { label: "Invite only", tone: "border-orange/25 bg-orange/10 text-orange" };
  }
  if (entryType === "credits_premium") {
    return { label: entryFee > 0 ? `${formatCredits(entryFee)} + Premium` : "Premium entry", tone: "border-purple-400/25 bg-purple-400/10 text-purple-300" };
  }
  if (entryType === "premium") {
    return { label: "Premium entry", tone: "border-purple-400/25 bg-purple-400/10 text-purple-300" };
  }
  if (entryType === "credits" && entryFee > 0) {
    return { label: formatCredits(entryFee), tone: "border-yellow-400/25 bg-yellow-400/10 text-yellow-300" };
  }
  return { label: "Free entry", tone: "border-cyan/25 bg-cyan/10 text-cyan" };
};
const isFreeTournament = (tournament) => {
  const entryType = tournamentEntryType(tournament);
  return entryType === "free";
};
const requiresTournamentCredits = (tournament) => (
  ["credits", "credits_premium"].includes(tournamentEntryType(tournament))
  && Number(tournament?.entry_fee || 0) > 0
);
const isCompletedTournamentMatch = (match) => Boolean(match?.completed || match?.status === "completed");
const tournamentMatchStatusPriority = (status) => ({
  in_progress: 7,
  awaiting_report: 6,
  awaiting_team_a_report: 6,
  awaiting_team_b_report: 6,
  score_conflict: 5,
  disputed: 5,
  ready: 4,
  pending: 3,
  reset: 2,
  completed: 1,
}[status] || 0);
const tournamentMatchStagePriority = (match) => (
  (match?.bracket === "grand_final" ? 3000 : match?.bracket === "loser" ? 2000 : 1000)
  + Number(match?.round || 0)
);
const currentMatchForUser = (matches, participantKeys, teamKeys) => {
  const belongsToUser = (match) => [
    match.team_a_participant_id,
    match.team_b_participant_id,
    match.team_a_id,
    match.team_b_id,
    match.team_a_name,
    match.team_b_name,
  ].filter(Boolean).some((value) => {
    const key = String(value).toLowerCase();
    return participantKeys.has(key) || teamKeys.has(key);
  });

  return matches
    .filter(belongsToUser)
    .sort((a, b) => {
      const activeDifference = Number(!isCompletedTournamentMatch(b)) - Number(!isCompletedTournamentMatch(a));
      if (activeDifference) return activeDifference;
      const statusDifference = tournamentMatchStatusPriority(b.status) - tournamentMatchStatusPriority(a.status);
      if (statusDifference) return statusDifference;
      const stageDifference = tournamentMatchStagePriority(b) - tournamentMatchStagePriority(a);
      if (stageDifference) return stageDifference;
      const dateA = new Date(a.assigned_date || a.updated_date || a.created_date || 0).getTime();
      const dateB = new Date(b.assigned_date || b.updated_date || b.created_date || 0).getTime();
      return dateB - dateA;
    })[0] || null;
};

function FeaturedTournamentHero({ tournament, now, onSelect, halloweenEvent = false }) {
  const bannerUrl = tournamentBannerUrl(tournament);
  const entryInfo = tournamentEntryInfo(tournament);
  const actionLabel = ["open", "registration"].includes(tournament.status)
    ? "Enter tournament"
    : "View tournament";
  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="tournaments-featured-hero dark-media group relative mb-6 min-h-[360px] overflow-hidden rounded-2xl border border-border bg-card shadow-[0_28px_80px_-42px_rgba(0,0,0,.9)]"
    >
      {bannerUrl && <img src={bannerUrl} alt={`${tournament.name} featured banner`} className="absolute inset-0 h-full w-full object-cover" />}
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(11,15,22,.98)_0%,rgba(11,15,22,.92)_48%,rgba(11,15,22,.5)_100%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_10%,rgba(255,130,0,.12),transparent_34%),linear-gradient(180deg,transparent_30%,rgba(8,12,18,.88)_100%)]" />
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-orange/70 via-cyan/30 to-transparent" />
      <div className="relative grid min-h-[360px] lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col justify-end p-6 sm:p-9 lg:p-12 xl:p-14">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md border border-orange/35 bg-orange/15 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.18em] text-orange">Featured tournament</span>
            <span className={`rounded-md border px-2.5 py-1 text-[9px] font-black uppercase tracking-wider ${statusTone(tournament.status)}`}>
              {statusLabels[tournament.status] || tournament.status}
            </span>
            <TournamentEntryBadge tournament={tournament} />
            {halloweenEvent && <HalloweenEventBadge />}
          </div>
          <h2 className="mt-6 max-w-3xl text-4xl font-black leading-[.92] tracking-[-0.045em] text-white sm:text-5xl lg:text-6xl">{tournament.name}</h2>
          <p className="mt-5 max-w-2xl text-[15px] leading-7 text-vapor">
            {tournament.description || `${compactModeLabel(tournament)}. Enter with your roster and compete for the featured prize pool.`}
          </p>
        </div>

        <aside className="relative flex flex-col justify-between border-t border-white/[0.08] bg-background/65 p-6 backdrop-blur-md lg:border-l lg:border-t-0 lg:p-7">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.22em] text-vapor">Tournament overview</p>
            <div className="mt-4 rounded-xl border border-green/25 bg-[linear-gradient(145deg,rgba(0,255,153,.13),rgba(0,255,153,.035))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,.06),0_16px_40px_rgba(0,0,0,.18)]">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-green text-background shadow-[0_0_24px_rgba(0,255,153,.24)]">
                  <Trophy className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-[8px] font-black uppercase tracking-[0.2em] text-green/75">Prize pool</p>
                  <p className="mt-1 font-mono text-2xl font-black leading-none text-green">{formatMoney(tournament.prize_pool)}</p>
                </div>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-white/[0.07] bg-white/[0.035] p-3">
                <p className="text-[8px] font-black uppercase tracking-[0.16em] text-vapor">Entry</p>
                <p className={`mt-2 text-[10px] font-black uppercase ${entryInfo.tone.split(" ").at(-1)}`}>{entryInfo.label}</p>
              </div>
              <div className="rounded-lg border border-white/[0.07] bg-white/[0.035] p-3">
                <p className="text-[8px] font-black uppercase tracking-[0.16em] text-vapor">Format</p>
                <p className="mt-2 text-[10px] font-black uppercase text-white">{tournament.team_size || "1v1"}</p>
              </div>
            </div>
            <div className="mt-2 grid grid-cols-[84px_minmax(0,1fr)] gap-2">
              <CompactStat label="Teams" value={`${tournament.registered_teams || 0}/${tournament.max_teams || 0}`} />
              <TournamentCountdown tournament={tournament} now={now} />
            </div>
          </div>
          <button
            type="button"
            onClick={() => onSelect(tournament.id)}
            className="mt-5 inline-flex w-full shrink-0 items-center justify-between rounded-xl bg-orange px-5 py-3.5 text-[10px] font-black uppercase tracking-[0.14em] text-white shadow-[0_10px_30px_rgba(255,130,0,.16)] transition-all hover:-translate-y-0.5 hover:bg-orange/90 hover:shadow-[0_14px_34px_rgba(255,130,0,.24)]"
          >
            {actionLabel} <ArrowRight className="h-4 w-4" />
          </button>
        </aside>
      </div>
    </motion.section>
  );
}

function TournamentEntryBadge({ tournament, className = "" }) {
  const entryInfo = tournamentEntryInfo(tournament);
  return (
    <span className={`inline-flex items-center rounded-md border px-2.5 py-1 text-[8px] font-black uppercase tracking-[0.14em] ${entryInfo.tone} ${className}`}>
      {entryInfo.label}
    </span>
  );
}

export default function Tournaments() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState("All");
  const [visibleTournamentCount, setVisibleTournamentCount] = useState(8);
  const [user, setUser] = useState(null);
  const [tournaments, setTournaments] = useState([]);
  const [matchesByTournament, setMatchesByTournament] = useState({});
  const [participantsByTournament, setParticipantsByTournament] = useState({});
  const [selectedTournamentId, setSelectedTournamentId] = useState(null);
  const [tournamentTab, setTournamentTab] = useState("overview");
  const [loading, setLoading] = useState(true);
  const [joiningId, setJoiningId] = useState(null);
  const [leavingId, setLeavingId] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const [joinedTournamentIds, setJoinedTournamentIds] = useState(new Set());
  const [userTeams, setUserTeams] = useState([]);
  const [selectedTeamByTournament, setSelectedTeamByTournament] = useState({});
  const [sponsoredMembersByTournament, setSponsoredMembersByTournament] = useState({});
  const [teamCreator, setTeamCreator] = useState({ open: false, tournamentId: null, rosterSize: 4 });
  const [joinTournamentId, setJoinTournamentId] = useState(null);
  const selectedTournamentIdRef = useRef(null);
  const refreshInFlightRef = useRef(false);

  useEffect(() => {
    loadTournaments();

    const refreshLiveTournaments = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      loadTournaments({ silent: true });
    };
    const interval = window.setInterval(refreshLiveTournaments, 10000);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") loadTournaments({ silent: true });
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  useEffect(() => {
    selectedTournamentIdRef.current = selectedTournamentId;
  }, [selectedTournamentId]);

  useEffect(() => {
    const countdownInterval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(countdownInterval);
  }, []);

  useEffect(() => {
    setVisibleTournamentCount(8);
  }, [filter]);

  const loadTournaments = async ({ silent = false } = {}) => {
    if (refreshInFlightRef.current && silent) return;
    refreshInFlightRef.current = true;
    try {
      if (!silent) setLoading(true);
      if (!silent) {
        await base44.functions.invoke("syncTournamentLifecycle", {}).catch(() => null);
      }
      const [currentUser, tournamentRows] = await Promise.all([
        silent ? Promise.resolve(null) : base44.auth.me().catch(() => null),
        base44.entities.Tournament.filterFresh({}, "-start_date", 100),
      ]);
      const rows = tournamentRows || [];
      const officialRows = rows.filter((tournament) => !isStreamerTournament(tournament));

      if (!silent) setUser(currentUser);
      setTournaments(rows);
      if (!silent && currentUser?.id) {
        const [allParticipants, memberships] = await Promise.all([
          base44.entities.TournamentParticipant.filterFresh({}, "-registered_date", 500).catch(() => []),
          base44.entities.TeamMember.filter({ user_id: currentUser.id }, "-joined_date", 20).catch(() => []),
        ]);
        const joined = (allParticipants || []).filter((participant) => (
          participant.captain_id === currentUser.id
          || participant.team_id === currentUser.id
          || (participant.members || []).some((member) => member.user_id === currentUser.id)
        ));
        setJoinedTournamentIds(new Set(joined.map((participant) => participant.tournament_id)));
        const teams = await Promise.all((memberships || [])
          .filter((membership) => membership.is_active !== false)
          .map(async (membership) => {
            const team = await base44.entities.Team.get(membership.team_id).catch(() => null);
            const members = team ? await base44.entities.TeamMember.filter({ team_id: team.id }, "-joined_date", 20).catch(() => []) : [];
            return team ? { ...team, membership, members: (members || []).filter((member) => member.is_active !== false) } : null;
          }));
        setUserTeams(teams.filter(Boolean));
      } else if (!silent) {
        setJoinedTournamentIds(new Set());
        setUserTeams([]);
      }

      const currentSelectedId = selectedTournamentIdRef.current;
      const requestedTournamentId = typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("tournament")
        : null;
      const nextSelectedId = officialRows.some((tournament) => tournament.id === currentSelectedId)
        ? currentSelectedId
        : officialRows.some((tournament) => tournament.id === requestedTournamentId)
          ? requestedTournamentId
          : officialRows[0]?.id;

      if (nextSelectedId && nextSelectedId !== currentSelectedId) {
        selectedTournamentIdRef.current = nextSelectedId;
        setSelectedTournamentId(nextSelectedId);
      } else if (!nextSelectedId) {
        selectedTournamentIdRef.current = null;
        setSelectedTournamentId(null);
      }

      const tournamentIdsToRefresh = new Set([
        nextSelectedId,
        ...officialRows
          .filter((tournament) => ["live", "in_progress"].includes(tournament.status))
          .map((tournament) => tournament.id),
      ].filter(Boolean));
      await Promise.all([...tournamentIdsToRefresh].map((tournamentId) => (
        loadMatches(tournamentId, { includeParticipants: !silent })
      )));
    } catch (error) {
      console.error("Failed to load tournaments:", error);
      if (!silent) {
        toast({ title: "Tournaments unavailable", description: "Could not load tournaments.", variant: "destructive" });
      }
    } finally {
      if (!silent) setLoading(false);
      refreshInFlightRef.current = false;
    }
  };

  const canJoinTournament = (tournament) => {
    if (!tournament) return false;
    const registered = Number(tournament.registered_teams || 0);
    const maxTeams = Number(tournament.max_teams || 0);
    const inviteOnly = tournament.invite_only === true || tournament.entry_type === "invitational";
    const isInvited = (tournament.invited_user_ids || []).map(String).includes(String(user?.id || ""));
    return ["open", "registration"].includes(tournament.status)
      && !joinedTournamentIds.has(tournament.id)
      && (!inviteOnly || isInvited)
      && (!maxTeams || registered < maxTeams);
  };

  const canLeaveTournament = (tournament) => (
    tournament
    && ["open", "registration"].includes(tournament.status)
    && tournament.registration_locked !== true
    && tournament.bracket_generated !== true
  );

  const rosterSize = (teamSize) => Number.parseInt(String(teamSize || "1v1").split("v")[0], 10) || 1;
  const compatibleTeamsFor = (_tournament) => (
    userTeams.filter((team) => (
      team.team_type === "tournament"
      && team.captain_id === user?.id
    ))
  );
  const isTournamentTeamReady = (team, tournament) => {
    const required = rosterSize(tournament.team_size);
    return Boolean(team && Number(team.roster_size || required) === required && team.members.length === required);
  };
  const selectedTeamFor = (tournament) => compatibleTeamsFor(tournament).find((team) => team.id === selectedTeamByTournament[tournament.id]);

  const handleJoinTournament = async (tournament) => {
    if (!user?.id) {
      toast({ title: "Login required", description: "Please log in to join tournaments.", variant: "destructive" });
      return;
    }
    if (!hasActivisionId(user)) {
      toast({ title: "Activision ID required", description: activisionIdRequiredMessage, variant: "destructive" });
      return;
    }
    if (!canJoinTournament(tournament)) return;

    setJoiningId(tournament.id);
    try {
      const required = rosterSize(tournament.team_size);
      const selectedTeam = selectedTeamFor(tournament);
      if (!selectedTeam || !isTournamentTeamReady(selectedTeam, tournament)) {
        toast({ title: "Team required", description: `Select a tournament team with exactly ${required} active players.`, variant: "destructive" });
        return;
      }
      const response = await base44.functions.invoke("registerTournament", {
        tournament_id: tournament.id,
        team_id: selectedTeam.id,
        sponsored_member_ids: isFreeTournament(tournament) ? [] : (sponsoredMembersByTournament[tournament.id] || []),
      });
      if (!response.data?.success) {
        toast({ title: "Join failed", description: response.data?.error || "Could not join tournament.", variant: "destructive" });
        return;
      }
      setJoinedTournamentIds((current) => new Set([...current, tournament.id]));
      const registered = Number(tournament.registered_teams || 0) + 1;
      setTournaments((current) => current.map((row) => (
        row.id === tournament.id ? { ...row, registered_teams: registered } : row
      )));
      window.dispatchEvent(new CustomEvent("topfragg:credits-updated"));
      window.dispatchEvent(new CustomEvent("topfragg:notifications-updated", { detail: { refresh: true } }));
      toast({ title: "Tournament joined", description: `You are registered for ${tournament.name}.` });
      setSponsoredMembersByTournament((current) => ({ ...current, [tournament.id]: [] }));
      setJoinTournamentId(null);
      await loadMatches(tournament.id);
    } catch (error) {
      toast({ title: "Join failed", description: error.message || "Could not join tournament.", variant: "destructive" });
    } finally {
      setJoiningId(null);
    }
  };

  const handleLeaveTournament = async (tournament) => {
    if (!user?.id || !tournament || leavingId) return;

    const participant = selectedParticipants.find((row) => row.captain_id === user.id);
    if (!participant) {
      toast({ title: "Captain required", description: "Only the team captain can leave a tournament.", variant: "destructive" });
      return;
    }

    setLeavingId(tournament.id);
    try {
      const response = await base44.functions.invoke("leaveTournament", {
        tournament_id: tournament.id,
        participant_id: participant.id,
      });
      if (!response.data?.success) {
        toast({ title: "Leave failed", description: response.data?.error || "Could not leave tournament.", variant: "destructive" });
        return;
      }

      setJoinedTournamentIds((current) => {
        const next = new Set(current);
        next.delete(tournament.id);
        return next;
      });
      setParticipantsByTournament((current) => ({
        ...current,
        [tournament.id]: (current[tournament.id] || []).filter((row) => row.id !== participant.id),
      }));
      setTournaments((current) => current.map((row) => (
        row.id === tournament.id
          ? { ...row, registered_teams: response.data.tournament?.registered_teams ?? Math.max(0, Number(row.registered_teams || 0) - 1) }
          : row
      )));
      toast({ title: "Tournament left", description: `${participant.team_name || "Your team"} left ${tournament.name}.` });
      await loadMatches(tournament.id);
    } catch (error) {
      toast({ title: "Leave failed", description: error.message || "Could not leave tournament.", variant: "destructive" });
    } finally {
      setLeavingId(null);
    }
  };

  const loadMatches = async (tournamentId, { includeParticipants = true } = {}) => {
    if (!tournamentId) return;
    try {
      const [matches, participants] = await Promise.all([
        base44.entities.TournamentMatch.filterFresh({ tournament_id: tournamentId }, "round", 256),
        includeParticipants
          ? base44.entities.TournamentParticipant.filterFresh({ tournament_id: tournamentId }, "seed", 256).catch(() => [])
          : Promise.resolve(null),
      ]);
      setMatchesByTournament((current) => ({ ...current, [tournamentId]: matches || [] }));
      if (participants) {
        setParticipantsByTournament((current) => ({ ...current, [tournamentId]: participants }));
      }
    } catch (error) {
      console.error("Failed to load tournament matches:", error);
    }
  };

  const handleSelectTournament = (tournamentId) => {
    navigate(`/tournaments/${tournamentId}`);
  };

  const officialTournaments = useMemo(() => tournaments.filter((tournament) => !isStreamerTournament(tournament)), [tournaments]);
  const halloweenTournamentIds = useMemo(() => new Set(
    [...officialTournaments]
      .sort((a, b) => {
        const priorityDifference = tournamentSchedulePriority(b.status) - tournamentSchedulePriority(a.status);
        return priorityDifference || tournamentScheduleDate(b) - tournamentScheduleDate(a);
      })
      .slice(0, 2)
      .map((tournament) => tournament.id)
  ), [officialTournaments]);
  const featuredTournament = useMemo(() => (
    officialTournaments.find((tournament) => tournament.is_featured === true)
    || officialTournaments.find((tournament) => ["open", "registration", "live", "in_progress"].includes(tournament.status))
    || officialTournaments[0]
    || null
  ), [officialTournaments]);
  const filteredTournaments = useMemo(() => (
    officialTournaments.filter((tournament) => filter === "All" || statusLabels[tournament.status] === filter || tournament.status === filter)
  ), [officialTournaments, filter]);
  const scheduleTournaments = useMemo(() => (
    [...filteredTournaments]
      .sort((a, b) => {
        const priorityDifference = tournamentSchedulePriority(b.status) - tournamentSchedulePriority(a.status);
        return priorityDifference || tournamentScheduleDate(b) - tournamentScheduleDate(a);
      })
      .slice(0, 16)
  ), [filteredTournaments]);
  const visibleScheduleTournaments = scheduleTournaments.slice(0, visibleTournamentCount);
  const hasMoreScheduleTournaments = visibleScheduleTournaments.length < scheduleTournaments.length;
  const liveTournaments = officialTournaments.filter((tournament) => ["live", "in_progress"].includes(tournament.status));
  const selectedTournament = officialTournaments.find((tournament) => tournament.id === selectedTournamentId);
  const selectedMatches = matchesByTournament[selectedTournamentId] || [];
  const selectedParticipants = participantsByTournament[selectedTournamentId] || [];
  const openTournamentTeamCreator = (tournament = selectedTournament || officialTournaments[0]) => {
    setTeamCreator({
      open: true,
      tournamentId: tournament?.id || null,
      rosterSize: tournament ? rosterSize(tournament.team_size) : 4,
    });
  };
  const handleTournamentTeamCreated = async (team) => {
    const tournamentId = teamCreator.tournamentId;
    await loadTournaments();
    if (tournamentId) {
      setSelectedTeamByTournament((current) => ({ ...current, [tournamentId]: team.id }));
      setSponsoredMembersByTournament((current) => ({ ...current, [tournamentId]: [] }));
      setJoinTournamentId(tournamentId);
    }
  };
  const isStaff = staffRoles.has(user?.role);
  const isAdmin = adminRoles.has(user?.role);
  const participantIncludesCurrentUser = (participant) => (
    participant.captain_id === user?.id
    || participant.user_id === user?.id
    || (participant.members || []).some((member) => member.user_id === user?.id)
  );
  const selectedUserParticipant = selectedParticipants.find(participantIncludesCurrentUser);
  const canLeaveSelectedTournament = (
    selectedTournament
    && canLeaveTournament(selectedTournament)
    && selectedUserParticipant?.captain_id === user?.id
  );
  const currentUserParticipantKeys = new Set(selectedParticipants
    .filter(participantIncludesCurrentUser)
    .flatMap((participant) => [participant.id, participant.team_id, participant.user_id, participant.captain_id].filter(Boolean))
    .map((value) => String(value).toLowerCase()));
  const currentUserTeamKeys = new Set(userTeams
    .filter((team) => team.membership?.is_active !== false)
    .flatMap((team) => [team.id, team.name].filter(Boolean).map((value) => String(value).toLowerCase())));
  const selectedUserMatch = currentMatchForUser(selectedMatches, currentUserParticipantKeys, currentUserTeamKeys);
  const joinTournament = officialTournaments.find((tournament) => tournament.id === joinTournamentId) || null;
  const recentChampions = officialTournaments
    .filter((tournament) => tournament.winner_name || tournament.status === "completed")
    .sort((a, b) => new Date(b.completed_date || b.updated_date || b.start_date || 0) - new Date(a.completed_date || a.updated_date || a.start_date || 0))
    .slice(0, 4);
  if (loading) {
    return <PageLoader label="Loading tournaments" />;
  }

  return (
    <div className="tournaments-page min-h-screen py-6">
      <div className="mx-auto max-w-[1600px] px-4 lg:px-6">
        <CompetitionHeader
          mode="tournaments"
          playerCount={officialTournaments.length}
          className="mb-5"
          action={<div className="flex flex-wrap items-center gap-2">
            <Link to="/teams" className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-white/15 bg-background/70 px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-vapor backdrop-blur-sm transition-colors hover:border-cyan/30 hover:text-cyan">
              <Users className="h-3.5 w-3.5" /> My Teams
            </Link>
            <button type="button" onClick={() => openTournamentTeamCreator()} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-cyan px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-background transition-colors hover:bg-cyan/90">
              <Plus className="h-3.5 w-3.5" /> Create Tournament Team
            </button>
            {isAdmin && (
              <Link to="/admin" className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-orange/30 bg-background/70 px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-orange backdrop-blur-sm transition-colors hover:bg-orange/15">
                <Trophy className="h-3.5 w-3.5" /> Create Tournament
              </Link>
            )}
          </div>}
        />

        <ActivisionIdNotice user={user} className="mb-5" />

        {featuredTournament && (
          <FeaturedTournamentHero tournament={featuredTournament} now={now} onSelect={handleSelectTournament} halloweenEvent={halloweenTournamentIds.has(featuredTournament.id)} />
        )}

        <div className="tournaments-toolbar mb-4 flex flex-col gap-3 rounded-xl border border-white/[0.06] bg-card/55 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="px-1">
            <p className="text-sm font-black text-white">Browse tournaments</p>
            <p className="mt-0.5 text-[11px] text-vapor">{filteredTournaments.length} official event{filteredTournaments.length === 1 ? "" : "s"} available</p>
          </div>
          <div className="tournaments-filter-group flex items-center gap-1 overflow-x-auto rounded-lg border border-white/[0.055] bg-background/35 p-1">
            {["All", "Open", "Registration", "In Progress", "Completed"].map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={filter === item}
                onClick={() => setFilter(item)}
                className={`whitespace-nowrap rounded-md px-3 py-2 text-[10px] font-black uppercase tracking-wider transition-all ${
                  filter === item ? "bg-white/[0.09] text-white shadow-sm" : "text-vapor hover:bg-white/[0.04] hover:text-white"
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        {liveTournaments.map((tournament) => {
          const matches = matchesByTournament[tournament.id] || [];
          const liveParticipantKeys = new Set((participantsByTournament[tournament.id] || [])
            .filter(participantIncludesCurrentUser)
            .flatMap((participant) => [participant.id, participant.team_id, participant.user_id, participant.captain_id].filter(Boolean))
            .map((value) => String(value).toLowerCase()));
          const currentUserMatch = currentMatchForUser(matches, liveParticipantKeys, currentUserTeamKeys);
          const activeUserMatch = currentUserMatch && !isCompletedTournamentMatch(currentUserMatch) ? currentUserMatch : null;
          const liveMatch = activeUserMatch || matches.find((match) => [
            "ready",
            "in_progress",
            "awaiting_report",
            "awaiting_team_a_report",
            "awaiting_team_b_report",
          ].includes(match.status));
          const liveStartWindow = matchStartWindow(liveMatch, now);

          return (
            <motion.div
              key={tournament.id}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="tournament-live-strip glass relative mb-3 flex flex-col items-start justify-between gap-3 overflow-hidden rounded-xl border border-red-500/20 px-5 py-3.5 sm:flex-row sm:items-center"
            >
              <div className="absolute top-0 left-0 w-60 h-60 bg-red-500/5 rounded-full blur-[80px]" />
              <div className="relative flex items-center gap-3">
                <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                <div>
                  <p className="text-sm font-bold">{tournament.name}</p>
                  <p className="text-[11px] text-vapor">
                    {statusLabels[tournament.status] || tournament.status} - {tournament.registered_teams || 0}/{tournament.max_teams} teams
                  </p>
                  {liveStartWindow && (
                    <p className={`mt-1 flex items-center gap-1.5 text-xs font-bold ${liveStartWindow.expired ? "text-orange" : "text-cyan"}`}>
                      <Clock className="h-3.5 w-3.5" /> {liveStartWindow.label}
                    </p>
                  )}
                </div>
              </div>
              {liveMatch ? (
                <Link to={`/tournament-match/${liveMatch.id}`} className="inline-flex items-center gap-2 rounded-md border border-red-500/20 bg-red-500/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-red-400 transition-all hover:bg-red-500/20">
                  {activeUserMatch ? "Open My Match" : "Open Live Match"} <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              ) : (
                <button onClick={() => handleSelectTournament(tournament.id)} className="inline-flex items-center gap-2 rounded-md border border-red-500/20 bg-red-500/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-red-400 transition-all hover:bg-red-500/20">
                  View Tournament <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </motion.div>
          );
        })}

        <div className="tournaments-main-grid mt-4">
          <section className="tournaments-list-panel w-full rounded-xl border border-white/[0.07] bg-card/45 p-3">
            <div className="mb-3 flex items-center justify-between gap-3 px-1 pb-2">
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-cyan">Official competition</p>
                <h2 className="mt-1 text-lg font-black">Tournament schedule</h2>
              </div>
              <span className="rounded-full bg-white/[0.055] px-2.5 py-1 text-[10px] font-bold text-vapor">{scheduleTournaments.length}</span>
            </div>
            <div className="space-y-2">
              {visibleScheduleTournaments.length === 0 ? (
                <div className="rounded-lg border border-white/5 px-5 py-10 text-center">
                  <Trophy className="w-10 h-10 text-vapor/30 mx-auto mb-3" />
                  <p className="text-sm text-vapor">No tournaments found.</p>
                </div>
              ) : visibleScheduleTournaments.map((tournament) => (
                <TournamentCard
                  key={tournament.id}
                  tournament={tournament}
                  selected={false}
                  joined={joinedTournamentIds.has(tournament.id)}
                  onSelect={handleSelectTournament}
                  canJoin={canJoinTournament(tournament)}
                  onJoin={() => setJoinTournamentId(tournament.id)}
                  now={now}
                  halloweenEvent={halloweenTournamentIds.has(tournament.id)}
                />
              ))}
            </div>
            {hasMoreScheduleTournaments && (
              <button
                type="button"
                onClick={() => setVisibleTournamentCount((current) => Math.min(current + 8, 16))}
                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/[0.07] bg-background/35 px-4 py-3.5 text-[10px] font-black uppercase tracking-[0.14em] text-vapor transition-colors hover:border-orange/25 hover:bg-orange/[0.06] hover:text-orange"
              >
                Load more tournaments <ChevronDown className="h-4 w-4" />
              </button>
            )}
          </section>

          <div className="hidden" aria-hidden="true">
            <div id="tournament-bracket-preview" className="scroll-mt-24 space-y-5">
              {selectedTournament && (
                <div className="tournament-detail-header glass flex flex-col gap-5 rounded-xl border border-white/[0.07] p-5 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex min-w-0 items-center gap-4">
                    <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-background">
                      {tournamentImageUrl(selectedTournament) ? (
                        <img src={tournamentImageUrl(selectedTournament)} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-vapor"><Trophy className="h-5 w-5" /></div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="truncate text-xl font-black tracking-[-0.02em] sm:text-2xl">{selectedTournament.name}</h2>
                        <span className={`rounded border px-2 py-0.5 text-[8px] font-black uppercase tracking-wider ${statusTone(selectedTournament.status)}`}>
                          {statusLabels[selectedTournament.status] || selectedTournament.status}
                        </span>
                      </div>
                      <p className="mt-1.5 text-xs text-vapor">
                        {compactModeLabel(selectedTournament)} · {formatDate(selectedTournament.start_date)}
                      </p>
                    </div>
                  </div>
                  <div className="tournament-detail-stats grid shrink-0 grid-cols-2 gap-2 text-right sm:grid-cols-4">
                    <CompactStat label="Prize" value={formatMoney(selectedTournament.prize_pool)} tone="green" />
                    <CompactStat label="Entry" value={tournamentEntryInfo(selectedTournament).label} tone={isFreeTournament(selectedTournament) ? "cyan" : "default"} />
                    <CompactStat label="Teams" value={`${selectedTournament.registered_teams || 0}/${selectedTournament.max_teams || 0}`} />
                    <CompactStat label="Starts in" value={timeUntil(selectedTournament.start_date, now)} tone="cyan" />
                  </div>
                </div>
              )}

              {selectedTournament && (
                <div className="tournament-detail-tabs overflow-x-auto rounded-xl border border-white/[0.06] bg-card/45 px-2">
                  <div className="flex min-w-max items-center" role="tablist" aria-label="Tournament sections">
                    {[
                      ["overview", "Overview"],
                      ["bracket", "Bracket"],
                      ["matches", "Matches"],
                      ["teams", "Teams"],
                      ["rules", "Rules"],
                    ].map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        role="tab"
                        aria-selected={tournamentTab === value}
                        onClick={() => setTournamentTab(value)}
                        className={`relative min-h-12 px-4 text-xs font-black transition-colors after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full ${tournamentTab === value ? "text-primary after:bg-primary" : "text-vapor after:bg-transparent hover:text-white"}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {tournamentTab === "overview" && <div className="tournament-access-panel flex flex-col gap-4 rounded-xl border border-white/[0.06] bg-card/45 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h2 className="text-sm font-black">Tournament access</h2>
                    <p className="mt-1 max-w-xl text-xs leading-5 text-vapor">
                    {selectedTournament?.invite_only || selectedTournament?.entry_type === "invitational"
                      ? "Invite-only tournament. Registered teams remain private."
                      : isFreeTournament(selectedTournament)
                        ? "Free entry. Join with an eligible tournament team; no credits are required."
                        : `${tournamentEntryInfo(selectedTournament).label}. Join with an eligible tournament team.`}
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {selectedTournament && joinedTournamentIds.has(selectedTournament.id) && (
                    <span className="px-3 py-2 bg-green/10 text-green text-xs font-bold rounded-lg border border-green/20 uppercase tracking-wider">
                      Joined
                    </span>
                  )}
                  {canLeaveSelectedTournament && (
                    <button
                      type="button"
                      onClick={() => handleLeaveTournament(selectedTournament)}
                      disabled={leavingId === selectedTournament.id}
                      className="inline-flex items-center gap-2 px-3 py-2 bg-red-500/10 text-red-300 text-xs font-bold rounded-lg border border-red-500/20 hover:bg-red-500/20 disabled:opacity-50 uppercase tracking-wider"
                    >
                      {leavingId === selectedTournament.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />}
                      Leave
                    </button>
                  )}
                  {selectedUserMatch && (
                    <Link
                      to={`/tournament-match/${selectedUserMatch.id}`}
                      className="px-3 py-2 bg-cyan/10 text-cyan text-xs font-bold rounded-lg border border-cyan/20 hover:bg-cyan/20 uppercase tracking-wider"
                    >
                      Open My Match
                    </Link>
                  )}
                  {selectedTournament && canJoinTournament(selectedTournament) && (
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <select
                        value={selectedTeamByTournament[selectedTournament.id] || ""}
                        onChange={(event) => {
                          setSelectedTeamByTournament((current) => ({ ...current, [selectedTournament.id]: event.target.value }));
                          setSponsoredMembersByTournament((current) => ({ ...current, [selectedTournament.id]: [] }));
                        }}
                        className="px-3 py-2 bg-secondary text-vapor text-xs rounded-lg border border-white/5 focus:border-cyan/30 focus:outline-none"
                      >
                        <option value="">Select team</option>
                        {compatibleTeamsFor(selectedTournament).map((team) => (
                          <option key={team.id} value={team.id}>
                            {team.name} ({team.members.length}/{rosterSize(selectedTournament.team_size)})
                          </option>
                        ))}
                      </select>
                      {compatibleTeamsFor(selectedTournament).length === 0 && (
                        <button type="button" onClick={() => openTournamentTeamCreator(selectedTournament)} className="inline-flex items-center gap-1.5 rounded-lg border border-cyan/20 bg-cyan/10 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-cyan hover:bg-cyan/20">
                          <Plus className="h-3 w-3" /> Create Team
                        </button>
                      )}
                      {selectedTeamByTournament[selectedTournament.id] && !isTournamentTeamReady(selectedTeamFor(selectedTournament), selectedTournament) && (
                        <span className="text-[10px] text-orange">
                          Needs exactly {rosterSize(selectedTournament.team_size)} active players
                        </span>
                      )}
                      <button
                        onClick={() => setJoinTournamentId(selectedTournament.id)}
                        disabled={joiningId === selectedTournament.id}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-green text-background text-xs font-bold rounded-lg disabled:opacity-50 uppercase tracking-wider"
                      >
                        {joiningId === selectedTournament.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Users className="w-3.5 h-3.5" />}
                        Join
                      </button>
                    </div>
                  )}
                </div>
              </div>}
              <RecentChampionsPanel champions={recentChampions} />
              {tournamentTab === "bracket" && <CompactBracketPreview matches={selectedMatches} tournament={selectedTournament} />}
              {tournamentTab === "matches" && <TournamentMatchesPanel matches={selectedMatches} />}
              {tournamentTab === "teams" && <TournamentTeamsPanel participants={selectedParticipants} tournament={selectedTournament} />}
              {tournamentTab === "rules" && <TournamentRulesPanel tournament={selectedTournament} />}
            </div>
          </div>
        </div>

        <CreateTeamModal
          isOpen={teamCreator.open}
          onClose={() => setTeamCreator((current) => ({ ...current, open: false }))}
          onCreated={handleTournamentTeamCreated}
          user={user}
          defaultTeamType="tournament"
          defaultRosterSize={teamCreator.rosterSize}
          lockTeamType
          title="Create Tournament Team"
          description={`Create a ${teamRosterFormat(teamCreator.rosterSize)} tournament roster with yourself as captain.`}
        />
        <TournamentJoinModal
          isOpen={Boolean(joinTournament)}
          onClose={() => setJoinTournamentId(null)}
          tournament={joinTournament}
          teams={joinTournament ? compatibleTeamsFor(joinTournament) : []}
          selectedTeamId={joinTournament ? selectedTeamByTournament[joinTournament.id] || "" : ""}
          onSelectTeam={(teamId) => {
            if (!joinTournament) return;
            setSelectedTeamByTournament((current) => ({ ...current, [joinTournament.id]: teamId }));
            setSponsoredMembersByTournament((current) => ({ ...current, [joinTournament.id]: [] }));
          }}
          onCreateTeam={() => {
            if (!joinTournament) return;
            setJoinTournamentId(null);
            openTournamentTeamCreator(joinTournament);
          }}
          onJoin={() => joinTournament && handleJoinTournament(joinTournament)}
          joining={joiningId === joinTournament?.id}
          sponsoredMemberIds={joinTournament ? sponsoredMembersByTournament[joinTournament.id] || [] : []}
          onSponsoredMemberIdsChange={(memberIds) => joinTournament && setSponsoredMembersByTournament((current) => ({ ...current, [joinTournament.id]: memberIds }))}
          requiresCredits={joinTournament ? requiresTournamentCredits(joinTournament) : false}
        />
      </div>
    </div>
  );
}

function TournamentCountdown({ tournament, now }) {
  const countdown = countdownUntil(tournament?.start_date, now);
  const status = String(tournament?.status || "").toLowerCase();
  if (!countdown) {
    return <CompactStat label="Starts in" value="TBD" tone="cyan" />;
  }
  if (countdown.expired) {
    if (["live", "in_progress"].includes(status)) {
      return <CompactStat label="Status" value="Live now" tone="orange" />;
    }
    if (status === "completed") {
      return <CompactStat label="Status" value="Completed" tone="green" />;
    }
    if (status === "cancelled") {
      return <CompactStat label="Status" value="Cancelled" tone="default" />;
    }
    return <CompactStat label="Status" value="Starting" tone="cyan" />;
  }

  const units = [
    [countdown.hours, "hrs"],
    [countdown.minutes, "min"],
    [countdown.seconds, "sec"],
  ];

  return (
    <div className="flex min-h-[58px] min-w-0 items-center rounded-lg border border-cyan/20 bg-cyan/[0.08] px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="min-w-0 flex-1">
        <p className="mb-1.5 flex items-center gap-1.5 text-[8px] font-black uppercase tracking-[0.18em] text-cyan/75">
          <Clock className="h-3 w-3 shrink-0" /> Starts in
        </p>
        <div className="grid grid-cols-[1fr_auto_1fr_auto_1fr] items-baseline gap-x-1" aria-label={`Starts in ${countdown.hours} hours, ${countdown.minutes} minutes and ${countdown.seconds} seconds`}>
          {units.map(([unitValue, label], index) => (
            <React.Fragment key={label}>
              {index > 0 && <span className="font-mono text-[10px] font-black text-cyan/35">:</span>}
              <span className="inline-flex min-w-0 items-baseline justify-center gap-0.5">
                <span className="font-mono text-sm font-black leading-none text-white">{padCountdownUnit(unitValue)}</span>
                <span className="text-[6px] font-black uppercase tracking-wide text-vapor">{label}</span>
              </span>
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}

function CompactStat({ label, value, tone = "default" }) {
  const valueTone = {
    green: "text-green",
    cyan: "text-cyan",
    orange: "text-orange",
    default: "text-white",
  }[tone];
  const surfaceTone = {
    green: "border-green/20 bg-green/[0.07]",
    cyan: "border-cyan/20 bg-cyan/[0.07]",
    orange: "border-orange/20 bg-orange/[0.07]",
    default: "border-white/[0.06] bg-background/35",
  }[tone];
  return (
    <div className={`min-w-[72px] rounded-md border px-2.5 py-2 ${surfaceTone}`}>
      <p className={`truncate font-mono text-[11px] font-black ${valueTone}`}>{value}</p>
      <p className="mt-0.5 text-[8px] font-black uppercase tracking-wider text-vapor">{label}</p>
    </div>
  );
}

function TournamentMatchesPanel({ matches = [] }) {
  const orderedMatches = [...matches].sort((a, b) => (
    Number(a.round || 1) - Number(b.round || 1)
    || Number(a.match_number || 1) - Number(b.match_number || 1)
  ));

  return (
    <section className="glass overflow-hidden rounded-xl border border-border">
      <div className="border-b border-border px-5 py-4">
        <p className="text-[9px] font-black uppercase tracking-[0.18em] text-primary">Tournament matches</p>
        <h2 className="mt-1 text-base font-black">Match schedule and results</h2>
      </div>
      {orderedMatches.length ? (
        <div className="divide-y divide-border">
          {orderedMatches.map((match) => {
            const complete = match.completed || match.status === "completed";
            return (
              <Link key={match.id} to={`/tournament-match/${match.id}`} className="group grid gap-3 px-5 py-4 transition-colors hover:bg-primary/[0.035] sm:grid-cols-[110px_minmax(0,1fr)_auto] sm:items-center">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-wider text-vapor">{match.bracket === "loser" ? "Lower" : match.bracket === "grand_final" ? "Grand Final" : "Round"} {match.round || 1}</p>
                  <p className="mt-1 text-xs font-bold text-primary">Match {match.match_number || 1}</p>
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold">{match.team_a_name || "Open slot"} <span className="px-1 text-vapor">vs</span> {match.team_b_name || "Open slot"}</p>
                  <p className="mt-1 text-[10px] text-vapor">{modeLabels[match.game_mode] || match.game_mode || "Mode TBD"} · {formatDate(match.scheduled_date || match.start_date)}</p>
                </div>
                <div className="flex items-center gap-3 sm:justify-end">
                  <span className="font-mono text-sm font-black">{match.team_a_score || 0} — {match.team_b_score || 0}</span>
                  <span className={`rounded-md border px-2 py-1 text-[9px] font-black uppercase ${complete ? "border-green/20 bg-green/10 text-green" : "border-primary/20 bg-primary/10 text-primary"}`}>
                    {complete ? "Final" : statusLabels[match.status] || String(match.status || "pending").replace(/_/g, " ")}
                  </span>
                  <ArrowRight className="h-4 w-4 text-vapor group-hover:text-primary" />
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="px-5 py-12 text-center">
          <Clock className="mx-auto h-8 w-8 text-vapor/35" />
          <p className="mt-3 text-sm font-bold">Matches appear after the bracket is generated.</p>
        </div>
      )}
    </section>
  );
}

function TournamentTeamsPanel({ participants = [], tournament }) {
  const teamsVisible = tournament?.bracket_generated || ["live", "in_progress", "completed"].includes(tournament?.status);

  return (
    <section className="glass overflow-hidden rounded-xl border border-border">
      <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.18em] text-primary">Registered teams</p>
          <h2 className="mt-1 text-base font-black">Competition field</h2>
        </div>
        <span className="rounded-md border border-border bg-secondary px-2.5 py-1 text-[10px] font-black text-vapor">{tournament?.registered_teams || participants.length}/{tournament?.max_teams || "—"}</span>
      </div>
      {!teamsVisible ? (
        <div className="px-5 py-12 text-center">
          <Users className="mx-auto h-8 w-8 text-vapor/35" />
          <p className="mt-3 text-sm font-bold">Team entries stay private until the bracket is seeded.</p>
        </div>
      ) : participants.length ? (
        <div className="grid gap-3 p-4 sm:grid-cols-2">
          {participants.map((participant, index) => (
            <article key={participant.id || index} className="flex items-center gap-3 rounded-lg border border-border bg-secondary/45 p-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 font-mono text-xs font-black text-primary">#{participant.seed || index + 1}</span>
              <div className="min-w-0">
                <p className="truncate text-sm font-black">{participant.team_name || participant.player_name || `Team ${index + 1}`}</p>
                <p className="mt-0.5 text-[10px] text-vapor">{participant.members?.length || participant.player_names?.length || 1} player roster</p>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="px-5 py-12 text-center"><p className="text-sm text-vapor">No teams registered yet.</p></div>
      )}
    </section>
  );
}

function TournamentRulesPanel({ tournament }) {
  const rules = tournament?.rules || tournament?.rules_text || tournament?.description;

  return (
    <section className="glass rounded-xl border border-border p-5 sm:p-6">
      <p className="text-[9px] font-black uppercase tracking-[0.18em] text-primary">Tournament rules</p>
      <h2 className="mt-1 text-base font-black">Format and fair play</h2>
      <div className="mt-4 whitespace-pre-wrap text-sm leading-7 text-vapor">
        {rules || "This event follows the Topfragg competitive rules, match reporting process, and dispute policy."}
      </div>
      <Link to="/rules" className="mt-5 inline-flex items-center gap-2 rounded-lg border border-border bg-secondary px-4 py-2.5 text-xs font-black uppercase tracking-wider text-foreground hover:border-primary/30 hover:bg-primary/[0.06] hover:text-primary">
        View Platform Rules <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </section>
  );
}

function CompactBracketPreview({ matches = [], tournament = null }) {
  const groups = useMemo(() => {
    const unique = new Map();
    matches.forEach((match) => {
      const key = String(match.id || `${match.bracket || "winner"}-${match.round || 1}-${match.match_number || 1}`);
      unique.set(key, match);
    });
    const bracketOrder = { winner: 1, loser: 2, grand_final: 3 };
    const rows = [...unique.values()].sort((a, b) => (
      (bracketOrder[a.bracket || "winner"] || 9) - (bracketOrder[b.bracket || "winner"] || 9)
      || Number(a.round || 1) - Number(b.round || 1)
      || Number(a.match_number || 1) - Number(b.match_number || 1)
    ));
    const maxWinnerRound = Math.max(1, ...rows
      .filter((match) => !match.bracket || match.bracket === "winner")
      .map((match) => Number(match.round || 1)));
    const hasGrandFinal = rows.some((match) => match.bracket === "grand_final");
    const map = new Map();
    rows.forEach((match) => {
      const bracket = match.bracket || "winner";
      const round = Number(match.round || 1);
      const key = `${bracket}-${round}`;
      if (!map.has(key)) {
        const roundsFromFinal = maxWinnerRound - round + (hasGrandFinal && bracket === "winner" ? 1 : 0);
        const label = bracket === "grand_final"
          ? "Grand Final"
          : bracket === "loser"
            ? `Lower R${round}`
            : roundsFromFinal === 0
              ? "Final"
              : roundsFromFinal === 1
                ? "Semi Finals"
                : roundsFromFinal === 2
                  ? "Quarter Finals"
                  : `Round ${round}`;
        map.set(key, { key, label, bracket, round, matches: [] });
      }
      map.get(key).matches.push(match);
    });
    return [...map.values()];
  }, [matches]);

  return (
    <section className="glass overflow-hidden rounded-xl border border-white/[0.07]">
      <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-3">
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.18em] text-vapor">Tournament bracket</p>
          <h2 className="mt-0.5 text-sm font-black">Bracket overview</h2>
        </div>
        {tournament?.winner_name && (
          <span className="inline-flex items-center gap-1.5 rounded-md border border-yellow-400/15 bg-yellow-400/[0.06] px-2.5 py-1.5 text-[9px] font-black uppercase tracking-wider text-yellow-300">
            <Trophy className="h-3 w-3" /> {tournament.winner_name}
          </span>
        )}
      </div>

      {groups.length === 0 ? (
        <div className="px-5 py-12 text-center">
          <Trophy className="mx-auto h-8 w-8 text-vapor/25" />
          <p className="mt-3 text-xs font-bold text-vapor">The bracket will appear after teams are seeded.</p>
        </div>
      ) : (
        <div className="overflow-x-auto p-3">
          <div className="grid min-w-max items-stretch gap-6" style={{ gridTemplateColumns: `repeat(${groups.length}, minmax(184px, 1fr))` }}>
            {groups.map((group, groupIndex) => {
              const previousGroup = groups[groupIndex - 1];
              const nextGroup = groups[groupIndex + 1];
              const connects = (source, target) => Boolean(source && target && (
                (source.bracket === target.bracket && target.round === source.round + 1)
                || (["winner", "loser"].includes(source.bracket) && target.bracket === "grand_final")
              ) && (
                source.matches.length === target.matches.length
                || source.matches.length === target.matches.length * 2
              ));
              const hasIncomingLine = connects(previousGroup, group);
              const hasOutgoingLine = connects(group, nextGroup);
              const hasBranchLines = hasOutgoingLine && group.matches.length === nextGroup.matches.length * 2;

              return (
              <div key={group.key} className="flex h-full min-w-0 flex-col">
                <div className="mb-2 flex items-center justify-between px-1">
                  <h3 className="text-[9px] font-black uppercase tracking-wider text-vapor">{group.label}</h3>
                  <span className="text-[8px] font-bold text-vapor/70">{group.matches.length}</span>
                </div>
                <div
                  className="relative grid min-h-[340px] flex-1 gap-2"
                  style={{ gridTemplateRows: `repeat(${group.matches.length}, minmax(78px, 1fr))` }}
                >
                  {hasBranchLines && nextGroup.matches.map((_, pairIndex) => (
                    <span
                      key={`branch-${group.key}-${pairIndex}`}
                      aria-hidden="true"
                      className="pointer-events-none absolute left-[calc(100%+12px)] z-0 w-px bg-white/20"
                      style={{
                        top: `${((pairIndex * 2) + 0.5) / group.matches.length * 100}%`,
                        height: `${100 / group.matches.length}%`,
                      }}
                    />
                  ))}
                  {group.matches.map((match) => {
                    const complete = Boolean(match.completed || match.status === "completed");
                    const teamAWin = complete && String(match.winner_id || "") === String(match.team_a_id || "");
                    const teamBWin = complete && String(match.winner_id || "") === String(match.team_b_id || "");
                    return (
                      <Link
                        key={match.id}
                        to={`/tournament-match/${match.id}`}
                        className="relative z-10 flex min-h-[78px] w-full self-center flex-col justify-center rounded-lg border border-white/[0.07] bg-background/95 p-2 transition-colors hover:border-white/20 hover:bg-secondary"
                      >
                        {hasIncomingLine && <span aria-hidden="true" className="pointer-events-none absolute right-full top-1/2 h-px w-3 bg-white/20" />}
                        {hasOutgoingLine && <span aria-hidden="true" className="pointer-events-none absolute left-full top-1/2 h-px w-3 bg-white/20" />}
                        <p className="mb-1.5 text-[8px] font-black uppercase tracking-wider text-vapor">Match {match.match_number || "-"}</p>
                        <BracketTeamRow name={match.team_a_name} seed={match.team_a_seed} score={match.team_a_score} winner={teamAWin} complete={complete} />
                        <BracketTeamRow name={match.team_b_name} seed={match.team_b_seed} score={match.team_b_score} winner={teamBWin} complete={complete} />
                      </Link>
                    );
                  })}
                </div>
              </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

function BracketTeamRow({ name, seed, score, winner, complete }) {
  return (
    <div className={`flex items-center justify-between gap-2 border-t border-white/[0.05] py-1.5 first:border-t-0 ${winner ? "text-white" : "text-vapor"}`}>
      <span className="min-w-0 truncate text-[10px] font-bold">{name ? `${seed ? `#${seed} ` : ""}${name}` : "TBD"}</span>
      <span className={`font-mono text-[10px] font-black ${winner ? "text-green" : "text-vapor"}`}>{complete ? Number(score || 0) : "—"}</span>
    </div>
  );
}

function TournamentCardStat({ label, value, tone = "text-white", icon: Icon }) {
  return (
    <div className="min-w-0 border-l border-white/[0.07] pl-3 sm:min-w-[86px]">
      <p className="flex items-center gap-1.5 text-[7px] font-black uppercase tracking-[0.14em] text-vapor/65">
        {Icon && <Icon className="h-2.5 w-2.5" />} {label}
      </p>
      <p className={`mt-0.5 whitespace-nowrap font-mono text-[11px] font-black ${tone}`}>{value}</p>
    </div>
  );
}

function TournamentCard({ tournament, selected, joined, canJoin, onSelect, onJoin, now, halloweenEvent = false }) {
  const imageUrl = tournamentImageUrl(tournament);
  const entryInfo = tournamentEntryInfo(tournament);
  const startLabel = timeUntil(tournament.start_date, now);
  const scheduleCompleted = startLabel === "Completed";
  const tournamentStatus = String(tournament.status || "").toLowerCase();
  const scheduleStatusValue = !scheduleCompleted
    ? startLabel
    : ["live", "in_progress"].includes(tournamentStatus)
      ? "Live now"
      : tournamentStatus === "completed"
        ? "Completed"
        : tournamentStatus === "cancelled"
          ? "Cancelled"
          : "Starting";
  const scheduleStatusTone = !scheduleCompleted
    ? "text-cyan"
    : ["live", "in_progress"].includes(tournamentStatus)
      ? "text-orange"
      : tournamentStatus === "completed"
        ? "text-green"
        : "text-cyan";
  return (
    <motion.article
      className={`tournament-list-card group relative grid w-full grid-cols-[48px_minmax(0,1fr)] gap-2.5 overflow-hidden rounded-lg border px-3 py-2.5 text-left transition-all lg:grid-cols-[48px_minmax(230px,1fr)_auto] lg:items-center ${
        selected ? "is-selected border-cyan/25 bg-cyan/[0.055]" : "border-white/[0.055] bg-background/20 hover:border-white/15 hover:bg-white/[0.03]"
      }`}
    >
      <button type="button" onClick={() => onSelect(tournament.id)} className="absolute inset-0 z-0" aria-label={`View ${tournament.name} overview`} />
      <div className="pointer-events-none relative z-[1] h-12 w-12 overflow-hidden rounded-md border border-white/[0.07] bg-background">
        <img src={imageUrl || "/assets/tournaments/black-ops-7.webp"} alt="" className="h-full w-full object-cover" />
      </div>
      <div className="pointer-events-none relative z-[1] min-w-0">
        <div className="flex min-w-0 items-center gap-2.5">
          <h3 className="truncate text-sm font-black tracking-[-0.01em] transition-colors duration-200 group-hover:text-orange">{tournament.name}</h3>
          {joined && <span className="shrink-0 rounded-full bg-green/10 px-2 py-0.5 text-[8px] font-black uppercase tracking-wider text-green">Joined</span>}
          {halloweenEvent && <HalloweenEventBadge className="hidden sm:inline-flex" />}
        </div>
        <p className="mt-1 truncate text-[10px] leading-4 text-vapor">{compactModeLabel(tournament)}</p>
      </div>
      <div className="pointer-events-none relative z-[1] col-span-2 grid grid-cols-2 items-center gap-x-2.5 gap-y-2.5 border-t border-white/[0.05] pt-2.5 sm:grid-cols-[repeat(4,auto)_auto] lg:col-span-1 lg:flex lg:border-t-0 lg:pt-0">
        <TournamentCardStat label="Prize pool" value={formatMoney(tournament.prize_pool)} tone="text-green" icon={Trophy} />
        <TournamentCardStat label="Entry" value={entryInfo.label} tone={entryInfo.tone.split(" ").at(-1)} />
        <TournamentCardStat label="Teams" value={`${tournament.registered_teams || 0} / ${tournament.max_teams || 0}`} icon={Users} />
        <TournamentCardStat label={scheduleCompleted ? "Status" : "Starts in"} value={scheduleStatusValue} tone={scheduleStatusTone} icon={Clock} />
        {canJoin ? (
          <button
            type="button"
            onClick={(event) => { event.stopPropagation(); onJoin(); }}
            className="pointer-events-auto relative z-10 col-span-2 inline-flex items-center justify-center gap-1.5 rounded-md bg-orange px-3.5 py-2 text-[9px] font-black uppercase tracking-[0.12em] text-white shadow-[0_6px_16px_rgba(255,130,0,.14)] transition-colors hover:bg-orange/90 sm:col-span-1"
          >
            <Users className="h-3 w-3" /> Join
          </button>
        ) : (
          <span className="col-span-2 inline-flex items-center justify-center gap-1.5 rounded-md border border-cyan/25 bg-cyan/10 px-3 py-2 text-[8px] font-black uppercase tracking-wider text-cyan sm:col-span-1">View <ArrowRight className="h-3 w-3" /></span>
        )}
      </div>
    </motion.article>
  );
}

function RecentChampionsPanel({ champions }) {
  return (
    <section className="tournaments-champions-panel h-full rounded-xl border border-white/[0.07] bg-card/45 p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.2em] text-yellow-300">Hall of victory</p>
          <h2 className="mt-1 text-lg font-black tracking-[-0.02em]">Recent champions</h2>
        </div>
        <span className="text-[10px] font-black uppercase tracking-wider text-cyan">View All Champions</span>
      </div>
      {champions.length === 0 ? (
        <div className="flex min-h-40 items-center justify-center rounded-xl border border-dashed border-white/[0.08] bg-background/15 px-5 py-8 text-center">
          <div>
            <Medal className="mx-auto mb-3 h-9 w-9 text-vapor/25" />
            <p className="text-sm font-bold text-vapor">The podium is still open</p>
            <p className="mt-1 text-xs text-vapor/70">Completed tournaments will appear here.</p>
          </div>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {champions.map((tournament) => (
            <div key={tournament.id} className="rounded-lg border border-white/5 bg-background/25 p-4">
              <div className="mb-3 flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-yellow-400/20 bg-yellow-400/10">
                  <Trophy className="h-7 w-7 text-yellow-400" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-black">{tournament.winner_name || "Champion TBD"}</p>
                  <p className="truncate text-xs text-vapor">{tournament.name}</p>
                </div>
              </div>
              <p className="font-mono text-xs font-black text-green">
                Won {formatMoney(tournament.prize_won || tournament.prize_pool || 0)}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
