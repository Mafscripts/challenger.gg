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

export default function Tournaments() {
  const [filter, setFilter] = useState("All");
  const [user, setUser] = useState(null);
  const [tournaments, setTournaments] = useState([]);
  const [matchesByTournament, setMatchesByTournament] = useState({});
  const [selectedTournamentId, setSelectedTournamentId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generatingId, setGeneratingId] = useState(null);

  useEffect(() => {
    loadTournaments();
  }, []);

  const isStaff = staffRoles.includes(user?.role);

  const loadTournaments = async () => {
    try {
      setLoading(true);
      const [currentUser, tournamentRows] = await Promise.all([
        base44.auth.me().catch(() => null),
        base44.entities.Tournament.filter({}, "-start_date", 100),
      ]);

      setUser(currentUser);
      setTournaments(tournamentRows || []);
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

  const loadMatches = async (tournamentId) => {
    if (!tournamentId) return;
    try {
      const matches = await base44.entities.TournamentMatch.filter({ tournament_id: tournamentId }, "round", 256);
      setMatchesByTournament((current) => ({ ...current, [tournamentId]: matches || [] }));
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
  const selectedMatches = matchesByTournament[selectedTournamentId] || [];

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
                <p className="text-xs text-vapor">Select a tournament to view match rooms.</p>
              </div>
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
