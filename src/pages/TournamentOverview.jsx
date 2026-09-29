import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  CalendarDays,
  Check,
  Clock3,
  Gamepad2,
  Globe2,
  Layers3,
  Loader2,
  Medal,
  Monitor,
  ShieldCheck,
  Trophy,
  Users,
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/use-toast";
import ActivisionIdNotice from "@/components/competition/ActivisionIdNotice";
import CreateTeamModal from "@/components/teams/CreateTeamModal";
import TournamentJoinModal from "@/components/tournaments/TournamentJoinModal";
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

function Countdown({ value, now }) {
  const target = new Date(value || "").getTime();
  const difference = target - now;
  if (!Number.isFinite(target)) return <span className="font-mono text-sm font-black text-vapor">TBA</span>;
  if (difference <= 0) return <span className="font-mono text-sm font-black text-orange">Schedule passed</span>;
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
  const [paymentMode, setPaymentMode] = useState("own");
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);

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
      const [currentUser, tournamentRow, participantRows, matchRows] = await Promise.all([
        base44.auth.me().catch(() => null),
        base44.entities.Tournament.get(id),
        base44.entities.TournamentParticipant.filterFresh({ tournament_id: id }, "seed", 256).catch(() => []),
        base44.entities.TournamentMatch.filterFresh({ tournament_id: id }, "round", 256).catch(() => []),
      ]);
      setUser(currentUser);
      setTournament(tournamentRow);
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
        payment_mode: entryType(tournament) === "free" ? "own" : paymentMode,
      });
      if (!response.data?.success) {
        toast({ title: "Join failed", description: response.data?.error || "Could not join tournament.", variant: "destructive" });
        return;
      }
      setJoined(true);
      setJoinOpen(false);
      setTournament((current) => ({ ...current, registered_teams: Number(current.registered_teams || 0) + 1 }));
      toast({ title: "Tournament joined", description: `${response.data.participant?.team_name || "Your team"} is registered.` });
    } catch (error) {
      toast({ title: "Join failed", description: error.message || "Could not join tournament.", variant: "destructive" });
    } finally {
      setJoining(false);
    }
  };

  const handleTeamCreated = async (team) => {
    const refreshedTeams = await loadTeams(user);
    setTeams(refreshedTeams);
    setSelectedTeamId(team.id);
    setCreateTeamOpen(false);
    setJoinOpen(true);
  };

  if (loading) {
    return <div className="flex min-h-[70vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-cyan" /></div>;
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
                <Countdown value={tournament.start_date} now={now} />
              </div>
            </div>
            <div className="space-y-3">
              {joined ? (
                <div className="flex items-center justify-center gap-2 rounded-xl border border-green/20 bg-green/10 px-5 py-4 text-[10px] font-black uppercase tracking-wider text-green"><Check className="h-4 w-4" /> Tournament joined</div>
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
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,1fr)_310px]">
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
                    <div className="mt-4 flex items-end justify-between gap-4"><div><p className="text-sm font-black text-white">{formatDate(registrationDate)}</p><p className="mt-1 text-[10px] text-vapor">Secure your place before the deadline.</p></div><Countdown value={registrationDate} now={now} /></div>
                  </div>
                  <div className="rounded-xl border border-orange/15 bg-[linear-gradient(145deg,rgba(255,130,0,.07),rgba(255,255,255,.015))] p-5">
                    <p className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.15em] text-vapor"><span className="h-1.5 w-1.5 rounded-full bg-orange" /> Tournament starts</p>
                    <div className="mt-4 flex items-end justify-between gap-4"><div><p className="text-sm font-black text-white">{formatDate(tournament.start_date)}</p><p className="mt-1 text-[10px] text-vapor">All teams must be match ready.</p></div><Countdown value={tournament.start_date} now={now} /></div>
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
          </motion.div>
        )}

        {activeTab === "bracket" && <div className="mt-7"><BracketPreview matches={matches} /></div>}
        {activeTab === "participants" && (
          <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {participants.length ? participants.map((participant, index) => (
              <div key={participant.id || index} className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-card/40 p-4"><span className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan/10 font-mono text-xs font-black text-cyan">#{participant.seed || index + 1}</span><div className="min-w-0"><p className="truncate text-sm font-black">{participant.team_name || participant.player_name || `Team ${index + 1}`}</p><p className="mt-1 text-[10px] text-vapor">{participant.members?.length || participant.player_names?.length || rosterSize(tournament.team_size)} player roster</p></div></div>
            )) : <div className="col-span-full rounded-xl border border-dashed border-white/10 px-5 py-14 text-center text-sm text-vapor">No teams registered yet.</div>}
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
        onSelectTeam={setSelectedTeamId}
        onCreateTeam={() => { setJoinOpen(false); setCreateTeamOpen(true); }}
        onJoin={handleJoin}
        joining={joining}
        paymentMode={paymentMode}
        onPaymentModeChange={setPaymentMode}
        requiresCredits={["credits", "credits_premium"].includes(entryType(tournament)) && Number(tournament.entry_fee || 0) > 0}
      />
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
