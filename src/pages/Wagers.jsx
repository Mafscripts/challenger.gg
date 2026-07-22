import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Zap, Plus, DollarSign, Star, Clock3, ShieldCheck, Swords, History
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/use-toast";
import CreateLobbyModal from "@/components/match/CreateLobbyModal";
import MapVetoModal from "@/components/match/MapVetoModal";
import ActivisionIdNotice from "@/components/competition/ActivisionIdNotice";
import { activisionIdRequiredMessage, hasActivisionId } from "@/lib/activision";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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
  const [cancellingWagerId, setCancellingWagerId] = useState(null);
  const [wagerToCancel, setWagerToCancel] = useState(null);
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
    if (!hasActivisionId(user)) {
      toast({ title: "Activision ID required", description: activisionIdRequiredMessage, variant: "destructive" });
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

  const handleCancel = async (wager) => {
    setCancellingWagerId(wager.id);
    try {
      const response = await base44.functions.invoke("refundWager", {
        wager_id: wager.id,
        reason: "Cancelled by host while waiting for an opponent",
      });
      if (!response.data?.success) {
        toast({
          title: "Could not cancel wager",
          description: response.data?.error || "Please try again.",
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "Wager cancelled",
        description: "Your entry fee has been returned to your wallet.",
      });
      setWagerToCancel(null);
      await loadData();
    } catch (error) {
      toast({
        title: "Could not cancel wager",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setCancellingWagerId(null);
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
      team.team_type === "wager"
      && team.captain_id === user?.id
    ))
  );

  return (
    <div className="min-h-screen py-6 md:py-10">
      <div className="max-w-[1600px] mx-auto px-4 lg:px-6">
        <section className="relative mb-8 overflow-hidden rounded-2xl border border-white/10 bg-[linear-gradient(135deg,rgba(20,216,255,0.08),rgba(255,255,255,0.025)_45%,rgba(0,255,136,0.055))] p-6 md:p-9">
          <div className="pointer-events-none absolute -right-16 -top-20 h-52 w-52 rounded-full bg-green/10 blur-3xl" />
          <div className="relative flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-cyan">
                <Swords className="h-4 w-4" /> Competitive wagers
              </div>
              <h1 className="text-3xl font-black tracking-tight md:text-4xl">Find your next match</h1>
              <p className="mt-3 max-w-2xl text-base leading-relaxed text-vapor">Post a challenge or accept an open wager. Your entry is secured until the match is completed.</p>
            </div>
            <button onClick={() => setIsCreateModalOpen(true)} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-green px-6 py-3.5 text-sm font-black uppercase tracking-wider text-background shadow-[0_10px_30px_rgba(0,255,136,0.16)] transition-all hover:-translate-y-0.5 hover:shadow-[0_14px_36px_rgba(0,255,136,0.25)]">
              <Plus className="h-[18px] w-[18px]" /> Post a wager
            </button>
          </div>
          <div className="relative mt-7 grid grid-cols-2 gap-4 border-t border-white/5 pt-6 md:grid-cols-4">
            {[
              { label: "Open now", value: wagers.length, icon: Zap, color: "text-orange" },
              { label: "Wallet", value: user ? `$${(user.wallet_balance || 0).toFixed(2)}` : "$0.00", icon: DollarSign, color: "text-green" },
              { label: "Account", value: hasActivePremium ? "Premium" : "Standard", icon: Star, color: hasActivePremium ? "text-yellow-400" : "text-vapor" },
              { label: "Platform fee", value: hasActivePremium ? "5%" : "10%", icon: ShieldCheck, color: "text-cyan" },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="flex items-center gap-4 rounded-xl border border-white/5 bg-black/15 px-4 py-4">
                <div className={`flex h-11 w-11 items-center justify-center rounded-lg bg-white/[0.04] ${color}`}><Icon className="h-5 w-5" /></div>
                <div><p className="text-[11px] font-black uppercase tracking-wider text-vapor">{label}</p><p className={`mt-1 font-mono text-lg font-black ${color}`}>{value}</p></div>
              </div>
            ))}
          </div>
        </section>
        <ActivisionIdNotice user={user} className="mb-5" />

        <div className="mb-5 flex flex-col gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex rounded-lg bg-black/20 p-1">
            <button onClick={() => setTab("active")} className={`flex flex-1 items-center justify-center gap-2 rounded-md px-5 py-2.5 text-sm font-bold transition-all sm:flex-none ${tab === "active" ? "bg-cyan/10 text-cyan shadow-sm" : "text-vapor hover:text-foreground"}`}><Zap className="h-4 w-4" /> Open wagers</button>
            <button onClick={() => setTab("history")} className={`flex flex-1 items-center justify-center gap-2 rounded-md px-5 py-2.5 text-sm font-bold transition-all sm:flex-none ${tab === "history" ? "bg-cyan/10 text-cyan shadow-sm" : "text-vapor hover:text-foreground"}`}><History className="h-4 w-4" /> My history</button>
          </div>
          {tab === "active" && <div className="flex gap-1 overflow-x-auto">
            {["All", "$5-$10", "$25-$50", "$100+"].map(a => <button key={a} onClick={() => setAmountFilter(a)} className={`whitespace-nowrap rounded-md border px-4 py-2.5 text-xs font-black transition-all ${amountFilter === a ? "border-green/30 bg-green/10 text-green" : "border-transparent text-vapor hover:bg-white/5 hover:text-foreground"}`}>{a}</button>)}
          </div>}
        </div>

        {tab === "active" ? (
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-card/70 shadow-[0_18px_50px_rgba(0,0,0,0.18)]">
            <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
              <div><h2 className="text-lg font-black">Open challenges</h2><p className="mt-1 text-sm text-vapor">Choose a match that fits your team and stake.</p></div>
              <span className="rounded-full bg-cyan/10 px-3 py-1.5 font-mono text-xs font-black text-cyan">{filteredWagers.length} OPEN</span>
            </div>
            <div className="hidden grid-cols-[1.1fr_1.6fr_.7fr_.7fr_1.5fr] gap-5 border-b border-white/5 bg-white/[0.015] px-6 py-3.5 text-xs font-black uppercase tracking-[0.12em] text-vapor md:grid">
              <span>Player</span><span>Challenge</span><span>Stake</span><span>Series</span><span className="text-right">Action</span>
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
                    whileHover={{ backgroundColor: "rgba(255,255,255,0.02)", transition: { duration: 0.1, ease: "easeOut" } }}
                    className="grid gap-4 px-6 py-6 md:min-h-24 md:grid-cols-[1.1fr_1.6fr_.7fr_.7fr_1.5fr] md:items-center md:gap-5"
                  >
                    <div><Link to={`/profile/${w.host_name || w.host_id || ""}`} className="text-base font-black hover:text-cyan">{w.host_name || "Host unavailable"}</Link>{w.host_id === user?.id && <span className="ml-2 rounded bg-cyan/10 px-2 py-1 text-[10px] font-black uppercase text-cyan">You</span>}</div>
                    <div><p className="text-base font-bold">{w.game_mode_display}</p><p className="mt-1.5 text-sm text-vapor">{w.team_size} · {w.final_map_name || "Map decided by veto"}</p></div>
                    <div><p className="font-mono text-xl font-black text-green">${w.entry_fee ?? w.amount ?? 0}</p><p className="text-[11px] uppercase text-vapor">per player</p></div>
                    <span className="w-fit rounded-md border border-cyan/15 bg-cyan/5 px-3 py-1.5 font-mono text-xs font-black text-cyan">BO{w.best_of || 1}</span>
                    <div className="md:justify-self-end">
                      {w.status === "open" && w.host_id === user?.id ? (
                        <div className="flex items-center gap-3">
                          <span className="inline-flex items-center gap-2 text-sm font-bold text-orange"><Clock3 className="h-4 w-4" /> Awaiting opponent</span>
                          <button
                            type="button"
                            onClick={() => setWagerToCancel(w)}
                            disabled={cancellingWagerId === w.id}
                            className="rounded-lg border border-white/10 px-4 py-2.5 text-xs font-black text-vapor transition-all hover:border-red-400/30 hover:bg-red-400/10 hover:text-red-400 disabled:opacity-50"
                          >
                            {cancellingWagerId === w.id ? "Cancelling..." : "Cancel"}
                          </button>
                        </div>
                      ) : w.status === "open" && (
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
                            className="rounded-lg bg-green px-5 py-2.5 text-xs font-black uppercase tracking-wider text-background transition-all hover:shadow-lg hover:shadow-green/20"
                          >
                            Accept wager
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
          onCreate={(result) => {
            loadData();
            setIsCreateModalOpen(false);
            if (result?.wager_id) {
              toast({ title: "Wager posted", description: "The match room opens after another player accepts your wager." });
            }
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

        <AlertDialog open={Boolean(wagerToCancel)} onOpenChange={(open) => !open && !cancellingWagerId && setWagerToCancel(null)}>
          <AlertDialogContent className="border-white/10 bg-card">
            <AlertDialogHeader>
              <AlertDialogTitle>Cancel this wager?</AlertDialogTitle>
              <AlertDialogDescription>Your ${wagerToCancel?.entry_fee ?? wagerToCancel?.amount ?? 0} entry fee will be returned to your wallet. This cannot be undone.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={Boolean(cancellingWagerId)}>Keep wager</AlertDialogCancel>
              <AlertDialogAction onClick={(event) => { event.preventDefault(); handleCancel(wagerToCancel); }} disabled={Boolean(cancellingWagerId)} className="bg-red-500 text-white hover:bg-red-500/90">
                {cancellingWagerId ? "Cancelling..." : "Yes, cancel wager"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
