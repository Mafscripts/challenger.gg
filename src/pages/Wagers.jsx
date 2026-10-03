import React, { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  Plus, Clock3, Users
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/use-toast";
import CreateLobbyModal from "@/components/match/CreateLobbyModal";
import CompetitionLadder from "@/components/competition/CompetitionLadder";
import { CompetitionMatchfinder, CompetitionMatchfinderRow } from "@/components/competition/CompetitionMatchfinder";
import ActivisionIdNotice from "@/components/competition/ActivisionIdNotice";
import { activisionIdRequiredMessage, hasActivisionId } from "@/lib/activision";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const rosterSize = (teamSize) => Number.parseInt(String(teamSize || "1v1").split("v")[0], 10) || 1;
const isWagerMatch = (wager) => (
  (wager.match_type || ((wager.entry_fee ?? wager.amount ?? 0) > 0 ? "wagers" : "ranked")) === "wagers"
);

export default function Wagers() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedWagerId = searchParams.get("accept");
  const requestedTeamId = searchParams.get("team");
  const [amountFilter, setAmountFilter] = useState("All");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [wagers, setWagers] = useState([]);
  const [historyWagers, setHistoryWagers] = useState([]);
  const [user, setUser] = useState(null);
  const [userTeams, setUserTeams] = useState([]);
  const [acceptTeamByWager, setAcceptTeamByWager] = useState({});
  const [acceptPaymentByWager, setAcceptPaymentByWager] = useState({});
  const [acceptingWagerId, setAcceptingWagerId] = useState(null);
  const [cancellingWagerId, setCancellingWagerId] = useState(null);
  const [wagerToCancel, setWagerToCancel] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    let active = true;
    let refreshing = false;
    const refresh = async () => {
      if (refreshing || document.visibilityState === "hidden") return;
      refreshing = true;
      try {
        const wagerList = await base44.entities.Wager.filterFresh({ status: "open" }, "-created_date", 50);
        if (!active) return;
        setWagers((wagerList || []).filter(isWagerMatch));

        if (user?.id) {
          const [wallets, hosted, challenged] = await Promise.all([
            base44.entities.Wallet.filterFresh({ user_id: user.id }, "-created_date", 1),
            base44.entities.Wager.filterFresh({ host_id: user.id }, "-created_date", 50),
            base44.entities.Wager.filterFresh({ challenger_id: user.id }, "-created_date", 50),
          ]);
          if (!active) return;
          const wallet = (wallets || [])[0];
          setUser((current) => current ? { ...current, wallet_balance: Number(wallet?.available_balance ?? current.wallet_balance ?? 0), wallet: wallet || current.wallet } : current);
          setHistoryWagers([...hosted, ...challenged]
            .filter((wager, index, list) => list.findIndex((item) => item.id === wager.id) === index)
            .filter(isWagerMatch)
            .filter((wager) => ["completed", "cancelled", "disputed", "score_conflict"].includes(wager.status))
            .sort((a, b) => new Date(b.match_completed_date || b.accepted_date || b.created_date || 0) - new Date(a.match_completed_date || a.accepted_date || a.created_date || 0)));
        }
      } catch (error) {
        console.error("Failed to refresh wagers:", error);
      } finally {
        refreshing = false;
      }
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const interval = setInterval(refresh, 5000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      active = false;
      clearInterval(interval);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [user?.id]);

  const loadData = async () => {
    try {
      const [currentUser, wagerList] = await Promise.all([
        base44.auth.me().catch(() => null),
        base44.entities.Wager.filterFresh({ status: "open" }, "-created_date", 50)
      ]);
      if (currentUser) {
        const wallets = await base44.entities.Wallet.filterFresh({ user_id: currentUser.id }, "-created_date", 1);
        const [hosted, challenged, memberships] = await Promise.all([
          base44.entities.Wager.filterFresh({ host_id: currentUser.id }, "-created_date", 50),
          base44.entities.Wager.filterFresh({ challenger_id: currentUser.id }, "-created_date", 50),
          base44.entities.TeamMember.filterFresh({ user_id: currentUser.id }, "-joined_date", 50).catch(() => [])
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
        const activeTeams = teams.filter(Boolean);
        setUserTeams(activeTeams);
        if (requestedWagerId && requestedTeamId && activeTeams.some((team) => String(team.id) === String(requestedTeamId))) {
          setAcceptTeamByWager((current) => ({ ...current, [requestedWagerId]: requestedTeamId }));
        }
        const combinedHistory = [...hosted, ...challenged]
          .filter((w, index, list) => list.findIndex(item => item.id === w.id) === index)
          .filter(isWagerMatch)
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
      setWagers((wagerList || []).filter(isWagerMatch));
      setLoading(false);
    } catch (error) {
      console.error("Failed to load wagers:", error);
      setLoading(false);
    }
  };

  const handleAccept = async (wager) => {
    if (acceptingWagerId) return;
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
    const isTeamWager = true;
    const selectedTeamId = acceptTeamByWager[wager.id];
    const paymentMode = acceptPaymentByWager[wager.id] || "own";
    const selectedTeam = compatibleTeamsFor(wager).find((team) => String(team.id) === String(selectedTeamId));
    if (isTeamWager && !selectedTeamId) {
      const ownedTeams = ownedWagerTeamsFor();
      if (ownedTeams.length === 0) {
        toast({ title: "Create a wager team first", description: "Your team will be set to the right match size automatically." });
        navigate(createTeamUrlFor(wager));
        return;
      }
      toast({
        title: "Team required",
        description: `Choose a roster with ${required} active players, or finish inviting your team first.`,
        variant: "destructive"
      });
      return;
    }
    if (isTeamWager && (!selectedTeam || selectedTeam.members.length < required)) {
      toast({
        title: "Roster incomplete",
        description: `That team needs at least ${required} active players before it can join this wager.`,
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

    setAcceptingWagerId(wager.id);
    try {
      const response = await base44.functions.invoke('acceptWager', {
        wager_id: wager.id,
        team_id: selectedTeamId || undefined,
        payment_mode: paymentMode,
      });

      if (response.data?.success) {
        window.dispatchEvent(new CustomEvent("topfragg:credits-updated"));
        window.dispatchEvent(new CustomEvent("topfragg:notifications-updated", { detail: { refresh: true } }));
        toast({
          title: "Wager accepted!",
          description: `System-selected map: ${response.data.final_map_name || "Open the match room"}`,
        });
        navigate(`/wagers-match/${response.data.wager?.id || wager.id}`);
      } else {
        toast({
          title: "Failed to accept",
        description: response.data?.error || "The wager could not be accepted. Refresh the page and try again.",
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
      setAcceptingWagerId(null);
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

  const compatibleTeamsFor = (wager) => (
    userTeams.filter((team) => (
      ["wager", "general"].includes(team.team_type)
      && String(team.captain_id || "") === String(user?.id || "")
      && team.members.length >= rosterSize(wager.team_size)
    ))
  );

  const ownedWagerTeamsFor = () => (
    userTeams.filter((team) => (
      ["wager", "general"].includes(team.team_type)
      && String(team.captain_id || "") === String(user?.id || "")
    ))
  );

  const createTeamUrlFor = (wager) => {
    const returnTo = `/wagers?accept=${encodeURIComponent(wager.id)}`;
    return `/teams?create=wager&roster=${rosterSize(wager.team_size)}&returnTo=${encodeURIComponent(returnTo)}`;
  };

  return (
    <div className="min-h-screen py-8">
      <div className="max-w-[1600px] mx-auto px-4 lg:px-6">
        <CompetitionLadder
          mode="wagers"
          currentUser={user}
          openCount={wagers.length}
          matchfinder={(
            <div>
              <div className="flex justify-end gap-1 overflow-x-auto border-b border-white/[0.06] px-5 py-3">
                {["All", "$5-$10", "$25-$50", "$100+"].map((amount) => <button key={amount} onClick={() => setAmountFilter(amount)} className={`whitespace-nowrap rounded-md border px-4 py-2 text-[10px] font-black transition-all ${amountFilter === amount ? "border-green/30 bg-green/10 text-green" : "border-transparent text-vapor hover:bg-white/5 hover:text-foreground"}`}>{amount}</button>)}
              </div>
              <CompetitionMatchfinder loading={loading} emptyMessage="No wagers are open right now.">
                {filteredWagers.map((wager) => (
                  <CompetitionMatchfinderRow
                    key={wager.id}
                    game={wager.game_mode_display || wager.game_mode}
                    gameDetail={`${wager.team_size} · $${wager.entry_fee ?? wager.amount ?? 0} per player`}
                    competition="Wager"
                    competitionDetail={`BO${wager.best_of || 1} · ${wager.host_id === user?.id ? "Your wager" : "Open challenge"}`}
                    playRule={wager.play_rule}
                    tone="green"
                    action={wager.host_id === user?.id ? (
                      <div className="flex items-center justify-end gap-2">
                        <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-orange"><Clock3 className="h-3.5 w-3.5" /> Awaiting opponent</span>
                        <button type="button" onClick={() => setWagerToCancel(wager)} disabled={cancellingWagerId === wager.id} className="rounded-lg border border-white/10 px-3 py-2 text-[10px] font-black text-vapor hover:border-red-400/30 hover:text-red-400 disabled:opacity-50">{cancellingWagerId === wager.id ? "Cancelling..." : "Cancel"}</button>
                      </div>
                    ) : user ? (
                      <div className="w-52 space-y-2">
                        {compatibleTeamsFor(wager).length === 0 && (
                          <div className="space-y-2 rounded-lg border border-orange/20 bg-orange/5 px-2.5 py-2.5">
                            <p className="text-[10px] font-semibold leading-relaxed text-orange">{ownedWagerTeamsFor().length > 0 ? `Your wager roster needs at least ${rosterSize(wager.team_size)} active player${rosterSize(wager.team_size) === 1 ? "" : "s"}.` : `You need a wager team with at least ${rosterSize(wager.team_size)} active player${rosterSize(wager.team_size) === 1 ? "" : "s"}.`}</p>
                            {ownedWagerTeamsFor().length > 0 ? (
                              <Link to={`/teams?team=${encodeURIComponent(ownedWagerTeamsFor()[0].id)}`} className="flex w-full items-center justify-center gap-1.5 rounded-md bg-orange px-2.5 py-2 text-[10px] font-black uppercase tracking-wider text-background transition-colors hover:bg-orange/90"><Users className="h-3.5 w-3.5" /> Finish roster</Link>
                            ) : (
                              <Link to={createTeamUrlFor(wager)} className="flex w-full items-center justify-center gap-1.5 rounded-md bg-orange px-2.5 py-2 text-[10px] font-black uppercase tracking-wider text-background transition-colors hover:bg-orange/90"><Users className="h-3.5 w-3.5" /> Create team to accept</Link>
                            )}
                          </div>
                        )}
                        <select value={acceptTeamByWager[wager.id] || ""} onChange={(event) => setAcceptTeamByWager((current) => ({ ...current, [wager.id]: event.target.value }))} disabled={acceptingWagerId === wager.id} className="w-full rounded border border-white/5 bg-secondary px-2 py-1.5 text-xs text-vapor focus:border-cyan/30 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50">
                          <option value="">Select wager team</option>
                          {compatibleTeamsFor(wager).map((team) => <option key={team.id} value={team.id}>{team.name} ({team.members.length} available · {rosterSize(wager.team_size)} needed)</option>)}
                        </select>
                        {rosterSize(wager.team_size) > 1 && <select value={acceptPaymentByWager[wager.id] || "own"} onChange={(event) => setAcceptPaymentByWager((current) => ({ ...current, [wager.id]: event.target.value }))} disabled={acceptingWagerId === wager.id} className="w-full rounded border border-white/5 bg-secondary px-2 py-1.5 text-xs text-vapor focus:border-cyan/30 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"><option value="own">Pay my own entry</option><option value="full_team">Pay full team entry</option></select>}
                        <button onClick={() => handleAccept(wager)} disabled={acceptingWagerId === wager.id} className="w-full rounded-lg bg-green px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-background disabled:cursor-not-allowed disabled:opacity-50">{acceptingWagerId === wager.id ? "Joining..." : "Accept This Match"}</button>
                      </div>
                    ) : null}
                  />
                ))}
              </CompetitionMatchfinder>
            </div>
          )}
          action={
            <div className="flex flex-col gap-2">
              <Link to="/teams?create=wager" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-white/10 bg-secondary px-5 py-3.5 text-xs font-black uppercase tracking-wider text-vapor transition-colors hover:border-cyan/25 hover:bg-cyan/10 hover:text-cyan">
                <Users className="h-[18px] w-[18px]" /> Create Wager Team
              </Link>
              <button onClick={() => setIsCreateModalOpen(true)} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-cyan px-6 py-3.5 text-sm font-black uppercase tracking-wider text-background shadow-[0_10px_30px_hsl(var(--cyan)/0.18)] transition-all hover:-translate-y-0.5 hover:bg-cyan/90 hover:shadow-[0_14px_36px_hsl(var(--cyan)/0.26)]">
                <Plus className="h-[18px] w-[18px]" /> Post a wager
              </button>
            </div>
          }
        />
        <ActivisionIdNotice user={user} className="mb-5" />

        <section className="glass overflow-hidden rounded-xl border border-white/5">
          <div className="border-b border-white/5 px-5 py-4"><h2 className="font-black">My wager history</h2><p className="mt-1 text-xs text-vapor">Your completed and previous wager matches.</p></div>
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
        </section>

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
