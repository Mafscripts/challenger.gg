import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { CalendarDays, Clock3, DollarSign, Gamepad2, Shield, Swords, Trophy, Users, X, Zap } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { CompetitionMatchfinder, CompetitionMatchfinderRow } from "@/components/competition/CompetitionMatchfinder";
import { toast } from "@/components/ui/use-toast";
import { FreeEightsDiscordDialog, FreeEightsDiscordNotice, FreeEightsDiscordServerDialog, hasFreeEightsDiscordLink, isFreeEightsDiscordRequired } from "@/components/competition/FreeEightsDiscord";
import { isFreeEightsDiscordServerRequired } from "@/lib/discordCommunity";
import { loadFreeEightsOverview } from "@/lib/freeEightsData";
import { FreeEightsRankDialog, FreeEightsRankNotice } from "@/components/competition/FreeEightsRankRequirement";
import { hasFreeEightsRank, isFreeEightsRankRequired } from "@/lib/freeEightsRankRequirement";

const categories = [
  { key: "xp", label: "XP Matches", icon: Swords, tone: "cyan", active: "border-cyan/35 bg-cyan/10 text-cyan", dot: "bg-cyan" },
  { key: "elo", label: "ELO", icon: Shield, tone: "cyan", active: "border-purple-400/35 bg-purple-400/10 text-purple-300", dot: "bg-purple-400" },
  { key: "eights", label: "Free 8s", icon: Users, tone: "orange", active: "border-orange/35 bg-orange/10 text-orange", dot: "bg-orange" },
  { key: "money8s", label: "Money 8s", icon: DollarSign, tone: "green", active: "border-green/35 bg-green/10 text-green", dot: "bg-green" },
  { key: "wagers", label: "Wagers", icon: Zap, tone: "green", active: "border-green/35 bg-green/10 text-green", dot: "bg-green" },
  { key: "tournaments", label: "Scheduled tournaments", icon: Trophy, tone: "orange", active: "border-red-400/35 bg-red-400/10 text-red-300", dot: "bg-red-400" },
];

const openTournamentStatuses = new Set(["open", "registration", "live", "in_progress"]);
const wagerType = (match) => String(match?.match_type || ((match?.entry_fee ?? match?.amount ?? 0) > 0 ? "wagers" : "ranked")).toLowerCase();
const teamSlots = (teamSize) => Math.max(1, Number.parseInt(String(teamSize || "1v1").split("v")[0], 10) || 1) * 2;
const rosterSize = (teamSize) => Math.max(1, Number.parseInt(String(teamSize || "1v1").split("v")[0], 10) || 1);
const displayMode = (item) => item?.game_mode_display || item?.game_mode || item?.mode || "Search & Destroy";
const formatStart = (value) => {
  if (!value) return "Schedule TBA";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Schedule TBA";
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
};

export default function Matchfinder() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedWagerId = searchParams.get("accept");
  const requestedTeamId = searchParams.get("team");
  const autoOpenedWagerId = useRef("");
  const [activeCategory, setActiveCategory] = useState(() => searchParams.get("category") === "eights" ? "eights" : "xp");
  const [user, setUser] = useState(null);
  const [xpMatches, setXpMatches] = useState([]);
  const [rankedMatches, setRankedMatches] = useState([]);
  const [wagerMatches, setWagerMatches] = useState([]);
  const [eightsCounts, setEightsCounts] = useState({});
  const [freeMembership, setFreeMembership] = useState(null);
  const activeFreeMatch = user?.id && freeMembership?.userId === user.id ? freeMembership?.match ?? null : null;
  const [tournaments, setTournaments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [acceptingId, setAcceptingId] = useState("");
  const [discordPromptOpen, setDiscordPromptOpen] = useState(false);
  const [rankPromptOpen, setRankPromptOpen] = useState(false);
  const [discordServerPrompt, setDiscordServerPrompt] = useState(null);
  const discordPromptTrigger = useRef(null);
  const [wagerToAccept, setWagerToAccept] = useState(null);
  const [wagerTeams, setWagerTeams] = useState([]);
  const [selectedWagerTeamId, setSelectedWagerTeamId] = useState("");
  const [wagerPaymentMode, setWagerPaymentMode] = useState("own");
  const [loadingWagerTeams, setLoadingWagerTeams] = useState(false);
  const [cancellingWagerId, setCancellingWagerId] = useState("");

  const loadMatches = async () => {
    try {
      setLoading(true);
      const [currentUser, xpRows, rankedRows, wagerRows, tournamentRows] = await Promise.all([
        base44.auth.me().catch(() => null),
        base44.entities.XPMatch.filterFresh({ status: "open" }, "-created_date", 100).catch(() => []),
        base44.entities.RankedMatch.filterFresh({ status: "open" }, "-created_date", 100).catch(() => []),
        base44.entities.Wager.filterFresh({ status: "open" }, "-created_date", 100).catch(() => []),
        base44.entities.Tournament.filterFresh({}, "start_date", 100).catch(() => []),
      ]);
      setUser(currentUser);
      setXpMatches((xpRows || []).filter((match) => match.posted_to_matchfinder !== false));
      setRankedMatches(rankedRows || []);
      setWagerMatches(wagerRows || []);
      setTournaments((tournamentRows || []).filter((tournament) => (
        openTournamentStatuses.has(String(tournament?.status || "").toLowerCase())
        && !tournament?.is_streamer_tournament
      )));
    } catch (error) {
      console.error("Failed to load matchfinder:", error);
      toast({ title: "Matchfinder unavailable", description: "The open matches could not be loaded.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMatches();
  }, []);

  useEffect(() => {
    if (activeCategory !== "eights" || !user?.id) return;
    let cancelled = false;
    let inFlight = false;
    const refresh = async () => {
      if (inFlight || cancelled) return;
      inFlight = true;
      try {
        const overview = await loadFreeEightsOverview(base44);
        if (!cancelled) {
          if (overview.current_user?.id === user.id) setUser(overview.current_user);
          setFreeMembership({ userId: user.id, match: overview.active_lobby });
          setEightsCounts(overview.counts);
        }
      } catch (error) { console.error("Could not check active Free 8s match:", error); }
      finally { inFlight = false; }
    };
    void refresh();
    const interval = window.setInterval(refresh, 6000);
    window.addEventListener("focus", refresh);
    return () => { cancelled = true; window.clearInterval(interval); window.removeEventListener("focus", refresh); };
  }, [activeCategory, user?.id]);

  useEffect(() => {
    if (activeCategory === "eights" && user?.id) return;
    if (!["eights", "money8s"].includes(activeCategory)) return;
    const matchType = activeCategory === "money8s" ? "money8s" : "8s";
    const lobbies = wagerMatches.filter((match) => wagerType(match) === matchType);
    if (!lobbies.length) return;
    let cancelled = false;
    const refreshCounts = async () => {
      const counts = await Promise.all(lobbies.map(async (lobby) => {
        const participants = await base44.entities.WagerParticipant.filterFresh({ wager_id: lobby.id }, "joined_date", 8).catch(() => null);
        return [lobby.id, participants?.length ?? null];
      }));
      if (!cancelled) setEightsCounts(Object.fromEntries(counts));
    };
    refreshCounts();
    const interval = window.setInterval(refreshCounts, 6000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [activeCategory, wagerMatches, user?.id]);

  useEffect(() => {
    if (!requestedWagerId || autoOpenedWagerId.current === requestedWagerId) return;
    const match = wagerMatches.find((item) => String(item.id) === String(requestedWagerId));
    if (!match || !user?.id) return;
    autoOpenedWagerId.current = requestedWagerId;
    openWagerAccept(match);
  }, [requestedWagerId, user?.id, wagerMatches]);

  const matches = useMemo(() => ({
    xp: xpMatches,
    elo: rankedMatches,
    eights: wagerMatches.filter((match) => wagerType(match) === "8s"),
    money8s: wagerMatches.filter((match) => wagerType(match) === "money8s"),
    wagers: wagerMatches.filter((match) => wagerType(match) === "wagers"),
    tournaments,
  }), [xpMatches, rankedMatches, tournaments, wagerMatches]);

  const activeRows = matches[activeCategory] || [];
  const currentCategory = categories.find((category) => category.key === activeCategory) || categories[0];
  const totalOpen = Object.values(matches).reduce((total, rows) => total + rows.length, 0);

  const ownsMatch = (match) => (
    match?.host_id === user?.id
    || match?.challenger_id === user?.id
    || match?.team_alpha_player_ids?.includes(user?.id)
    || match?.team_bravo_player_ids?.includes(user?.id)
  );

  const roomPath = (category, item) => {
    if (category === "xp") return `/xp-match/${item.id}`;
    if (category === "elo") return `/ranked-match/${item.id}`;
    if (["eights", "money8s"].includes(category)) return `/8s-match/${item.id}`;
    if (category === "wagers") return `/wagers-match/${item.id}`;
    if (category === "tournaments") return `/tournaments/${item.id}`;
    return `/match-room/${item.id}`;
  };

  const loadWagerTeams = async (userId = user?.id) => {
    if (!userId) return [];
    setLoadingWagerTeams(true);
    try {
      const memberships = await base44.entities.TeamMember.filterFresh({ user_id: userId }, "-joined_date", 50).catch(() => []);
      const teams = await Promise.all((memberships || [])
        .filter((membership) => membership.is_active !== false)
        .map(async (membership) => {
          const team = await base44.entities.Team.get(membership.team_id).catch(() => null);
          if (!team || team.is_active === false || !["wager", "general"].includes(team.team_type) || String(team.captain_id || "") !== String(userId)) return null;
          const members = await base44.entities.TeamMember.filter({ team_id: team.id }, "-joined_date", 50).catch(() => []);
          return { ...team, members: (members || []).filter((member) => member.is_active !== false) };
        }));
      const activeTeams = teams.filter(Boolean);
      setWagerTeams(activeTeams);
      return activeTeams;
    } catch (error) {
      console.error("Failed to load wager teams:", error);
      toast({ title: "Could not load teams", description: "Refresh and try again.", variant: "destructive" });
      return [];
    } finally {
      setLoadingWagerTeams(false);
    }
  };

  const openWagerAccept = async (match) => {
    if (!user?.id) {
      toast({ title: "Login required", description: "Log in before accepting a wager.", variant: "destructive" });
      return;
    }
    setWagerToAccept(match);
    setSelectedWagerTeamId("");
    setWagerPaymentMode("own");
    const teams = await loadWagerTeams(user.id);
    const required = rosterSize(match.team_size);
    const requestedTeam = teams.find((team) => String(team.id) === String(requestedTeamId) && team.members.length >= required);
    if (requestedTeam) setSelectedWagerTeamId(requestedTeam.id);
  };

  const closeWagerAccept = () => {
    setWagerToAccept(null);
    setSelectedWagerTeamId("");
  };

  const finishWagerAccept = async () => {
    if (!wagerToAccept || acceptingId) return;
    const required = rosterSize(wagerToAccept.team_size);
    const selectedTeam = wagerTeams.find((team) => String(team.id) === String(selectedWagerTeamId));
    if (!selectedTeam) {
      toast({ title: "Choose a team", description: "Select an eligible team, or create one first.", variant: "destructive" });
      return;
    }
    if (selectedTeam.members.length < required) {
      toast({ title: "Roster incomplete", description: `${selectedTeam.name} needs at least ${required} active players.`, variant: "destructive" });
      return;
    }

    setAcceptingId(wagerToAccept.id);
    try {
      const response = await base44.functions.invoke("acceptWager", {
        wager_id: wagerToAccept.id,
        team_id: selectedTeam.id,
        payment_mode: wagerPaymentMode,
      });
      if (!response.data?.success) throw new Error(response.data?.error || "This wager could not be accepted.");
      window.dispatchEvent(new CustomEvent("topfragg:credits-updated"));
      window.dispatchEvent(new CustomEvent("topfragg:notifications-updated", { detail: { refresh: true } }));
      closeWagerAccept();
      navigate(`/wagers-match/${response.data.wager?.id || wagerToAccept.id}`);
    } catch (error) {
      toast({ title: "Could not accept wager", description: error.message || "Please try again.", variant: "destructive" });
      await loadMatches();
    } finally {
      setAcceptingId("");
    }
  };

  const cancelOpenWager = async (wager) => {
    if (cancellingWagerId) return;
    setCancellingWagerId(wager.id);
    try {
      const response = await base44.functions.invoke("refundWager", {
        wager_id: wager.id,
        reason: "Cancelled by the host while waiting for an opponent",
      });
      if (!response.data?.success) throw new Error(response.data?.error || "This wager could not be cancelled.");
      window.dispatchEvent(new CustomEvent("topfragg:credits-updated"));
      toast({ title: "Wager cancelled", description: "Your entry fee has been returned." });
      await loadMatches();
    } catch (error) {
      toast({ title: "Could not cancel wager", description: error.message || "Please try again.", variant: "destructive" });
    } finally {
      setCancellingWagerId("");
    }
  };

  const acceptMatch = async (category, match) => {
    if (category === "eights" && activeFreeMatch) { navigate(`/8s-match/${activeFreeMatch.id}`); return; }
    if (category === "eights") discordPromptTrigger.current = document.activeElement;
    if (category === "eights" && !hasFreeEightsDiscordLink(user)) {
      setDiscordPromptOpen(true);
      return;
    }
    if (category === "eights" && !hasFreeEightsRank(user)) {
      setRankPromptOpen(true);
      return;
    }
    if (category === "wagers") {
      await openWagerAccept(match);
      return;
    }
    if (category === "tournaments") {
      navigate(`/tournaments/${match.id}`);
      return;
    }
    setAcceptingId(match.id);
    try {
      const response = category === "xp"
        ? await base44.functions.invoke("acceptXPMatch", { xp_match_id: match.id })
        : category === "elo"
          ? await base44.functions.invoke("acceptRankedMatch", { ranked_match_id: match.id })
          : await base44.functions.invoke("acceptWager", { wager_id: match.id });
      if (category === "eights" && response.data?.code === "FREE_EIGHTS_ACTIVE_MATCH") {
        setFreeMembership({ userId: user.id, match: { id: response.data.active_match_id } });
        toast({ title: "Finish your current Free 8s", description: response.data.error });
        return;
      }
      if (category === "eights" && isFreeEightsDiscordRequired(response.data)) {
        setDiscordPromptOpen(true);
        return;
      }
      if (category === "eights" && isFreeEightsRankRequired(response.data)) {
        setRankPromptOpen(true);
        return;
      }
      if (category === "eights" && isFreeEightsDiscordServerRequired(response.data)) {
        setDiscordServerPrompt(response.data);
        return;
      }
      if (!response.data?.success) throw new Error(response.data?.error || "This match could not be accepted.");
      navigate(roomPath(category, match));
    } catch (error) {
      if (category === "eights" && isFreeEightsDiscordServerRequired(error)) {
        setDiscordServerPrompt(error.data || error);
        return;
      }
      if (category === "eights" && isFreeEightsRankRequired(error)) {
        setRankPromptOpen(true);
        return;
      }
      if (category === "eights" && isFreeEightsDiscordRequired(error)) {
        setDiscordPromptOpen(true);
        return;
      }
      toast({ title: "Could not accept match", description: error.message || "Please try again.", variant: "destructive" });
      await loadMatches();
    } finally {
      setAcceptingId("");
    }
  };

  const renderAction = (item) => {
    if (activeCategory === "eights" && activeFreeMatch) {
      return <button type="button" onClick={() => navigate(`/8s-match/${activeFreeMatch.id}`)} className="min-w-40 rounded-lg border border-cyan/25 bg-cyan/10 px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-cyan">{activeFreeMatch.id === item.id ? "Open match room" : "Finish active Free 8s first"}</button>;
    }
    if (activeCategory === "tournaments") {
      return <button type="button" onClick={() => navigate(roomPath(activeCategory, item))} className="min-w-40 rounded-lg border border-red-400/25 bg-red-400/10 px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-red-300">View Tournament</button>;
    }
    if (activeCategory === "wagers" && String(item.host_id) === String(user?.id)) {
      return <div className="flex min-w-44 flex-col items-end gap-2"><span className="inline-flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider text-orange"><Clock3 className="h-3.5 w-3.5" /> Awaiting opponent</span><button type="button" onClick={() => cancelOpenWager(item)} disabled={cancellingWagerId === item.id} className="rounded-lg border border-white/10 px-4 py-2 text-[10px] font-black uppercase tracking-wider text-vapor transition hover:border-red-400/35 hover:text-red-300 disabled:opacity-50">{cancellingWagerId === item.id ? "Cancelling…" : "Cancel wager"}</button></div>;
    }
    if (ownsMatch(item)) {
      return <button type="button" onClick={() => navigate(roomPath(activeCategory, item))} className="min-w-44 rounded-lg border border-cyan/25 bg-cyan/10 px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-cyan">Open Match Room</button>;
    }
    return (
      <button type="button" disabled={acceptingId === item.id} onClick={() => acceptMatch(activeCategory, item)} className="min-w-44 rounded-lg bg-cyan px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-background disabled:cursor-wait disabled:opacity-50">
        {acceptingId === item.id ? "Accepting..." : "Accept This Match"}
      </button>
    );
  };

  return (
    <main className="min-h-screen py-8">
      <FreeEightsDiscordDialog open={discordPromptOpen} onOpenChange={setDiscordPromptOpen} returnFocusTo={discordPromptTrigger} returnTo="/matchfinder?category=eights" />
      <FreeEightsRankDialog open={rankPromptOpen} onOpenChange={setRankPromptOpen} returnFocusTo={discordPromptTrigger} />
      <FreeEightsDiscordServerDialog result={discordServerPrompt} onOpenChange={() => setDiscordServerPrompt(null)} returnFocusTo={discordPromptTrigger} />
      <div className="mx-auto max-w-[1600px] px-4 lg:px-6">
        <section className="relative isolate min-h-[350px] overflow-hidden rounded-2xl border border-white/[0.1] bg-[#07111c] shadow-[0_18px_60px_rgba(0,0,0,.24)] lg:min-h-[370px]" aria-labelledby="matchfinder-title">
          <img src="/assets/competition/matchfinder-hero.png" alt="Topfragg Matchfinder competition hub" className="absolute inset-0 h-full w-full object-cover object-center" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#07111c]/75 via-transparent to-[#07111c]/10" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#07111c]/20 via-transparent to-[#07111c]/35" />
          <h1 id="matchfinder-title" className="sr-only">Matchfinder</h1>
          <div className="absolute right-4 top-4 flex items-center gap-3 rounded-xl border border-white/[0.12] bg-[#07111c]/75 px-3 py-2.5 shadow-xl backdrop-blur-md sm:right-6 sm:top-6 sm:px-4 sm:py-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-yellow-300/20 bg-yellow-300/10 text-yellow-300"><Gamepad2 className="h-4 w-4 sm:h-5 sm:w-5" /></span>
            <div><p className="font-mono text-lg font-black leading-none text-white sm:text-xl">{totalOpen}</p><p className="mt-1 text-[8px] font-black uppercase tracking-[0.17em] text-vapor">Available now</p></div>
          </div>
        </section>

        <nav className="mt-5 grid overflow-hidden rounded-xl border border-white/[0.08] bg-card sm:grid-cols-2 xl:grid-cols-6" aria-label="Matchfinder categories">
          {categories.map((category) => {
            const Icon = category.icon;
            const active = activeCategory === category.key;
            return (
              <button key={category.key} type="button" onClick={() => setActiveCategory(category.key)} className={`relative flex min-h-16 items-center justify-between gap-3 border-b border-white/[0.06] px-5 text-left sm:border-r xl:border-b-0 ${active ? category.active : "text-vapor hover:bg-white/[0.025] hover:text-white"}`}>
                <span className="flex min-w-0 items-center gap-2.5"><Icon className="h-4 w-4 shrink-0" /><span className="truncate text-[11px] font-black uppercase tracking-wide">{category.label}</span></span>
                <span className="font-mono text-xs font-black">{matches[category.key]?.length || 0}</span>
                {active && <span className={`absolute inset-x-0 bottom-0 h-0.5 ${category.dot}`} />}
              </button>
            );
          })}
        </nav>

        {activeCategory === "eights" && <FreeEightsDiscordNotice user={user} returnTo="/matchfinder?category=eights" />}
        {activeCategory === "eights" && <FreeEightsRankNotice user={user} />}
        {activeCategory === "eights" && activeFreeMatch && <Link to={`/8s-match/${activeFreeMatch.id}`} className="mb-4 block rounded-xl border border-cyan/20 bg-cyan/5 p-4 text-sm text-white"><strong>Finish your current Free 8s first.</strong><span className="mt-1 block text-xs text-vapor">Report the score and wait for the confirmed result before joining another lobby. Open your current match →</span></Link>}
        <section className="mt-5 overflow-hidden rounded-2xl border border-white/[0.08] bg-card">
          <header className="flex flex-col gap-3 border-b border-white/[0.07] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-vapor">Now browsing</p>
              <h2 className="mt-1 flex items-center gap-2 text-lg font-black text-white"><span className={`h-2 w-2 rounded-full ${currentCategory.dot}`} /> {currentCategory.label}</h2>
            </div>
            <button type="button" onClick={loadMatches} className="self-start rounded-lg border border-white/[0.08] bg-white/[0.025] px-4 py-2 text-[9px] font-black uppercase tracking-wider text-vapor hover:border-yellow-300/25 hover:text-yellow-300">Refresh matches</button>
          </header>

          <CompetitionMatchfinder loading={loading} emptyMessage={`No ${currentCategory.label.toLowerCase()} available right now.`}>
            {activeRows.map((item) => {
              const slots = teamSlots(item.team_size);
              const joined = new Set([...(item.team_alpha_player_ids || [item.host_id]), ...(item.team_bravo_player_ids || (item.challenger_id ? [item.challenger_id] : []))].filter(Boolean)).size;
              const isTournament = activeCategory === "tournaments";
              const amount = Number(item.entry_fee ?? item.amount ?? 0);
              return (
                <CompetitionMatchfinderRow
                  key={item.id}
                  game={isTournament ? item.name : displayMode(item)}
                  gameDetail={isTournament ? `${item.team_size || "Team format"} · ${item.game || "Call of Duty"}` : ["eights", "money8s"].includes(activeCategory) ? `4v4 · ${eightsCounts[item.id] ?? "—"}/8 joined` : `${item.team_size || "1v1"} · ${joined}/${slots} players`}
                  competition={activeCategory === "xp" ? "XP Match" : activeCategory === "elo" ? "ELO Ranked" : activeCategory === "eights" ? "Free 8s" : activeCategory === "money8s" ? "Money 8s" : activeCategory === "wagers" ? `$${amount} Wager` : "Official Tournament"}
                  competitionDetail={isTournament ? `${item.current_teams || item.registered_teams || 0}/${item.max_teams || item.team_limit || "—"} teams registered` : `${activeCategory === "money8s" ? `$${amount.toFixed(2)} entry · ` : ""}Hosted by ${item.host_name || "Player"} · BO${item.best_of || 1}`}
                  playRule={item.play_rule}
                  starting={isTournament ? formatStart(item.start_date) : "Available now"}
                  tone={currentCategory.tone}
                  action={renderAction(item)}
                />
              );
            })}
          </CompetitionMatchfinder>
        </section>

        <div className="mt-4 flex items-center gap-2 text-[10px] text-vapor"><CalendarDays className="h-3.5 w-3.5 text-yellow-300" /> Scheduled tournaments show their announced start time; open matches can be accepted immediately.</div>
      </div>
      {wagerToAccept && <WagerAcceptModal
        wager={wagerToAccept}
        teams={wagerTeams}
        selectedTeamId={selectedWagerTeamId}
        paymentMode={wagerPaymentMode}
        loading={loadingWagerTeams}
        accepting={acceptingId === wagerToAccept.id}
        onClose={closeWagerAccept}
        onSelectTeam={setSelectedWagerTeamId}
        onPaymentMode={setWagerPaymentMode}
        onAccept={finishWagerAccept}
      />}
    </main>
  );
}

function WagerAcceptModal({ wager, teams, selectedTeamId, paymentMode, loading, accepting, onClose, onSelectTeam, onPaymentMode, onAccept }) {
  const required = rosterSize(wager.team_size);
  const eligibleTeams = teams.filter((team) => team.members.length >= required);
  const returnTo = `/matchfinder?accept=${encodeURIComponent(wager.id)}`;
  const createTeamUrl = `/teams?create=wager&roster=${required}&returnTo=${encodeURIComponent(returnTo)}`;
  const rosterUrl = teams[0]?.id ? `/teams?team=${encodeURIComponent(teams[0].id)}` : createTeamUrl;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Accept wager">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-green/25 bg-card shadow-[0_24px_80px_rgba(0,0,0,.6)]">
        <div className="flex items-start justify-between border-b border-white/[0.07] px-5 py-4">
          <div><p className="text-[9px] font-black uppercase tracking-[0.18em] text-green">Accept wager</p><h2 className="mt-1 text-lg font-black text-white">{wager.game_mode_display || wager.game_mode}</h2><p className="mt-1 text-xs text-vapor">{wager.team_size || "1v1"} · ${Number(wager.entry_fee ?? wager.amount ?? 0).toFixed(2)} per player</p></div>
          <button type="button" onClick={onClose} disabled={accepting} className="rounded-lg p-2 text-vapor hover:bg-white/5 hover:text-white" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-4 p-5">
          {loading ? <p className="py-6 text-center text-sm text-vapor">Loading your teams…</p> : eligibleTeams.length > 0 ? <>
            <label className="block"><span className="mb-2 block text-[10px] font-black uppercase tracking-wider text-vapor">Your team</span><select value={selectedTeamId} onChange={(event) => onSelectTeam(event.target.value)} disabled={accepting} className="w-full rounded-lg border border-white/10 bg-secondary px-3 py-3 text-sm text-white focus:border-green/40 focus:outline-none"><option value="">Select a team</option>{eligibleTeams.map((team) => <option key={team.id} value={team.id}>{team.name} — {team.members.length} players</option>)}</select></label>
            {required > 1 && <label className="block"><span className="mb-2 block text-[10px] font-black uppercase tracking-wider text-vapor">Entry payment</span><select value={paymentMode} onChange={(event) => onPaymentMode(event.target.value)} disabled={accepting} className="w-full rounded-lg border border-white/10 bg-secondary px-3 py-3 text-sm text-white focus:border-green/40 focus:outline-none"><option value="own">Pay my own entry</option><option value="full_team">Pay the full team entry</option></select></label>}
            <button type="button" onClick={onAccept} disabled={accepting} className="w-full rounded-lg bg-green px-4 py-3 text-xs font-black uppercase tracking-wider text-background transition hover:bg-green/90 disabled:opacity-50">{accepting ? "Accepting…" : "Accept this match"}</button>
          </> : <div className="rounded-xl border border-orange/25 bg-orange/5 p-4"><p className="text-sm font-bold text-orange">You need a team with at least {required} active player{required === 1 ? "" : "s"}.</p><p className="mt-1 text-xs leading-5 text-vapor">Create one now, or invite players to an existing roster. You will return to this Matchfinder accept window.</p><div className="mt-4 grid grid-cols-2 gap-2"><Link to={rosterUrl} className="rounded-lg border border-white/10 px-3 py-2.5 text-center text-[10px] font-black uppercase tracking-wider text-vapor hover:border-orange/30 hover:text-orange">Finish roster</Link><Link to={createTeamUrl} className="create-cta rounded-lg px-3 py-2.5 text-center text-[10px] font-black uppercase tracking-wider transition-all">Create team</Link></div></div>}
        </div>
      </div>
    </div>
  );
}
