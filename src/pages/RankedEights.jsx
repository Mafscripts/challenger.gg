import React, { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, CalendarDays, Crown, DollarSign, Plus, Shield } from "lucide-react";
import { base44 } from "@/api/base44Client";
import CompetitionLadder from "@/components/competition/CompetitionLadder";
import { CompetitionMatchfinder, CompetitionMatchfinderRow } from "@/components/competition/CompetitionMatchfinder";
import CreateLobbyModal from "@/components/match/CreateLobbyModal";
import ActivisionIdNotice from "@/components/competition/ActivisionIdNotice";
import { activisionIdRequiredMessage, hasActivisionId } from "@/lib/activision";
import { toast } from "@/components/ui/use-toast";

const activeStatuses = new Set(["open", "in_progress", "awaiting_team_alpha_report", "awaiting_team_bravo_report", "awaiting_completion", "score_conflict", "disputed"]);
const EIGHTS_PRIZE_START_MONTH = "2026-10";
const EIGHTS_PRIZE_START_DATE = new Date("2026-10-01T00:00:00Z");
const monthKey = () => new Date().toISOString().slice(0, 7);
const daysLeftInMonth = () => {
  const now = new Date();
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return Math.max(0, last.getDate() - now.getDate());
};
const daysUntilPrizeStarts = () => Math.max(0, Math.ceil((EIGHTS_PRIZE_START_DATE.getTime() - Date.now()) / 86400000));

export default function RankedEights() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [lobbies, setLobbies] = useState([]);
  const [counts, setCounts] = useState({});
  const [activeLobby, setActiveLobby] = useState(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [queueMode, setQueueMode] = useState("ranked");
  const isMoney = queueMode === "money";
  const lobbyMatchType = isMoney ? "money8s" : "8s";

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const currentUser = await base44.auth.me();
      const [openRows, memberships] = await Promise.all([
        base44.entities.Wager.filterFresh({ match_type: lobbyMatchType, status: "open" }, "-created_date", 30),
        base44.entities.WagerParticipant.filterFresh({ user_id: currentUser.id }, "-joined_date", 50),
      ]);
      const activeMemberships = (memberships || []).filter(Boolean);
      const activeMatches = await Promise.all(activeMemberships.map((row) => base44.entities.Wager.getFresh(row.wager_id).catch(() => null)));
      const current = activeMatches.filter((row) => row?.match_type === lobbyMatchType && activeStatuses.has(row.status)).sort((a, b) => new Date(b.created_date || 0) - new Date(a.created_date || 0))[0] || null;
      const participantLists = await Promise.all((openRows || []).map((row) => base44.entities.WagerParticipant.filterFresh({ wager_id: row.id }, "joined_date", 8).catch(() => [])));
      setUser(currentUser);
      setLobbies(openRows || []);
      setActiveLobby(current);
      setCounts(Object.fromEntries((openRows || []).map((row, index) => [row.id, participantLists[index]?.length || 0])));
    } catch (error) {
      console.error("Failed to load 8s:", error);
      toast({ title: isMoney ? "Money 8s unavailable" : "8s unavailable", description: error.message || "Please try again.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [isMoney, lobbyMatchType]);

  useEffect(() => {
    if (!isMoney && monthKey() > EIGHTS_PRIZE_START_MONTH) {
      base44.functions.invoke("settleEightsMonthlyPrize", {}).catch(() => null);
    }
    load();
    const interval = window.setInterval(() => load(true), 6000);
    return () => window.clearInterval(interval);
  }, [isMoney, load]);

  const prizeActive = monthKey() >= EIGHTS_PRIZE_START_MONTH;

  const joinLobby = async (lobby) => {
    if (!hasActivisionId(user)) {
      toast({ title: "Activision ID required", description: activisionIdRequiredMessage, variant: "destructive" });
      return;
    }
    setJoining(lobby.id);
    try {
      const response = await base44.functions.invoke("acceptWager", { wager_id: lobby.id });
      if (!response.data?.success) throw new Error(response.data?.error || "Could not join this lobby");
      if (isMoney && Number(lobby.entry_fee || lobby.amount || 0) > 0) {
        window.dispatchEvent(new CustomEvent("topfragg:balance-popup", {
          detail: {
            title: "Money 8s entry secured",
            message: `$${Number(lobby.entry_fee || lobby.amount).toFixed(2)} was deducted from your wallet for this Money 8s lobby.`,
            balance_type: "wallet",
            balance_change: -Number(lobby.entry_fee || lobby.amount),
            related_entity_id: lobby.id,
            related_entity_type: "Wager",
          },
        }));
      }
      navigate(`/8s-match/${lobby.id}`);
    } catch (error) {
      toast({ title: "Could not join", description: error.message, variant: "destructive" });
      await load(true);
    } finally {
      setJoining("");
    }
  };

  const handleCreated = (result) => {
    setCreateOpen(false);
    if (result?.wager_id) navigate(`/8s-match/${result.wager_id}`);
    else load();
  };

  return (
    <div className="min-h-screen py-8">
      <div className="mx-auto max-w-[1600px] px-4 lg:px-6">
        <section className="mb-6 flex flex-col gap-3 rounded-2xl border border-white/[0.08] bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-2">
            <button type="button" onClick={() => setQueueMode("ranked")} className={`inline-flex items-center gap-2 rounded-xl px-4 py-3 text-[10px] font-black uppercase tracking-wider transition ${!isMoney ? "bg-cyan text-background" : "text-vapor hover:bg-white/[0.06]"}`}><Shield className="h-4 w-4" /> Free 8s</button>
            <button type="button" onClick={() => setQueueMode("money")} className={`inline-flex items-center gap-2 rounded-xl border px-4 py-3 text-[10px] font-black uppercase tracking-wider transition ${isMoney ? "border-green/50 bg-green text-background shadow-lg shadow-green/20 ring-2 ring-green/20" : "border-green/25 bg-green/[0.08] text-green hover:bg-green/15"}`}><DollarSign className="h-4 w-4" /> Money 8s <span className="rounded bg-background/20 px-1.5 py-0.5 text-[8px]">WALLET</span></button>
          </div>
          {isMoney && <p className="px-2 text-xs text-vapor">Wallet entry fee · winner receives the prize pool</p>}
        </section>

        <CompetitionLadder
          mode="eights"
          currentUser={user}
          openCount={lobbies.length}
          headerEyebrow={isMoney ? "Wallet-backed 8s" : "Free 8s ladder"}
          headerTitle={isMoney ? "Money 8s" : "Free 8s"}
          headerDescription={isMoney ? "Choose a wallet entry fee, get shuffled into a 4v4 team and play for the full prize pool." : "Join free, get shuffled into a 4v4 team and climb the monthly standings."}
          matchfinder={(
            <CompetitionMatchfinder loading={loading} emptyMessage={isMoney ? "No Money 8s lobbies are open right now." : "No 8s lobbies are open right now."}>
              {lobbies.map((lobby) => {
                const joined = counts[lobby.id] || 0;
                const alreadyIn = activeLobby?.id === lobby.id;
                return (
                  <CompetitionMatchfinderRow
                    key={lobby.id}
                    game={lobby.game_mode_display || lobby.game_mode}
                    gameDetail={`4v4 · ${joined}/8 players`}
                    competition={isMoney ? "Money 8s" : "Free 8s"}
                    competitionDetail={`Hosted by ${lobby.host_name || "Player"} · BO${lobby.best_of || 3}`}
                    playRule={lobby.play_rule}
                    tone="orange"
                    action={user ? (
                      <button disabled={joining === lobby.id || (activeLobby && !alreadyIn) || joined >= 8} onClick={() => alreadyIn ? navigate(`/8s-match/${lobby.id}`) : joinLobby(lobby)} className="min-w-48 rounded-lg bg-cyan px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-background disabled:cursor-not-allowed disabled:opacity-45">
                        {joining === lobby.id ? "Joining..." : alreadyIn ? "Open match room" : activeLobby ? `Finish active ${isMoney ? "Money 8s" : "8s"} first` : "Accept This Match"}
                      </button>
                    ) : null}
                  />
                );
              })}
            </CompetitionMatchfinder>
          )}
          action={activeLobby ? (
            <Link to={`/8s-match/${activeLobby.id}`} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-cyan px-6 py-3.5 text-xs font-black uppercase tracking-wider text-background">
              Return to your {isMoney ? "Money 8s" : "8s"} <ArrowRight className="h-4 w-4" />
            </Link>
          ) : (
            <button onClick={() => setCreateOpen(true)} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-cyan px-6 py-3.5 text-xs font-black uppercase tracking-wider text-background hover:bg-cyan/90">
              <Plus className="h-4 w-4" /> Create {isMoney ? "Money 8s" : "8s"} lobby
            </button>
          )}
        />
        <ActivisionIdNotice user={user} className="mb-6" />

        <section className={`mb-6 overflow-hidden rounded-2xl border bg-gradient-to-r via-card to-card ${isMoney ? "border-green/25 from-green/[0.11]" : "border-yellow-400/25 from-yellow-400/[0.11]"}`}>
          <div className="grid gap-6 p-6 lg:grid-cols-[1fr_auto] lg:items-center">
            <div className="flex items-start gap-4">
              <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border ${isMoney ? "border-green/25 bg-green/10 text-green" : "border-yellow-400/25 bg-yellow-400/10 text-yellow-300"}`}><Crown className="h-6 w-6" /></div>
              <div>
                <p className={`text-[10px] font-black uppercase tracking-[0.2em] ${isMoney ? "text-green" : "text-yellow-300"}`}>{isMoney ? "Wallet-backed matches" : prizeActive ? "Monthly 8s race" : "8s prize announcement"}</p>
                <h2 className="mt-1 text-2xl font-black">{isMoney ? "Play for the full prize pool" : prizeActive ? "#1 wins $100" : "$100 monthly prize starts October 1"}</h2>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-vapor">{isMoney ? "Every player pays the selected entry fee from their wallet. The winning team shares the complete Money 8s pot." : prizeActive ? "Play at least one completed 8s match this month. Most wins takes the prize; monthly XP and rating break ties." : "Matches played before October 1 do not count toward the $100 prize. Starting in October, the player with the most monthly 8s wins takes the prize."}</p>
              </div>
            </div>
            <div className="rounded-xl border border-white/[0.08] bg-black/20 px-5 py-4 text-center">
              <CalendarDays className="mx-auto h-5 w-5 text-cyan" />
              <p className="mt-2 font-mono text-2xl font-black">{isMoney ? "8" : prizeActive ? daysLeftInMonth() : daysUntilPrizeStarts()}</p>
              <p className="text-[9px] font-black uppercase tracking-wider text-vapor">{isMoney ? "players per lobby" : prizeActive ? "days remaining" : "days until launch"}</p>
            </div>
          </div>
        </section>

      </div>
      <CreateLobbyModal isOpen={createOpen} onClose={() => setCreateOpen(false)} onCreate={handleCreated} user={user} mode={isMoney ? "money8s" : "eights"} />
    </div>
  );
}
