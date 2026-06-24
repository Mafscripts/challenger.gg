import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Zap, Plus, DollarSign,
  Star, TrendingUp
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/use-toast";
import CreateLobbyModal from "@/components/match/CreateLobbyModal";
import MapVetoModal from "@/components/match/MapVetoModal";

const rosterSize = (teamSize) => Number.parseInt(String(teamSize || "1v1").split("v")[0], 10) || 1;

export default function Wagers() {
  const navigate = useNavigate();
  const [tab, setTab] = useState("active");
  const [amountFilter, setAmountFilter] = useState("All");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isVetoModalOpen, setIsVetoModalOpen] = useState(false);
  const [selectedWager, setSelectedWager] = useState(null);
  const [wagers, setWagers] = useState([]);
  const [historyWagers, setHistoryWagers] = useState([]);
  const [user, setUser] = useState(null);
  const [userTeams, setUserTeams] = useState([]);
  const [acceptTeamByWager, setAcceptTeamByWager] = useState({});
  const [acceptPaymentByWager, setAcceptPaymentByWager] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [currentUser, wagerList] = await Promise.all([
        base44.auth.me().catch(() => null),
        base44.entities.Wager.filter({ status: "open" })
      ]);
      if (currentUser) {
        const wallets = await base44.entities.Wallet.filter({ user_id: currentUser.id });
        const [hosted, challenged, memberships] = await Promise.all([
          base44.entities.Wager.filter({ host_id: currentUser.id }, "-created_date", 50),
          base44.entities.Wager.filter({ challenger_id: currentUser.id }, "-created_date", 50),
          base44.entities.TeamMember.filter({ user_id: currentUser.id }, "-joined_date", 50).catch(() => [])
        ]);
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
        const combinedHistory = [...hosted, ...challenged]
          .filter((w, index, list) => list.findIndex(item => item.id === w.id) === index)
          .filter(w => ["completed", "cancelled", "disputed", "score_conflict"].includes(w.status))
          .sort((a, b) => new Date(b.match_completed_date || b.accepted_date || b.created_date || 0) - new Date(a.match_completed_date || a.accepted_date || a.created_date || 0));
        const wallet = wallets[0];
        setUser({
          ...currentUser,
          wallet_balance: Number(wallet?.available_balance ?? 0),
          wallet
        });
        setHistoryWagers(combinedHistory);
      } else {
        setUser(null);
        setUserTeams([]);
        setHistoryWagers([]);
      }
      setWagers(wagerList.filter(w => (w.match_type || ((w.entry_fee ?? w.amount ?? 0) > 0 ? "wagers" : "ranked")) === "wagers"));
      setLoading(false);
    } catch (error) {
      console.error("Failed to load wagers:", error);
      setLoading(false);
    }
  };

  const handleAccept = async (wager) => {
    if (!user) {
      toast({
        title: "Login required",
        description: "Please login to accept wagers",
        variant: "destructive"
      });
      return;
    }

    const entryFee = wager.entry_fee ?? wager.amount ?? 0;
    const required = rosterSize(wager.team_size);
    const isTeamWager = required > 1;
    const selectedTeamId = acceptTeamByWager[wager.id];
    const paymentMode = acceptPaymentByWager[wager.id] || "own";
    const selectedTeam = compatibleTeamsFor(wager).find((team) => team.id === selectedTeamId);
    if (isTeamWager && !selectedTeamId) {
      toast({
        title: "Team required",
        description: `Select a wager team with ${required} active players.`,
        variant: "destructive"
      });
      return;
    }
    if (isTeamWager && (!selectedTeam || selectedTeam.members.length < required)) {
      toast({
        title: "Roster incomplete",
        description: `That team needs ${required} active players before it can join this wager.`,
        variant: "destructive"
      });
      return;
    }
    const neededBalance = isTeamWager && paymentMode === "full_team" ? entryFee * required : entryFee;
    if ((user.wallet_balance || 0) < neededBalance) {
      toast({
        title: "Insufficient balance",
        description: `You need $${neededBalance} to accept this wager`,
        variant: "destructive"
      });
      return;
    }

    setSelectedWager(wager);
    setIsVetoModalOpen(true);
  };

  const handleVetoComplete = async ({ challenger_banned_map, challenger_banned_map_name, final_map, final_map_name }) => {
    try {
      const response = await base44.functions.invoke('acceptWager', {
        wager_id: selectedWager.id,
        team_id: acceptTeamByWager[selectedWager.id] || undefined,
        payment_mode: acceptPaymentByWager[selectedWager.id] || "own",
        challenger_banned_map,
        challenger_banned_map_name,
        final_map,
        final_map_name,
      });

      if (response.data.success) {
        toast({
          title: "Wager accepted!",
          description: `Map: ${response.data.final_map_name || final_map_name}`,
        });
        navigate(`/wagers-match/${selectedWager.id}`);
      } else {
        toast({
          title: "Failed to accept",
          description: response.data.error || "Unknown error",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error("Failed to accept wager:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to accept wager",
        variant: "destructive"
      });
    } finally {
      setIsVetoModalOpen(false);
      setSelectedWager(null);
      loadData();
    }
  };

  const filteredWagers = wagers.filter(w => {
    const entryFee = w.entry_fee ?? w.amount ?? 0;
    if (amountFilter === "$5-$10" && (entryFee < 5 || entryFee > 10)) return false;
    if (amountFilter === "$25-$50" && (entryFee < 25 || entryFee > 50)) return false;
    if (amountFilter === "$100+" && entryFee < 100) return false;
    return true;
  });

  const hasActivePremium = user?.is_premium && (!user?.premium_expires || new Date(user.premium_expires) > new Date());
  const compatibleTeamsFor = (_wager) => (
    userTeams.filter((team) => (
      (team.team_type === "wager" || team.team_type === "general")
      && team.captain_id === user?.id
    ))
  );

  return (
    <div className="min-h-screen py-8">
      <div className="max-w-[1600px] mx-auto px-4 lg:px-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-black tracking-tight">Wagers</h1>
            <p className="text-vapor text-sm mt-1">Put your skills on the line</p>
          </div>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-green text-background font-bold text-xs rounded-lg hover:shadow-lg hover:shadow-green/25 transition-all uppercase tracking-wider"
          >
            <Plus className="w-3.5 h-3.5" /> Create Wager
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: "Active Wagers", value: wagers.length.toString(), icon: Zap, color: "text-orange" },
            { label: "Your Balance", value: user ? `$${(user.wallet_balance || 0).toFixed(2)}` : "$0", icon: DollarSign, color: "text-green" },
            { label: "Premium", value: hasActivePremium ? "Yes" : "No", icon: Star, color: hasActivePremium ? "text-yellow-400" : "text-vapor" },
            { label: "Fee Rate", value: hasActivePremium ? "5%" : "10%", icon: TrendingUp, color: "text-cyan" },
          ].map((s, i) => (
            <div 
              key={i} 
              className="glass rounded-lg px-4 py-3 border border-white/5"
            >
              <s.icon className={`w-4 h-4 ${s.color} mb-2`} />
              <p className={`text-xl font-bold font-mono ${s.color}`}>{s.value}</p>
              <p className="text-[10px] text-vapor uppercase tracking-wider">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-4 mb-6 border-b border-white/5 pb-4">
          {["active", "history"].map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold capitalize transition-all ${
                tab === t ? "bg-cyan/10 text-cyan" : "text-vapor hover:text-foreground"
              }`}
            >{t === "active" ? "Active Wagers" : "My History"}</button>
          ))}
          <div className="ml-auto flex gap-2">
            {["All", "$5-$10", "$25-$50", "$100+"].map(a => (
              <button
                key={a}
                onClick={() => setAmountFilter(a)}
                className={`px-3 py-1.5 rounded text-xs font-semibold transition-all ${
                  amountFilter === a ? "bg-green/10 text-green border border-green/20" : "bg-secondary text-vapor"
                }`}
              >{a}</button>
            ))}
          </div>
        </div>

        {tab === "active" ? (
          <div className="glass rounded-xl border border-white/5 overflow-hidden">
            <div className="hidden md:grid grid-cols-6 gap-4 px-5 py-3 border-b border-white/5 text-xs text-vapor uppercase tracking-wider font-semibold">
              <span>Host</span>
              <span>Mode</span>
              <span>Amount</span>
              <span>Format</span>
              <span>Status</span>
              <span></span>
            </div>
            <div className="divide-y divide-white/5">
              {loading ? (
                <div className="px-5 py-8 text-center text-vapor">Loading wagers...</div>
              ) : filteredWagers.length === 0 ? (
                <div className="px-5 py-8 text-center text-vapor">No active wagers</div>
              ) : (
                filteredWagers.map((w) => (
                  <motion.div
                    key={w.id}
                    whileHover={{ backgroundColor: "rgba(255,255,255,0.02)" }}
                    className="grid grid-cols-2 md:grid-cols-6 gap-2 md:gap-4 px-5 py-4 items-center"
                  >
                    <Link to={`/profile/${w.host_name || w.host_id || ""}`} className="font-semibold text-sm hover:text-cyan transition-colors">{w.host_name || "Host unavailable"}</Link>
                    <span className="text-sm text-vapor">{w.team_size} {w.game_mode_display}</span>
                    <span className="text-sm font-mono font-bold text-green">${w.entry_fee ?? w.amount ?? 0}</span>
                    <span className="text-sm font-mono font-bold text-cyan">BO{w.best_of || 1}</span>
                    <span className={`text-xs font-semibold text-green`}>{w.status}</span>
                    <div>
                      {w.status === "open" && (
                        <div className="flex flex-col gap-2">
                          {rosterSize(w.team_size) > 1 && (
                            <>
                              <select
                                value={acceptTeamByWager[w.id] || ""}
                                onChange={(event) => setAcceptTeamByWager((current) => ({ ...current, [w.id]: event.target.value }))}
                                className="px-2 py-1.5 bg-secondary text-vapor text-xs rounded border border-white/5 focus:border-cyan/30 focus:outline-none"
                              >
                                <option value="">Select team</option>
                                {compatibleTeamsFor(w).map((team) => (
                                  <option key={team.id} value={team.id}>{team.name} ({team.members.length}/{rosterSize(w.team_size)})</option>
                                ))}
                              </select>
                              {acceptTeamByWager[w.id] && compatibleTeamsFor(w).find((team) => team.id === acceptTeamByWager[w.id])?.members.length < rosterSize(w.team_size) && (
                                <span className="text-[10px] text-orange">
                                  Needs {rosterSize(w.team_size)} active players
                                </span>
                              )}
                              <select
                                value={acceptPaymentByWager[w.id] || "own"}
                                onChange={(event) => setAcceptPaymentByWager((current) => ({ ...current, [w.id]: event.target.value }))}
                                className="px-2 py-1.5 bg-secondary text-vapor text-xs rounded border border-white/5 focus:border-cyan/30 focus:outline-none"
                              >
                                <option value="own">Pay my own entry only</option>
                                <option value="full_team">Pay full team entry</option>
                              </select>
                            </>
                          )}
                          <button 
                            onClick={() => handleAccept(w)}
                            className="px-4 py-1.5 bg-green/10 text-green text-xs font-bold rounded hover:bg-green/20 transition-all"
                          >
                            Accept
                          </button>
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          </div>
        ) : (
          <div className="glass rounded-xl border border-white/5 overflow-hidden">
            <div className="divide-y divide-white/5">
              {historyWagers.length === 0 ? (
                <div className="px-5 py-8 text-center text-vapor">
                  Match history will appear here
                </div>
              ) : (
                historyWagers.map((w) => {
                  const entryFee = w.entry_fee ?? w.amount ?? 0;
                  const result = w.winner_id === user?.id ? "Won" : w.status === "completed" ? "Lost" : w.status;
                  return (
                    <div key={w.id} className="grid grid-cols-2 md:grid-cols-6 gap-2 md:gap-4 px-5 py-4 items-center">
                      <span className="font-semibold text-sm">{w.host_name || "Host unavailable"} vs {w.challenger_name || "Opponent pending"}</span>
                      <span className="text-sm text-vapor">{w.team_size} {w.game_mode_display}</span>
                      <span className="text-sm font-mono font-bold text-green">${entryFee}</span>
                      <span className="text-sm font-mono font-bold text-cyan">{w.winner_score || 0}-{w.loser_score || 0}</span>
                      <span className={`text-xs font-semibold ${result === "Won" ? "text-green" : result === "Lost" ? "text-red-400" : "text-orange"}`}>{result}</span>
                      <Link to={`/wagers-match/${w.id}`} className="text-xs text-cyan hover:underline">View</Link>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Create Lobby Modal */}
        <CreateLobbyModal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          user={user}
          mode="wager"
          onCreate={() => {
            loadData();
            setIsCreateModalOpen(false);
          }}
        />

        {/* Map Veto Modal */}
        <MapVetoModal
          isOpen={isVetoModalOpen}
          onClose={() => {
            setIsVetoModalOpen(false);
            setSelectedWager(null);
          }}
          wager={selectedWager}
          user={user}
          onComplete={handleVetoComplete}
        />
      </div>
    </div>
  );
}
