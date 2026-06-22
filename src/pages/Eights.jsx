import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, Search, Users, Clock, Zap, Filter, ChevronDown,
  Gamepad2, Target, Crosshair, RefreshCw
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import CreateLobbyModal from "@/components/match/CreateLobbyModal";
import { toast } from "@/components/ui/use-toast";

const modes = ["All", "1v1", "2v2", "3v3", "4v4"];
const gameModes = ["All", "Search & Destroy", "Hardpoint", "Overload"];
const teamCapacity = { "1v1": 2, "2v2": 4, "3v3": 6, "4v4": 8 };

export default function Eights() {
  const navigate = useNavigate();
  const [selectedMode, setSelectedMode] = useState("All");
  const [selectedGameMode, setSelectedGameMode] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [lobbies, setLobbies] = useState([]);
  const [stats, setStats] = useState({ activeLobbies: 0, playersQueued: 0, matchesLive: 0 });
  const [joiningId, setJoiningId] = useState(null);

  useEffect(() => {
    loadLobbies();
  }, []);

  const loadLobbies = async () => {
    try {
      const currentUser = await base44.auth.me().catch(() => null);
      setUser(currentUser);
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
        host: wager.host_name || "Host unavailable",
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
    }
  };

  const handleJoinLobby = async (lobby) => {
    setJoiningId(lobby.id);
    try {
      const response = await base44.functions.invoke("acceptWager", {
        wager_id: lobby.id,
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

  return (
    <div className="min-h-screen py-8">
      <div className="max-w-[1600px] mx-auto px-4 lg:px-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-black tracking-tight">8s Lobbies</h1>
            <p className="text-vapor text-sm mt-1">Find a lobby or create your own</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-cyan text-background font-bold text-xs rounded-lg hover:shadow-lg hover:shadow-cyan/25 transition-all uppercase tracking-wider"
            >
              <Plus className="w-3.5 h-3.5" /> Create Lobby
            </button>
          </div>
        </div>

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

        {/* Stats Bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: "Active Lobbies", value: stats.activeLobbies, icon: Gamepad2, color: "text-cyan" },
            { label: "Players Queued", value: stats.playersQueued, icon: Users, color: "text-green" },
            { label: "Matches Live", value: stats.matchesLive, icon: Zap, color: "text-orange" },
            { label: "Queue Type", value: "Open", icon: Clock, color: "text-purple-400" },
          ].map((s, i) => (
            <div key={i} className="glass rounded-lg px-4 py-3 flex items-center gap-3 border border-white/5">
              <s.icon className={`w-4 h-4 ${s.color}`} />
              <div>
                <p className={`text-lg font-bold font-mono ${s.color}`}>{s.value}</p>
                <p className="text-[10px] text-vapor uppercase tracking-wider">{s.label}</p>
              </div>
            </div>
          ))}
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
            {filtered.length === 0 ? (
              <div className="px-5 py-8 text-center text-vapor">No 8s lobbies available.</div>
            ) : filtered.map((lobby) => (
              <motion.div
                key={lobby.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                whileHover={{ backgroundColor: "rgba(255,255,255,0.02)" }}
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
                  {lobby.status !== "In Progress" && lobby.players.split("/")[0] !== lobby.players.split("/")[1] && (
                    <button onClick={() => handleJoinLobby(lobby)} disabled={joiningId === lobby.id} className="ml-3 px-3 py-1 bg-cyan/10 text-cyan text-xs font-bold rounded hover:bg-cyan/20 transition-all">
                      {joiningId === lobby.id ? "Joining" : "Join"}
                    </button>
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
          onCreate={() => {
            setIsCreateModalOpen(false);
            loadLobbies();
          }}
        />
      </div>
    </div>
  );
}
