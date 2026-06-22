import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  AlertCircle,
  Check,
  Flag,
  Gavel,
  RefreshCw,
  Shield,
  Swords,
  Trophy,
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/use-toast";

const bracketLabels = {
  winner: "Winner Bracket",
  loser: "Loser Bracket",
  grand_final: "Grand Final",
};

const statusLabel = (value) => String(value || "pending").replace(/_/g, " ");

function TeamCard({ label, name, color, score, setScore, disabled }) {
  const colorClass = color === "cyan" ? "text-cyan border-cyan/20 bg-cyan/5" : "text-orange border-orange/20 bg-orange/5";

  return (
    <div className={`glass rounded-xl border p-6 ${colorClass}`}>
      <p className="text-xs font-bold uppercase tracking-wider mb-4">{label}</p>
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-lg bg-background/40 border border-white/5 flex items-center justify-center">
          <Shield className="w-6 h-6" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-black truncate">{name || "Open slot"}</h2>
          <p className="text-xs text-vapor">Tournament participant</p>
        </div>
        <input
          type="number"
          min="0"
          value={score}
          disabled={disabled || !name}
          onChange={(event) => setScore(Number(event.target.value))}
          className="w-20 text-center bg-secondary border border-white/5 rounded-lg py-3 text-4xl font-black font-mono focus:outline-none focus:border-cyan/30 disabled:opacity-60"
        />
      </div>
    </div>
  );
}

export default function TournamentMatchRoom() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [match, setMatch] = useState(null);
  const [tournament, setTournament] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [requestingAdmin, setRequestingAdmin] = useState(false);
  const [scoreA, setScoreA] = useState(0);
  const [scoreB, setScoreB] = useState(0);

  useEffect(() => {
    loadRoom();
  }, [id]);

  const isComplete = match?.completed || match?.status === "completed";
  const canSubmit = useMemo(() => (
    Boolean(match?.team_a_id && match?.team_b_id && !isComplete)
  ), [match?.team_a_id, match?.team_b_id, isComplete]);

  const loadRoom = async () => {
    try {
      setLoading(true);
      const [currentUser, matchData] = await Promise.all([
        base44.auth.me().catch(() => null),
        base44.entities.TournamentMatch.get(id),
      ]);
      const tournamentData = await base44.entities.Tournament.get(matchData.tournament_id);

      setUser(currentUser);
      setMatch(matchData);
      setTournament(tournamentData);
      setScoreA(matchData.team_a_score || 0);
      setScoreB(matchData.team_b_score || 0);
    } catch (error) {
      console.error("Failed to load tournament match:", error);
      toast({ title: "Error loading match", description: error.message || "Match not found.", variant: "destructive" });
      setMatch(null);
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
      } else {
        toast({ title: "Request failed", description: response.data?.error || "Could not request admin.", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Request failed", description: error.message || "Could not request admin.", variant: "destructive" });
    } finally {
      setRequestingAdmin(false);
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
            <Link to="/tournaments" className="inline-flex items-center gap-2 px-4 py-2 bg-secondary text-vapor text-xs font-bold rounded-lg hover:bg-white/10 transition-all">
              Back to Bracket
            </Link>
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

        <div className="grid lg:grid-cols-2 gap-6 mb-6">
          <TeamCard
            label="Team A"
            color="cyan"
            name={match.team_a_name}
            score={scoreA}
            setScore={setScoreA}
            disabled={!canSubmit}
          />
          <TeamCard
            label="Team B"
            color="orange"
            name={match.team_b_name}
            score={scoreB}
            setScore={setScoreB}
            disabled={!canSubmit}
          />
        </div>

        <div className="glass rounded-xl border border-white/5 p-4 mb-6">
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleComplete}
              disabled={!canSubmit || submitting}
              className="flex-1 min-w-[200px] py-3 bg-green/10 text-green font-bold text-sm rounded-lg border border-green/20 hover:bg-green/20 transition-all uppercase tracking-wider flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Check className="w-4 h-4" /> {submitting ? "Submitting..." : "Submit Result"}
            </button>
            <button
              onClick={handleRequestAdmin}
              disabled={requestingAdmin}
              className="px-6 py-3 bg-red-500/10 text-red-400 font-bold text-sm rounded-lg border border-red-500/20 hover:bg-red-500/20 transition-all uppercase tracking-wider flex items-center gap-2 disabled:opacity-50"
            >
              <Gavel className="w-4 h-4" /> {requestingAdmin ? "Requesting..." : "Request Admin"}
            </button>
            <button
              onClick={loadRoom}
              className="px-4 py-3 bg-secondary/50 text-vapor font-bold text-sm rounded-lg border border-white/5 hover:bg-secondary transition-all"
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
          {predictedWinner && canSubmit && (
            <p className="text-xs text-vapor mt-3 flex items-center gap-2">
              <Flag className="w-3.5 h-3.5 text-orange" />
              Current score advances {predictedWinner}.
            </p>
          )}
        </div>

        <div className="grid md:grid-cols-2 gap-6">
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
    </div>
  );
}
