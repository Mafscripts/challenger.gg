import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  Coins,
  Crown,
  Gamepad2,
  Globe2,
  Layers3,
  Loader2,
  LogOut,
  Medal,
  Monitor,
  ShieldCheck,
  Trophy,
  Users,
  X,
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/use-toast";
import ActivisionIdNotice from "@/components/competition/ActivisionIdNotice";
import CreateTeamModal from "@/components/teams/CreateTeamModal";
import TournamentJoinModal from "@/components/tournaments/TournamentJoinModal";
import PageLoader from "@/components/ui/PageLoader";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { activisionIdRequiredMessage, hasActivisionId } from "@/lib/activision";
import { teamRosterFormat } from "@/lib/teamFormats";

const BLACK_OPS_7_ART = "/assets/tournaments/black-ops-7.webp";

const statusLabels = {
  draft: "Draft",
  open: "Open",
  registration: "Registration open",
  closed: "Closed",
  live: "Live",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

const modeLabels = {
  bo1_snd: "Best of 1 Search & Destroy",
  snd_hp_snd: "Best of 3 Search & Destroy / Hardpoint / Search & Destroy",
  bo3_hp_overload_snd: "Best of 3 Hardpoint / Overload / Search & Destroy",
  bo5_hp_overload_snd_hp_snd: "Best of 5 Hardpoint / Overload / Search & Destroy / Hardpoint / Search & Destroy",
  snd: "Best of 3 Search & Destroy",
  overload: "Best of 3 Overload",
  hp: "Best of 3 Hardpoint",
};

const formatMoney = (value) => `$${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const formatDate = (value) => {
  if (!value) return "To be announced";
  return new Date(value).toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};
const formatShortDate = (value) => {
  if (!value) return "TBA";
  return new Date(value).toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
};
const rosterSize = (teamSize) => Number.parseInt(String(teamSize || "1v1").split("v")[0], 10) || 1;
const imageForTournament = (tournament) => {
  const identity = `${tournament?.name || ""} ${tournament?.game || ""} ${tournament?.game_name || ""}`.toLowerCase();
  if (identity.includes("black ops 7") || identity.includes("test tournament")) return BLACK_OPS_7_ART;
  return tournament?.banner_url || tournament?.cover_image_url || tournament?.image_url || BLACK_OPS_7_ART;
};
const entryType = (tournament) => String(
  tournament?.entry_type
  || (tournament?.is_premium_only ? "premium" : (Number(tournament?.entry_fee || 0) > 0 ? "credits" : "free")),
).toLowerCase();
const entryLabel = (tournament) => {
  const type = entryType(tournament);
  if (type === "invitational" || tournament?.invite_only) return "Invite only";
  if (type === "premium") return "Premium entry";
  if (type === "credits_premium") return `${Number(tournament?.entry_fee || 0).toLocaleString()} Credits + Premium`;
  if (type === "credits") return `${Number(tournament?.entry_fee || 0).toLocaleString()} Credits`;
  return "Free entry";
};
const canJoin = (tournament, joined, user) => {
  if (!tournament || joined) return false;
  const inviteOnly = tournament.invite_only || entryType(tournament) === "invitational";
  const invited = (tournament.invited_user_ids || []).map(String).includes(String(user?.id || ""));
  const hasSpace = !Number(tournament.max_teams || 0) || Number(tournament.registered_teams || 0) < Number(tournament.max_teams || 0);
  return ["open", "registration"].includes(tournament.status) && hasSpace && (!inviteOnly || invited);
};
const canLeave = (tournament, matches) => Boolean(
  tournament
  && ["open", "registration"].includes(tournament.status)
  && tournament.registration_locked !== true
  && tournament.bracket_generated !== true
  && matches.length === 0
);
const refundForUser = (participant, userId, tournament) => {
  const allocation = (participant?.payment_allocations || []).find((item) => String(item?.user_id) === String(userId || ""));
  if (allocation) return Number(allocation.amount || 0);
  if (participant?.payment_mode === "full_team" && String(participant?.captain_id) === String(userId || "")) {
    return Number(participant?.entry_fee_paid || 0);
  }
  return Number(tournament?.entry_fee || 0);
};

function Countdown({ value, now, status, expiredLabel = "Closed" }) {
  const target = new Date(value || "").getTime();
  const difference = target - now;
  if (!Number.isFinite(target)) return <span className="font-mono text-sm font-black text-vapor">TBA</span>;
  if (difference <= 0) {
    const normalizedStatus = String(status || "").toLowerCase();
    if (["live", "in_progress"].includes(normalizedStatus)) {
      return <span className="font-mono text-sm font-black text-orange">Live now</span>;
    }
    if (normalizedStatus === "completed") {
      return <span className="font-mono text-sm font-black text-green">Completed</span>;
    }
    return <span className="font-mono text-sm font-black text-vapor">{expiredLabel}</span>;
  }
  const totalSeconds = Math.floor(difference / 1000);
  const units = [
    [Math.floor(totalSeconds / 86400), "D"],
    [Math.floor((totalSeconds % 86400) / 3600), "H"],
    [Math.floor((totalSeconds % 3600) / 60), "M"],
    [totalSeconds % 60, "S"],
  ];
  return (
    <div className="flex items-baseline gap-1.5 font-mono">
      {units.map(([number, label], index) => (
        <React.Fragment key={label}>
          {index > 0 && <span className="text-xs font-black text-cyan/35">:</span>}
          <span className="text-base font-black text-cyan">{String(number).padStart(2, "0")}<small className="ml-0.5 text-[8px] text-vapor">{label}</small></span>
        </React.Fragment>
      ))}
    </div>
  );
}

function PrizeCard({ place, amount, color, icon: Icon = Trophy }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-background/30 px-4 py-5 text-center">
      <Icon className={`mx-auto h-5 w-5 ${color}`} />
      <p className="mt-3 text-[9px] font-black uppercase tracking-[0.16em] text-vapor">{place}</p>
      <p className="mt-1 font-mono text-lg font-black text-white">{formatMoney(amount)}</p>
    </div>
  );
}

function DetailRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-3 border-b border-white/[0.06] py-3 last:border-b-0">
      <Icon className="h-4 w-4 shrink-0 text-vapor/60" />
      <span className="min-w-24 text-xs text-vapor">{label}</span>
      <span className="ml-auto text-right text-xs font-black text-white">{value}</span>
    </div>
  );
}

const rosterMemberName = (member) => member?.display_name || member?.user_name || member?.username || member?.full_name || "Player";

function TournamentRosterPlayerCard({ player, captain }) {
  const wins = Number(player?.total_wins ?? player?.wins ?? 0);
  const losses = Number(player?.total_losses ?? player?.losses ?? 0);
  const avatar = player?.avatar_url || "";
  return (
    <article className="overflow-hidden rounded-xl border border-white/[0.08] bg-background/40 p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-cyan/20 bg-cyan/10 font-mono text-sm font-black text-cyan">
          {avatar ? <img src={avatar} alt="" className="h-full w-full object-cover" /> : rosterMemberName(player).slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5"><p className="truncate text-sm font-black text-white">{rosterMemberName(player)}</p>{captain && <Crown className="h-3.5 w-3.5 shrink-0 text-yellow-300" aria-label="Team captain" />}</div>
          <p className="mt-1 truncate font-mono text-[10px] text-vapor">{player?.activision_id || player?.handle || player?.username || "Topfragg player"}</p>
        </div>
        <div className="rounded-lg border border-cyan/15 bg-cyan/[0.06] px-2.5 py-1.5 text-center"><p className="font-mono text-sm font-black text-cyan">{Number(player?.elo || 0).toLocaleString()}</p><p className="text-[7px] font-black uppercase tracking-wider text-vapor">ELO</p></div>
      </div>
      <div className="mt-3 grid grid-cols-3 overflow-hidden rounded-lg border border-white/[0.06] bg-black/15 text-center">
        <div className="px-2 py-2"><p className="text-[7px] font-black uppercase tracking-wider text-vapor">Wins</p><p className="mt-1 font-mono text-xs font-black text-green">{wins}</p></div>
        <div className="border-x border-white/[0.06] px-2 py-2"><p className="text-[7px] font-black uppercase tracking-wider text-vapor">Losses</p><p className="mt-1 font-mono text-xs font-black text-white">{losses}</p></div>
        <div className="px-2 py-2"><p className="text-[7px] font-black uppercase tracking-wider text-vapor">Level</p><p className="mt-1 font-mono text-xs font-black text-cyan">{player?.xp_level || 1}</p></div>
      </div>
    </article>
  );
}

function BracketPreview({ matches }) {
  const rounds = useMemo(() => {
    const groups = new Map();
    matches.forEach((match) => {
      const key = `${match.bracket || "winner"}-${match.round || 1}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(match);
    });
    return [...groups.entries()];
  }, [matches]);

  if (!rounds.length) {
    return (
      <div className="rounded-xl border border-dashed border-white/10 bg-card/35 px-5 py-16 text-center">
        <Layers3 className="mx-auto h-9 w-9 text-vapor/25" />
        <p className="mt-3 text-sm font-black">Bracket not generated yet</p>
        <p className="mt-1 text-xs text-vapor">The bracket appears here as soon as registration is locked.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-white/[0.07] bg-card/35 p-4">
      <div className="grid min-w-max gap-5" style={{ gridTemplateColumns: `repeat(${rounds.length}, minmax(210px, 1fr))` }}>
        {rounds.map(([key, roundMatches]) => (
          <div key={key} className="space-y-3">
            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-cyan">{key.replace("-", " · Round ")}</p>
            {roundMatches.map((match) => (
              <Link key={match.id} to={`/tournament-match/${match.id}`} className="block rounded-lg border border-white/[0.07] bg-background/60 p-3 transition-colors hover:border-cyan/25">
                <div className="flex items-center justify-between gap-3 border-b border-white/[0.05] pb-2 text-xs font-bold"><span className="truncate">{match.team_a_name || "TBD"}</span><span>{match.team_a_score ?? "—"}</span></div>
                <div className="flex items-center justify-between gap-3 pt-2 text-xs font-bold"><span className="truncate">{match.team_b_name || "TBD"}</span><span>{match.team_b_score ?? "—"}</span></div>
              </Link>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function TournamentOverview() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tournament, setTournament] = useState(null);
  const [user, setUser] = useState(null);
  const [teams, setTeams] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const [activeTab, setActiveTab] = useState("overview");
  const [joinOpen, setJoinOpen] = useState(false);
  const [createTeamOpen, setCreateTeamOpen] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [sponsoredMemberIds, setSponsoredMemberIds] = useState([]);
  const [joining, setJoining] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const [refundResult, setRefundResult] = useState(null);
  const [joined, setJoined] = useState(false);
  const [selectedParticipantId, setSelectedParticipantId] = useState(null);
  const [rosterPlayers, setRosterPlayers] = useState([]);
  const [rosterLoading, setRosterLoading] = useState(false);

  const selectedParticipant = useMemo(() => (
    participants.find((participant) => String(participant.id) === String(selectedParticipantId)) || null
  ), [participants, selectedParticipantId]);

  useEffect(() => {
    if (!selectedParticipant) {
      setRosterPlayers([]);
      setRosterLoading(false);
      return undefined;
    }

    let cancelled = false;
    const members = Array.isArray(selectedParticipant.members) && selectedParticipant.members.length
      ? selectedParticipant.members
      : [{
        user_id: selectedParticipant.user_id || selectedParticipant.captain_id,
        user_name: selectedParticipant.player_name || selectedParticipant.captain_name || selectedParticipant.team_name,
      }];

    setRosterLoading(true);
    Promise.all(members.map(async (member) => {
      const userId = member?.user_id;
      if (!userId) return member;
      const [userRow, profileRows] = await Promise.all([
        base44.entities.User.get(userId).catch(() => null),
        base44.entities.PlayerProfile.filterFresh({ user_id: userId }, "-created_date", 1).catch(() => []),
      ]);
      return { ...member, ...(profileRows?.[0] || {}), ...(userRow || {}) };
    })).then((players) => {
      if (!cancelled) setRosterPlayers(players);
    }).finally(() => {
      if (!cancelled) setRosterLoading(false);
    });

    return () => { cancelled = true; };
  }, [selectedParticipant]);

  const loadTeams = async (currentUser) => {
    if (!currentUser?.id) return [];
    const memberships = await base44.entities.TeamMember.filter({ user_id: currentUser.id }, "-joined_date", 30).catch(() => []);
    const loadedTeams = await Promise.all((memberships || []).filter((membership) => membership.is_active !== false).map(async (membership) => {
      const team = await base44.entities.Team.get(membership.team_id).catch(() => null);
      const members = team ? await base44.entities.TeamMember.filter({ team_id: team.id }, "-joined_date", 30).catch(() => []) : [];
      return team ? { ...team, membership, members: members.filter((member) => member.is_active !== false) } : null;
    }));
    return loadedTeams.filter((team) => team && team.team_type === "tournament" && team.captain_id === currentUser.id);
  };

  const loadPage = async () => {
    try {
      setLoading(true);
      const currentUserPromise = base44.auth.me().catch(() => null);
      const participantRowsPromise = base44.entities.TournamentParticipant.filterFresh({ tournament_id: id }, "seed", 256).catch(() => []);
      const matchRowsPromise = base44.entities.TournamentMatch.filterFresh({ tournament_id: id }, "round", 256).catch(() => []);
      const tournamentRow = await base44.entities.Tournament.get(id);
      setTournament(tournamentRow);
      // Team memberships and bracket data are useful after the first paint,
      // but should not keep the tournament header behind a full-page loader.
      setLoading(false);

      const [currentUser, participantRows, matchRows] = await Promise.all([
        currentUserPromise,
        participantRowsPromise,
        matchRowsPromise,
      ]);
      setUser(currentUser);
      setParticipants(participantRows || []);
      setMatches(matchRows || []);
      const availableTeams = await loadTeams(currentUser);
      setTeams(availableTeams);
      const userJoined = (participantRows || []).some((participant) => (
        participant.captain_id === currentUser?.id
        || participant.user_id === currentUser?.id
        || (participant.members || []).some((member) => member.user_id === currentUser?.id)
      ));
      setJoined(userJoined);
      if (searchParams.get("join") === "1" && canJoin(tournamentRow, userJoined, currentUser)) setJoinOpen(true);
    } catch (error) {
      console.error("Failed to load tournament overview:", error);
      toast({ title: "Tournament unavailable", description: "This tournament could not be loaded.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPage();
  }, [id]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const openJoin = () => {
    if (!user?.id) {
      navigate("/login");
      return;
    }
    setJoinOpen(true);
  };

  const handleJoin = async () => {
    if (!hasActivisionId(user)) {
      toast({ title: "Activision ID required", description: activisionIdRequiredMessage, variant: "destructive" });
      return;
    }
    if (!selectedTeamId || !canJoin(tournament, joined, user)) return;
    setJoining(true);
    try {
      const response = await base44.functions.invoke("registerTournament", {
        tournament_id: tournament.id,
        team_id: selectedTeamId,
        sponsored_member_ids: entryType(tournament) === "free" ? [] : sponsoredMemberIds,
      });
      if (!response.data?.success) {
        toast({ title: "Join failed", description: response.data?.error || "Could not join tournament.", variant: "destructive" });
        return;
      }
      setJoined(true);
      if (response.data.participant) {
        setParticipants((current) => (
          current.some((participant) => participant.id === response.data.participant.id)
            ? current
            : [...current, response.data.participant]
        ));
      }
      setJoinOpen(false);
      setTournament((current) => ({ ...current, registered_teams: Number(current.registered_teams || 0) + 1 }));
      window.dispatchEvent(new CustomEvent("topfragg:credits-updated"));
      window.dispatchEvent(new CustomEvent("topfragg:notifications-updated", { detail: { refresh: true } }));
      toast({ title: "Tournament joined", description: `${response.data.participant?.team_name || "Your team"} is registered.` });
    } catch (error) {
      toast({ title: "Join failed", description: error.message || "Could not join tournament.", variant: "destructive" });
    } finally {
      setJoining(false);
    }
  };

  const handleLeave = async () => {
    if (!user?.id || !tournament || leaving) return;
    const participant = participants.find((row) => (
      row.captain_id === user.id
      || row.user_id === user.id
      || (row.members || []).some((member) => member.user_id === user.id)
    ));
    if (!participant || participant.captain_id !== user.id) {
      toast({ title: "Captain required", description: "Only the team captain can leave a tournament.", variant: "destructive" });
      return;
    }

    setLeaving(true);
    try {
      const response = await base44.functions.invoke("leaveTournament", {
        tournament_id: tournament.id,
        participant_id: participant.id,
      });
      if (!response.data?.success) {
        toast({ title: "Leave failed", description: response.data?.error || "Could not leave tournament.", variant: "destructive" });
        return;
      }

      setJoined(false);
      setParticipants((current) => current.filter((row) => row.id !== participant.id));
      setTournament((current) => ({
        ...current,
        registered_teams: response.data.tournament?.registered_teams ?? Math.max(0, Number(current.registered_teams || 0) - 1),
      }));
      const refunds = response.data.refunds || [];
      const fullTeamRefund = participant.payment_mode === "full_team";
      const personalRefund = refunds.find((refund) => String(refund.user_id) === String(user.id));
      if (personalRefund) {
        setUser((current) => ({ ...current, credits: Number(current?.credits || 0) + Number(personalRefund.amount || 0) }));
      }
      window.dispatchEvent(new CustomEvent("topfragg:credits-updated"));
      setRefundResult({
        credits: fullTeamRefund
          ? refunds.reduce((total, refund) => total + Number(refund.amount || 0), 0)
          : Number(personalRefund?.amount || 0),
        fullTeam: fullTeamRefund,
      });
    } catch (error) {
      toast({ title: "Leave failed", description: error.message || "Could not leave tournament.", variant: "destructive" });
    } finally {
      setLeaving(false);
    }
  };

  const handleTeamCreated = async (team) => {
    // Entity reads can briefly lag behind a successful create. Keep the new
    // team in this chooser immediately so the player is not sent back to
    // "Create team" again, including on free tournaments.
    const createdTeam = {
      ...team,
      membership: { user_id: user?.id, team_id: team.id, is_active: true, role: "captain" },
      members: [{
        user_id: user?.id,
        user_name: user?.display_name || user?.username || user?.full_name || user?.email || "Captain",
        role: "captain",
        is_active: true,
      }],
    };
    setTeams((current) => current.some((row) => row.id === team.id) ? current : [...current, createdTeam]);
    setSelectedTeamId(team.id);
    setSponsoredMemberIds([]);
    setCreateTeamOpen(false);
    setJoinOpen(true);

    const refreshedTeams = await loadTeams(user);
    setTeams((current) => {
      const next = refreshedTeams.some((row) => row.id === team.id)
        ? refreshedTeams
        : [...refreshedTeams, createdTeam];
      return next;
    });
  };

  if (loading) {
    return <PageLoader label="Loading tournament" />;
  }
  if (!tournament) {
    return (
      <div className="mx-auto flex min-h-[65vh] max-w-xl flex-col items-center justify-center px-5 text-center">
        <Trophy className="h-10 w-10 text-vapor/25" />
        <h1 className="mt-4 text-2xl font-black">Tournament not found</h1>
        <Link to="/tournaments" className="mt-5 rounded-xl bg-orange px-5 py-3 text-xs font-black uppercase tracking-wider text-white">Back to tournaments</Link>
      </div>
    );
  }

  const joinAvailable = canJoin(tournament, joined, user);
  const joinedParticipant = participants.find((participant) => (
    participant.captain_id === user?.id
    || participant.user_id === user?.id
    || (participant.members || []).some((member) => member.user_id === user?.id)
  ));
  const leaveAvailable = joinedParticipant?.captain_id === user?.id && canLeave(tournament, matches);
  const distribution = tournament.prize_distribution || {};
  const firstPrize = Number(distribution.first_amount ?? distribution.first ?? tournament.first_place_prize ?? tournament.prize_pool ?? 0);
  const secondPrize = Number(distribution.second_amount ?? distribution.second ?? tournament.second_place_prize ?? 0);
  const thirdPrize = Number(distribution.third_amount ?? distribution.third ?? tournament.third_place_prize ?? 0);
  const registrationDate = tournament.registration_end || tournament.start_date;
  const gameName = tournament.game || tournament.game_name || "Call of Duty: Black Ops 7";
  const modeName = modeLabels[tournament.game_mode] || tournament.game_mode || "Search & Destroy";

  return (
    <div className="min-h-screen pb-16">
      <section className="relative overflow-hidden border-b border-white/[0.07] bg-card/40">
        <img src={imageForTournament(tournament)} alt="" className="absolute inset-0 h-full w-full scale-105 object-cover opacity-20 blur-[1px]" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,hsl(var(--background))_0%,rgba(8,12,18,.91)_48%,rgba(8,12,18,.68)_100%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_76%_20%,rgba(255,130,0,.12),transparent_33%),linear-gradient(180deg,transparent,rgba(8,12,18,.88))]" />
        <div className="relative mx-auto max-w-[1500px] px-4 py-7 lg:px-8 lg:py-12">
          <Link to="/tournaments" className="mb-8 inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.14em] text-vapor transition-colors hover:text-white"><ArrowLeft className="h-3.5 w-3.5" /> All tournaments</Link>
          <div className="grid gap-7 lg:grid-cols-[150px_minmax(0,1fr)_240px] lg:items-end">
            <div className="h-44 w-36 overflow-hidden rounded-xl border border-white/10 bg-background shadow-2xl sm:h-48 sm:w-40">
              <img src={imageForTournament(tournament)} alt={`${gameName} artwork`} className="h-full w-full object-cover" />
            </div>
            <div className="min-w-0 pb-1">
              <div className="flex flex-wrap items-center gap-2 text-[9px] font-black uppercase tracking-[0.15em]">
                <span className="rounded-md bg-orange px-2.5 py-1 text-white">{statusLabels[tournament.status] || tournament.status}</span>
                <span className="text-vapor">{gameName}</span>
                <span className="text-vapor/35">·</span>
                <span className="text-vapor">{formatShortDate(tournament.start_date)}</span>
              </div>
              <h1 className="mt-4 max-w-4xl text-3xl font-black leading-tight tracking-[-0.035em] text-white sm:text-4xl lg:text-5xl">{tournament.name}</h1>
              <p className="mt-3 text-xs font-bold text-vapor sm:text-sm">{tournament.team_size || "1v1"} <span className="px-2 text-white/20">|</span> {tournament.region?.toUpperCase() || "NA + EU"} <span className="px-2 text-white/20">|</span> {entryLabel(tournament)}</p>
              <div className="mt-5 flex items-center gap-3">
                <span className="text-[10px] font-black uppercase tracking-wider text-vapor">Starts in</span>
                <Countdown value={tournament.start_date} now={now} status={tournament.status} expiredLabel="Starting" />
              </div>
            </div>
            <div className="space-y-3">
              {joined ? (
                <div className="grid gap-2">
                  <div className="flex items-center justify-center gap-2 rounded-xl border border-green/20 bg-green/10 px-5 py-4 text-[10px] font-black uppercase tracking-wider text-green"><Check className="h-4 w-4" /> Tournament joined</div>
                  {leaveAvailable && (
                    <button type="button" onClick={() => { setRefundResult(null); setLeaveDialogOpen(true); }} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-red-500/25 bg-red-500/10 px-5 py-3 text-[10px] font-black uppercase tracking-[0.15em] text-red-300 transition-all hover:border-red-500/40 hover:bg-red-500/20">
                      <LogOut className="h-4 w-4" /> Leave tournament
                    </button>
                  )}
                </div>
              ) : joinAvailable ? (
                <button type="button" onClick={openJoin} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-orange px-5 py-4 text-[10px] font-black uppercase tracking-[0.15em] text-white shadow-[0_14px_35px_rgba(255,130,0,.24)] transition-all hover:-translate-y-0.5 hover:bg-orange/90"><Users className="h-4 w-4" /> Join tournament</button>
              ) : (
                <div className="rounded-xl border border-white/[0.08] bg-background/55 px-5 py-4 text-center text-[10px] font-black uppercase tracking-wider text-vapor">Registration unavailable</div>
              )}
              <div className="flex items-center justify-center gap-2 text-[10px] text-vapor"><Users className="h-3.5 w-3.5 text-cyan" /> {tournament.registered_teams || participants.length}/{tournament.max_teams || "∞"} teams registered</div>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-[1500px] px-4 lg:px-8">
        <ActivisionIdNotice user={user} className="mt-5" />
        <div className="overflow-x-auto border-b border-white/[0.07]">
          <div className="flex min-w-max" role="tablist">
            {[["overview", "Overview"], ["bracket", "Bracket"], ["participants", `Participants ${participants.length}`], ["rules", "Rules"]].map(([value, label]) => (
              <button key={value} type="button" onClick={() => setActiveTab(value)} className={`relative px-5 py-5 text-[10px] font-black uppercase tracking-[0.13em] after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 ${activeTab === value ? "text-orange after:bg-orange" : "text-vapor after:bg-transparent hover:text-white"}`}>{label}</button>
            ))}
          </div>
        </div>

        {activeTab === "overview" && (
          <div className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,1fr)_310px]">
            <div className="space-y-7">
              <section>
                <div className="mb-3 flex items-center justify-between"><h2 className="text-base font-black">Prizes</h2><span className="font-mono text-lg font-black text-green">{formatMoney(tournament.prize_pool)}</span></div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <PrizeCard place="1st place" amount={firstPrize} color="text-yellow-300" />
                  <PrizeCard place="2nd place" amount={secondPrize} color="text-zinc-300" icon={Medal} />
                  <PrizeCard place="3rd place" amount={thirdPrize} color="text-orange" icon={Medal} />
                </div>
              </section>

              <section>
                <h2 className="mb-3 text-base font-black">Schedule</h2>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-xl border border-white/[0.07] bg-card/45 p-5">
                    <p className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.15em] text-vapor"><span className="h-1.5 w-1.5 rounded-full bg-cyan" /> Registration closes</p>
                    <div className="mt-4 flex items-end justify-between gap-4"><div><p className="text-sm font-black text-white">{formatDate(registrationDate)}</p><p className="mt-1 text-[10px] text-vapor">Secure your place before the deadline.</p></div><Countdown value={registrationDate} now={now} expiredLabel="Closed" /></div>
                  </div>
                  <div className="rounded-xl border border-orange/15 bg-[linear-gradient(145deg,rgba(255,130,0,.07),rgba(255,255,255,.015))] p-5">
                    <p className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.15em] text-vapor"><span className="h-1.5 w-1.5 rounded-full bg-orange" /> Tournament starts</p>
                    <div className="mt-4 flex items-end justify-between gap-4"><div><p className="text-sm font-black text-white">{formatDate(tournament.start_date)}</p><p className="mt-1 text-[10px] text-vapor">All teams must be match ready.</p></div><Countdown value={tournament.start_date} now={now} status={tournament.status} expiredLabel="Starting" /></div>
                    {joinAvailable && <button type="button" onClick={openJoin} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-orange px-4 py-3 text-[10px] font-black uppercase tracking-[0.14em] text-white transition-colors hover:bg-orange/90"><Users className="h-3.5 w-3.5" /> Join tournament</button>}
                  </div>
                </div>
              </section>

              <section>
                <h2 className="mb-3 text-base font-black">Details</h2>
                <div className="grid gap-x-8 rounded-xl border border-white/[0.07] bg-card/35 px-5 md:grid-cols-2">
                  <div><DetailRow icon={Gamepad2} label="Format" value={tournament.team_size || "1v1"} /><DetailRow icon={Globe2} label="Region" value={tournament.region?.toUpperCase() || "NA + EU"} /><DetailRow icon={CalendarDays} label="Starts" value={formatShortDate(tournament.start_date)} /><DetailRow icon={Users} label="Size" value={`${tournament.max_teams || "Open"} teams`} /></div>
                  <div><DetailRow icon={Monitor} label="Game" value={gameName} /><DetailRow icon={Layers3} label="Mode" value={modeName} /><DetailRow icon={ShieldCheck} label="Platform" value={tournament.platform || "Cross platform"} /><DetailRow icon={Trophy} label="Bracket" value={String(tournament.bracket_type || "Single elimination").replace(/_/g, " ")} /></div>
                </div>
              </section>
            </div>

            <aside className="space-y-5">
              <section>
                <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-black">Participants</h2><button type="button" onClick={() => setActiveTab("participants")} className="text-[9px] font-black uppercase tracking-wider text-orange hover:text-orange/80">View all</button></div>
                <div className="rounded-xl border border-white/[0.07] bg-card/45 p-4">
                  <div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan/10 text-cyan"><Users className="h-4 w-4" /></span><div><p className="font-mono text-lg font-black text-white">{tournament.registered_teams || participants.length}<span className="text-vapor">/{tournament.max_teams || "∞"}</span></p><p className="text-[9px] font-black uppercase tracking-wider text-vapor">Registered teams</p></div></div>
                </div>
              </section>
              <section>
                <h2 className="mb-3 text-sm font-black">Requirements</h2>
                <div className="overflow-hidden rounded-xl border border-white/[0.07] bg-card/45 px-4">
                  <DetailRow icon={Globe2} label="Region" value={tournament.region?.toUpperCase() || "NA + EU"} />
                  <DetailRow icon={Users} label="Team size" value={`${rosterSize(tournament.team_size)} players`} />
                  <DetailRow icon={Trophy} label="Entry" value={entryLabel(tournament)} />
                  <DetailRow icon={Clock3} label="Check-in" value={tournament.check_in_required ? "Required" : "Automatic"} />
                </div>
              </section>
            </aside>
          </div>
        )}

        {activeTab === "bracket" && <div className="mt-7"><BracketPreview matches={matches} /></div>}
        {activeTab === "participants" && (
          <div className="mt-7">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {participants.length ? participants.map((participant, index) => {
                const selected = String(selectedParticipantId) === String(participant.id);
                return (
                  <button
                    key={participant.id || index}
                    type="button"
                    onClick={() => setSelectedParticipantId(selected ? null : participant.id)}
                    aria-expanded={selected}
                    className={`group flex items-center gap-3 rounded-xl border p-4 text-left transition-all ${selected ? "border-cyan/40 bg-cyan/[0.08]" : "border-white/[0.07] bg-card/40 hover:border-cyan/25 hover:bg-cyan/[0.04]"}`}
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-cyan/10 font-mono text-xs font-black text-cyan">#{participant.seed || index + 1}</span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-black">{participant.team_name || participant.player_name || `Team ${index + 1}`}</span><span className="mt-1 block text-[10px] text-vapor">{participant.members?.length || participant.player_names?.length || rosterSize(tournament.team_size)} player roster · View players</span></span>
                    <ChevronRight className={`h-4 w-4 shrink-0 text-vapor transition-transform group-hover:text-cyan ${selected ? "rotate-90 text-cyan" : ""}`} />
                  </button>
                );
              }) : <div className="col-span-full rounded-xl border border-dashed border-white/10 px-5 py-14 text-center text-sm text-vapor">No teams registered yet.</div>}
            </div>

            {selectedParticipant && (
              <section className="mt-5 overflow-hidden rounded-xl border border-cyan/20 bg-card/50">
                <header className="flex items-center justify-between gap-4 border-b border-cyan/15 bg-cyan/[0.05] px-5 py-4">
                  <div><p className="text-[9px] font-black uppercase tracking-[0.18em] text-cyan">Team roster</p><h2 className="mt-1 text-lg font-black text-white">{selectedParticipant.team_name || selectedParticipant.player_name || "Tournament team"}</h2></div>
                  <button type="button" onClick={() => setSelectedParticipantId(null)} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-vapor transition-colors hover:border-cyan/30 hover:text-cyan" aria-label="Close roster"><X className="h-4 w-4" /></button>
                </header>
                <div className="p-4 sm:p-5">
                  {rosterLoading ? <div className="flex items-center justify-center gap-2 py-10 text-sm text-vapor"><Loader2 className="h-4 w-4 animate-spin text-cyan" /> Loading player cards…</div> : (
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {rosterPlayers.map((player, index) => <TournamentRosterPlayerCard key={player.user_id || player.id || index} player={player} captain={String(player.user_id || "") === String(selectedParticipant.captain_id || "")} />)}
                    </div>
                  )}
                </div>
              </section>
            )}
          </div>
        )}
        {activeTab === "rules" && (
          <div className="mt-7 rounded-xl border border-white/[0.07] bg-card/40 p-6"><p className="text-[9px] font-black uppercase tracking-[0.18em] text-orange">Tournament rules</p><h2 className="mt-2 text-xl font-black">Format and fair play</h2><div className="mt-5 whitespace-pre-wrap text-sm leading-7 text-vapor">{tournament.rules || tournament.rules_text || tournament.description || "This event follows the Topfragg competitive rules, match reporting process, and dispute policy."}</div><Link to="/rules" className="mt-6 inline-flex rounded-lg border border-white/10 bg-secondary px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-white hover:border-orange/25 hover:text-orange">View platform rules</Link></div>
        )}
      </div>

      <TournamentJoinModal
        isOpen={joinOpen}
        onClose={() => { setJoinOpen(false); if (searchParams.has("join")) setSearchParams({}, { replace: true }); }}
        tournament={tournament}
        teams={teams}
        selectedTeamId={selectedTeamId}
        onSelectTeam={(teamId) => { setSelectedTeamId(teamId); setSponsoredMemberIds([]); }}
        onCreateTeam={() => { setJoinOpen(false); setCreateTeamOpen(true); }}
        onJoin={handleJoin}
        joining={joining}
        sponsoredMemberIds={sponsoredMemberIds}
        onSponsoredMemberIdsChange={setSponsoredMemberIds}
        requiresCredits={["credits", "credits_premium"].includes(entryType(tournament)) && Number(tournament.entry_fee || 0) > 0}
      />
      <AlertDialog open={leaveDialogOpen} onOpenChange={(open) => {
        if (leaving) return;
        setLeaveDialogOpen(open);
        if (!open) setRefundResult(null);
      }}>
        <AlertDialogContent className="overflow-hidden border-white/10 bg-card p-0">
          {refundResult ? (
            <>
              <div className="border-b border-white/[0.07] bg-green/[0.06] px-6 py-7 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-green/25 bg-green/10 text-green"><Coins className="h-7 w-7" /></div>
                <AlertDialogTitle className="mt-4 text-xl font-black text-white">Credits refunded</AlertDialogTitle>
                <p className="mt-2 font-mono text-3xl font-black text-green">+{refundResult.credits.toLocaleString()} Credits</p>
              </div>
              <div className="px-6 pb-6">
                <AlertDialogDescription className="text-center leading-6 text-vapor">
                  {refundResult.credits > 0
                    ? refundResult.fullTeam
                      ? "The full team entry was refunded to your wallet."
                      : "Your payment was refunded to your wallet. Teammates receive their own refunds separately."
                    : "No credits were charged for this tournament entry."}
                </AlertDialogDescription>
                <AlertDialogAction onClick={() => setLeaveDialogOpen(false)} className="mt-5 w-full bg-green font-black uppercase tracking-wider text-background hover:bg-green/90">Done</AlertDialogAction>
              </div>
            </>
          ) : (
            <div className="p-6">
              <AlertDialogHeader>
                <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-xl border border-red-500/25 bg-red-500/10 text-red-300"><LogOut className="h-5 w-5" /></div>
                <AlertDialogTitle className="text-xl font-black">Leave tournament?</AlertDialogTitle>
                <AlertDialogDescription className="leading-6 text-vapor">Your team will be removed from {tournament.name}. This cannot be undone.</AlertDialogDescription>
              </AlertDialogHeader>
              <div className="my-5 flex items-center justify-between rounded-xl border border-green/20 bg-green/[0.07] px-4 py-3">
                <span className="flex items-center gap-2 text-xs font-bold text-vapor"><Coins className="h-4 w-4 text-green" /> Credits refunded</span>
                <span className="font-mono text-sm font-black text-green">{refundForUser(joinedParticipant, user?.id, tournament).toLocaleString()} Credits</span>
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={leaving}>Keep my spot</AlertDialogCancel>
                <AlertDialogAction onClick={(event) => { event.preventDefault(); handleLeave(); }} disabled={leaving} className="bg-red-500 font-black text-white hover:bg-red-500/90">
                  {leaving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Refunding...</> : "Leave & refund"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </div>
          )}
        </AlertDialogContent>
      </AlertDialog>
      <CreateTeamModal
        isOpen={createTeamOpen}
        onClose={() => { setCreateTeamOpen(false); setJoinOpen(true); }}
        onCreated={handleTeamCreated}
        user={user}
        defaultTeamType="tournament"
        defaultRosterSize={rosterSize(tournament.team_size)}
        lockTeamType
        title="Create Tournament Team"
        description={`Create a ${teamRosterFormat(rosterSize(tournament.team_size))} tournament roster with yourself as captain.`}
      />
    </div>
  );
}
