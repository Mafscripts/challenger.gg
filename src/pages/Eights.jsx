import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Plus, Search, Users, Clock, Zap,
  Gamepad2
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import CreateLobbyModal from "@/components/match/CreateLobbyModal";
import CompetitionHero from "@/components/match/CompetitionHero";
import { toast } from "@/components/ui/use-toast";
import ActivisionIdNotice from "@/components/competition/ActivisionIdNotice";
import { activisionIdRequiredMessage, hasActivisionId } from "@/lib/activision";

const modes = ["All", "1v1", "2v2", "3v3", "4v4"];
const gameModes = ["All", "Search & Destroy", "Hardpoint", "Overload"];
const teamCapacity = { "1v1": 2, "2v2": 4, "3v3": 6, "4v4": 8 };
const rosterSize = (teamSize) => Number.parseInt(String(teamSize || "1v1").split("v")[0], 10) || 1;

export default function Eights() {
  const navigate = useNavigate();
  const [selectedMode, setSelectedMode] = useState("All");
  const [selectedGameMode, setSelectedGameMode] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [lobbies, setLobbies] = useState([]);
  const [userTeams, setUserTeams] = useState([]);
  const [joinTeamByLobby, setJoinTeamByLobby] = useState({});
  const [stats, setStats] = useState({ activeLobbies: 0, playersQueued: 0, matchesLive: 0 });
  const [joiningId, setJoiningId] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLobbies();
  }, []);

  const loadLobbies = async () => {
    try {
      setLoading(true);
      const currentUser = await base44.auth.me().catch(() => null);
      setUser(currentUser);
      if (currentUser?.id) {
        const memberships = await base44.entities.TeamMember.filter({ user_id: currentUser.id }, "-joined_date", 50).catch(() => []);
        const teams = await Promise.all((memberships || [])
          .filter((membership) => membership.is_active !== false)
          .map(async (membership) => {
            const team = await base44.entities.Team.get(membership.team_id).catch(() => null);
            const members = team ? await base44.entities.TeamMember.filter({ team_id: team.id }, "-joined_date", 50).catch(() => []) : [];
            return team && team.is_active !== false
              ? { ...team, membership, members: (members || []).filter((member) => member.is_active !== false) }
              : null;
          }));
        setUserTeams(teams.filter(Boolean));
      } else {
        setUserTeams([]);
      }
      const [records, liveRecords] = await Promise.all([
        base44.entities.Wager.filter({ status: "open", entry_fee: 0, match_type: "8s" }, "-created_date", 50),
        base44.entities.Wager.filter({ status: "in_progress", entry_fee: 0, match_type: "8s" }, "-created_date", 50).catch(() => []),
      ]);
      const lobbiesWithParticipants = await Promise.all((records || []).map(async (wager) => {
        const participants = await base44.entities.WagerParticipant.filter({ wager_id: wager.id }).catch(() => []);
        return { wager, participantCount: participants.length };
      }));

      setLobbies(lobbiesWithParticipants.map(({ wager, participantCount }) => ({
        id: wager.id,
        hostId: wager.host_id,
        host: wager.host_name || "Host unavailable",
        teamName: wager.host_team_name || wager.host_name || "Host unavailable",
        hostSlug: wager.host_name || wager.host_id || "",
        mode: wager.team_size,
        gameMode: wager.game_mode_display,
        map: wager.final_map_name || "Map pending",
        players: `${participantCount}/${teamCapacity[wager.team_size] || 2}`,
        wager: null,
        status: "Open",
      })));
      setStats({
        activeLobbies: lobbiesWithParticipants.length,
        playersQueued: lobbiesWithParticipants.reduce((total, row) => total + row.participantCount, 0),
        matchesLive: liveRecords.length,
      });
    } catch (error) {
      console.error("Failed to load 8s lobbies:", error);
      toast({ title: "Could not load lobbies", description: error.message || "Please try again.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleJoinLobby = async (lobby) => {
    if (!user) {
      toast({ title: "Login required", description: "Please log in to join 8s lobbies.", variant: "destructive" });
      return;
    }
    if (!hasActivisionId(user)) {
      toast({ title: "Activision ID required", description: activisionIdRequiredMessage, variant: "destructive" });
      return;
    }

    const required = rosterSize(lobby.mode);
    const selectedTeam = compatibleTeamsFor(lobby).find((team) => team.id === joinTeamByLobby[lobby.id]);
    if (required > 1 && !joinTeamByLobby[lobby.id]) {
      toast({ title: "Team required", description: `Select an 8s team with ${required} active players.`, variant: "destructive" });
      return;
    }
    if (required > 1 && (!selectedTeam || selectedTeam.members.length < required)) {
      toast({ title: "Roster incomplete", description: `That team needs ${required} active players before it can join this lobby.`, variant: "destructive" });
      return;
    }
    setJoiningId(lobby.id);
    try {
      const response = await base44.functions.invoke("acceptWager", {
        wager_id: lobby.id,
        team_id: joinTeamByLobby[lobby.id] || undefined,
        challenger_banned_map: null,
        challenger_banned_map_name: "",
      });
      if (response.data.success) {
        toast({ title: "Lobby joined", description: "Redirecting to 8s match room..." });
        navigate(`/8s-match/${lobby.id}`);
      } else {
        toast({ title: "Failed to join", description: response.data.error || "Try again", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Failed to join", description: error.message || "Try again", variant: "destructive" });
    } finally {
      setJoiningId(null);
      loadLobbies();
    }
  };

  const filtered = lobbies.filter(l => {
    if (selectedMode !== "All" && l.mode !== selectedMode) return false;
    if (selectedGameMode !== "All" && l.gameMode !== selectedGameMode) return false;
    if (searchQuery && !l.host.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });
  const compatibleTeamsFor = (_lobby) => (
    userTeams.filter((team) => (
      (team.team_type === "8s" || team.team_type === "general")
      && team.captain_id === user?.id
    ))
  );

  return (
    <div className="min-h-screen py-8">
      <div className="max-w-[1600px] mx-auto px-4 lg:px-6">
        <CompetitionHero
          eyebrow="Season 1 Match Hub"
          title="8s Lobbies"
          description="Find an open lobby, bring your roster, and move straight into the same competitive match-room flow used by tournaments."
          action={
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-cyan text-background font-bold text-xs rounded-lg hover:shadow-lg hover:shadow-cyan/25 transition-all uppercase tracking-wider"
            >
              <Plus className="w-3.5 h-3.5" /> Create Lobby
            </button>
          }
          stats={[
            { label: "Active Lobbies", value: stats.activeLobbies, icon: Gamepad2, color: "text-cyan" },
            { label: "Players Queued", value: stats.playersQueued, icon: Users, color: "text-green" },
            { label: "Matches Live", value: stats.matchesLive, icon: Zap, color: "text-orange" },
            { label: "Queue Type", value: "Open", icon: Clock, color: "text-purple-400" },
          ]}
        />
        <ActivisionIdNotice user={user} className="mb-6" />

        {/* Filters */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-4 mb-6">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-vapor" />
            <input
              type="text"
              placeholder="Search by host..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-secondary rounded-lg text-sm border border-white/5 focus:border-cyan/30 focus:outline-none transition-all"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {modes.map(m => (
              <button
                key={m}
                onClick={() => setSelectedMode(m)}
                className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                  selectedMode === m ? "bg-cyan text-background" : "bg-secondary text-vapor hover:text-foreground"
                }`}
              >{m}</button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {gameModes.map(gm => (
              <button
                key={gm}
                onClick={() => setSelectedGameMode(gm)}
                className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                  selectedGameMode === gm ? "bg-orange/20 text-orange border border-orange/30" : "bg-secondary text-vapor hover:text-foreground"
                }`}
              >{gm}</button>
            ))}
          </div>
        </div>

        {/* Lobby List */}
        <div className="glass rounded-xl border border-white/5 overflow-hidden">
          <div className="hidden md:grid grid-cols-7 gap-4 px-5 py-3 border-b border-white/5 text-xs text-vapor uppercase tracking-wider font-semibold">
            <span>Host</span>
            <span>Mode</span>
            <span>Game Mode</span>
            <span>Map</span>
            <span>Players</span>
            <span>Wager</span>
            <span>Status</span>
          </div>
          <div className="divide-y divide-white/5">
            {loading ? (
              <div className="px-5 py-8 text-center text-vapor">Loading 8s lobbies...</div>
            ) : filtered.length === 0 ? (
              <div className="px-5 py-8 text-center text-vapor">No 8s lobbies available.</div>
            ) : filtered.map((lobby) => (
              <motion.div
                key={lobby.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                whileHover={{ backgroundColor: "rgba(255,255,255,0.02)", transition: { duration: 0.1, ease: "easeOut" } }}
                className="grid grid-cols-2 md:grid-cols-7 gap-2 md:gap-4 px-5 py-4 cursor-pointer items-center transition-all"
              >
                <div>
                  <Link to={`/profile/${lobby.hostSlug}`} className="font-semibold text-sm hover:text-cyan transition-colors">{lobby.host}</Link>
                </div>
                <span className="text-sm font-mono text-cyan">{lobby.mode}</span>
                <span className="text-sm text-vapor hidden md:block">{lobby.gameMode}</span>
                <span className="text-xs text-vapor hidden md:block">{lobby.map}</span>
                <span className="text-sm font-mono">{lobby.players}</span>
                <span className={`text-sm font-mono font-bold hidden md:block ${lobby.wager ? "text-green" : "text-vapor"}`}>
                  {lobby.wager || "Free"}
                </span>
                <div className="flex items-center justify-between md:justify-start">
                  <span className={`text-xs font-semibold ${
                    lobby.status === "Open" ? "text-green" :
                    lobby.status === "Almost Full" ? "text-orange" :
                    lobby.status === "In Progress" ? "text-red-400" : "text-cyan"
                  }`}>{lobby.status}</span>
                  {lobby.hostId === user?.id ? (
                    <Link to={`/8s-match/${lobby.id}`} className="ml-3 px-3 py-1.5 bg-secondary text-cyan text-xs font-bold rounded hover:bg-white/10 transition-all">
                      Open Room
                    </Link>
                  ) : lobby.status !== "In Progress" && lobby.players.split("/")[0] !== lobby.players.split("/")[1] && (
                    <div className="ml-3 flex flex-col gap-2">
                      {rosterSize(lobby.mode) > 1 && (
                        <>
                          <select
                            value={joinTeamByLobby[lobby.id] || ""}
                            onChange={(event) => setJoinTeamByLobby((current) => ({ ...current, [lobby.id]: event.target.value }))}
                            className="px-2 py-1.5 bg-secondary text-vapor text-xs rounded border border-white/5 focus:border-cyan/30 focus:outline-none"
                          >
                            <option value="">Select team</option>
                            {compatibleTeamsFor(lobby).map((team) => (
                              <option key={team.id} value={team.id}>{team.name} ({team.members.length}/{rosterSize(lobby.mode)})</option>
                            ))}
                          </select>
                          {joinTeamByLobby[lobby.id] && compatibleTeamsFor(lobby).find((team) => team.id === joinTeamByLobby[lobby.id])?.members.length < rosterSize(lobby.mode) && (
                            <span className="text-[10px] text-orange">Needs {rosterSize(lobby.mode)} active players</span>
                          )}
                        </>
                      )}
                      <button onClick={() => handleJoinLobby(lobby)} disabled={joiningId === lobby.id} className="px-3 py-1 bg-cyan/10 text-cyan text-xs font-bold rounded hover:bg-cyan/20 transition-all">
                        {joiningId === lobby.id ? "Joining" : "Join"}
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Create Lobby Modal */}
        <CreateLobbyModal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          user={user}
          mode="8s"
          onCreate={(result) => {
            setIsCreateModalOpen(false);
            loadLobbies();
            if (result?.wager_id) navigate(`/8s-match/${result.wager_id}`);
          }}
        />
      </div>
    </div>
  );
}
