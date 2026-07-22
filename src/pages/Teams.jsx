import React, { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  Award,
  ArrowLeft,
  ArrowRight,
  Camera,
  CheckCircle,
  Clock,
  Crown,
  Gamepad2,
  Globe2,
  Lock,
  LogOut,
  Medal,
  Plus,
  Radio,
  Save,
  Search,
  Shield,
  Swords,
  Sparkles,
  Target,
  Trash2,
  TrendingUp,
  Trophy,
  UserMinus,
  UserPlus,
  Users,
  X,
  XCircle,
  Zap,
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/use-toast";
import CreateTeamModal from "@/components/teams/CreateTeamModal";
import ActivisionIdLabel from "@/components/competition/ActivisionIdLabel";
import UserBadges from "@/components/ui/UserBadges";
import { normalizeTeamRosterSize, teamRosterFormat } from "@/lib/teamFormats";

const teamInitials = (team) => {
  const words = String(team?.name || "").trim().split(/\s+/).filter(Boolean);
  if (words.length > 1) return words.slice(0, 2).map((word) => word.charAt(0)).join("").toUpperCase();
  return String(words[0] || team?.tag || "--").slice(0, 2).toUpperCase();
};
const formatMoney = (value) => `$${Number(value || 0).toLocaleString()}`;
const playerEarnings = (user) => Math.max(
  Number(user?.lifetime_earnings || 0),
  Number(user?.total_wager_earnings || 0),
  Number(user?.total_earnings || 0),
  Number(user?.earnings || 0),
);
const formatDate = (value) => value ? new Date(value).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }) : "TBD";
const formatDateTime = (value) => value ? new Date(value).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "TBD";
const teamTypeLabel = (team) => ({ "8s": "8s", wager: "Wager", tournament: "Tournament", general: "General" }[team?.team_type || "8s"] || "8s");
const titleCase = (value) => String(value || "pending").replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const teamBannerMaxBytes = 1.5 * 1024 * 1024;
const statNumber = (value) => {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
};
const emptyTrophyCounts = () => ({ gold: 0, silver: 0, bronze: 0, invitational: 0, premium: 0 });
const rosterTrophySlots = [
  { key: "gold", label: "Gold", icon: Trophy, tone: "text-yellow-400" },
  { key: "silver", label: "Silver", icon: Medal, tone: "text-gray-300" },
  { key: "bronze", label: "Bronze", icon: Award, tone: "text-amber-600" },
  { key: "invitational", label: "Invitational", icon: Swords, tone: "text-cyan" },
  { key: "premium", label: "Premium", icon: Crown, tone: "text-purple-300" },
];
const countInventoryTrophies = (items = []) => {
  const counts = emptyTrophyCounts();
  (items || []).forEach((item) => {
    const text = [item.item_name, item.unlock_key, item.item_rarity, item.purchase_method]
      .filter(Boolean)
      .join(" ")
      .trim()
      .toLowerCase();
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
};
const trophyCountsFor = (user, inventoryRows = []) => {
  const inventory = countInventoryTrophies(inventoryRows);
  return {
    gold: statNumber(user?.gold_count) + inventory.gold,
    silver: statNumber(user?.silver_count) + inventory.silver,
    bronze: statNumber(user?.bronze_count) + inventory.bronze,
    invitational: statNumber(user?.invitational_count || user?.invitation_count || user?.champion_count) + inventory.invitational,
    premium: statNumber(user?.premium_count) + inventory.premium,
  };
};
const fileToDataUrl = (file) => new Promise((resolve, reject) => {
  if (!file) return resolve("");
  if (!file.type.startsWith("image/")) return reject(new Error("Choose an image file."));
  if (file.size > teamBannerMaxBytes) return reject(new Error("Image must be 1.5MB or smaller."));
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ""));
  reader.onerror = () => reject(new Error("Could not read image file."));
  reader.readAsDataURL(file);
});

const detailTabs = [
  { id: "overview", label: "Overview", icon: Target },
  { id: "roster", label: "Roster", icon: Users },
  { id: "matches", label: "Matches", icon: Swords },
  { id: "tournaments", label: "Tournaments", icon: Trophy },
  { id: "settings", label: "Settings", icon: Shield },
];

export default function Teams() {
  const [searchParams] = useSearchParams();
  const linkedTeamId = searchParams.get("team");
  const [view, setView] = useState("my_teams");
  const [detailTab, setDetailTab] = useState("overview");
  const [currentUser, setCurrentUser] = useState(null);
  const [teams, setTeams] = useState([]);
  const [membersByTeam, setMembersByTeam] = useState({});
  const [memberUsersById, setMemberUsersById] = useState({});
  const [pendingInvites, setPendingInvites] = useState([]);
  const [wagers, setWagers] = useState([]);
  const [tournaments, setTournaments] = useState([]);
  const [tournamentParticipants, setTournamentParticipants] = useState([]);
  const [tournamentMatches, setTournamentMatches] = useState([]);
  const [selectedTeamId, setSelectedTeamId] = useState(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [busyAction, setBusyAction] = useState("");
  const [inviteIdentifier, setInviteIdentifier] = useState("");
  const [teamBannerDraft, setTeamBannerDraft] = useState("");
  const [teamNameDraft, setTeamNameDraft] = useState("");

  useEffect(() => {
    loadTeams();
  }, []);

  const loadTeams = async () => {
    try {
      setLoading(true);
      const userData = await base44.auth.me().catch(() => null);
      setCurrentUser(userData);
      if (!userData?.id) {
        setPendingInvites([]);
        setTeams([]);
        setMembersByTeam({});
        setMemberUsersById({});
        return;
      }

      const [teamRows, invites, memberships, wagerRows, tournamentRows, participantRows, matchRows] = await Promise.all([
        base44.entities.Team.filter({}, "ranking", 100).catch(() => []),
        base44.entities.TeamInvite.filter({ invited_user_id: userData.id, status: "pending" }, "-created_date", 50).catch(() => []),
        base44.entities.TeamMember.filter({ user_id: userData.id }, "-joined_date", 100).catch(() => []),
        base44.entities.Wager.filter({}, "-created_date", 250).catch(() => []),
        base44.entities.Tournament.filter({}, "-start_date", 150).catch(() => []),
        base44.entities.TournamentParticipant.filter({}, "-registered_date", 300).catch(() => []),
        base44.entities.TournamentMatch.filter({}, "-assigned_date", 300).catch(() => []),
      ]);

      setPendingInvites(invites || []);
      setWagers(wagerRows || []);
      setTournaments(tournamentRows || []);
      setTournamentParticipants(participantRows || []);
      setTournamentMatches(matchRows || []);

      const activeMembershipTeamIds = new Set((memberships || [])
        .filter((membership) => membership.is_active !== false)
        .map((membership) => String(membership.team_id)));
      const myTeams = (teamRows || []).filter((team) => (
        team.is_active !== false
        && (String(team.captain_id || "") === String(userData.id) || activeMembershipTeamIds.has(String(team.id)))
      ));
      const linkedTeam = (teamRows || []).find((team) => team.is_active !== false && String(team.id) === String(linkedTeamId || ""));
      const visibleTeams = linkedTeam && !myTeams.some((team) => String(team.id) === String(linkedTeam.id))
        ? [...myTeams, linkedTeam]
        : myTeams;
      setTeams(visibleTeams);
      setSelectedTeamId((current) => linkedTeam?.id || (visibleTeams.some((team) => team.id === current) ? current : visibleTeams?.[0]?.id || null));
      if (linkedTeam) {
        setDetailTab("overview");
        setView("details");
      }

      const memberPairs = await Promise.all(visibleTeams.map(async (team) => {
        const members = await base44.entities.TeamMember.filter({ team_id: team.id }, "-joined_date", 20).catch(() => []);
        return [team.id, (members || []).filter((member) => member.is_active !== false)];
      }));
      const nextMembersByTeam = Object.fromEntries(memberPairs);
      setMembersByTeam(nextMembersByTeam);

      const userIds = [...new Set(memberPairs.flatMap(([, members]) => members.map((member) => member.user_id).filter(Boolean)))];
      const userPairs = await Promise.all(userIds.map(async (userId) => {
        const user = await base44.entities.User.get(userId).catch(() => null);
        return [userId, user ? { ...user, team_trophies: trophyCountsFor(user) } : null];
      }));
      setMemberUsersById(Object.fromEntries(userPairs));
    } finally {
      setLoading(false);
    }
  };

  const filteredTeams = useMemo(() => (
    teams.filter((team) => `${team.name} ${team.tag} ${team.region || ""} ${teamTypeLabel(team)}`.toLowerCase().includes(search.toLowerCase()))
  ), [teams, search]);

  const selectedTeam = teams.find((team) => team.id === selectedTeamId) || filteredTeams[0] || teams[0] || null;
  const selectedMembers = selectedTeam ? (membersByTeam[selectedTeam.id] || []) : [];
  const selectedMembership = selectedMembers.find((member) => member.user_id === currentUser?.id);
  const isSelectedCaptain = Boolean(selectedTeam && selectedTeam.captain_id === currentUser?.id);
  const selectedMemberIdsKey = selectedMembers.map((member) => member.user_id).filter(Boolean).sort().join("|");

  useEffect(() => {
    if (view !== "details" || !selectedMemberIdsKey) return undefined;
    let cancelled = false;
    const userIds = selectedMemberIdsKey.split("|");

    Promise.all(userIds.map(async (userId) => [
      userId,
      await base44.entities.UserInventory.filterFresh({ user_id: userId }, "-acquired_date", 100).catch(() => []),
    ])).then((inventoryPairs) => {
      if (cancelled) return;
      setMemberUsersById((current) => {
        const next = { ...current };
        inventoryPairs.forEach(([userId, inventory]) => {
          const user = current[userId];
          if (user) next[userId] = { ...user, team_trophies: trophyCountsFor(user, inventory) };
        });
        return next;
      });
    });

    return () => { cancelled = true; };
  }, [selectedMemberIdsKey, view]);

  const tournamentById = useMemo(() => Object.fromEntries(tournaments.map((tournament) => [String(tournament.id), tournament])), [tournaments]);
  const teamSummaries = useMemo(() => teams.map((team) => {
    const teamId = String(team.id);
    const members = membersByTeam[team.id] || [];
    const requiredPlayers = normalizeTeamRosterSize(team.roster_size);
    const wins = Number(team.total_wins || 0);
    const losses = Number(team.total_losses || 0);
    const matchCandidates = [];

    tournamentMatches.forEach((match) => {
      const isTeamA = String(match.team_a_id || "") === teamId;
      const isTeamB = String(match.team_b_id || "") === teamId;
      if ((!isTeamA && !isTeamB) || match.completed || ["completed", "cancelled"].includes(match.status)) return;
      const tournament = tournamentById[String(match.tournament_id)] || null;
      matchCandidates.push({
        id: match.id,
        source: "Tournament",
        title: tournament?.name || tournament?.title || "Tournament match",
        opponent: isTeamA ? (match.team_b_name || "Waiting for opponent") : (match.team_a_name || "Waiting for opponent"),
        status: match.status || "pending",
        round: Number(match.round || 0),
        date: match.scheduled_start_date || match.assigned_date || match.created_date,
        href: `/tournament-match/${match.id}`,
      });
    });

    wagers.forEach((wager) => {
      const isHost = String(wager.host_team_id || "") === teamId;
      const isChallenger = String(wager.challenger_team_id || "") === teamId;
      if ((!isHost && !isChallenger) || ["completed", "cancelled"].includes(wager.status)) return;
      const roomPrefix = wager.match_type === "8s" ? "8s-match" : wager.match_type === "xp" ? "xp-match" : "wagers-match";
      matchCandidates.push({
        id: wager.id,
        source: wager.match_type === "8s" ? "8s" : wager.match_type === "xp" ? "XP" : "Wager",
        title: wager.game_mode_display || wager.game_mode || "Competition match",
        opponent: isHost ? (wager.challenger_team_name || wager.challenger_name || "Waiting for opponent") : (wager.host_team_name || wager.host_name || "Host"),
        status: wager.status || "pending",
        round: 0,
        date: wager.match_started_date || wager.accepted_date || wager.created_date,
        href: `/${roomPrefix}/${wager.id}`,
      });
    });

    const statusPriority = { in_progress: 6, ready: 5, awaiting_report: 4, awaiting_team_a_report: 4, awaiting_team_b_report: 4, pending: 2, open: 1 };
    const activeMatch = matchCandidates.sort((a, b) => (
      (statusPriority[b.status] || 0) - (statusPriority[a.status] || 0)
      || Number(b.round || 0) - Number(a.round || 0)
      || new Date(b.date || 0) - new Date(a.date || 0)
    ))[0] || null;

    const currentTournament = tournamentParticipants
      .filter((participant) => String(participant.team_id || "") === teamId)
      .map((participant) => ({ participant, tournament: tournamentById[String(participant.tournament_id)] || null }))
      .filter((entry) => entry.tournament && !["completed", "cancelled"].includes(entry.tournament.status))
      .sort((a, b) => {
        const priority = { in_progress: 4, live: 4, registration: 3, open: 3, closed: 2 };
        return (priority[b.tournament.status] || 0) - (priority[a.tournament.status] || 0)
          || new Date(a.tournament.start_date || 0) - new Date(b.tournament.start_date || 0);
      })[0] || null;

    return {
      team,
      members,
      requiredPlayers,
      rosterPercent: Math.min(100, Math.round((members.length / Math.max(1, requiredPlayers)) * 100)),
      rosterReady: members.length >= requiredPlayers,
      wins,
      losses,
      winRate: wins + losses > 0 ? Math.round((wins / (wins + losses)) * 100) : 0,
      activeMatch,
      currentTournament,
      userRole: String(team.captain_id || "") === String(currentUser?.id || "")
        ? "Captain"
        : titleCase(members.find((member) => String(member.user_id) === String(currentUser?.id))?.role || "Member"),
    };
  }), [currentUser?.id, membersByTeam, teams, tournamentById, tournamentMatches, tournamentParticipants, wagers]);
  const summaryByTeamId = useMemo(() => Object.fromEntries(teamSummaries.map((summary) => [summary.team.id, summary])), [teamSummaries]);
  const teamOverview = useMemo(() => {
    const wins = teamSummaries.reduce((total, summary) => total + summary.wins, 0);
    const losses = teamSummaries.reduce((total, summary) => total + summary.losses, 0);
    return {
      teamCount: teamSummaries.length,
      playerCount: teamSummaries.reduce((total, summary) => total + summary.members.length, 0),
      readyCount: teamSummaries.filter((summary) => summary.rosterReady).length,
      activeMatchCount: teamSummaries.filter((summary) => summary.activeMatch).length,
      winRate: wins + losses > 0 ? Math.round((wins / (wins + losses)) * 100) : 0,
      featuredSummary: teamSummaries
        .filter((summary) => summary.activeMatch)
        .sort((a, b) => Number(Boolean(b.activeMatch)) - Number(Boolean(a.activeMatch)))[0] || teamSummaries[0] || null,
    };
  }, [teamSummaries]);
  const selectedTournamentEntries = useMemo(() => {
    if (!selectedTeam?.id) return [];
    return tournamentParticipants
      .filter((participant) => String(participant.team_id || "") === String(selectedTeam.id))
      .map((participant) => ({ ...participant, tournament: tournamentById[String(participant.tournament_id)] || null }))
      .sort((a, b) => new Date(b.tournament?.start_date || b.registered_date || 0) - new Date(a.tournament?.start_date || a.registered_date || 0));
  }, [selectedTeam?.id, tournamentById, tournamentParticipants]);

  const selectedMatches = useMemo(() => {
    if (!selectedTeam?.id) return [];
    const teamId = String(selectedTeam.id);
    const wagerRows = wagers.flatMap((wager) => {
      const isHost = String(wager.host_team_id || "") === teamId;
      const isChallenger = String(wager.challenger_team_id || "") === teamId;
      if (!isHost && !isChallenger) return [];
      const completed = wager.status === "completed";
      const sideId = isHost ? wager.host_id : wager.challenger_id;
      const won = completed && (String(wager.winner_id || "") === String(sideId || "") || wager.winner_team === (isHost ? "host" : "challenger"));
      const alpha = wager.confirmed_score_alpha ?? wager.reported_score_alpha ?? wager.team_alpha_score_reported;
      const bravo = wager.confirmed_score_bravo ?? wager.reported_score_bravo ?? wager.team_bravo_score_reported;
      let ownScore = isHost ? alpha : bravo;
      let opponentScore = isHost ? bravo : alpha;
      if (completed && wager.winner_score != null && wager.loser_score != null) {
        ownScore = won ? wager.winner_score : wager.loser_score;
        opponentScore = won ? wager.loser_score : wager.winner_score;
      }
      const roomPrefix = wager.match_type === "8s" ? "8s-match" : wager.match_type === "xp" ? "xp-match" : "wagers-match";
      return [{
        id: `wager-${wager.id}`,
        sourceId: wager.id,
        source: wager.match_type === "8s" ? "8s" : wager.match_type === "xp" ? "XP" : "Wager",
        opponent: isHost ? (wager.challenger_team_name || wager.challenger_name || "Awaiting opponent") : (wager.host_team_name || wager.host_name || "Host"),
        mode: wager.game_mode_display || wager.game_mode || "Match",
        format: wager.team_size || teamRosterFormat(selectedTeam.roster_size),
        status: wager.status,
        completed,
        outcome: completed ? (won ? "win" : "loss") : null,
        ownScore,
        opponentScore,
        date: wager.match_started_date || wager.accepted_date || wager.created_date,
        href: `/${roomPrefix}/${wager.id}`,
      }];
    });

    const tournamentRows = tournamentMatches.flatMap((match) => {
      const isTeamA = String(match.team_a_id || "") === teamId;
      const isTeamB = String(match.team_b_id || "") === teamId;
      if (!isTeamA && !isTeamB) return [];
      const completed = match.completed || match.status === "completed";
      const won = completed && String(match.winner_id || "") === teamId;
      const tournament = tournamentById[String(match.tournament_id)] || null;
      return [{
        id: `tournament-${match.id}`,
        sourceId: match.id,
        source: "Tournament",
        tournamentName: tournament?.name || tournament?.title || "Tournament",
        opponent: isTeamA ? (match.team_b_name || "Open slot") : (match.team_a_name || "Open slot"),
        mode: match.game_mode || match.tournament_game_mode || tournament?.game_mode || "Tournament match",
        format: tournament?.team_size || teamRosterFormat(selectedTeam.roster_size),
        status: match.status,
        completed,
        outcome: completed ? (won ? "win" : "loss") : null,
        ownScore: isTeamA ? match.team_a_score : match.team_b_score,
        opponentScore: isTeamA ? match.team_b_score : match.team_a_score,
        date: match.scheduled_start_date || match.assigned_date || match.created_date,
        href: `/tournament-match/${match.id}`,
      }];
    });

    return [...wagerRows, ...tournamentRows].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  }, [selectedTeam, tournamentById, tournamentMatches, wagers]);

  const completedMatches = selectedMatches.filter((match) => match.completed);
  const upcomingMatches = selectedMatches.filter((match) => !match.completed && !["cancelled"].includes(match.status));
  const wins = Math.max(Number(selectedTeam?.total_wins || 0), completedMatches.filter((match) => match.outcome === "win").length);
  const losses = Math.max(Number(selectedTeam?.total_losses || 0), completedMatches.filter((match) => match.outcome === "loss").length);
  const winRate = wins + losses > 0 ? Math.round((wins / (wins + losses)) * 100) : 0;
  const firstNonWinIndex = completedMatches.findIndex((match) => match.outcome !== "win");
  const currentStreak = firstNonWinIndex === -1 ? completedMatches.length : firstNonWinIndex;
  const nextMatch = [...upcomingMatches].sort((a, b) => new Date(a.date || 8640000000000000) - new Date(b.date || 8640000000000000))[0] || null;

  useEffect(() => {
    setTeamBannerDraft(selectedTeam?.banner_url || "");
    setTeamNameDraft(selectedTeam?.name || "");
  }, [selectedTeam?.id, selectedTeam?.banner_url, selectedTeam?.name]);

  const runTeamAction = async (payload, successTitle) => {
    setBusyAction(payload.action);
    try {
      const response = await base44.functions.invoke("manageTeam", payload);
      if (!response.data?.success) {
        toast({ title: "Team action failed", description: response.data?.error || "Could not update team.", variant: "destructive" });
        return false;
      }
      toast({ title: successTitle });
      await loadTeams();
      return true;
    } catch (error) {
      toast({ title: "Team action failed", description: error.message || "Could not update team.", variant: "destructive" });
      return false;
    } finally {
      setBusyAction("");
    }
  };

  const handleInvite = async (event) => {
    event.preventDefault();
    if (!selectedTeam || !inviteIdentifier.trim()) return;
    const ok = await runTeamAction({ action: "invite", team_id: selectedTeam.id, identifier: inviteIdentifier.trim() }, "Invite sent");
    if (ok) {
      setInviteIdentifier("");
      setInviteOpen(false);
    }
  };

  const handleInviteResponse = async (invite, decision) => {
    await runTeamAction({ action: "respond_invite", team_id: invite.team_id, invite_id: invite.id, decision }, decision === "accept" ? "Invite accepted" : "Invite declined");
  };

  const handleTeamBannerFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setTeamBannerDraft(await fileToDataUrl(file));
    } catch (error) {
      toast({ title: "Image failed", description: error.message || "Could not read image.", variant: "destructive" });
    } finally {
      event.target.value = "";
    }
  };

  const handleUpdateTeamBanner = async () => {
    if (!selectedTeam || !isSelectedCaptain) return;
    await runTeamAction({ action: "update_assets", team_id: selectedTeam.id, banner_url: teamBannerDraft.trim() }, "Team banner saved");
  };

  const handleUpdateTeamName = async (event) => {
    event.preventDefault();
    if (!selectedTeam || !isSelectedCaptain) return;
    const name = teamNameDraft.trim();
    if (!name) {
      toast({ title: "Team name required", description: "Enter a team name before saving.", variant: "destructive" });
      return;
    }
    if (name === selectedTeam.name) return;
    await runTeamAction({ action: "update_profile", team_id: selectedTeam.id, name }, "Team name saved");
  };

  const openTeam = (team) => {
    setSelectedTeamId(team.id);
    setDetailTab("overview");
    setView("details");
  };

  return (
    <div className="min-h-screen py-8">
      <div className="mx-auto max-w-[1600px] px-4 lg:px-6">
        {view === "my_teams" && (!loading && teams.length > 0 ? (
          <TeamsCommandHero overview={teamOverview} onCreate={() => setCreateOpen(true)} onOpenTeam={openTeam} />
        ) : (
          <header className="mb-7 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <p className="mb-2 text-[10px] font-black uppercase tracking-[0.22em] text-cyan">Team command center</p>
              <h1 className="text-3xl font-black tracking-tight">My Teams</h1>
              <p className="mt-1 text-sm text-vapor">Build your roster, track results and prepare for competition.</p>
            </div>
            <button onClick={() => setCreateOpen(true)} className="inline-flex items-center gap-2 rounded-xl bg-cyan px-5 py-3 text-xs font-black uppercase tracking-wider text-background transition-colors hover:bg-cyan/90">
              <Plus className="h-3.5 w-3.5" /> Create Team
            </button>
          </header>
        ))}

        {pendingInvites.length > 0 && (
          <section className="mb-6 rounded-2xl border border-cyan/15 bg-cyan/[0.05] p-5">
            <div className="mb-4 flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan/10 text-cyan"><UserPlus className="h-4 w-4" /></span>
              <div><h2 className="text-sm font-black">Team invitations</h2><p className="text-xs text-vapor">You have {pendingInvites.length} invitation{pendingInvites.length === 1 ? "" : "s"} waiting.</p></div>
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              {pendingInvites.map((invite) => (
                <div key={invite.id} className="flex flex-col justify-between gap-3 rounded-xl border border-white/5 bg-card/70 p-4 sm:flex-row sm:items-center">
                  <div><p className="font-bold">{invite.team_name}</p><p className="mt-1 text-xs text-vapor">{teamTypeLabel(invite)} invite from {invite.invited_by_name || "Captain"}</p></div>
                  <div className="flex gap-2">
                    <button onClick={() => handleInviteResponse(invite, "accept")} className="inline-flex items-center gap-1.5 rounded-lg bg-green/10 px-3 py-2 text-xs font-bold text-green"><CheckCircle className="h-3.5 w-3.5" /> Accept</button>
                    <button onClick={() => handleInviteResponse(invite, "decline")} className="inline-flex items-center gap-1.5 rounded-lg bg-red-500/10 px-3 py-2 text-xs font-bold text-red-400"><XCircle className="h-3.5 w-3.5" /> Decline</button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {loading ? (
          <div className="rounded-2xl border border-white/5 bg-card/70 p-12 text-center text-sm text-vapor">Loading your team hub...</div>
        ) : teams.length === 0 ? (
          <EmptyState icon={Users} title="Your first roster starts here" description="Create a Solo, Duo, Trio or Squad team, then invite the players you want to compete with." action={<button onClick={() => setCreateOpen(true)} className="rounded-lg bg-cyan px-4 py-2.5 text-xs font-black uppercase text-background">Create Team</button>} />
        ) : view === "my_teams" ? (
          <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
            <div className="min-w-0">
              <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div><p className="text-[9px] font-black uppercase tracking-[0.18em] text-cyan">Roster collection</p><h2 className="mt-1 text-xl font-black">Your teams</h2><p className="mt-1 text-xs text-vapor">Choose a roster to enter its command center.</p></div>
                <div className="relative w-full sm:w-72">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-vapor" />
                  <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search my teams..." className="w-full rounded-xl border border-white/[0.07] bg-card/70 py-2.5 pl-10 pr-4 text-sm shadow-inner focus:border-cyan/30 focus:outline-none" />
                </div>
              </div>
              {filteredTeams.length === 0 ? (
                <EmptyState icon={Search} title="No teams found" description="Try another team name, tag or region." />
              ) : (
                <div className="grid gap-5 lg:grid-cols-2">
                  {filteredTeams.map((team) => (
                    <TeamCard key={team.id} summary={summaryByTeamId[team.id]} usersById={memberUsersById} onOpen={() => openTeam(team)} />
                  ))}
                </div>
              )}
            </div>
            <TeamsOverviewSidebar summaries={teamSummaries} onCreate={() => setCreateOpen(true)} onOpenTeam={openTeam} />
          </div>
        ) : selectedTeam ? (
          <>
            <TeamHero
              team={selectedTeam}
              teams={teams}
              members={selectedMembers}
              wins={wins}
              losses={losses}
              winRate={winRate}
              streak={currentStreak}
              isCaptain={isSelectedCaptain}
              onBack={() => setView("my_teams")}
              onSelectTeam={(teamId) => { setSelectedTeamId(teamId); setDetailTab("overview"); }}
              onInvite={() => setInviteOpen(true)}
              onSettings={() => setDetailTab("settings")}
            />

            <nav className="mb-6 mt-4 flex gap-1 overflow-x-auto rounded-xl border border-white/5 bg-card/60 p-1.5">
              {detailTabs.map((tab) => {
                const Icon = tab.icon;
                return <button key={tab.id} onClick={() => setDetailTab(tab.id)} className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-4 py-2.5 text-xs font-black uppercase tracking-wider transition-colors ${detailTab === tab.id ? "bg-cyan/10 text-cyan" : "text-vapor hover:bg-white/[0.04] hover:text-white"}`}><Icon className="h-3.5 w-3.5" /> {tab.label}</button>;
              })}
            </nav>

            {detailTab === "overview" && <OverviewTab team={selectedTeam} members={selectedMembers} usersById={memberUsersById} matches={selectedMatches} nextMatch={nextMatch} tournaments={selectedTournamentEntries} isCaptain={isSelectedCaptain} onInvite={() => setInviteOpen(true)} onRoster={() => setDetailTab("roster")} onMatches={() => setDetailTab("matches")} onTournaments={() => setDetailTab("tournaments")} />}
            {detailTab === "roster" && <RosterPanel team={selectedTeam} members={selectedMembers} usersById={memberUsersById} isCaptain={isSelectedCaptain} busy={Boolean(busyAction)} onInvite={() => setInviteOpen(true)} onKick={(member) => runTeamAction({ action: "kick", team_id: selectedTeam.id, member_id: member.id }, "Player kicked")} />}
            {detailTab === "matches" && <MatchList matches={selectedMatches} limit={50} />}
            {detailTab === "tournaments" && <TournamentList entries={selectedTournamentEntries} limit={50} />}
            {detailTab === "settings" && <SettingsPanel team={selectedTeam} membership={selectedMembership} members={selectedMembers} usersById={memberUsersById} isCaptain={isSelectedCaptain} busy={Boolean(busyAction)} nameDraft={teamNameDraft} setNameDraft={setTeamNameDraft} bannerDraft={teamBannerDraft} setBannerDraft={setTeamBannerDraft} onNameSubmit={handleUpdateTeamName} onBannerFile={handleTeamBannerFile} onBannerSave={handleUpdateTeamBanner} onInvite={() => setInviteOpen(true)} onKick={(member) => runTeamAction({ action: "kick", team_id: selectedTeam.id, member_id: member.id }, "Player kicked")} onLeave={() => runTeamAction({ action: "leave", team_id: selectedTeam.id }, "Left team")} onDisband={() => runTeamAction({ action: "disband", team_id: selectedTeam.id }, "Team disbanded")} />}
          </>
        ) : null}
      </div>

      <CreateTeamModal isOpen={createOpen} onClose={() => setCreateOpen(false)} user={currentUser} onCreated={async (team) => { await loadTeams(); setSelectedTeamId(team.id); setDetailTab("overview"); setView("details"); }} />
      <InvitePlayerModal isOpen={inviteOpen} onClose={() => setInviteOpen(false)} team={selectedTeam} value={inviteIdentifier} onChange={setInviteIdentifier} onSubmit={handleInvite} busy={Boolean(busyAction)} />
    </div>
  );
}

function TeamLogo({ team, className = "h-16 w-16", textClassName = "text-xl" }) {
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [team.logo_url]);

  return (
    <div className={`flex shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-cyan/25 via-secondary to-orange/25 font-mono font-black shadow-[0_16px_32px_rgba(0,0,0,0.28)] ${className}`}>
      {team.logo_url && !imageFailed ? <img src={team.logo_url} alt="" onError={() => setImageFailed(true)} className="block h-full w-full object-cover" /> : <span className={`block max-w-full truncate px-2 ${textClassName}`}>{teamInitials(team)}</span>}
    </div>
  );
}

function TeamBanner({ team, imageClassName = "opacity-65 transition-transform duration-300 group-hover:scale-[1.025]" }) {
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [team.banner_url]);

  return (
    <div className="absolute inset-0 overflow-hidden bg-[radial-gradient(circle_at_78%_15%,rgba(20,216,255,.2),transparent_34%),radial-gradient(circle_at_18%_90%,rgba(255,122,0,.12),transparent_30%),linear-gradient(125deg,rgba(21,34,48,.98),rgba(12,18,27,.96))]">
      {team.banner_url && !imageFailed && <img src={team.banner_url} alt="" onError={() => setImageFailed(true)} className={`absolute inset-0 block h-full w-full object-cover ${imageClassName}`} />}
    </div>
  );
}

function TeamsCommandHero({ overview, onCreate, onOpenTeam }) {
  const featured = overview.featuredSummary;
  const activeMatch = featured?.activeMatch;
  return (
    <section className="relative mb-8 overflow-hidden rounded-3xl border border-cyan/15 bg-card shadow-[0_28px_70px_-46px_rgba(20,216,255,.48)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_10%,rgba(20,216,255,.16),transparent_30%),radial-gradient(circle_at_88%_5%,rgba(255,130,0,.11),transparent_27%),linear-gradient(118deg,rgba(14,22,32,.99),rgba(18,28,39,.96)_50%,rgba(10,17,26,.99))]" />
      <div className="pointer-events-none absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.035)_1px,transparent_1px)] [background-size:38px_38px]" />
      <div className="relative grid gap-7 p-6 sm:p-8 xl:grid-cols-[minmax(0,1fr)_420px] xl:items-stretch">
        <div className="flex min-w-0 flex-col justify-between">
          <div className="flex flex-col items-start justify-between gap-5 sm:flex-row">
            <div>
              <div className="mb-3 flex items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-xl bg-cyan/10 text-cyan"><Sparkles className="h-4 w-4" /></span><p className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan">Team command center</p></div>
              <h1 className="text-4xl font-black tracking-[-0.04em] sm:text-5xl">Your competition squads</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-vapor">Manage every roster, follow active matches and keep your teams ready for the next tournament.</p>
            </div>
            <button onClick={onCreate} className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-cyan px-5 py-3 text-xs font-black uppercase tracking-wider text-background shadow-[0_12px_30px_-16px_rgba(20,216,255,.85)] transition-[transform,background-color] duration-150 hover:-translate-y-0.5 hover:bg-cyan/90"><Plus className="h-3.5 w-3.5" /> Create Team</button>
          </div>
          <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <CommandMetric label="Teams" value={overview.teamCount} detail="Active rosters" icon={Shield} tone="text-cyan" />
            <CommandMetric label="Players" value={overview.playerCount} detail="Across teams" icon={Users} tone="text-purple-300" />
            <CommandMetric label="Ready" value={`${overview.readyCount}/${overview.teamCount}`} detail="Full rosters" icon={CheckCircle} tone="text-green" />
            <CommandMetric label="Win rate" value={`${overview.winRate}%`} detail={`${overview.activeMatchCount} active match${overview.activeMatchCount === 1 ? "" : "es"}`} icon={TrendingUp} tone="text-orange" />
          </div>
        </div>
        <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-background/55 p-5 shadow-inner">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-orange/60 to-transparent" />
          <div className="flex items-center justify-between gap-3"><div><p className="text-[9px] font-black uppercase tracking-[0.2em] text-orange">Competition pulse</p><h2 className="mt-1 text-lg font-black">{activeMatch ? "Match ready" : "Roster status"}</h2></div>{activeMatch ? <span className="flex items-center gap-1.5 rounded-lg border border-red-400/20 bg-red-500/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-red-300"><Radio className="h-3 w-3 animate-pulse" /> Live</span> : <Activity className="h-5 w-5 text-cyan" />}</div>
          {featured ? (
            <div className="mt-5">
              <div className="flex items-center gap-3"><TeamLogo team={featured.team} className="h-12 w-12 rounded-xl" textClassName="text-sm" /><div className="min-w-0"><p className="truncate text-sm font-black">{featured.team.name}</p><p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-vapor">{featured.userRole} · {teamRosterFormat(featured.team.roster_size)}</p></div></div>
              {activeMatch ? (
                <div className="mt-5 rounded-xl border border-cyan/15 bg-cyan/[0.045] p-4"><p className="text-[9px] font-black uppercase tracking-wider text-cyan">{activeMatch.source} · {titleCase(activeMatch.status)}</p><p className="mt-2 truncate text-xl font-black">vs {activeMatch.opponent}</p><p className="mt-1 truncate text-xs text-vapor">{activeMatch.title}{activeMatch.date ? ` · ${formatDateTime(activeMatch.date)}` : ""}</p><Link to={activeMatch.href} className="mt-4 inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-cyan">Open match room <ArrowRight className="h-3.5 w-3.5" /></Link></div>
              ) : (
                <div className="mt-5"><div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider"><span className="text-vapor">Roster readiness</span><span className={featured.rosterReady ? "text-green" : "text-orange"}>{featured.members.length}/{featured.requiredPlayers} players</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-black/30"><div className={`h-full rounded-full ${featured.rosterReady ? "bg-gradient-to-r from-cyan to-green" : "bg-gradient-to-r from-orange to-yellow-300"}`} style={{ width: `${featured.rosterPercent}%` }} /></div><button onClick={() => onOpenTeam(featured.team)} className="mt-5 inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-cyan">Open team hub <ArrowRight className="h-3.5 w-3.5" /></button></div>
              )}
            </div>
          ) : <CompactEmpty icon={Users} title="No team selected" text="Create a team to start competing." />}
        </div>
      </div>
    </section>
  );
}

function TeamsOverviewSidebar({ summaries, onCreate, onOpenTeam }) {
  const activeSummaries = summaries.filter((summary) => summary.activeMatch);
  return (
    <aside className="space-y-5 xl:sticky xl:top-24">
      <section className="rounded-2xl border border-white/[0.07] bg-card/75 p-5 shadow-[0_18px_45px_-34px_rgba(0,0,0,.95)]">
        <div className="flex items-center justify-between gap-3"><div><p className="text-[9px] font-black uppercase tracking-[0.18em] text-cyan">Squad health</p><h2 className="mt-1 text-base font-black">Roster readiness</h2></div><Users className="h-4 w-4 text-cyan" /></div>
        <div className="mt-5 space-y-4">
          {summaries.map((summary) => (
            <button key={summary.team.id} type="button" onClick={() => onOpenTeam(summary.team)} className="group block w-full text-left">
              <div className="flex items-center gap-3"><TeamLogo team={summary.team} className="h-10 w-10 rounded-xl" textClassName="text-[10px]" /><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><p className="truncate text-xs font-black group-hover:text-cyan">{summary.team.name}</p><span className={`text-[9px] font-black ${summary.rosterReady ? "text-green" : "text-orange"}`}>{summary.members.length}/{summary.requiredPlayers}</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-background"><div className={`h-full rounded-full ${summary.rosterReady ? "bg-green" : "bg-orange"}`} style={{ width: `${summary.rosterPercent}%` }} /></div></div></div>
            </button>
          ))}
        </div>
      </section>
      {activeSummaries.length > 0 && (
        <section className="rounded-2xl border border-red-400/15 bg-[linear-gradient(145deg,rgba(248,113,113,.07),rgba(18,25,35,.82))] p-5">
          <div className="flex items-center gap-2 text-red-300"><Radio className="h-4 w-4" /><p className="text-[9px] font-black uppercase tracking-[0.18em]">Active competition</p></div>
          <div className="mt-4 space-y-3">{activeSummaries.slice(0, 3).map((summary) => <Link key={summary.team.id} to={summary.activeMatch.href} className="block rounded-xl border border-white/[0.06] bg-background/40 p-3 transition-colors hover:border-red-400/25"><p className="truncate text-xs font-black">{summary.team.name} vs {summary.activeMatch.opponent}</p><p className="mt-1 text-[9px] font-bold uppercase tracking-wider text-vapor">{summary.activeMatch.source} · {titleCase(summary.activeMatch.status)}</p></Link>)}</div>
        </section>
      )}
      <section className="rounded-2xl border border-white/[0.07] bg-card/65 p-5">
        <p className="text-[9px] font-black uppercase tracking-[0.18em] text-vapor">Quick actions</p>
        <div className="mt-3 grid gap-2"><button onClick={onCreate} className="flex items-center justify-between rounded-xl bg-cyan px-4 py-3 text-xs font-black uppercase tracking-wider text-background"><span className="flex items-center gap-2"><Plus className="h-3.5 w-3.5" /> New team</span><ArrowRight className="h-3.5 w-3.5" /></button><Link to="/tournaments" className="flex items-center justify-between rounded-xl border border-white/[0.07] bg-secondary/55 px-4 py-3 text-xs font-black uppercase tracking-wider text-vapor transition-colors hover:border-cyan/20 hover:text-cyan"><span className="flex items-center gap-2"><Trophy className="h-3.5 w-3.5" /> Tournaments</span><ArrowRight className="h-3.5 w-3.5" /></Link></div>
      </section>
    </aside>
  );
}

function TeamCard({ summary, usersById, onOpen }) {
  const { team, members, requiredPlayers, rosterPercent, rosterReady, wins, losses, winRate, activeMatch, currentTournament, userRole } = summary;
  const slots = [...members.slice(0, requiredPlayers), ...Array.from({ length: Math.max(0, requiredPlayers - members.length) }, () => null)].slice(0, 4);
  return (
    <button type="button" onClick={onOpen} className="group relative flex h-full min-h-[590px] w-full min-w-0 flex-col overflow-hidden rounded-3xl border border-white/[0.07] bg-card text-left shadow-[0_24px_55px_-38px_rgba(0,0,0,.98)] transition-[transform,border-color,box-shadow] duration-150 hover:-translate-y-1 hover:border-cyan/25 hover:shadow-[0_30px_70px_-42px_rgba(20,216,255,.32)]">
      <div className="relative h-36 min-h-36 w-full shrink-0 overflow-hidden">
        <TeamBanner team={team} />
        <div className="absolute inset-0 bg-gradient-to-t from-card via-card/25 to-black/5" />
        <div className="absolute left-4 top-4 flex flex-wrap gap-2"><span className="rounded-lg border border-white/10 bg-black/45 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-white backdrop-blur-sm">{userRole}</span>{team.is_demo && <span className="rounded-lg border border-purple-400/25 bg-purple-500/15 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-purple-200 backdrop-blur-sm">Demo team</span>}</div>
        <div className="absolute right-4 top-4">{activeMatch ? <span className="inline-flex items-center gap-1.5 rounded-lg border border-red-400/25 bg-red-500/15 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-red-200 backdrop-blur-sm"><Radio className="h-3 w-3 animate-pulse" /> Match ready</span> : rosterReady ? <span className="inline-flex items-center gap-1.5 rounded-lg border border-green/25 bg-green/15 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-green backdrop-blur-sm"><CheckCircle className="h-3 w-3" /> Roster ready</span> : null}</div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col px-5 pb-5 pt-5">
        <div className="flex min-w-0 items-center gap-3">
          <TeamLogo team={team} className="h-14 w-14 rounded-xl" textClassName="text-sm tracking-[0.08em]" />
          <div className="min-w-0 flex-1"><p className="text-[9px] font-black uppercase tracking-[0.2em] text-cyan">[{team.tag || "TEAM"}] · {teamRosterFormat(team.roster_size)}</p><h2 className="mt-1 truncate text-2xl font-black tracking-tight">{team.name}</h2><p className="mt-1 truncate text-xs text-vapor">Captain {team.captain_name || "Unknown"}</p></div>
          <ArrowRight className="h-4 w-4 shrink-0 text-vapor transition-transform duration-150 group-hover:translate-x-1 group-hover:text-cyan" />
        </div>
        <div className="mt-4 flex min-h-7 flex-wrap content-start gap-2"><TeamPill icon={Trophy} text={teamTypeLabel(team)} /><TeamPill icon={Globe2} text={String(team.region || "global").toUpperCase()} />{currentTournament && <TeamPill icon={Activity} text={titleCase(currentTournament.tournament.status)} emphasized />}</div>
        <div className="mt-5 rounded-2xl border border-white/[0.06] bg-background/35 p-3.5">
          <div className="flex items-center justify-between"><p className="text-[9px] font-black uppercase tracking-wider text-vapor">Active roster</p><p className={`text-[9px] font-black uppercase ${rosterReady ? "text-green" : "text-orange"}`}>{members.length}/{requiredPlayers} players</p></div>
          <div className="mt-3 flex items-center gap-2">{slots.map((member, index) => { const player = member ? (usersById[member.user_id] || {}) : null; const name = player?.display_name || player?.full_name || player?.username || member?.user_name || "Open slot"; return <span key={member?.id || `slot-${index}`} title={name} className={`flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl border text-[10px] font-black ${member ? "border-white/10 bg-secondary text-cyan" : "border-dashed border-white/10 bg-white/[0.02] text-vapor/40"}`}>{player?.avatar_url ? <img src={player.avatar_url} alt="" className="h-full w-full object-cover" /> : member ? name.charAt(0).toUpperCase() : <Plus className="h-3.5 w-3.5" />}</span>; })}<div className="ml-1 min-w-0 flex-1"><div className="h-1.5 overflow-hidden rounded-full bg-black/30"><div className={`h-full rounded-full ${rosterReady ? "bg-gradient-to-r from-cyan to-green" : "bg-gradient-to-r from-orange to-yellow-300"}`} style={{ width: `${rosterPercent}%` }} /></div><p className="mt-1.5 truncate text-[9px] text-vapor">{rosterReady ? "Ready for competition" : `${requiredPlayers - members.length} player${requiredPlayers - members.length === 1 ? "" : "s"} needed`}</p></div></div>
        </div>
        <div className="mt-3 min-h-[54px]">
          {activeMatch ? <div className="flex min-h-[54px] items-center gap-3 rounded-xl border border-red-400/15 bg-red-500/[0.045] px-3 py-2.5"><Radio className="h-3.5 w-3.5 shrink-0 text-red-300" /><div className="min-w-0"><p className="truncate text-xs font-black">vs {activeMatch.opponent}</p><p className="mt-0.5 truncate text-[9px] font-bold uppercase tracking-wider text-vapor">{activeMatch.source} · {titleCase(activeMatch.status)}</p></div></div> : <div className="flex min-h-[54px] items-center gap-3 rounded-xl border border-white/[0.05] bg-background/20 px-3 py-2.5"><Clock className="h-3.5 w-3.5 shrink-0 text-vapor/60" /><div className="min-w-0"><p className="text-xs font-black text-vapor">No active match</p><p className="mt-0.5 text-[9px] font-bold uppercase tracking-wider text-vapor/60">Schedule clear</p></div></div>}
        </div>
        <div className="mt-auto grid grid-cols-3 gap-2 pt-4"><MiniMetric label="Record" value={`${wins}-${losses}`} /><MiniMetric label="Win rate" value={`${winRate}%`} /><MiniMetric label="Ranking" value={team.ranking > 0 ? `#${team.ranking}` : "—"} /></div>
        <div className="mt-4 flex items-center justify-between border-t border-white/[0.06] pt-3"><span className="text-[9px] font-black uppercase tracking-[0.16em] text-cyan">Open command center</span><span className="text-[9px] font-bold uppercase tracking-wider text-vapor">{team.is_demo ? "Test roster" : `${teamRosterFormat(team.roster_size)} roster`}</span></div>
      </div>
    </button>
  );
}

function CommandMetric({ label, value, detail, icon: Icon, tone }) {
  return <div className="rounded-2xl border border-white/[0.07] bg-black/20 p-4 shadow-inner"><div className="flex items-center justify-between gap-2"><p className="text-[9px] font-black uppercase tracking-[0.16em] text-vapor">{label}</p><Icon className={`h-4 w-4 ${tone}`} /></div><p className={`mt-3 font-mono text-2xl font-black ${tone}`}>{value}</p><p className="mt-1 text-[9px] font-bold uppercase tracking-wider text-vapor/70">{detail}</p></div>;
}

function TeamHero({ team, teams, members, wins, losses, winRate, streak, isCaptain, onBack, onSelectTeam, onInvite, onSettings }) {
  return (
    <section className="relative overflow-hidden rounded-3xl border border-cyan/15 bg-card shadow-[0_24px_60px_-38px_rgba(0,0,0,.95)]">
      <TeamBanner team={team} imageClassName="opacity-35" />
      <div className="absolute inset-0 bg-[linear-gradient(100deg,rgba(8,13,21,.99)_0%,rgba(8,13,21,.92)_48%,rgba(8,13,21,.62)_100%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent,rgba(8,13,21,.72))]" />
      <div className="relative flex min-h-14 flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] bg-black/15 px-5 py-3 sm:px-8">
        <button onClick={onBack} className="inline-flex items-center gap-2 rounded-lg px-2 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-vapor transition-colors hover:bg-white/[0.04] hover:text-cyan"><ArrowLeft className="h-3.5 w-3.5" /> All teams</button>
        <div className="flex items-center gap-3">
          <span className="hidden text-[9px] font-black uppercase tracking-[0.16em] text-vapor/70 sm:inline">Viewing team</span>
          {teams.length > 1 ? (
            <select value={team.id} onChange={(event) => onSelectTeam(event.target.value)} className="min-w-44 rounded-lg border border-white/[0.08] bg-secondary/85 px-3 py-2 text-xs font-black focus:border-cyan/30 focus:outline-none">
              {teams.map((item) => <option key={item.id} value={item.id}>{item.name} [{item.tag}]</option>)}
            </select>
          ) : (
            <span className="rounded-lg border border-white/[0.08] bg-secondary/65 px-3 py-2 text-xs font-black">{team.name} [{team.tag}]</span>
          )}
        </div>
      </div>
      <div className="relative grid gap-7 p-6 sm:p-8 xl:grid-cols-[1fr_auto] xl:items-end">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <TeamLogo team={team} className="h-24 w-24 sm:h-28 sm:w-28" textClassName="text-3xl" />
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan">[{team.tag || "TEAM"}]</p>
            <h1 className="mt-2 truncate text-4xl font-black tracking-tight sm:text-5xl">{team.name}</h1>
            <p className="mt-2 text-sm text-vapor">Led by {team.captain_name || "Captain"} · Founded {formatDate(team.created_date)}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <TeamPill icon={Gamepad2} text={teamRosterFormat(team.roster_size)} emphasized />
              <TeamPill icon={Trophy} text={teamTypeLabel(team)} />
              <TeamPill icon={Globe2} text={String(team.region || "global").toUpperCase()} />
              <TeamPill icon={Users} text={`${members.length}/${normalizeTeamRosterSize(team.roster_size)} ready`} />
              {team.roster_locked && <TeamPill icon={Lock} text="Roster locked" tone="orange" />}
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              {isCaptain && members.length < normalizeTeamRosterSize(team.roster_size) && <button onClick={onInvite} className="inline-flex items-center gap-2 rounded-lg bg-cyan px-4 py-2.5 text-xs font-black uppercase tracking-wider text-background"><UserPlus className="h-3.5 w-3.5" /> Invite Player</button>}
              <button onClick={onSettings} className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2.5 text-xs font-black uppercase tracking-wider text-vapor hover:border-cyan/20 hover:text-cyan"><Shield className="h-3.5 w-3.5" /> Manage Team</button>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:min-w-[500px]">
          <HeroMetric icon={Swords} label="Record" value={`${wins}-${losses}`} tone="text-cyan" />
          <HeroMetric icon={TrendingUp} label="Win rate" value={`${winRate}%`} tone="text-green" />
          <HeroMetric icon={Zap} label="Win streak" value={`${streak}W`} tone="text-orange" />
          <HeroMetric icon={Trophy} label="Ranking" value={team.ranking > 0 ? `#${team.ranking}` : "Unranked"} tone="text-yellow-300" />
        </div>
      </div>
    </section>
  );
}

function OverviewTab({ team, members, usersById, matches, nextMatch, tournaments, isCaptain, onInvite, onRoster, onMatches, onTournaments }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[1.25fr_.75fr]">
        <Panel title="Active roster" eyebrow={`${members.length}/${normalizeTeamRosterSize(team.roster_size)} players`} action={<button onClick={onRoster} className="text-[10px] font-black uppercase tracking-wider text-cyan">Full roster →</button>}>
          <RosterPanel team={team} members={members} usersById={usersById} isCaptain={isCaptain} onInvite={onInvite} compact />
        </Panel>
        <Panel title="Next match" eyebrow="Match center">
          {nextMatch ? <FeaturedMatch match={nextMatch} /> : <CompactEmpty icon={Clock} title="No upcoming match" text="Your next scheduled match will appear here." />}
        </Panel>
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Recent matches" eyebrow={`${matches.length} tracked`} action={<button onClick={onMatches} className="text-[10px] font-black uppercase tracking-wider text-cyan">Match history →</button>}><MatchList matches={matches} limit={4} embedded /></Panel>
        <Panel title="Tournament journey" eyebrow={`${tournaments.length} entered`} action={<button onClick={onTournaments} className="text-[10px] font-black uppercase tracking-wider text-cyan">All tournaments →</button>}><TournamentList entries={tournaments} limit={4} embedded /></Panel>
      </div>
    </div>
  );
}

function RosterTrophyCounts({ trophies }) {
  const counts = trophies || emptyTrophyCounts();
  return (
    <div className="grid grid-cols-5 gap-1.5">
      {rosterTrophySlots.map(({ key, label, icon: Icon, tone }) => (
        <span key={key} title={`${label} trophies: ${statNumber(counts[key])}`} aria-label={`${label} trophies: ${statNumber(counts[key])}`} className="flex min-w-0 items-center justify-center gap-1 rounded-lg border border-white/[0.05] bg-background/45 px-1.5 py-2">
          <Icon className={`h-3.5 w-3.5 shrink-0 ${tone}`} />
          <span className="font-mono text-[10px] font-black text-white">{statNumber(counts[key])}</span>
        </span>
      ))}
    </div>
  );
}

function RosterPanel({ team, members, usersById, isCaptain, busy, onInvite, onKick, compact = false }) {
  const limit = normalizeTeamRosterSize(team.roster_size);
  const openSlots = Math.max(0, limit - members.length);
  const visibleMembers = compact ? members.slice(0, 4) : members;
  const visibleOpenSlots = compact ? Math.min(openSlots, Math.max(0, 4 - visibleMembers.length)) : openSlots;
  return (
    <div className={compact ? "grid gap-3 sm:grid-cols-2" : "grid gap-4 md:grid-cols-2 xl:grid-cols-3"}>
      {visibleMembers.map((member) => {
        const user = usersById[member.user_id] || {};
        const name = user.display_name || user.full_name || user.username || member.user_name || "Unnamed player";
        return (
          <article key={member.id} className="group rounded-2xl border border-white/5 bg-secondary/35 p-4 transition-colors hover:border-cyan/15 hover:bg-secondary/50">
            <div className="flex items-start gap-3">
              <Link to={`/profile/${encodeURIComponent(user.id || member.user_id || member.user_name || "")}`} className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/5 bg-background font-mono font-black text-cyan">
                {user.avatar_url ? <img src={user.avatar_url} alt="" className="h-full w-full object-cover" /> : name.charAt(0).toUpperCase()}
              </Link>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2"><Link to={`/profile/${encodeURIComponent(user.id || member.user_id || member.user_name || "")}`} className="truncate text-sm font-black hover:text-cyan">{name}</Link><UserBadges user={user} badges={user.badges || []} size="xs" iconOnly showMonitorCam /></div>
                <p className={`mt-1 text-[10px] font-black uppercase tracking-wider ${member.role === "captain" ? "text-orange" : "text-vapor"}`}>{member.role === "captain" ? "Team captain" : member.role || "Member"}</p>
                <ActivisionIdLabel user={user} className="mt-2 max-w-full" />
              </div>
              {member.role === "captain" ? <Crown className="h-4 w-4 shrink-0 text-orange" /> : isCaptain && onKick ? <button onClick={() => onKick(member)} disabled={busy} title="Remove player" className="rounded-lg p-2 text-vapor transition-colors hover:bg-red-500/10 hover:text-red-400 disabled:opacity-40"><UserMinus className="h-4 w-4" /></button> : null}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <MiniMetric label="Level" value={user.xp_level || 1} />
              <MiniMetric label="Wager W-L" value={`${user.wager_wins || 0}-${user.wager_losses || 0}`} />
              <MiniMetric label="Region" value={String(user.region || team.region || "-").toUpperCase()} />
              <MiniMetric label="Earnings" value={formatMoney(playerEarnings(user))} />
            </div>
            <div className="mt-3 border-t border-white/[0.05] pt-3">
              <div className="mb-2 flex items-center justify-between gap-3"><p className="text-[9px] font-black uppercase tracking-[0.16em] text-vapor">Trophies</p><p className="text-[9px] font-bold text-vapor/60">Match room stats</p></div>
              <RosterTrophyCounts trophies={user.team_trophies} />
            </div>
          </article>
        );
      })}
      {Array.from({ length: visibleOpenSlots }, (_, index) => (
        <button key={`open-${index}`} type="button" onClick={isCaptain ? onInvite : undefined} className="flex min-h-36 flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/[0.015] p-5 text-center transition-colors hover:border-cyan/25 hover:bg-cyan/[0.035]">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan/10 text-cyan"><Plus className="h-4 w-4" /></span><p className="mt-3 text-xs font-black uppercase tracking-wider">Open roster slot</p><p className="mt-1 text-[10px] text-vapor">{isCaptain ? "Invite a player" : "Waiting for captain"}</p>
        </button>
      ))}
    </div>
  );
}

function MatchList({ matches, limit = 10, embedded = false }) {
  const rows = matches.slice(0, limit);
  if (rows.length === 0) return <CompactEmpty icon={Swords} title="No matches yet" text="Completed and scheduled matches will appear here." />;
  return <div className={embedded ? "divide-y divide-white/5" : "overflow-hidden rounded-2xl border border-white/5 bg-card divide-y divide-white/5"}>{rows.map((match) => <MatchRow key={match.id} match={match} />)}</div>;
}

function MatchRow({ match }) {
  const scoreReady = match.completed && match.ownScore != null && match.opponentScore != null;
  return (
    <Link to={match.href} className="grid gap-3 px-1 py-4 transition-colors hover:bg-white/[0.02] sm:grid-cols-[auto_1fr_auto] sm:items-center sm:px-3">
      <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${match.outcome === "win" ? "bg-green/10 text-green" : match.outcome === "loss" ? "bg-red-500/10 text-red-400" : "bg-cyan/10 text-cyan"}`}>{match.source === "Tournament" ? <Trophy className="h-4 w-4" /> : <Swords className="h-4 w-4" />}</span>
      <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-black">vs {match.opponent}</p><span className={`rounded px-2 py-0.5 text-[9px] font-black uppercase ${match.outcome === "win" ? "bg-green/10 text-green" : match.outcome === "loss" ? "bg-red-500/10 text-red-400" : "bg-white/5 text-vapor"}`}>{match.outcome || titleCase(match.status)}</span></div><p className="mt-1 truncate text-[11px] text-vapor">{match.tournamentName ? `${match.tournamentName} · ` : ""}{match.source} · {match.mode} · {formatDateTime(match.date)}</p></div>
      <div className="flex items-center justify-between gap-3 sm:justify-end"><span className="font-mono text-lg font-black text-cyan">{scoreReady ? `${match.ownScore}-${match.opponentScore}` : "TBD"}</span><ArrowRight className="h-3.5 w-3.5 text-vapor" /></div>
    </Link>
  );
}

function FeaturedMatch({ match }) {
  return (
    <Link to={match.href} className="block rounded-2xl border border-cyan/15 bg-[linear-gradient(135deg,rgba(20,216,255,.08),rgba(255,255,255,.015))] p-5 transition-colors hover:border-cyan/30">
      <div className="flex items-center justify-between gap-3"><span className="rounded-lg bg-cyan/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-cyan">{match.source}</span><span className="text-[10px] font-bold uppercase text-vapor">{titleCase(match.status)}</span></div>
      <p className="mt-6 text-[10px] font-black uppercase tracking-wider text-vapor">Next opponent</p><h3 className="mt-1 truncate text-2xl font-black">{match.opponent}</h3>
      <div className="mt-5 grid grid-cols-2 gap-3"><MiniMetric label="Mode" value={match.mode} /><MiniMetric label="Starts" value={formatDateTime(match.date)} /></div>
      <p className="mt-5 inline-flex items-center gap-2 text-xs font-black uppercase tracking-wider text-cyan">Open match room <ArrowRight className="h-3.5 w-3.5" /></p>
    </Link>
  );
}

function TournamentList({ entries, limit = 10, embedded = false }) {
  const rows = entries.slice(0, limit);
  if (rows.length === 0) return <CompactEmpty icon={Trophy} title="No tournaments yet" text="Tournament registrations and placements will appear here." />;
  return <div className={embedded ? "divide-y divide-white/5" : "grid gap-4 md:grid-cols-2"}>{rows.map((entry) => {
    const tournament = entry.tournament || {};
    return <Link key={entry.id} to={`/tournaments?tournament=${encodeURIComponent(entry.tournament_id)}`} className={`${embedded ? "flex items-center gap-3 px-1 py-4 sm:px-3" : "rounded-2xl border border-white/5 bg-card p-5"} group transition-colors hover:border-cyan/20 hover:bg-white/[0.02]`}><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-yellow-400/10 text-yellow-300"><Trophy className="h-4 w-4" /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-black">{tournament.name || tournament.title || entry.team_name || "Tournament"}</p><span className="rounded bg-white/5 px-2 py-0.5 text-[9px] font-black uppercase text-vapor">{titleCase(tournament.status || (entry.eliminated ? "eliminated" : "registered"))}</span></div><p className="mt-1 text-[11px] text-vapor">Seed #{entry.seed || "-"} · {entry.final_rank ? `Placed #${entry.final_rank}` : entry.eliminated ? `Eliminated${entry.eliminated_round ? ` round ${entry.eliminated_round}` : ""}` : "In competition"}</p></div><div className="text-right"><p className="font-mono text-sm font-black text-green">{entry.prize_won > 0 ? formatMoney(entry.prize_won) : "—"}</p><p className="mt-1 text-[9px] uppercase text-vapor">Prize</p></div></Link>;
  })}</div>;
}

function SettingsPanel({ team, membership, members, usersById, isCaptain, busy, nameDraft, setNameDraft, bannerDraft, setBannerDraft, onNameSubmit, onBannerFile, onBannerSave, onInvite, onKick, onLeave, onDisband }) {
  const rosterLimit = normalizeTeamRosterSize(team.roster_size);
  const rosterFull = members.length >= rosterLimit;
  const rosterLocked = Boolean(team.roster_locked);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Panel title="Team profile" eyebrow={isCaptain ? "Captain controls" : "Read only"}>
        {isCaptain ? <div className="space-y-6"><form onSubmit={onNameSubmit} className="space-y-3"><FieldLabel>Team name</FieldLabel><input value={nameDraft} onChange={(event) => setNameDraft(event.target.value)} maxLength={40} className="w-full rounded-xl border border-white/5 bg-secondary px-4 py-3 text-sm focus:border-cyan/30 focus:outline-none" /><button type="submit" disabled={busy || !nameDraft.trim() || nameDraft.trim() === team.name} className="inline-flex items-center gap-2 rounded-lg bg-cyan/10 px-4 py-2.5 text-xs font-black uppercase text-cyan disabled:opacity-40"><Save className="h-3.5 w-3.5" /> Save Name</button></form><div className="border-t border-white/5 pt-5"><FieldLabel>Team banner</FieldLabel><div className="mt-3 space-y-3"><input value={bannerDraft} onChange={(event) => setBannerDraft(event.target.value)} placeholder="https://i.imgur.com/team-banner.png" className="w-full rounded-xl border border-white/5 bg-secondary px-4 py-3 text-sm focus:border-cyan/30 focus:outline-none" /><input type="file" accept="image/*" onChange={onBannerFile} className="w-full rounded-xl border border-white/5 bg-secondary px-4 py-3 text-sm" /><button type="button" onClick={onBannerSave} disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-cyan/10 px-4 py-2.5 text-xs font-black uppercase text-cyan disabled:opacity-40"><Camera className="h-3.5 w-3.5" /> Save Banner</button></div></div></div> : <CompactEmpty icon={Lock} title="Captain controls" text="Only the team captain can edit the team profile and assets." />}
      </Panel>
      <div className="space-y-6">
        <Panel title="Roster management" eyebrow={`${teamRosterFormat(team.roster_size)} team`}>
          {rosterLocked && (
            <div className="mb-4 flex items-start gap-3 rounded-xl border border-orange/20 bg-orange/[0.06] p-4">
              <Lock className="mt-0.5 h-4 w-4 shrink-0 text-orange" />
              <div><p className="text-xs font-black text-orange">Roster changes are locked</p><p className="mt-1 text-[11px] leading-5 text-vapor">This team is registered in an active tournament. Invites and removals unlock when the tournament roster is released.</p></div>
            </div>
          )}

          <div className="space-y-2">
            {members.map((member) => {
              const player = usersById[member.user_id] || {};
              const name = player.display_name || player.full_name || player.username || member.user_name || "Unnamed player";
              const isCaptainMember = member.role === "captain" || String(member.user_id) === String(team.captain_id);
              return (
                <div key={member.id} className="flex flex-col gap-3 rounded-xl border border-white/[0.06] bg-secondary/30 p-3 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <Link to={`/profile/${encodeURIComponent(player.id || member.user_id || member.user_name || "")}`} className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/[0.06] bg-background font-mono text-xs font-black text-cyan">
                      {player.avatar_url ? <img src={player.avatar_url} alt="" className="h-full w-full object-cover" /> : name.charAt(0).toUpperCase()}
                    </Link>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-black">{name}</p><span className={`rounded-md px-2 py-0.5 text-[8px] font-black uppercase tracking-wider ${isCaptainMember ? "bg-orange/10 text-orange" : "bg-white/5 text-vapor"}`}>{isCaptainMember ? "Captain" : "Member"}</span></div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1"><ActivisionIdLabel user={player} className="max-w-full" /><span className="text-[10px] font-black text-green">{formatMoney(playerEarnings(player))} earned</span></div>
                    </div>
                  </div>
                  {isCaptain && !isCaptainMember && (
                    <button type="button" onClick={() => onKick(member)} disabled={busy || rosterLocked} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-red-400/15 bg-red-500/[0.06] px-3 py-2 text-[10px] font-black uppercase tracking-wider text-red-300 transition-colors hover:border-red-400/30 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-35"><UserMinus className="h-3.5 w-3.5" /> Kick</button>
                  )}
                </div>
              );
            })}
          </div>

          {isCaptain ? (
            <button type="button" onClick={onInvite} disabled={busy || rosterLocked || rosterFull} className="mt-4 flex w-full items-center justify-between rounded-xl border border-cyan/15 bg-cyan/[0.05] p-4 text-left transition-colors hover:border-cyan/30 disabled:cursor-not-allowed disabled:opacity-40">
              <span className="flex min-w-0 items-center gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan/10 text-cyan"><UserPlus className="h-4 w-4" /></span><span className="min-w-0"><span className="block text-sm font-black">{rosterFull ? "Roster is full" : "Invite a player"}</span><span className="mt-1 block truncate text-xs text-vapor">{rosterFull ? `${members.length}/${rosterLimit} player slots are filled.` : "Search by username, email or user ID."}</span></span></span><ArrowRight className="h-4 w-4 shrink-0 text-cyan" />
            </button>
          ) : <p className="mt-4 text-sm text-vapor">Your role: <span className="font-bold capitalize text-white">{membership?.role || "member"}</span></p>}
        </Panel>
        <Panel title="Team information" eyebrow="Roster identity"><div className="grid grid-cols-2 gap-3"><MiniMetric label="Team ID" value={String(team.id).slice(0, 8)} /><MiniMetric label="Created" value={formatDate(team.created_date)} /><MiniMetric label="Region" value={String(team.region || "-").toUpperCase()} /><MiniMetric label="Format" value={teamRosterFormat(team.roster_size)} /></div></Panel>
        <section className="rounded-2xl border border-red-500/10 bg-red-500/[0.025] p-5"><p className="text-[10px] font-black uppercase tracking-wider text-red-300">Danger zone</p><p className="mt-2 text-xs leading-5 text-vapor">Leaving or disbanding removes access to this roster. Tournament-locked rosters cannot be changed.</p><div className="mt-4 flex flex-wrap gap-2">{!isCaptain && <button onClick={onLeave} disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-secondary px-4 py-2.5 text-xs font-black text-vapor disabled:opacity-40"><LogOut className="h-3.5 w-3.5" /> Leave Team</button>}{isCaptain && <button onClick={onDisband} disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-red-500/10 px-4 py-2.5 text-xs font-black text-red-400 disabled:opacity-40"><Trash2 className="h-3.5 w-3.5" /> Disband Team</button>}</div></section>
      </div>
    </div>
  );
}

function InvitePlayerModal({ isOpen, onClose, team, value, onChange, onSubmit, busy }) {
  return (
    <AnimatePresence>{isOpen && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4" onClick={onClose}><motion.form initial={{ opacity: 0, y: 10, scale: 0.99 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 6, scale: 0.99 }} transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }} onSubmit={onSubmit} onClick={(event) => event.stopPropagation()} className="w-full max-w-md transform-gpu rounded-2xl border border-white/10 bg-card p-6 shadow-[0_24px_70px_rgba(0,0,0,.5)]"><div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan">Roster invite</p><h2 className="mt-1 text-xl font-black">Invite to {team?.name}</h2><p className="mt-1 text-xs text-vapor">The player receives an invitation they can accept from My Teams.</p></div><button type="button" onClick={onClose} className="rounded-lg p-2 text-vapor hover:bg-white/5"><X className="h-4 w-4" /></button></div><label className="mt-6 block"><FieldLabel>Username, email or user ID</FieldLabel><input autoFocus value={value} onChange={(event) => onChange(event.target.value)} placeholder="Find a TopFragg player" className="mt-2 w-full rounded-xl border border-white/5 bg-secondary px-4 py-3 text-sm focus:border-cyan/30 focus:outline-none" /></label><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-lg bg-secondary px-4 py-2.5 text-xs font-black text-vapor">Cancel</button><button disabled={busy || !value.trim()} className="inline-flex items-center gap-2 rounded-lg bg-cyan px-4 py-2.5 text-xs font-black text-background disabled:opacity-40"><UserPlus className="h-3.5 w-3.5" /> Send Invite</button></div></motion.form></motion.div>}</AnimatePresence>
  );
}

function Panel({ title, eyebrow, action, children }) {
  return <section className="rounded-2xl border border-white/5 bg-card/75 p-5 shadow-[0_18px_45px_-34px_rgba(0,0,0,.95)] sm:p-6"><div className="mb-5 flex items-center justify-between gap-4"><div><p className="text-[10px] font-black uppercase tracking-wider text-cyan/75">{eyebrow}</p><h2 className="mt-1 text-lg font-black">{title}</h2></div>{action}</div>{children}</section>;
}

function HeroMetric({ icon: Icon, label, value, tone }) {
  return <div className="rounded-2xl border border-white/5 bg-background/55 p-4"><div className="flex items-center justify-between gap-2"><p className="text-[9px] font-black uppercase tracking-wider text-vapor">{label}</p><Icon className={`h-4 w-4 ${tone}`} /></div><p className={`mt-3 truncate font-mono text-xl font-black ${tone}`}>{value}</p></div>;
}

function MiniMetric({ label, value }) {
  return <div className="min-w-0 rounded-lg border border-white/5 bg-background/35 px-3 py-2"><p className="text-[8px] font-black uppercase tracking-wider text-vapor">{label}</p><p className="mt-1 truncate text-xs font-black text-white">{value}</p></div>;
}

function TeamPill({ icon: Icon, text, emphasized = false, tone = "cyan" }) {
  const style = tone === "orange" ? "border-orange/20 bg-orange/10 text-orange" : emphasized ? "border-cyan/25 bg-cyan/15 text-cyan" : "border-white/10 bg-white/[0.04] text-vapor";
  return <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[9px] font-black uppercase tracking-wider ${style}`}><Icon className="h-3 w-3" /> {text}</span>;
}

function FieldLabel({ children }) {
  return <span className="block text-[10px] font-black uppercase tracking-wider text-vapor">{children}</span>;
}

function CompactEmpty({ icon: Icon, title, text }) {
  return <div className="flex min-h-40 flex-col items-center justify-center rounded-xl border border-dashed border-white/10 bg-white/[0.01] p-6 text-center"><Icon className="h-7 w-7 text-vapor/30" /><p className="mt-3 text-sm font-black">{title}</p><p className="mt-1 max-w-xs text-xs leading-5 text-vapor">{text}</p></div>;
}

function EmptyState({ icon: Icon, title, description, action }) {
  return <div className="rounded-3xl border border-dashed border-white/10 bg-card/50 px-6 py-16 text-center"><span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan/10 text-cyan"><Icon className="h-6 w-6" /></span><h2 className="mt-5 text-xl font-black">{title}</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-vapor">{description}</p>{action && <div className="mt-6">{action}</div>}</div>;
}
