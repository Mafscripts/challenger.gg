import { playerDisplayName } from "@/lib/playerIdentity";
import PlayerCardEffects from "@/components/ui/PlayerCardEffects";
import { playerCardAppearance } from "@/lib/playerCards";
import "@/styles/player-cards.css";
import { competitionStreamRequiredMessage, hasCompetitionStream } from "@/lib/competitionStreaming";
import { loadPlayTeams } from "@/lib/playTeams";
import { tournamentPayoutPolicy } from "@/lib/tournamentPayoutPolicy";
import { tournamentFormat, tournamentPrizes, tournamentRegistration } from "@/lib/tournamentOverview";
import React, { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import useRouteSection from "@/hooks/useRouteSection";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CalendarDays,
  CheckCircle2,
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
  Radio,
  ShieldCheck,
  Trophy,
  Users,
  X,
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/use-toast";
import PageLoader from "@/components/ui/PageLoader";
import { tournamentGameId, tournamentGameName } from "@/lib/tournamentGames";
import TournamentOverviewBracket from "@/components/tournaments/TournamentOverviewBracket";
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
import CommercePausedNotice from "@/components/commerce/CommercePausedNotice";
import { publicCommerceEnabled } from "@/lib/commerce";
import "@/styles/tournament-overview.css";
import "@/styles/competition-presentation.css";

const CreateTeamModal = lazy(() => import("@/components/teams/CreateTeamModal"));
const TournamentJoinModal = lazy(() => import("@/components/tournaments/TournamentJoinModal"));

const BLACK_OPS_7_ART = "/assets/tournaments/black-ops-7.webp";

const formatMoney = (value) => `$${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const formatDate = (value) => {
  if (!value || !Number.isFinite(Date.parse(value))) return "To be announced";
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
  if (!value || !Number.isFinite(Date.parse(value))) return "To be announced";
  return new Date(value).toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
};
const rosterSize = (teamSize) => Number.parseInt(String(teamSize || "1v1").split("v")[0], 10) || 1;
const imageForTournament = (tournament) => {
  if (tournamentGameId(tournament) !== "bo7") {
    return tournament.banner_url || tournament.cover_image_url || tournament.image_url
      || (tournamentGameId(tournament) === "mw4" ? "/assets/mw4/hero.webp" : "/assets/competition/play-hero.png");
  }
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
const canJoin = (tournament, joined, user) => tournamentRegistration(tournament, { joined, user }).available;
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

function Countdown({ value, status, expiredLabel = "Closed" }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const target = Date.parse(value || "");
    if (!Number.isFinite(target) || target <= Date.now()) return;
    const refresh = () => { if (document.visibilityState !== "hidden") setNow(Date.now()); };
    const timer = window.setInterval(() => { refresh(); if (Date.now() >= target) window.clearInterval(timer); }, 1000);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", refresh); };
  }, [value]);
  const target = new Date(value || "").getTime();
  const difference = target - now;
  if (["cancelled", "completed", "live", "in_progress"].includes(status)) return <strong className="to-countdown-status">{status === "cancelled" ? "Cancelled" : status === "completed" ? "Completed" : "Live now"}</strong>;
  if (!Number.isFinite(target)) return <strong className="to-countdown-status">To be announced</strong>;
  if (difference <= 0) {
    return <strong className="to-countdown-status">{expiredLabel}</strong>;
  }
  const totalSeconds = Math.floor(difference / 1000);
  const units = [
    [Math.floor(totalSeconds / 86400), "D"],
    [Math.floor((totalSeconds % 86400) / 3600), "H"],
    [Math.floor((totalSeconds % 3600) / 60), "M"],
    [totalSeconds % 60, "S"],
  ];
  return (
    <div className="to-countdown">
      {units.map(([number, label]) => <span key={label}><strong>{String(number).padStart(2, "0")}</strong><small>{{ D: "days", H: "hrs", M: "min", S: "sec" }[label]}</small></span>)}
    </div>
  );
}

function PrizeCard({ place, amount, icon: Icon = Trophy }) {
  return (
    <div className="overview-panel overview-prize" data-place={place}>
      <Icon size={25} aria-hidden="true" />
      <div><p>{place}</p><strong>{formatMoney(amount)}</strong></div>
    </div>
  );
}

function DetailRow({ icon: Icon, label, value }) {
  return (
    <div className="overview-detail-row">
      <Icon size={16} aria-hidden="true" />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

const rosterMemberName = (member) => playerDisplayName(member);

function TournamentRosterPlayerCard({ player, captain }) {
  const wins = Number(player?.total_wins ?? player?.wins ?? 0);
  const losses = Number(player?.total_losses ?? player?.losses ?? 0);
  const avatar = player?.avatar_url || "";
  return (
    <article {...playerCardAppearance(player)} className="overview-panel overflow-hidden p-4"><PlayerCardEffects player={player} />
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-cyan/20 bg-cyan/10 font-mono text-sm font-black text-cyan">
          {avatar ? <img src={avatar} alt="" className="h-full w-full object-cover" /> : rosterMemberName(player).slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5"><p className="truncate text-sm font-black text-white">{rosterMemberName(player)}</p>{captain && <Crown className="h-3.5 w-3.5 shrink-0 text-yellow-300" aria-label="Team captain" />}</div>
          <p className="mt-1 truncate font-mono text-[10px] text-vapor">{player?.activision_id || "TopFragg player"}</p>
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
  const [loadError, setLoadError] = useState(false);
  const [accountReady, setAccountReady] = useState(false);
  const [registrationNow, setRegistrationNow] = useState(Date.now);
  const loadGeneration = useRef(0);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [participantsLoading, setParticipantsLoading] = useState(true);
  const [matchesLoading, setMatchesLoading] = useState(true);
  const [participantsError, setParticipantsError] = useState(false);
  const [matchesError, setMatchesError] = useState(false);
  const [activeTab, setActiveTab] = useRouteSection("tab", "overview", ["overview", "bracket", "participants", "rules"]);
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

  useEffect(() => {
    const deadline = Date.parse(tournament?.registration_end || tournament?.start_date || "");
    if (!Number.isFinite(deadline) || deadline <= registrationNow) return;
    const timer = window.setTimeout(() => setRegistrationNow(Date.now()), Math.min(deadline - Date.now() + 30, 2147483647));
    return () => window.clearTimeout(timer);
  }, [tournament?.registration_end, tournament?.start_date, registrationNow]);

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
    return (await loadPlayTeams(base44)).filter(team => team.team_type === "tournament" && team.captain_id === currentUser.id);
  };

  useEffect(() => {
    if (!joinOpen || !user?.id) return;
    let cancelled = false;
    setTeamsLoading(true);
    loadTeams(user).then(rows => { if (!cancelled) setTeams(rows); }).catch(error => {
      if (!cancelled) toast({ title: "Teams unavailable", description: error.message || "Please reopen registration to try again.", variant: "destructive" });
    }).finally(() => { if (!cancelled) setTeamsLoading(false); });
    return () => { cancelled = true; };
  }, [joinOpen, user?.id]);

  const loadPage = async () => {
    const generation = ++loadGeneration.current;
    const current = () => generation === loadGeneration.current;
    try {
      setLoading(true); setLoadError(false); setTournament(null); setUser(null); setAccountReady(false);
      setParticipantsLoading(true); setMatchesLoading(true); setParticipantsError(false); setMatchesError(false);
      setParticipants([]); setMatches([]); setTeams([]); setJoined(false); setSelectedParticipantId(null);
      setJoinOpen(false); setCreateTeamOpen(false); setLeaveDialogOpen(false); setSelectedTeamId(""); setSponsoredMemberIds([]);
      let participantsFailed = false;
      const currentUserPromise = base44.auth.me().catch(() => null).then(row => { if (current()) { setUser(row); setAccountReady(true); } return row; });
      const participantRowsPromise = base44.entities.TournamentParticipant.filterFresh({ tournament_id: id }, "seed", 256).catch(() => { participantsFailed = true; if (current()) setParticipantsError(true); return []; }).then(rows => {
        if (current()) { setParticipants(rows || []); setParticipantsLoading(false); }
        return rows || [];
      });
      void base44.entities.TournamentMatch.filterFresh({ tournament_id: id }, "round", 256).catch(() => { if (current()) setMatchesError(true); return []; }).then(rows => {
        if (current()) { setMatches(rows || []); setMatchesLoading(false); }
      });
      const tournamentRow = await base44.entities.Tournament.get(id);
      if (!current()) return;
      setTournament(tournamentRow); setLoading(false);
      const [currentUser, participantRows] = await Promise.all([currentUserPromise, participantRowsPromise]);
      if (!current()) return;
      const userJoined = Boolean(currentUser?.id) && participantRows.some(participant => participant.captain_id === currentUser?.id || participant.user_id === currentUser?.id
        || (participant.members || []).some(member => member.user_id === currentUser?.id));
      setJoined(userJoined);
      if (!participantsFailed && searchParams.get("join") === "1" && canJoin({ ...tournamentRow, registered_teams: tournamentRow.registered_teams ?? participantRows.length }, userJoined, currentUser)) {
        if (currentUser?.id) setJoinOpen(true);
        else navigate("/login");
      }
    } catch (error) {
      if (!current()) return;
      console.error("Failed to load tournament overview:", error);
      setLoadError(true);
      toast({ title: "Tournament unavailable", description: "This tournament could not be loaded.", variant: "destructive" });
    } finally { if (current()) setLoading(false); }
  };

  useEffect(() => {
    void loadPage();
    return () => { loadGeneration.current += 1; };
  }, [id]);

  const openJoin = () => {
    if (!user?.id) {
      navigate("/login");
      return;
    }
    setJoinOpen(true);
  };

  const handleJoin = async () => {
    if (!hasCompetitionStream(user)) {
      toast({ title: "Stream channel required", description: competitionStreamRequiredMessage, variant: "destructive" });
      return;
    }
    if (!hasActivisionId(user)) {
      toast({ title: "Activision ID required", description: activisionIdRequiredMessage, variant: "destructive" });
      return;
    }
    if (!selectedTeamId || participantsLoading || participantsError || !canJoin({ ...tournament, registered_teams: tournament.registered_teams ?? participants.length }, joined, user)) return;
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

  const handleTeamCreated = (team) => {
    // Entity reads can briefly lag behind a successful create. Keep the new
    // team in this chooser immediately so the player is not sent back to
    // "Create team" again, including on free tournaments.
    const createdTeam = {
      ...team,
      membership: { user_id: user?.id, team_id: team.id, is_active: true, role: "captain" },
      members: [{
        user_id: user?.id,
        user_name: playerDisplayName(user, "Captain"),
        role: "captain",
        is_active: true,
      }],
    };
    setTeams((current) => current.some((row) => row.id === team.id) ? current : [...current, createdTeam]);
    setSelectedTeamId(team.id);
    setSponsoredMemberIds([]);
    setCreateTeamOpen(false);
    setJoinOpen(true);


  };

  if (loading) {
    return <PageLoader label="Loading tournament" />;
  }
  if (!tournament) {
    return (
      <div className="mx-auto flex min-h-[65vh] max-w-xl flex-col items-center justify-center px-5 text-center">
        <Trophy className="h-10 w-10 text-vapor/25" />
        <h1 className="mt-4 text-2xl font-black">{loadError ? "Tournament could not be loaded" : "Tournament not found"}</h1>
        {loadError && <button type="button" onClick={loadPage} className="to-primary mt-5">Try again</button>}
        <Link to="/tournaments" className="mt-5 rounded-xl bg-orange px-5 py-3 text-xs font-black uppercase tracking-wider text-white">Back to tournaments</Link>
      </div>
    );
  }

  const registrationChecking = !accountReady || participantsLoading;
  const registeredTeams = Number(tournament.registered_teams ?? participants.length) || 0;
  const registration = tournamentRegistration({ ...tournament, registered_teams: registeredTeams }, { joined, user, now: registrationNow });
  const joinAvailable = registration.available && !registrationChecking && !participantsError;
  const joinedParticipant = participants.find((participant) => (
    participant.captain_id === user?.id
    || participant.user_id === user?.id
    || (participant.members || []).some((member) => member.user_id === user?.id)
  ));
  const leaveAvailable = joinedParticipant?.captain_id === user?.id && canLeave(tournament, matches);
  const prizes = tournamentPrizes(tournament);
  const registrationDate = tournament.registration_end || tournament.start_date;
  const gameName = tournamentGameName(tournament);
  const format = tournamentFormat(tournament);
  const capacity = Number(tournament.max_teams) || 0;
  const localTimeZone = Intl.DateTimeFormat(undefined, { timeZoneName: "short" }).formatToParts(new Date()).find(part => part.type === "timeZoneName")?.value || "your local time";
  const eventStatus = String(tournament.status || "").toLowerCase();
  const eventActive = ["live", "in_progress"].includes(eventStatus);
  const eventFinished = ["completed", "cancelled"].includes(eventStatus);
  const waitingToStart = !eventActive && !eventFinished && registration.status !== "draft";
  const statusLabel = eventActive ? "Tournament in progress" : eventFinished ? eventStatus === "completed" ? "Tournament completed" : "Tournament cancelled" : registration.status === "open" ? "Registration open" : registration.label;
  const countdownDate = registration.status === "open" ? registration.deadline : tournament.start_date;
  const moveSection = event => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const tabs = [...event.currentTarget.parentElement.querySelectorAll('[role="tab"]')];
    const index = tabs.indexOf(event.currentTarget);
    const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    event.preventDefault(); tabs[next]?.click(); tabs[next]?.focus();
  };

  return (
    <div className="tournament-overview competition-surface page-shell" data-competition="tournaments">
      <div className="page-container">
        <Link to="/tournaments" className="overview-back"><ArrowLeft size={15} />All tournaments</Link>
        <header className="to-hero overview-hero" data-game={tournamentGameId(tournament)}>
          <img className="to-hero-art" src={imageForTournament(tournament)} alt="" decoding="async" />
          <div className="to-hero-main">
            <div className="to-identity">
              <img className="to-cover" src={tournamentGameId(tournament) === "mw4" ? "/assets/mw4/tournament-cover.webp" : imageForTournament(tournament)} alt={gameName} width={224} height={315} decoding="async" />
              <div className="to-title-copy">
                <p className="to-eyebrow"><Trophy size={15} />Tournament</p>
                <h1>{tournament.name}</h1>
                <p className="to-game-label">{gameName}</p>
                <div className="to-tags"><span><Gamepad2 size={14} />{tournament.team_size || "1v1"}</span><span><Layers3 size={14} />{format.modesLabel}</span><span><Globe2 size={14} />{tournament.region?.toUpperCase() || "NA + EU"}</span></div>
              </div>
            </div>
            <aside className="to-registration" aria-label="Tournament registration">
              <span className="to-status" data-status={eventActive ? "live" : eventFinished ? eventStatus : registration.status}>{statusLabel}</span>
              <div className="to-seat-count"><Users size={18} /><strong>{registeredTeams}<span>{capacity ? ` / ${capacity}` : ""}</span></strong><small>teams registered</small></div>
              {capacity > 0 && <div className="to-capacity" role="meter" aria-label="Registered teams" aria-valuenow={Math.min(registeredTeams, capacity)} aria-valuemin={0} aria-valuemax={capacity}><span style={{ width: `${Math.min(100, registeredTeams / capacity * 100)}%` }} /></div>}
              {(waitingToStart || eventActive || eventFinished) && <div className="to-deadline"><span>{registration.status === "open" ? "Registration closes in" : waitingToStart ? "Starts in" : "Tournament status"}</span><Countdown key={countdownDate} value={countdownDate} status={eventStatus} expiredLabel="Awaiting start" /></div>}
              {registrationChecking ? <button className="to-primary" type="button" disabled><Loader2 size={16} className="animate-spin" />Checking registration...</button> : joined ? <div className="to-joined-actions"><div className="to-registered"><CheckCircle2 size={17} /><div><strong>Your team is registered</strong><span>{joinedParticipant?.team_name || joinedParticipant?.player_name || "You have a place in this tournament."}</span></div></div>{(eventActive || eventStatus === "completed") && <button type="button" className="to-primary" onClick={() => setActiveTab("bracket")}><Layers3 size={16} />View bracket<ArrowRight size={16} /></button>}</div> : joinAvailable ? <button type="button" onClick={openJoin} className="to-primary"><Users size={16} />{registration.label}<ArrowRight size={16} /></button> : ["live", "completed"].includes(registration.status) ? <button type="button" className="to-primary" onClick={() => setActiveTab("bracket")}><Layers3 size={16} />View bracket<ArrowRight size={16} /></button> : registration.status === "invite_only" && !user ? <Link className="to-primary" to="/login">Sign in to check your invite<ArrowRight size={16} /></Link> : null}
              {participantsError ? <div className="to-load-error" role="alert">Registration could not be checked.<button type="button" onClick={loadPage}>Try again</button></div> : !registrationChecking && <p className="to-action-hint">{eventActive ? "Follow the matches in the bracket." : eventFinished ? "Registration has ended." : joined ? "Keep your roster ready and follow the tournament rules." : registration.reason}</p>}
              {leaveAvailable && !matchesLoading && !matchesError && <button type="button" className="to-leave" onClick={() => { setRefundResult(null); setLeaveDialogOpen(true); }}><LogOut size={14} />Leave tournament</button>}
            </aside>
          </div>
          <div className="to-quick-facts">
            <div className="to-total-prize"><Trophy size={20} /><div><span>Total prize pool</span><strong>{formatMoney(tournament.prize_pool)}</strong><small>{entryLabel(tournament)}</small></div></div>
            <div><CalendarDays size={20} /><div><span>Tournament starts</span><strong>{formatShortDate(tournament.start_date)}</strong><small>Your local time · {localTimeZone}</small></div></div>
            <div><Layers3 size={20} /><div><span>Competition format</span><strong>{format.seriesLabel}</strong><small>{format.bracketLabel}</small></div></div>
          </div>
        </header>
      </div>

      <div className="page-container">
        {!publicCommerceEnabled && <CommercePausedNotice compact className="mt-5" />}
        <div className="overview-tabs arena-tabs mt-5">
          <div className="flex" role="tablist" aria-label="Tournament sections">
            {[["overview", "Overview", Trophy], ["bracket", "Bracket", Layers3], ["participants", `Teams ${registeredTeams}`, Users], ["rules", "Rules", BookOpen]].map(([value, label, Icon]) => (
              <button key={value} id={`tournament-tab-${value}`} aria-controls="tournament-section" type="button" onClick={() => setActiveTab(value)} onKeyDown={moveSection} role="tab" tabIndex={activeTab === value ? 0 : -1} aria-selected={activeTab === value} className="arena-tab"><Icon size={15} />{label}</button>
            ))}
          </div>
        </div>
        <div id="tournament-section" role="tabpanel" aria-labelledby={`tournament-tab-${activeTab}`}>
        {activeTab === "overview" && (
          <div className="to-overview-grid">
            <div className="to-main">
              <section className="to-section">
                <div className="to-section-heading"><div><h2><Trophy size={18} />Prize breakdown</h2><p>Announced prizes for the top placements.</p></div></div>
                {prizes.some(prize => prize.amount > 0) ? <div className="to-prize-grid">{prizes.filter(prize => prize.amount > 0).map(prize => <PrizeCard key={prize.place} place={prize.label} amount={prize.amount} icon={prize.place === 1 ? Trophy : Medal} />)}</div> : <div className="overview-panel to-no-prizes"><Trophy size={22} /><div><strong>No cash prizes announced</strong><p>Check the tournament rules for any additional rewards.</p></div></div>}
                <p className="to-prize-note"><button type="button" onClick={() => setActiveTab("rules")}>View prize payout details<ArrowRight size={13} /></button></p>
              </section>
              <section className="to-section">
                <div className="to-section-heading"><div><h2><CalendarDays size={18} />Schedule</h2><p>Plan your registration and be ready for the first match.</p></div></div>
                <div className="overview-panel to-timeline">
                  <div className="to-schedule-step"><span className="to-step-icon"><Users size={18} /></span><div><span>Registration closes</span><strong>{formatDate(registrationDate)}</strong><p>{joined ? "Your team is already registered." : "The captain registers the full team before this deadline."}</p></div></div>
                  <div className="to-schedule-step"><span className="to-step-icon"><Gamepad2 size={18} /></span><div><span>Tournament starts</span><strong>{formatDate(tournament.start_date)}</strong><p>{tournament.check_in_required ? "Check-in is required. Follow the tournament instructions before the start." : "Automatic check-in. Have your team and streams ready at the start."}</p></div></div>
                </div>
                <p className="to-timezone"><Clock3 size={12} />All times are shown in your local time ({localTimeZone}).</p>
              </section>
              <section className="to-section">
                <div className="to-section-heading"><div><h2><Gamepad2 size={18} />Event details</h2></div></div>
                <div className="overview-panel to-event-details"><DetailRow icon={Monitor} label="Game" value={gameName} /><DetailRow icon={Gamepad2} label="Teams" value={format.teamSizeLabel} /><DetailRow icon={Layers3} label="Game modes" value={format.modesLabel} /><DetailRow icon={Trophy} label="Series" value={format.seriesLabel} /><DetailRow icon={Globe2} label="Region" value={tournament.region?.toUpperCase() || "NA + EU"} /><DetailRow icon={ShieldCheck} label="Platform" value={tournament.platform || "Cross platform"} /></div>
              </section>
            </div>
            <aside>
              <section className="overview-panel to-readiness" aria-label="Entry requirements">
                <h2><ShieldCheck size={19} />Before you play</h2><p>Every player on your roster needs to be ready.</p>
                <ol className="to-checklist">
                  <li data-ready={joined ? "true" : "unknown"}>{joined ? <CheckCircle2 size={18} /> : <Users size={18} />}<div><strong>{joined ? "Team registered" : `${rosterSize(tournament.team_size)}-player team`}</strong><p>{joined ? joinedParticipant?.team_name || "Your roster has a place in this event." : "Your captain chooses the tournament team when joining."}</p></div></li>
                  <li data-ready={!user ? "unknown" : hasActivisionId(user) ? "true" : "false"}>{user && hasActivisionId(user) ? <CheckCircle2 size={18} /> : <Gamepad2 size={18} />}<div><strong>Activision ID</strong><p>{!user ? "Sign in to check your gaming ID." : hasActivisionId(user) ? "Your gaming ID is saved." : "Add your full Activision ID before joining."}</p>{(!user || !hasActivisionId(user)) && <Link to={user ? "/settings#gaming-ids" : "/login"}>{user ? "Add Activision ID" : "Sign in"}<ArrowRight size={12} /></Link>}</div></li>
                  <li data-ready={!user ? "unknown" : hasCompetitionStream(user) ? "true" : "false"}>{user && hasCompetitionStream(user) ? <CheckCircle2 size={18} /> : <Radio size={18} />}<div><strong>Stream every map</strong><p>{user && hasCompetitionStream(user) ? "Your channel is saved. Every player must still stream every map." : "Twitch, YouTube or Kick · all players, including console."}</p><Link to={!user ? "/login" : hasCompetitionStream(user) ? "/rules" : "/settings#streaming"}>{user && hasCompetitionStream(user) ? "Stream rules" : "Add stream channel"}<ArrowRight size={12} /></Link></div></li>
                </ol>
                <details className="to-stream-rules"><summary>Streaming requirements<ChevronRight size={13} /></summary><p>{competitionStreamRequiredMessage}</p></details>
                <div className="to-side-actions"><button type="button" onClick={() => setActiveTab("participants")}><Users size={15} />View registered teams<ArrowRight size={13} /></button><button type="button" onClick={() => setActiveTab("rules")}><BookOpen size={15} />Read tournament rules<ArrowRight size={13} /></button></div>
              </section>
            </aside>
          </div>
        )}

        {activeTab === "bracket" && <div className="mt-7">{matchesLoading ? <p role="status" className="p-6 text-sm text-vapor">Loading bracket…</p> : matchesError ? <div className="to-load-error" role="alert">The bracket could not be loaded.<button type="button" onClick={loadPage}>Try again</button></div> : <TournamentOverviewBracket matches={matches} tournament={tournament} />}</div>}
        {activeTab === "participants" && (
          <div className="mt-7">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {participantsLoading ? <p role="status" className="p-6 text-sm text-vapor">Loading registered teams…</p> : participantsError ? <div className="to-load-error" role="alert">Registered teams could not be loaded.<button type="button" onClick={loadPage}>Try again</button></div> : participants.length ? participants.map((participant, index) => {
                const selected = String(selectedParticipantId) === String(participant.id);
                return (
                  <button
                    key={participant.id || index}
                    type="button"
                    onClick={() => setSelectedParticipantId(selected ? null : participant.id)}
                    aria-expanded={selected}
                    className="overview-panel overview-participant group flex items-center gap-3 p-4 text-left transition-all"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-cyan/10 font-mono text-xs font-black text-cyan">#{participant.seed || index + 1}</span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-black">{participant.team_name || participant.player_name || `Team ${index + 1}`}</span><span className="mt-1 block text-[10px] text-vapor">{participant.members?.length || participant.player_names?.length || rosterSize(tournament.team_size)} player roster · View players</span></span>
                    <ChevronRight className={`h-4 w-4 shrink-0 text-vapor transition-transform group-hover:text-cyan ${selected ? "rotate-90 text-cyan" : ""}`} />
                  </button>
                );
              }) : <div className="overview-panel overview-empty col-span-full px-5 py-14 text-center text-sm text-vapor">No teams registered yet.</div>}
            </div>

            {selectedParticipant && (
              <section className="overview-panel mt-5 overflow-hidden">
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
          <div className="overview-panel overview-rules mt-7 p-6"><p className="text-[9px] font-black uppercase tracking-[0.18em] text-orange">Tournament rules</p><h2 className="mt-2 text-xl font-black">Format and fair play</h2><div className="mt-5 whitespace-pre-wrap text-sm leading-7 text-vapor">{tournament.rules || tournament.rules_text || tournament.description || "This event follows the Topfragg competitive rules, match reporting process, and dispute policy."}</div><section aria-label="Tournament prize payouts" className="mt-6 rounded-xl border border-orange/20 bg-orange/5 p-4"><h3 className="text-sm font-black text-white">Prize payouts</h3><div className="mt-3 space-y-4">{tournamentPayoutPolicy.map(policy => <div key={policy.title}><h4 className="text-xs font-bold text-orange">{policy.title}</h4><p className="mt-1 text-sm leading-6 text-vapor">{policy.text}</p></div>)}</div></section><Link to="/rules" className="mt-6 inline-flex rounded-lg border border-white/10 bg-secondary px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-white hover:border-orange/25 hover:text-orange">View platform rules</Link></div>
        )}
        </div>
      </div>

      {joinOpen && <Suspense fallback={<PageLoader label="Opening registration" />}><TournamentJoinModal
        isOpen={joinOpen}
        onClose={() => { setJoinOpen(false); if (searchParams.has("join")) setSearchParams((previous) => { const next = new URLSearchParams(previous); next.delete("join"); return next; }, { replace: true }); }}
        tournament={tournament}
        teams={teams}
        loadingTeams={teamsLoading}
        selectedTeamId={selectedTeamId}
        onSelectTeam={(teamId) => { setSelectedTeamId(teamId); setSponsoredMemberIds([]); }}
        onCreateTeam={() => { setJoinOpen(false); setCreateTeamOpen(true); }}
        onJoin={handleJoin}
        joining={joining}
        sponsoredMemberIds={sponsoredMemberIds}
        onSponsoredMemberIdsChange={setSponsoredMemberIds}
        requiresCredits={["credits", "credits_premium"].includes(entryType(tournament)) && Number(tournament.entry_fee || 0) > 0}
      /></Suspense>}
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
      {createTeamOpen && <Suspense fallback={<PageLoader label="Opening team creation" />}><CreateTeamModal
        isOpen={createTeamOpen}
        onClose={() => { setCreateTeamOpen(false); setJoinOpen(true); }}
        onCreated={handleTeamCreated}
        user={user}
        defaultTeamType="tournament"
        defaultRosterSize={rosterSize(tournament.team_size)}
        lockTeamType
        title="Create Tournament Team"
        description={`Create a ${teamRosterFormat(rosterSize(tournament.team_size))} tournament roster with yourself as captain.`}
      /></Suspense>}
    </div>
  );
}
