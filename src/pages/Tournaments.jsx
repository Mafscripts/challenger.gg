import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Calendar, Crown, Loader2, Play, Trophy, Users } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/use-toast";

const staffRoles = ["ceo", "super_admin", "admin", "moderator"];

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
  snd: "Search & Destroy",
  overload: "Overload",
  hp: "Hardpoint",
};

const formatDate = (value) => {
  if (!value) return "Not scheduled";
  return new Date(value).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
};

const formatMoney = (value) => `$${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const isFreeTournament = (tournament) => {
  const entryType = tournament?.entry_type || (tournament?.is_premium_only ? "premium" : (Number(tournament?.entry_fee || 0) > 0 ? "credits" : "free"));
  return ["free", "invitational"].includes(entryType) || Number(tournament?.entry_fee || 0) <= 0;
};

export default function Tournaments() {
  const [filter, setFilter] = useState("All");
  const [user, setUser] = useState(null);
  const [tournaments, setTournaments] = useState([]);
  const [matchesByTournament, setMatchesByTournament] = useState({});
  const [participantsByTournament, setParticipantsByTournament] = useState({});
  const [selectedTournamentId, setSelectedTournamentId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generatingId, setGeneratingId] = useState(null);
  const [joiningId, setJoiningId] = useState(null);
  const [joinedTournamentIds, setJoinedTournamentIds] = useState(new Set());
  const [userTeams, setUserTeams] = useState([]);
  const [selectedTeamByTournament, setSelectedTeamByTournament] = useState({});
  const [paymentModeByTournament, setPaymentModeByTournament] = useState({});

  useEffect(() => {
    loadTournaments();
  }, []);

  const isStaff = staffRoles.includes(user?.role);

  const loadTournaments = async () => {
    try {
      setLoading(true);
      await base44.functions.invoke("syncTournamentLifecycle", {}).catch(() => null);
      const [currentUser, tournamentRows] = await Promise.all([
        base44.auth.me().catch(() => null),
        base44.entities.Tournament.filter({}, "-start_date", 100),
      ]);

      setUser(currentUser);
      setTournaments(tournamentRows || []);
      if (currentUser?.id) {
        const [allParticipants, memberships] = await Promise.all([
          base44.entities.TournamentParticipant.filter({}, "-registered_date", 500).catch(() => []),
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
      } else {
        setJoinedTournamentIds(new Set());
        setUserTeams([]);
      }
      if ((tournamentRows || []).length > 0 && !selectedTournamentId) {
        setSelectedTournamentId(tournamentRows[0].id);
        loadMatches(tournamentRows[0].id);
      }
    } catch (error) {
      console.error("Failed to load tournaments:", error);
      toast({ title: "Tournaments unavailable", description: "Could not load tournaments.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const canJoinTournament = (tournament) => {
    if (!tournament) return false;
    const registered = Number(tournament.registered_teams || 0);
    const maxTeams = Number(tournament.max_teams || 0);
    return ["open", "registration"].includes(tournament.status)
      && !joinedTournamentIds.has(tournament.id)
      && (!maxTeams || registered < maxTeams);
  };

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
    } catch (error) {
      toast({ title: "Join failed", description: error.message || "Could not join tournament.", variant: "destructive" });
    } finally {
      setJoiningId(null);
    }
  };

  const loadMatches = async (tournamentId) => {
    if (!tournamentId) return;
    try {
      const [matches, participants] = await Promise.all([
        base44.entities.TournamentMatch.filter({ tournament_id: tournamentId }, "round", 256),
        base44.entities.TournamentParticipant.filter({ tournament_id: tournamentId }, "seed", 256).catch(() => []),
      ]);
      setMatchesByTournament((current) => ({ ...current, [tournamentId]: matches || [] }));
      setParticipantsByTournament((current) => ({ ...current, [tournamentId]: participants || [] }));
    } catch (error) {
      console.error("Failed to load tournament matches:", error);
    }
  };

  const handleSelectTournament = (tournamentId) => {
    setSelectedTournamentId(tournamentId);
    if (!matchesByTournament[tournamentId]) {
      loadMatches(tournamentId);
    }
  };

  const handleGenerateBracket = async (tournamentId) => {
    setGeneratingId(tournamentId);
    try {
      const response = await base44.functions.invoke("generateTournamentBracket", { tournament_id: tournamentId });
      if (response.data?.success) {
        toast({
          title: "Bracket generated",
          description: `${response.data.match_count} tournament matches created.`,
        });
        await loadTournaments();
        await loadMatches(tournamentId);
      } else {
        toast({ title: "Bracket failed", description: response.data?.error || "Could not generate bracket.", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Bracket failed", description: error.message || "Could not generate bracket.", variant: "destructive" });
    } finally {
      setGeneratingId(null);
    }
  };

  const filteredTournaments = useMemo(() => (
    tournaments.filter((tournament) => filter === "All" || statusLabels[tournament.status] === filter || tournament.status === filter)
  ), [tournaments, filter]);

  const liveTournaments = tournaments.filter((tournament) => ["live", "in_progress"].includes(tournament.status));
  const featuredTournaments = tournaments.filter((tournament) => tournament.is_premium_only || tournament.prize_pool >= 1000).slice(0, 2);
  const selectedTournament = tournaments.find((tournament) => tournament.id === selectedTournamentId);
  const selectedMatches = matchesByTournament[selectedTournamentId] || [];
  const selectedParticipants = participantsByTournament[selectedTournamentId] || [];
  const currentUserParticipantKeys = new Set(selectedParticipants
    .filter((participant) => (
      participant.captain_id === user?.id
      || participant.user_id === user?.id
      || (participant.members || []).some((member) => member.user_id === user?.id)
    ))
    .flatMap((participant) => [participant.id, participant.team_id, participant.user_id, participant.captain_id].filter(Boolean)));
  const currentUserTeamKeys = new Set(userTeams
    .filter((team) => team.membership?.is_active !== false)
    .flatMap((team) => [team.id, team.name].filter(Boolean).map((value) => String(value).toLowerCase())));
  const selectedUserMatch = selectedMatches.find((match) => (
    currentUserParticipantKeys.has(match.team_a_participant_id)
    || currentUserParticipantKeys.has(match.team_b_participant_id)
    || currentUserParticipantKeys.has(match.team_a_id)
    || currentUserParticipantKeys.has(match.team_b_id)
    || currentUserTeamKeys.has(String(match.team_a_id || "").toLowerCase())
    || currentUserTeamKeys.has(String(match.team_b_id || "").toLowerCase())
    || currentUserTeamKeys.has(String(match.team_a_name || "").toLowerCase())
    || currentUserTeamKeys.has(String(match.team_b_name || "").toLowerCase())
  ));

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
            <p className="text-vapor text-sm mt-1">Live brackets and database-backed events</p>
          </div>
        </div>

        {liveTournaments.map((tournament) => {
          const matches = matchesByTournament[tournament.id] || [];
          const liveMatch = matches.find((match) => ["ready", "in_progress", "awaiting_report"].includes(match.status));

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
                </div>
              </div>
              {liveMatch ? (
                <Link to={`/tournament-match/${liveMatch.id}`} className="inline-flex items-center gap-2 px-5 py-2 bg-red-500/10 text-red-400 border border-red-500/20 text-xs font-bold rounded-lg hover:bg-red-500/20 transition-all uppercase tracking-wider">
                  Open Live Match <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              ) : (
                <button onClick={() => handleSelectTournament(tournament.id)} className="inline-flex items-center gap-2 px-5 py-2 bg-red-500/10 text-red-400 border border-red-500/20 text-xs font-bold rounded-lg hover:bg-red-500/20 transition-all uppercase tracking-wider">
                  View Bracket <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </motion.div>
          );
        })}

        {featuredTournaments.length > 0 && (
          <div className="grid md:grid-cols-2 gap-5 mb-10">
            {featuredTournaments.map((tournament) => (
              <motion.button
                key={tournament.id}
                type="button"
                onClick={() => handleSelectTournament(tournament.id)}
                whileHover={{ y: -4 }}
                className="glass rounded-xl p-8 border border-orange/20 relative overflow-hidden group cursor-pointer text-left"
              >
                <div className="absolute top-0 right-0 w-40 h-40 bg-orange/5 rounded-full blur-[60px]" />
                <div className="relative">
                  <div className="flex items-center gap-2 mb-4">
                    <Crown className="w-4 h-4 text-orange" />
                    <span className="text-orange text-xs font-mono font-bold uppercase tracking-wider">
                      {tournament.is_premium_only ? "Premium Event" : "Featured Event"}
                    </span>
                  </div>
                  <h3 className="text-2xl font-black mb-2">{tournament.name}</h3>
                  <p className="text-vapor text-sm mb-6">
                    {tournament.team_size} {modeLabels[tournament.game_mode] || tournament.game_mode} - {tournament.registered_teams || 0}/{tournament.max_teams} Teams
                  </p>
                  <div className="flex items-center gap-6">
                    <div className="flex items-center gap-1.5">
                      <Trophy className="w-4 h-4 text-green" />
                      <span className="text-green font-mono font-bold text-lg">{formatMoney(tournament.prize_pool)}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-vapor text-sm">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>{formatDate(tournament.start_date)}</span>
                    </div>
                  </div>
                  <span className="mt-4 inline-block text-xs font-semibold text-cyan">
                    {statusLabels[tournament.status] || tournament.status}
                  </span>
                </div>
              </motion.button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 mb-6 overflow-x-auto">
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

        <div className="grid lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 glass rounded-xl border border-white/5 overflow-hidden">
            <div className="hidden md:grid grid-cols-6 gap-4 px-5 py-3 border-b border-white/5 text-xs text-vapor uppercase tracking-wider font-semibold">
              <span className="col-span-2">Tournament</span>
              <span>Prize</span>
              <span>Teams</span>
              <span>Start</span>
              <span>Status</span>
            </div>
            <div className="divide-y divide-white/5">
              {filteredTournaments.length === 0 ? (
                <div className="px-5 py-10 text-center">
                  <Trophy className="w-10 h-10 text-vapor/30 mx-auto mb-3" />
                  <p className="text-sm text-vapor">No tournaments found.</p>
                </div>
              ) : filteredTournaments.map((tournament) => (
                <button
                  type="button"
                  key={tournament.id}
                  onClick={() => handleSelectTournament(tournament.id)}
                  className={`w-full grid grid-cols-2 md:grid-cols-6 gap-2 md:gap-4 px-5 py-4 items-center text-left transition-all ${
                    selectedTournamentId === tournament.id ? "bg-cyan/5" : "hover:bg-white/[0.02]"
                  }`}
                >
                  <div className="col-span-2">
                    <p className="font-semibold text-sm">{tournament.name}</p>
                    <p className="text-xs text-vapor">{tournament.team_size} {modeLabels[tournament.game_mode] || tournament.game_mode}</p>
                  </div>
                  <span className="text-sm font-mono font-bold text-green">{formatMoney(tournament.prize_pool)}</span>
                  <span className="text-sm text-vapor hidden md:block">{tournament.registered_teams || 0}/{tournament.max_teams}</span>
                  <span className="text-sm text-vapor hidden md:block">{formatDate(tournament.start_date)}</span>
                  <span className={`text-xs font-semibold ${
                    tournament.status === "completed" ? "text-green" :
                    ["live", "in_progress"].includes(tournament.status) ? "text-red-400" :
                    tournament.status === "open" ? "text-cyan" :
                    "text-orange"
                  }`}>
                    {statusLabels[tournament.status] || tournament.status}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="lg:col-span-5 glass rounded-xl border border-white/5 overflow-hidden">
            <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold">Bracket Matches</h2>
                <p className="text-xs text-vapor">
                  {selectedParticipants.length} participant{selectedParticipants.length === 1 ? "" : "s"} registered.
                </p>
              </div>
              <div className="flex items-center gap-2">
                {selectedTournament && joinedTournamentIds.has(selectedTournament.id) && (
                  <span className="px-3 py-2 bg-green/10 text-green text-xs font-bold rounded-lg border border-green/20 uppercase tracking-wider">
                    Joined
                  </span>
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
                  <div className="flex items-center gap-2">
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
                {isStaff && selectedTournamentId && selectedMatches.length === 0 && (
                  <button
                    onClick={() => handleGenerateBracket(selectedTournamentId)}
                    disabled={generatingId === selectedTournamentId}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-cyan text-background text-xs font-bold rounded-lg disabled:opacity-50"
                  >
                    {generatingId === selectedTournamentId ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                    Generate
                  </button>
                )}
              </div>
            </div>
            {selectedParticipants.length > 0 && (
              <div className="px-5 py-3 border-b border-white/5 bg-secondary/20">
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
            <div className="divide-y divide-white/5 max-h-[640px] overflow-y-auto">
              {!selectedTournamentId ? (
                <p className="px-5 py-8 text-center text-sm text-vapor">No tournament selected.</p>
              ) : selectedMatches.length === 0 ? (
                <div className="px-5 py-8 text-center">
                  <Users className="w-10 h-10 text-vapor/30 mx-auto mb-3" />
                  <p className="text-sm text-vapor">No bracket matches generated yet.</p>
                </div>
              ) : selectedMatches.map((match) => (
                <Link
                  key={match.id}
                  to={`/tournament-match/${match.id}`}
                  className="block px-5 py-4 hover:bg-white/[0.02] transition-colors"
                >
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <p className="text-sm font-bold">
                      {match.bracket === "grand_final" ? "Grand Final" : `${match.bracket === "loser" ? "Loser" : "Winner"} Round ${match.round}`}
                    </p>
                    <span className="text-[10px] text-vapor uppercase">{match.status}</span>
                  </div>
                  <div className="text-xs text-vapor flex items-center justify-between gap-3">
                    <span className="truncate">{match.team_a_name || "Open slot"}</span>
                    <span className="text-cyan font-mono">{match.team_a_score || 0}-{match.team_b_score || 0}</span>
                    <span className="truncate text-right">{match.team_b_name || "Open slot"}</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
