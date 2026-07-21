import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Award,
  ChevronLeft,
  ChevronRight,
  Clock,
  DollarSign,
  Loader2,
  LogOut,
  Medal,
  Monitor,
  Plus,
  Radio,
  Star,
  Swords,
  Trophy,
  Users,
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/use-toast";
import ActivisionIdNotice from "@/components/competition/ActivisionIdNotice";
import CreateTeamModal from "@/components/teams/CreateTeamModal";
import TournamentBracket from "@/components/tournaments/TournamentBracket";
import { activisionIdRequiredMessage, hasActivisionId } from "@/lib/activision";
import { teamRosterFormat } from "@/lib/teamFormats";

const staffRoles = new Set(["ceo", "super_admin", "admin", "moderator"]);
const adminRoles = new Set(["ceo", "super_admin", "admin"]);

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
const timeUntil = (value, now = Date.now()) => {
  if (!value) return "TBD";
  const diff = new Date(value).getTime() - now;
  if (diff <= 0) return "Live now";
  const totalSeconds = Math.floor(diff / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (days > 0) return `${days}d ${padCountdownUnit(hours)}h ${padCountdownUnit(minutes)}m ${padCountdownUnit(seconds)}s`;
  if (hours > 0) return `${hours}h ${padCountdownUnit(minutes)}m ${padCountdownUnit(seconds)}s`;
  return `${minutes}m ${padCountdownUnit(seconds)}s`;
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
const compactModeLabel = (tournament) => `${tournament?.team_size || "1v1"} - ${modeLabels[tournament?.game_mode] || tournament?.game_mode || "Mode TBD"}`;
const tournamentImageUrl = (tournament) => tournament?.image_url || tournament?.banner_url || tournament?.cover_image_url || "";
const isStreamerTournament = (tournament) => Boolean(
  tournament?.is_streamer_tournament
  || ["streamer", "streamer_tournament"].includes(String(tournament?.tournament_type || "").toLowerCase())
  || ["streamer", "streamer_tournament"].includes(String(tournament?.source || "").toLowerCase())
);
const isStreamerUser = (user) => {
  const badges = Array.isArray(user?.badges) ? user.badges : [];
  return Boolean(user?.streamer_badge || user?.is_streamer || badges.some((badge) => badge?.type === "streamer"));
};
const tournamentEntryInfo = (tournament) => {
  const entryType = tournament?.entry_type || (tournament?.is_premium_only ? "premium" : (Number(tournament?.entry_fee || 0) > 0 ? "credits" : "free"));
  const fee = Number(tournament?.entry_fee || 0);

  if (entryType === "credits_premium") {
    return {
      pill: fee > 0 ? `${formatCredits(fee)} + Premium` : "Credits + Premium",
      value: fee > 0 ? formatCredits(fee) : "Premium",
      color: "text-orange",
      tone: "border-orange/25 bg-orange/10 text-orange",
    };
  }

  if (entryType === "premium") {
    return {
      pill: "Premium Only",
      value: fee > 0 ? `${formatCredits(fee)} + Premium` : "Premium",
      color: "text-purple-300",
      tone: "border-purple-400/25 bg-purple-400/10 text-purple-300",
    };
  }

  if (entryType === "credits") {
    return {
      pill: `${formatCredits(fee)} Entry`,
      value: formatCredits(fee),
      color: "text-orange",
      tone: "border-orange/25 bg-orange/10 text-orange",
    };
  }

  if (entryType === "invitational") {
    return {
      pill: "Invitational",
      value: "Invite Only",
      color: "text-yellow-300",
      tone: "border-yellow-400/25 bg-yellow-400/10 text-yellow-300",
    };
  }

  return {
    pill: "Free Entry",
    value: "Free",
    color: "text-green",
    tone: "border-green/25 bg-green/10 text-green",
  };
};
const isFreeTournament = (tournament) => {
  const entryType = tournament?.entry_type || (tournament?.is_premium_only ? "premium" : (Number(tournament?.entry_fee || 0) > 0 ? "credits" : "free"));
  return ["free", "invitational"].includes(entryType) || Number(tournament?.entry_fee || 0) <= 0;
};
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

export default function Tournaments() {
  const [filter, setFilter] = useState("All");
  const [user, setUser] = useState(null);
  const [tournaments, setTournaments] = useState([]);
  const [matchesByTournament, setMatchesByTournament] = useState({});
  const [participantsByTournament, setParticipantsByTournament] = useState({});
  const [selectedTournamentId, setSelectedTournamentId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [joiningId, setJoiningId] = useState(null);
  const [leavingId, setLeavingId] = useState(null);
  const [activeFeaturedIndex, setActiveFeaturedIndex] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [joinedTournamentIds, setJoinedTournamentIds] = useState(new Set());
  const [userTeams, setUserTeams] = useState([]);
  const [selectedTeamByTournament, setSelectedTeamByTournament] = useState({});
  const [paymentModeByTournament, setPaymentModeByTournament] = useState({});
  const [teamCreator, setTeamCreator] = useState({ open: false, tournamentId: null, rosterSize: 4 });
  const selectedTournamentIdRef = useRef(null);
  const refreshInFlightRef = useRef(false);

  useEffect(() => {
    loadTournaments();

    const refreshLiveTournaments = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      loadTournaments({ silent: true });
    };
    const interval = window.setInterval(refreshLiveTournaments, 30000);
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
      (team.team_type === "tournament" || team.team_type === "general")
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
        payment_mode: isFreeTournament(tournament) ? "own" : (paymentModeByTournament[tournament.id] || "own"),
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
      toast({ title: "Tournament joined", description: `You are registered for ${tournament.name}.` });
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
    selectedTournamentIdRef.current = tournamentId;
    setSelectedTournamentId(tournamentId);
    const featuredIndex = carouselTournaments.findIndex((tournament) => tournament.id === tournamentId);
    if (featuredIndex >= 0) setActiveFeaturedIndex(featuredIndex);
    if (!matchesByTournament[tournamentId]) {
      loadMatches(tournamentId);
    }
    window.setTimeout(() => {
      document.getElementById("tournament-bracket-preview")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  };

  const officialTournaments = useMemo(() => tournaments.filter((tournament) => !isStreamerTournament(tournament)), [tournaments]);
  const streamerTournaments = useMemo(() => tournaments.filter(isStreamerTournament), [tournaments]);
  const filteredTournaments = useMemo(() => (
    officialTournaments.filter((tournament) => filter === "All" || statusLabels[tournament.status] === filter || tournament.status === filter)
  ), [officialTournaments, filter]);
  const carouselTournaments = useMemo(() => {
    const activeRows = officialTournaments
      .filter((tournament) => !["completed", "cancelled"].includes(tournament.status))
      .sort((a, b) => new Date(a.start_date || 0) - new Date(b.start_date || 0));
    return activeRows.length > 0 ? activeRows : officialTournaments;
  }, [officialTournaments]);

  useEffect(() => {
    if (activeFeaturedIndex >= carouselTournaments.length) setActiveFeaturedIndex(0);
  }, [activeFeaturedIndex, carouselTournaments.length]);

  useEffect(() => {
    if (!selectedTournamentId || carouselTournaments.length === 0) return;
    const selectedIndex = carouselTournaments.findIndex((tournament) => tournament.id === selectedTournamentId);
    if (selectedIndex >= 0 && selectedIndex !== activeFeaturedIndex) setActiveFeaturedIndex(selectedIndex);
  }, [activeFeaturedIndex, carouselTournaments, selectedTournamentId]);

  const liveTournaments = officialTournaments.filter((tournament) => ["live", "in_progress"].includes(tournament.status));
  const featuredTournaments = officialTournaments.filter((tournament) => tournament.is_premium_only || tournament.prize_pool >= 1000).slice(0, 2);
  const selectedTournament = officialTournaments.find((tournament) => tournament.id === selectedTournamentId);
  const selectedMatches = matchesByTournament[selectedTournamentId] || [];
  const selectedParticipants = participantsByTournament[selectedTournamentId] || [];
  const featuredTournament = carouselTournaments[activeFeaturedIndex]
    || selectedTournament
    || featuredTournaments[0]
    || officialTournaments[0];
  const openTournamentTeamCreator = (tournament = selectedTournament || featuredTournament) => {
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
    }
  };
  const isStaff = staffRoles.has(user?.role);
  const isAdmin = adminRoles.has(user?.role);
  const canPostStreamerTournament = isStreamerUser(user);
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
  const totalPrizePool = officialTournaments.reduce((sum, tournament) => sum + Number(tournament.prize_pool || 0), 0);
  const totalTeams = officialTournaments.reduce((sum, tournament) => sum + Number(tournament.registered_teams || 0), 0);
  const totalPlayers = officialTournaments.reduce((sum, tournament) => (
    sum + (Number(tournament.registered_teams || 0) * rosterSize(tournament.team_size))
  ), 0);
  const recentChampions = officialTournaments
    .filter((tournament) => tournament.winner_name || tournament.status === "completed")
    .sort((a, b) => new Date(b.completed_date || b.updated_date || b.start_date || 0) - new Date(a.completed_date || a.updated_date || a.start_date || 0))
    .slice(0, 4);
  const browseFeaturedTournament = (index) => {
    if (carouselTournaments.length === 0) return;
    const nextIndex = (index + carouselTournaments.length) % carouselTournaments.length;
    const nextTournament = carouselTournaments[nextIndex];
    setActiveFeaturedIndex(nextIndex);
    if (nextTournament?.id) handleSelectTournament(nextTournament.id);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-cyan/20 border-t-cyan rounded-full animate-spin mx-auto mb-4" />
          <p className="text-vapor">Loading tournaments...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-8">
      <div className="max-w-[1600px] mx-auto px-4 lg:px-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-black tracking-tight">Tournaments</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link to="/teams" className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-secondary px-4 py-2.5 text-xs font-black uppercase tracking-wider text-vapor transition-colors hover:border-cyan/25 hover:text-cyan">
              <Users className="h-3.5 w-3.5" /> My Teams
            </Link>
            <button type="button" onClick={() => openTournamentTeamCreator()} className="inline-flex items-center gap-2 rounded-lg bg-cyan px-4 py-2.5 text-xs font-black uppercase tracking-wider text-background transition-colors hover:bg-cyan/90">
              <Plus className="h-3.5 w-3.5" /> Create Tournament Team
            </button>
          </div>
        </div>

        <ActivisionIdNotice user={user} className="mb-5" />

        <div className="flex items-center gap-2 mb-5 overflow-x-auto">
          {["All", "Open", "Registration", "In Progress", "Completed"].map((item) => (
            <button
              key={item}
              onClick={() => setFilter(item)}
              className={`px-4 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                filter === item ? "bg-cyan text-background" : "bg-secondary text-vapor hover:text-foreground"
              }`}
            >
              {item}
            </button>
          ))}
        </div>

        <SeasonOverview
          totalPrizePool={totalPrizePool}
          tournamentCount={officialTournaments.length}
          totalTeams={totalTeams}
          totalPlayers={totalPlayers}
        />

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
              className="glass rounded-xl border border-red-500/20 p-6 mb-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-60 h-60 bg-red-500/5 rounded-full blur-[80px]" />
              <div className="relative flex items-center gap-4">
                <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
                <div>
                  <p className="font-bold">{tournament.name}</p>
                  <p className="text-sm text-vapor">
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
                <Link to={`/tournament-match/${liveMatch.id}`} className="inline-flex items-center gap-2 px-5 py-2 bg-red-500/10 text-red-400 border border-red-500/20 text-xs font-bold rounded-lg hover:bg-red-500/20 transition-all uppercase tracking-wider">
                  {activeUserMatch ? "Open My Match" : "Open Live Match"} <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              ) : (
                <button onClick={() => handleSelectTournament(tournament.id)} className="inline-flex items-center gap-2 px-5 py-2 bg-red-500/10 text-red-400 border border-red-500/20 text-xs font-bold rounded-lg hover:bg-red-500/20 transition-all uppercase tracking-wider">
                  View Bracket <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </motion.div>
          );
        })}

        {featuredTournament && (
          <div className="mb-6">
            <FeaturedTournamentPanel
              tournament={featuredTournament}
              onSelect={handleSelectTournament}
              tournaments={carouselTournaments}
              activeIndex={activeFeaturedIndex}
              onBrowse={browseFeaturedTournament}
              canJoin={canJoinTournament(featuredTournament)}
              joined={joinedTournamentIds.has(featuredTournament.id)}
              joining={joiningId === featuredTournament.id}
              compatibleTeams={compatibleTeamsFor(featuredTournament)}
              selectedTeamId={selectedTeamByTournament[featuredTournament.id] || ""}
              selectedTeam={selectedTeamFor(featuredTournament)}
              paymentMode={paymentModeByTournament[featuredTournament.id] || "own"}
              isTeamReady={isTournamentTeamReady(selectedTeamFor(featuredTournament), featuredTournament)}
              isFree={isFreeTournament(featuredTournament)}
              rosterSize={rosterSize(featuredTournament.team_size)}
              onTeamChange={(teamId) => setSelectedTeamByTournament((current) => ({ ...current, [featuredTournament.id]: teamId }))}
              onPaymentChange={(mode) => setPaymentModeByTournament((current) => ({ ...current, [featuredTournament.id]: mode }))}
              onJoin={() => handleJoinTournament(featuredTournament)}
              onCreateTeam={() => openTournamentTeamCreator(featuredTournament)}
              now={now}
            />
          </div>
        )}

        <div className="grid lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-sm font-black uppercase tracking-wider">Tournaments</h2>
              <span className="text-xs text-vapor">{filteredTournaments.length} showing</span>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredTournaments.length === 0 ? (
                <div className="glass rounded-xl border border-white/5 px-5 py-10 text-center md:col-span-2 xl:col-span-3">
                  <Trophy className="w-10 h-10 text-vapor/30 mx-auto mb-3" />
                  <p className="text-sm text-vapor">No tournaments found.</p>
                </div>
              ) : filteredTournaments.map((tournament) => (
                <TournamentCard
                  key={tournament.id}
                  tournament={tournament}
                  selected={selectedTournamentId === tournament.id}
                  joined={joinedTournamentIds.has(tournament.id)}
                  onSelect={handleSelectTournament}
                  now={now}
                />
              ))}
            </div>
            <div className="mt-6">
              <StreamerTournamentPanel tournaments={streamerTournaments} canPost={canPostStreamerTournament} />
            </div>
          </div>

          <div className="lg:col-span-5 space-y-6">
            <div id="tournament-bracket-preview" className="scroll-mt-24 space-y-5">
              <div className="glass flex items-center justify-between gap-3 rounded-xl border border-white/5 px-5 py-4">
                <div>
                  <h2 className="text-lg font-bold">Live Bracket Preview</h2>
                  <p className="text-xs text-vapor">
                    {`${selectedParticipants.length} participant${selectedParticipants.length === 1 ? "" : "s"} registered. ${
                      selectedTournament?.invite_only || selectedTournament?.entry_type === "invitational"
                        ? "Invite-only registration."
                        : "Bracket is public."
                    }`}
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
                        onChange={(event) => setSelectedTeamByTournament((current) => ({ ...current, [selectedTournament.id]: event.target.value }))}
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
                      {!isFreeTournament(selectedTournament) && (
                        <select
                          value={paymentModeByTournament[selectedTournament.id] || "own"}
                          onChange={(event) => setPaymentModeByTournament((current) => ({ ...current, [selectedTournament.id]: event.target.value }))}
                          className="px-3 py-2 bg-secondary text-vapor text-xs rounded-lg border border-white/5 focus:border-cyan/30 focus:outline-none"
                        >
                          <option value="own">Pay my own entry only</option>
                          <option value="full_team">Pay full team entry</option>
                        </select>
                      )}
                      <button
                        onClick={() => handleJoinTournament(selectedTournament)}
                        disabled={joiningId === selectedTournament.id}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-green text-background text-xs font-bold rounded-lg disabled:opacity-50 uppercase tracking-wider"
                      >
                        {joiningId === selectedTournament.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Users className="w-3.5 h-3.5" />}
                        Join
                      </button>
                    </div>
                  )}
                </div>
              </div>
              {isStaff && selectedParticipants.length > 0 && (
                <div className="glass rounded-xl border border-white/5 bg-secondary/20 px-5 py-3">
                  <p className="text-[10px] text-vapor uppercase tracking-wider mb-2">Participants</p>
                  <div className="flex flex-wrap gap-2">
                    {selectedParticipants.map((participant) => (
                      <span key={participant.id} className="px-2 py-1 rounded bg-white/[0.03] border border-white/5 text-xs text-vapor">
                        #{participant.seed || "-"} {participant.team_name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <div>
                {!selectedTournamentId ? (
                  <p className="glass rounded-xl border border-white/5 px-5 py-8 text-center text-sm text-vapor">No tournament selected.</p>
                ) : selectedMatches.length === 0 ? (
                  <div className="glass rounded-xl border border-white/5 px-5 py-8 text-center">
                    <Users className="w-10 h-10 text-vapor/30 mx-auto mb-3" />
                    <p className="text-sm text-vapor">No bracket matches generated yet.</p>
                  </div>
                ) : (
                  <TournamentBracket
                    matches={selectedMatches}
                    currentId={selectedUserMatch?.id}
                    tournament={selectedTournament}
                    now={now}
                    showHeader={false}
                  />
                )}
              </div>
            </div>
            <RecentChampionsPanel champions={recentChampions} />
            {isAdmin && <CreateTournamentPanel />}
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
      </div>
    </div>
  );
}

function SeasonOverview({ totalPrizePool, tournamentCount, totalTeams, totalPlayers }) {
  const stats = [
    { label: "Total Prize Pool", value: formatMoney(totalPrizePool), icon: DollarSign, color: "text-green" },
    { label: "Tournaments", value: tournamentCount, icon: Trophy, color: "text-purple-300" },
    { label: "Teams", value: totalTeams, icon: Users, color: "text-cyan" },
    { label: "Players", value: totalPlayers, icon: Award, color: "text-yellow-400" },
  ];

  return (
    <section className="glass mb-6 overflow-hidden rounded-xl border border-cyan/20">
      <div className="relative grid gap-6 p-6 lg:grid-cols-[1fr_auto] lg:items-center">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(110deg,rgba(20,216,255,0.08),transparent_35%,rgba(255,130,0,0.08))]" />
        <div className="relative flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-5">
          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-cyan">Current Season</p>
            <h2 className="text-3xl font-black tracking-tight">Season 1</h2>
            <p className="mt-1 text-sm text-vapor">Compete. Climb. Conquer.</p>
          </div>
          <Link to="/leaderboards" className="inline-flex w-fit items-center gap-2 rounded-lg border border-cyan/20 bg-cyan/10 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-cyan hover:bg-cyan/20">
            View Leaderboard <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="relative grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {stats.map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="min-w-[150px] rounded-lg border border-white/5 bg-background/35 px-4 py-3">
              <div className="mb-2 flex items-center gap-2">
                <Icon className={`h-4 w-4 ${color}`} />
                <span className="text-[10px] font-black uppercase tracking-wider text-vapor">{label}</span>
              </div>
              <p className={`font-mono text-xl font-black ${color}`}>{value}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FeaturedTournamentPanel({
  tournament,
  onSelect,
  tournaments = [],
  activeIndex = 0,
  onBrowse,
  canJoin,
  joined,
  joining,
  compatibleTeams,
  selectedTeamId,
  selectedTeam,
  paymentMode,
  isTeamReady,
  isFree,
  rosterSize: requiredRosterSize,
  onTeamChange,
  onPaymentChange,
  onJoin,
  onCreateTeam,
  now,
}) {
  const imageUrl = tournamentImageUrl(tournament);
  const hasMultiple = tournaments.length > 1;
  const countdown = timeUntil(tournament.start_date, now);
  const entryInfo = tournamentEntryInfo(tournament);
  return (
    <section className="relative min-h-[520px] overflow-hidden rounded-3xl border border-cyan/20 bg-[#020408] shadow-[0_18px_38px_-26px_rgba(0,0,0,0.78)]">
      {imageUrl ? (
        <div
          className="tournament-hero-art"
          style={{ "--tournament-hero-image": `url(${JSON.stringify(imageUrl)})` }}
        >
          <img src={imageUrl} alt="" />
        </div>
      ) : (
        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(20,216,255,0.14),transparent_42%,rgba(255,130,0,0.12))]" />
      )}
      <div className="absolute inset-0 bg-[linear-gradient(90deg,#020408_0%,rgba(2,4,8,0.98)_32%,rgba(2,4,8,0.64)_55%,rgba(2,4,8,0.18)_100%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(2,4,8,0.04),rgba(2,4,8,0.22)_72%,rgba(2,4,8,0.74))]" />

      <div className="relative flex min-h-[520px] flex-col justify-between p-5 sm:p-8">
        <div className="max-w-3xl">
          <div className="mb-6 flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-2 rounded-lg border border-yellow-400/25 bg-yellow-400/10 px-4 py-2 text-xs font-black uppercase tracking-wider text-yellow-300">
              <Star className="h-4 w-4 fill-current" />
              Featured Tournament
            </span>
            <span className={`rounded-lg border px-3 py-2 text-[10px] font-black uppercase tracking-wider ${statusTone(tournament.status)}`}>
              {statusLabels[tournament.status] || tournament.status}
            </span>
            <span className={`rounded-lg border px-3 py-2 text-[10px] font-black uppercase tracking-wider ${entryInfo.tone}`}>
              {entryInfo.pill}
            </span>
            {joined && (
              <span className="rounded-lg border border-green/20 bg-green/10 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-green">
                Joined
              </span>
            )}
          </div>

          <h2 className="max-w-2xl text-5xl font-black uppercase leading-none tracking-tight sm:text-6xl lg:text-7xl">
            {tournament.name || "Tournament"}
          </h2>
          <p className="mt-5 text-lg font-semibold text-vapor">Only the best. Nothing less.</p>

          <div className="mt-8 grid max-w-4xl gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <FeatureStat icon={Trophy} label="Prize Pool" value={formatMoney(tournament.prize_pool)} color="text-green" />
            <FeatureStat icon={Users} label="Teams" value={`${tournament.registered_teams || 0} / ${tournament.max_teams || 0}`} color="text-cyan" />
            <FeatureStat icon={Swords} label="Format" value={tournament.team_size || "TBD"} color="text-vapor" />
            <FeatureStat icon={DollarSign} label="Entry" value={entryInfo.value} color={entryInfo.color} />
          </div>

          <div className="mt-8 grid max-w-3xl gap-4 rounded-xl border border-white/10 bg-background/90 p-4 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-vapor">Starts In</p>
              <p className="mt-1 font-mono text-3xl font-black text-white">{countdown}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-[minmax(170px,1fr)_auto] sm:items-center">
              {canJoin ? (
                <>
                  <div className="min-w-0 space-y-2">
                    <select
                      value={selectedTeamId}
                      onChange={(event) => onTeamChange(event.target.value)}
                      className="w-full min-w-0 px-3 py-3 bg-secondary text-vapor text-xs rounded-lg border border-white/10 focus:border-cyan/30 focus:outline-none"
                    >
                      <option value="">Select team</option>
                      {compatibleTeams.map((team) => (
                        <option key={team.id} value={team.id}>
                          {team.name} ({team.members.length}/{requiredRosterSize})
                        </option>
                      ))}
                    </select>
                    {compatibleTeams.length === 0 && (
                      <button type="button" onClick={onCreateTeam} className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-cyan/20 bg-cyan/10 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-cyan hover:bg-cyan/20">
                        <Plus className="h-3 w-3" /> Create Tournament Team
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={onJoin}
                    disabled={joining || !selectedTeamId || !isTeamReady}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-cyan px-6 py-3 text-sm font-black uppercase tracking-wider text-background disabled:opacity-50"
                  >
                    {joining ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
                    Join Now <ArrowRight className="h-4 w-4" />
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => onSelect(tournament.id)}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-cyan/20 bg-cyan/10 px-6 py-3 text-sm font-black uppercase tracking-wider text-cyan hover:bg-cyan/20"
                >
                  View Bracket <ArrowRight className="h-4 w-4" />
                </button>
              )}
            </div>
            {!isFree && canJoin && (
              <select
                value={paymentMode}
                onChange={(event) => onPaymentChange(event.target.value)}
                className="px-3 py-2 bg-secondary text-vapor text-xs rounded-lg border border-white/10 focus:border-cyan/30 focus:outline-none md:col-span-2"
              >
                <option value="own">Pay my own entry only</option>
                <option value="full_team">Pay full team entry</option>
              </select>
            )}
            {selectedTeam && !isTeamReady && (
              <p className="text-[10px] text-orange md:col-span-2">
                Team needs exactly {requiredRosterSize} active players.
              </p>
            )}
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="inline-flex items-center gap-2 text-sm font-semibold text-green">
            <span className="h-3 w-3 rounded-full bg-green shadow-[0_0_8px_rgba(0,255,128,0.28)]" />
            {statusLabels[tournament.status] || tournament.status}
          </div>

          {hasMultiple && (
            <div className="flex items-center gap-3 self-end rounded-xl border border-white/10 bg-background/90 p-2">
              <button
                type="button"
                onClick={() => onBrowse(activeIndex - 1)}
                className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary text-vapor transition-colors hover:text-white"
                aria-label="Previous tournament"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <div className="flex items-center gap-2 px-1">
                {tournaments.map((item, index) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onBrowse(index)}
                    className={`h-2.5 rounded-full transition-all ${index === activeIndex ? "w-6 bg-cyan" : "w-2.5 bg-white/30 hover:bg-white/60"}`}
                    aria-label={`Show ${item.name}`}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={() => onBrowse(activeIndex + 1)}
                className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary text-vapor transition-colors hover:text-white"
                aria-label="Next tournament"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function FeatureStat({ icon: Icon, label, value, color }) {
  return (
    <div className="rounded-lg border border-white/5 bg-background/25 p-3">
      <div className="mb-2 flex items-center gap-2">
        <Icon className={`h-4 w-4 ${color}`} />
        <span className="text-[9px] font-black uppercase tracking-wider text-vapor">{label}</span>
      </div>
      <p className={`font-mono text-sm font-black ${color}`}>{value}</p>
    </div>
  );
}

function TournamentCard({ tournament, selected, joined, onSelect, now }) {
  const imageUrl = tournamentImageUrl(tournament);
  return (
    <motion.button
      type="button"
      whileHover={{ y: -3, transition: { duration: 0.1, ease: "easeOut" } }}
      onClick={() => onSelect(tournament.id)}
      className={`overflow-hidden rounded-xl border text-left transition-colors ${
        selected ? "border-cyan/25 bg-cyan/5" : "glass border-white/5 hover:border-cyan/20"
      }`}
    >
      <div className="relative h-28 bg-background">
        {imageUrl ? (
          <img src={imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(20,216,255,0.10),transparent_55%,rgba(255,130,0,0.08))]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background/95 via-background/35 to-transparent" />
        <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-3">
          <span className={`rounded border px-2 py-1 text-[10px] font-black uppercase ${statusTone(tournament.status)}`}>
            {statusLabels[tournament.status] || tournament.status}
          </span>
          {joined && <span className="text-[10px] font-black uppercase tracking-wider text-green">Joined</span>}
        </div>
      </div>
      <div className="p-4">
        <h3 className="truncate text-base font-black">{tournament.name}</h3>
        <p className="mt-1 truncate text-xs text-vapor">{compactModeLabel(tournament)}</p>
        <div className="mt-5 grid grid-cols-3 gap-2 text-[10px]">
          <div>
            <p className="font-mono text-sm font-black text-green">{formatMoney(tournament.prize_pool)}</p>
            <p className="mt-1 uppercase tracking-wider text-vapor">Prize Pool</p>
          </div>
          <div>
            <p className="font-mono text-sm font-black text-white">{tournament.registered_teams || 0} / {tournament.max_teams || 0}</p>
            <p className="mt-1 uppercase tracking-wider text-vapor">Teams</p>
          </div>
          <div>
            <p className="font-mono text-sm font-black text-cyan">{tournament.team_size || "-"}</p>
            <p className="mt-1 uppercase tracking-wider text-vapor">Format</p>
          </div>
        </div>
        <div className="mt-5 flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-1 text-xs text-vapor">
            <Clock className="h-3.5 w-3.5" /> {timeUntil(tournament.start_date, now)}
          </span>
          <span className="rounded border border-cyan/20 bg-cyan/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-cyan">
            View
          </span>
        </div>
      </div>
    </motion.button>
  );
}

function StreamerTournamentPanel({ tournaments, canPost }) {
  const visible = [...tournaments]
    .sort((a, b) => new Date(b.created_date || b.start_date || 0) - new Date(a.created_date || a.start_date || 0))
    .slice(0, 3);

  return (
    <section className="glass rounded-xl border border-blue-400/15 p-5">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-md border border-blue-400/25 bg-blue-500/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-blue-300">
            <Monitor className="h-3.5 w-3.5" /> Streamer Badge
          </div>
          <h2 className="text-sm font-black uppercase tracking-wider">Streamer Tournaments</h2>
          <p className="mt-1 text-xs text-vapor">Visible to everyone. Streamer accounts can post their own lobby.</p>
        </div>
        <Link
          to="/streamer-tournaments"
          className="inline-flex w-fit items-center gap-2 rounded-lg border border-blue-400/20 bg-blue-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-blue-300 hover:bg-blue-500/20"
        >
          {canPost ? "Post Lobby" : "Browse Lobbies"} <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {!canPost && (
        <div className="mb-4 rounded-lg border border-white/5 bg-background/25 px-4 py-3 text-xs text-vapor">
          Streamer badge required to post. Everyone can open streamer lobbies and view the chat.
        </div>
      )}

      {visible.length === 0 ? (
        <div className="rounded-lg border border-white/5 bg-background/25 px-5 py-8 text-center">
          <Radio className="mx-auto mb-3 h-9 w-9 text-vapor/30" />
          <p className="text-sm text-vapor">No streamer lobbies posted yet.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {visible.map((tournament) => (
            <Link
              key={tournament.id}
              to={`/streamer-tournament/${tournament.id}`}
              className="grid gap-3 rounded-lg border border-white/5 bg-background/25 p-4 transition-colors hover:border-blue-400/25 hover:bg-blue-500/[0.03] sm:grid-cols-[1fr_auto] sm:items-center"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-black">{tournament.name}</p>
                <p className="mt-1 truncate text-xs text-vapor">
                  {tournament.host_name || tournament.created_by_name || "Streamer"} / {compactModeLabel(tournament)}
                </p>
              </div>
              <span className="inline-flex w-fit items-center gap-2 rounded border border-cyan/20 bg-cyan/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-cyan">
                Open Lobby <ArrowRight className="h-3 w-3" />
              </span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

function RecentChampionsPanel({ champions }) {
  return (
    <section className="glass rounded-xl border border-white/5 p-5 lg:col-span-8">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-black uppercase tracking-wider">Recent Champions</h2>
        <span className="text-[10px] font-black uppercase tracking-wider text-cyan">View All Champions</span>
      </div>
      {champions.length === 0 ? (
        <div className="rounded-lg border border-white/5 bg-background/25 px-5 py-8 text-center">
          <Medal className="mx-auto mb-3 h-10 w-10 text-vapor/30" />
          <p className="text-sm text-vapor">No champions crowned yet.</p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
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

function CreateTournamentPanel() {
  return (
    <section className="glass relative overflow-hidden rounded-xl border border-white/5 p-5 lg:col-span-4">
      <div className="pointer-events-none absolute right-4 top-4 opacity-10">
        <Trophy className="h-24 w-24" />
      </div>
      <div className="relative">
        <h2 className="text-sm font-black uppercase tracking-wider">Create Tournament</h2>
        <p className="mt-2 max-w-sm text-sm text-vapor">
          Organize your own tournament and bring the competition to Topfragg.gg.
        </p>
        <Link
          to="/admin"
          className="mt-5 inline-flex items-center gap-2 rounded-lg bg-cyan px-4 py-2 text-xs font-black uppercase tracking-wider text-background"
        >
          Create Tournament <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </section>
  );
}
