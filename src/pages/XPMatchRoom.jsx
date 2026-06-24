import React, { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  AlertTriangle, Clock, Check,
  AlertCircle
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/use-toast";
import StatsBar from "@/components/match/StatsBar";
import TeamRoster from "@/components/match/TeamRoster";
import MapVetoVertical from "@/components/match/MapVetoVertical";
import HeadToHead from "@/components/match/HeadToHead";
import RecentForm from "@/components/match/RecentForm";
import TrophyCase from "@/components/match/TrophyCase";
import MatchChat from "@/components/match/MatchChat";
import { loadWagerParticipants } from "@/lib/wagerParticipants";

export default function XPMatchRoom() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [wager, setWager] = useState(null);
  const [user, setUser] = useState(null);
  const [teamAPlayers, setTeamAPlayers] = useState([]);
  const [teamBPlayers, setTeamBPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [timeRemaining, setTimeRemaining] = useState(null);
  const [scoreA, setScoreA] = useState(0);
  const [scoreB, setScoreB] = useState(0);
  const [supporting, setSupporting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [disputing, setDisputing] = useState(false);

  useEffect(() => {
    setLoading(true);
    loadUser();
    loadWager();
  }, [id]);

  const loadUser = async () => {
    try {
      const userData = await base44.auth.me();
      if (userData) {
        setUser(userData);
      }
    } catch (error) {
      console.error("Failed to load user:", error);
    }
  };

  useEffect(() => {
    const interval = setInterval(calculateTimeRemaining, 1000);
    return () => clearInterval(interval);
  }, [wager]);

  const loadWager = async () => {
    try {
      const wagerData = await base44.entities.Wager.get(id);
      setWager(wagerData);

      const { teamAPlayers, teamBPlayers } = await loadWagerParticipants(base44, wagerData);
      setTeamAPlayers(teamAPlayers);
      setTeamBPlayers(teamBPlayers);
    } catch (error) {
      console.error("Failed to load wager:", error);
      toast({ 
        title: "Error loading match", 
        description: error.message || "Match not found", 
        variant: "destructive" 
      });
    } finally {
      setLoading(false);
    }
  };

  const calculateTimeRemaining = () => {
    if (!wager?.match_start_deadline) {
      setTimeRemaining(null);
      return;
    }
    const deadline = new Date(wager.match_start_deadline);
    const now = new Date();
    const diff = deadline - now;
    if (diff <= 0) {
      setTimeRemaining("EXPIRED");
      return;
    }
    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    setTimeRemaining(`${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
  };

  const handleReportScore = async () => {
    if (scoreA === scoreB) {
      toast({ title: "Invalid score", description: "Scores cannot be tied", variant: "destructive" });
      return;
    }
    
    const isHost = user?.id === wager.host_id;
    const team = isHost ? 'host' : 'challenger';
    
    setSubmitting(true);
    try {
      const response = await base44.functions.invoke('submitScore', { 
        wager_id: wager.id, 
        team: team, 
        team_alpha_score: scoreA,
        team_bravo_score: scoreB,
        proof_urls: []
      });
      
      if (response.data.success) {
        if (response.data.ready_to_complete) {
          const completeResponse = await base44.functions.invoke('completeWager', {
            wager_id: wager.id,
            winner_id: response.data.winner_id,
            team_alpha_score: scoreA,
            team_bravo_score: scoreB,
            proof_urls: []
          });
          if (!completeResponse.data.success) {
            toast({ title: "Failed", description: completeResponse.data.error || "Failed to complete match", variant: "destructive" });
            return;
          }
          toast({ title: "Match completed!", description: `${response.data.winner_name} won ${response.data.winner_score}-${response.data.loser_score}` });
          navigate('/xp');
        } else if (response.data.status === 'score_conflict') {
          toast({ title: "Score conflict", description: "Dispute opened", variant: "destructive" });
        } else {
          toast({ title: "Score submitted", description: response.data.message });
        }
      } else {
        toast({ title: "Failed", description: response.data.error, variant: "destructive" });
      }
    } catch (error) {
      console.error("Failed to report score:", error);
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSupportTicket = async (reason) => {
    setSupporting(true);
    try {
      const response = await base44.functions.invoke("requestAdminAlert", {
        match_type: wager.match_type || "xp",
        match_id: wager.id,
        subject: `XP match support ${wager.id}`,
        description: `${reason}\n\nMatch: ${wager.id}\nPlayers: ${wager.host_name || "Host unavailable"} vs ${wager.challenger_name || "Opponent pending"}`,
        priority: "high",
      });

      if (response.data?.success) {
        toast({ title: "Admin requested", description: "Staff were notified for this XP match." });
        await loadWager();
      } else {
        toast({ title: "Request failed", description: response.data?.error || "Could not request admin.", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Request failed", description: error.message || "Could not request admin.", variant: "destructive" });
    } finally {
      setSupporting(false);
    }
  };

  const handleCreateDispute = async () => {
    const evidenceText = typeof window !== "undefined" ? window.prompt("Evidence URLs (comma or line separated):", "") : "";
    if (evidenceText === null) return;
    const evidenceUrls = evidenceText.split(/[\n,]+/).map((url) => url.trim()).filter(Boolean);
    setDisputing(true);
    try {
      const response = await base44.functions.invoke("createDispute", {
        match_type: "wager",
        match_id: wager.id,
        wager_id: wager.id,
        reason: "score_dispute",
        description: `Dispute submitted from XP match room ${wager.id}. ${wager.host_name || "Host"} vs ${wager.challenger_name || "Opponent"}`,
        reported_against: user?.id === wager.host_id ? wager.challenger_id : wager.host_id,
        reported_against_name: user?.id === wager.host_id ? wager.challenger_name : wager.host_name,
        evidence_urls: evidenceUrls,
        escalated: Boolean(user?.is_premium),
      });

      if (response.data?.success) {
        toast({ title: response.data.escalated ? "Dispute escalated" : "Dispute submitted", description: "A review case was created for staff." });
        await loadWager();
      } else {
        toast({ title: "Dispute failed", description: response.data?.error || "Could not create dispute.", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Dispute failed", description: error.message || "Could not create dispute.", variant: "destructive" });
    } finally {
      setDisputing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-purple/20 border-t-purple rounded-full animate-spin mx-auto mb-4" />
          <p className="text-vapor">Loading XP match...</p>
        </div>
      </div>
    );
  }

  if (!wager) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">Match Not Found</h2>
          <Link to="/xp" className="text-purple hover:underline">Back to XP</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-obsidian py-6">
      <div className="max-w-[1800px] mx-auto px-4 lg:px-6">
        
        {/* Match Header */}
        <div className="glass rounded-xl border border-purple/20 p-6 mb-6">
          <div className="flex flex-col lg:flex-row items-center justify-between gap-6">
            
            {/* Left: Match Info */}
            <div className="w-full lg:w-auto">
              <div className="flex items-center gap-3 mb-2">
                <span className="w-3 h-3 rounded-full bg-purple animate-pulse" />
                <span className="text-xs font-mono font-semibold text-purple uppercase tracking-wider">XP Ladder Match</span>
              </div>
              <p className="text-sm text-vapor font-mono">
                {wager.team_size} {wager.game_mode_display} - {wager.final_map_name || "Map pending"}
              </p>
              <p className="text-[10px] text-vapor font-mono mt-1">Match ID: #{wager.id?.slice(-8)}</p>
            </div>

            {/* Center: Scoreboard */}
            <div className="flex-1 flex items-center justify-center gap-4 md:gap-6 lg:gap-8">
              <div className="text-center">
                <p className="text-lg md:text-xl lg:text-2xl font-black text-purple mb-1">TEAM ALPHA</p>
                <p className="text-xs text-vapor">{wager.host_name}</p>
              </div>
              <div className="flex items-center gap-2 md:gap-3 lg:gap-4">
                <input
                  type="number"
                  value={scoreA}
                  onChange={(e) => setScoreA(Number(e.target.value))}
                  className="w-14 md:w-16 lg:w-20 text-center bg-secondary border border-white/5 rounded-lg py-2 md:py-3 lg:py-4 text-3xl md:text-4xl lg:text-5xl font-black font-mono text-purple focus:outline-none focus:border-purple/30"
                />
                <span className="text-2xl md:text-3xl lg:text-4xl text-vapor font-bold">-</span>
                <input
                  type="number"
                  value={scoreB}
                  onChange={(e) => setScoreB(Number(e.target.value))}
                  className="w-14 md:w-16 lg:w-20 text-center bg-secondary border border-white/5 rounded-lg py-2 md:py-3 lg:py-4 text-3xl md:text-4xl lg:text-5xl font-black font-mono text-orange focus:outline-none focus:border-orange/30"
                />
              </div>
              <div className="text-center">
                <p className="text-lg md:text-xl lg:text-2xl font-black text-orange mb-1">TEAM BRAVO</p>
                <p className="text-xs text-vapor">{wager.challenger_name || "Opponent pending"}</p>
              </div>
            </div>

            {/* Right: Timer */}
            {timeRemaining && (
              <div className={`px-3 md:px-4 py-2 md:py-3 rounded-lg font-mono font-bold text-sm flex flex-col items-center ${
                timeRemaining === "EXPIRED" ? "bg-red-500/20 text-red-400" : "bg-purple/10 text-purple"
              }`}>
                <Clock className="w-3 h-3 md:w-4 md:h-4 mb-1" />
                <span>{timeRemaining === "EXPIRED" ? "EXPIRED" : timeRemaining}</span>
                <span className="text-[8px] md:text-[9px] uppercase">Time</span>
              </div>
            )}
          </div>
        </div>

        {/* Stats Bar */}
        <StatsBar teamAPlayers={teamAPlayers} teamBPlayers={teamBPlayers} />

        {/* Main Content Grid */}
        <div className="grid lg:grid-cols-12 gap-6 mb-6">
          
          {/* Left: Team Alpha Roster */}
          <div className="lg:col-span-3">
            <TeamRoster players={teamAPlayers} teamColor="purple" teamName="TEAM ALPHA" />
          </div>

          {/* Center: Map Veto */}
          <div className="lg:col-span-3">
            <MapVetoVertical wager={wager} />
          </div>

          {/* Right: Team Bravo Roster */}
          <div className="lg:col-span-3">
            <TeamRoster players={teamBPlayers} teamColor="orange" teamName="TEAM BRAVO" />
          </div>

          {/* Far Right: Chat */}
          <div className="lg:col-span-3">
            <MatchChat conversationId={wager.id} matchType="wager" accent="purple" />
          </div>
        </div>

        {/* Action Bar */}
        <div className="glass rounded-xl border border-white/5 p-4 mb-6">
          <div className="flex flex-wrap items-center gap-3">
            <button 
              onClick={handleReportScore}
              disabled={submitting}
              className="flex-1 min-w-[200px] py-3 bg-green/10 text-green font-bold text-sm rounded-lg border border-green/20 hover:bg-green/20 transition-all uppercase tracking-wider flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Check className="w-4 h-4" /> {submitting ? "Submitting..." : "Submit Score"}
            </button>
            <button
              onClick={() => handleSupportTicket("I need support for this XP match.")}
              disabled={supporting}
              className="px-6 py-3 bg-red-500/10 text-red-400 font-bold text-sm rounded-lg border border-red-500/20 hover:bg-red-500/20 transition-all uppercase tracking-wider flex items-center gap-2"
            >
              <AlertTriangle className="w-4 h-4" /> {supporting ? "Requesting..." : "Request Admin"}
            </button>
            <button onClick={handleCreateDispute} disabled={disputing} className="px-6 py-3 bg-orange/10 text-orange font-bold text-sm rounded-lg border border-orange/20 hover:bg-orange/20 transition-all uppercase tracking-wider disabled:opacity-50">
              {disputing ? "Submitting..." : "Submit Dispute"}
            </button>
            <button onClick={() => handleSupportTicket("Opponent no-show report.")} disabled={supporting} className="px-6 py-3 bg-secondary/50 text-vapor font-bold text-sm rounded-lg border border-white/5 hover:bg-secondary transition-all uppercase tracking-wider disabled:opacity-50">
              Report No Show
            </button>
          </div>
          {(wager.admin_request_status || wager.requested_admin) && (
            <p className="text-xs text-vapor mt-3">
              Admin request: {{
                waiting_for_admin: "Waiting for admin",
                admin_joined: "Admin joined",
                waiting_for_user: "Waiting for user",
                escalated: "Escalated",
                resolved: "Resolved",
                closed: "Closed",
              }[wager.admin_request_status || "waiting_for_admin"] || "Waiting for admin"}
            </p>
          )}
        </div>

        {/* Bottom Section */}
        <div className="grid lg:grid-cols-2 gap-6 mb-6">
          <HeadToHead teamAPlayers={teamAPlayers} teamBPlayers={teamBPlayers} />
          <TrophyCase teamAPlayers={teamAPlayers} teamBPlayers={teamBPlayers} />
        </div>

        <RecentForm teamAPlayers={teamAPlayers} teamBPlayers={teamBPlayers} />

      </div>
    </div>
  );
}
