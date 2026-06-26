import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Ban,
  CheckCircle2,
  Clock,
  Edit3,
  Loader2,
  Map as MapIcon,
  Maximize2,
  Monitor,
  Plus,
  Radio,
  RotateCcw,
  Save,
  Shield,
  Shuffle,
  Sparkles,
  Swords,
  Trash2,
  Trophy,
  Unlock,
  UserCheck,
  Users,
  X,
  XCircle,
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import MatchChat from "@/components/match/MatchChat";
import { toast } from "@/components/ui/use-toast";

const staffRoles = new Set(["ceo", "super_admin", "admin", "moderator"]);
const defaultStreamerMapPools = {
  snd: ["Hacienda", "Gridlock", "Raid", "Scar", "Den", "Sake", "Colossus"],
  hp: ["Sake", "Colossus", "Den", "Scar", "Gridlock", "Hacienda"],
  overload: ["Scar", "Gridlock", "Den", "Exposure"],
};
const defaultStreamerMaps = [...new Set([...defaultStreamerMapPools.snd, ...defaultStreamerMapPools.hp, ...defaultStreamerMapPools.overload])];
const mapPoolLabels = {
  snd: "SND Maps",
  hp: "HP Maps",
  overload: "Overload Maps",
};
const modeLabels = {
  bo1_snd: "BO1 SND",
  snd: "BO3 Search & Destroy",
  hp: "BO3 Hardpoint",
  overload: "BO3 Overload",
  snd_hp_snd: "BO3 SND / HP / SND",
  bo3_hp_overload_snd: "BO3 HP / Overload / SND",
  bo5_hp_overload_snd_hp_snd: "BO5 HP / Overload / SND / HP / SND",
};

const isStreamerTournament = (tournament) => Boolean(
  tournament?.is_streamer_tournament
  || ["streamer", "streamer_tournament"].includes(String(tournament?.tournament_type || "").toLowerCase())
  || ["streamer", "streamer_tournament"].includes(String(tournament?.source || "").toLowerCase())
);
const formatDate = (value) => value ? new Date(value).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "Start TBD";
const normalizeSwitchFormat = (value) => String(value || "4v4").toLowerCase() === "2v2" ? "2v2" : "4v4";
const entryLabel = (format) => format === "4v4" ? "Duo" : "Player";
const entryNames = (entry) => Array.isArray(entry?.player_names) ? entry.player_names.filter(Boolean) : [];
const normalizeMapsText = (maps, fallback = defaultStreamerMaps) => (Array.isArray(maps) && maps.length ? maps : fallback).join("\n");
const mapsFromText = (value) => [...new Set(String(value || "").split(/[\n,]+/).map((row) => row.trim()).filter(Boolean))];
const combinedMapsFromDraft = (draft) => [...new Set(["snd", "hp", "overload"].flatMap((key) => mapsFromText(draft[key])))];
const hasBothTeams = (match) => Boolean(match?.team_a_id && match?.team_b_id);
const isCompleted = (match) => Boolean(match?.completed || match?.status === "completed" || match?.winner_id);
const teamPlayerCount = (format) => format === "4v4" ? 4 : 2;
const teamNames = (team) => Array.isArray(team?.player_names) ? team.player_names.filter(Boolean) : [];
const teamPlayerSlots = (team, count) => Array.from({ length: count }, (_, index) => (
  Array.isArray(team?.player_names) ? team.player_names[index] || "" : ""
));

function shuffleRows(rows) {
  const copy = [...rows];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function previewTeams(entries, format) {
  const shuffled = shuffleRows(entries);
  const teams = [];
  for (let index = 0; index < shuffled.length - 1; index += 2) {
    const names = [...entryNames(shuffled[index]), ...entryNames(shuffled[index + 1])];
    teams.push({
      id: `preview-team-${teams.length + 1}`,
      name: `Team ${teams.length + 1}`,
      player_names: names,
      label: format === "4v4" ? `${entryNames(shuffled[index]).join(" / ")} + ${entryNames(shuffled[index + 1]).join(" / ")}` : names.join(" / "),
      source_entry_ids: [shuffled[index]?.id, shuffled[index + 1]?.id].filter(Boolean),
    });
  }
  return teams;
}

function mapDraftsFromTournament(tournament) {
  const pools = tournament?.map_pools || {};
  return {
    snd: normalizeMapsText(pools.snd || tournament?.snd_maps, defaultStreamerMapPools.snd),
    hp: normalizeMapsText(pools.hp || tournament?.hp_maps, defaultStreamerMapPools.hp),
    overload: normalizeMapsText(pools.overload || tournament?.overload_maps, defaultStreamerMapPools.overload),
  };
}

function teamLabel(team) {
  return teamNames(team).join(" / ");
}

export default function StreamerTournamentLobby() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [tournament, setTournament] = useState(null);
  const [messages, setMessages] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [matches, setMatches] = useState([]);
  const [entriesDraft, setEntriesDraft] = useState([]);
  const [entryDraft, setEntryDraft] = useState({ player_one: "", player_two: "" });
  const [entriesDirty, setEntriesDirty] = useState(false);
  const [mapDrafts, setMapDrafts] = useState(() => mapDraftsFromTournament(null));
  const [mapsDirty, setMapsDirty] = useState(false);
  const [teamDrafts, setTeamDrafts] = useState([]);
  const [teamsDirty, setTeamsDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyUserId, setBusyUserId] = useState("");
  const [savingEntries, setSavingEntries] = useState(false);
  const [savingMaps, setSavingMaps] = useState(false);
  const [savingTeams, setSavingTeams] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [spinTeams, setSpinTeams] = useState([]);
  const [advancingId, setAdvancingId] = useState("");
  const [overturningId, setOverturningId] = useState("");
  const [tournamentAction, setTournamentAction] = useState("");
  const [showBigDraw, setShowBigDraw] = useState(false);
  const pollRef = useRef(null);
  const entriesDirtyRef = useRef(false);
  const mapsDirtyRef = useRef(false);
  const teamsDirtyRef = useRef(false);
  const entryPlayerOneRef = useRef(null);

  const switchFormat = normalizeSwitchFormat(tournament?.switch_format || tournament?.team_size);
  const isFourVFour = switchFormat === "4v4";

  useEffect(() => {
    loadLobby(true);
    pollRef.current = window.setInterval(() => loadLobby(false), 5000);
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [id]);

  const loadLobby = async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const [currentUser, tournamentRow, chatRows, matchRows, participantRows] = await Promise.all([
        base44.auth.me().catch(() => null),
        base44.entities.Tournament.get(id).catch(() => null),
        base44.entities.ChatMessage.filterFresh({ conversation_id: id }, "-created_date", 100).catch(() => []),
        base44.entities.TournamentMatch.filterFresh({ tournament_id: id }, "round", 500).catch(() => []),
        base44.entities.TournamentParticipant.filterFresh({ tournament_id: id }, "seed", 500).catch(() => []),
      ]);
      setUser(currentUser);
      setTournament(tournamentRow);
      setMessages(chatRows || []);
      setMatches(matchRows || []);
      setParticipants(participantRows || []);
      if (showLoading || !entriesDirtyRef.current) setEntriesDraft(Array.isArray(tournamentRow?.switch_entries) ? tournamentRow.switch_entries : []);
      if (showLoading || !teamsDirtyRef.current) setTeamDrafts(Array.isArray(tournamentRow?.switch_teams) ? tournamentRow.switch_teams : []);
      if (showLoading || !mapsDirtyRef.current) setMapDrafts(mapDraftsFromTournament(tournamentRow));
    } catch (error) {
      toast({ title: "Lobby unavailable", description: error.message || "Could not load streamer lobby.", variant: "destructive" });
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  const bannedUsers = Array.isArray(tournament?.banned_users) ? tournament.banned_users : [];
  const bannedUserIds = new Set([
    ...(Array.isArray(tournament?.banned_user_ids) ? tournament.banned_user_ids : []),
    ...bannedUsers.map((entry) => entry?.user_id).filter(Boolean),
  ].map(String));
  const isHost = Boolean(user?.id && String(user.id) === String(tournament?.host_id || tournament?.created_by || ""));
  const canModerate = Boolean(isHost || staffRoles.has(user?.role));
  const viewerBanned = Boolean(user?.id && bannedUserIds.has(String(user.id)) && !canModerate);
  const entryCount = entriesDraft.length;
  const generatedTeamCount = Math.floor(entryCount / 2);
  const canGenerate = entryCount >= 4 && entryCount % 2 === 0 && generatedTeamCount <= Number(tournament?.max_teams || 64);
  const requiredTeamPlayers = teamPlayerCount(switchFormat);
  const canLockBracket = teamDrafts.length >= 2 && teamDrafts.every((team) => teamNames(team).length === requiredTeamPlayers);

  const participantByKey = useMemo(() => {
    const pairs = [];
    participants.forEach((participant) => {
      [participant.id, participant.team_id, participant.user_id, participant.captain_id].filter(Boolean).forEach((key) => {
        pairs.push([String(key), participant]);
      });
    });
    return new Map(pairs);
  }, [participants]);

  const matchesByRound = useMemo(() => {
    const grouped = new Map();
    [...matches]
      .sort((a, b) => Number(a.round || 0) - Number(b.round || 0) || Number(a.match_number || 0) - Number(b.match_number || 0))
      .forEach((match) => {
        const round = Number(match.round || 1);
        grouped.set(round, [...(grouped.get(round) || []), match]);
      });
    return [...grouped.entries()];
  }, [matches]);

  const chatters = useMemo(() => {
    const byId = new Map();
    [...messages].reverse().forEach((message) => {
      if (message.system || !message.sender_id) return;
      if (String(message.sender_id) === String(tournament?.host_id || tournament?.created_by || "")) return;
      if (!byId.has(message.sender_id)) {
        byId.set(message.sender_id, {
          user_id: message.sender_id,
          user_name: message.sender_name || "Viewer",
          last_message_date: message.created_date,
        });
      }
    });
    return [...byId.values()].slice(0, 12);
  }, [messages, tournament?.created_by, tournament?.host_id]);

  const addEntry = () => {
    const names = isFourVFour
      ? [entryDraft.player_one, entryDraft.player_two]
      : [entryDraft.player_one];
    const cleaned = names.map((name) => name.replace(/\s+/g, " ").trim()).filter(Boolean);
    if (cleaned.length !== (isFourVFour ? 2 : 1)) {
      toast({ title: `${entryLabel(switchFormat)} incomplete`, description: isFourVFour ? "Add two names for this duo." : "Add a player name.", variant: "destructive" });
      return;
    }
    const usedNames = new Set(entriesDraft.flatMap(entryNames).map((name) => name.toLowerCase()));
    if (cleaned.some((name) => usedNames.has(name.toLowerCase()))) {
      toast({ title: "Duplicate name", description: "Each manual player name can only be added once.", variant: "destructive" });
      return;
    }

    setEntriesDraft((current) => [
      ...current,
      {
        id: `local-${Date.now()}-${current.length}`,
        player_names: cleaned,
        created_date: new Date().toISOString(),
      },
    ]);
    setEntryDraft({ player_one: "", player_two: "" });
    entriesDirtyRef.current = true;
    setEntriesDirty(true);
    window.requestAnimationFrame(() => entryPlayerOneRef.current?.focus());
  };

  const removeEntry = (entryId) => {
    setEntriesDraft((current) => current.filter((entry) => entry.id !== entryId));
    entriesDirtyRef.current = true;
    setEntriesDirty(true);
  };

  const saveEntries = async () => {
    if (!canModerate || savingEntries) return null;
    setSavingEntries(true);
    try {
      const response = await base44.functions.invoke("saveStreamerSwitchEntries", {
        tournament_id: tournament.id,
        switch_format: switchFormat,
        entries: entriesDraft,
      });
      if (!response.data?.success) {
        toast({ title: "List save failed", description: response.data?.error || "Could not save names.", variant: "destructive" });
        return null;
      }
      setTournament(response.data.tournament);
      setEntriesDraft(response.data.entries || []);
      entriesDirtyRef.current = false;
      setEntriesDirty(false);
      setTeamDrafts([]);
      teamsDirtyRef.current = false;
      setTeamsDirty(false);
      setMatches([]);
      setParticipants([]);
      toast({ title: "Names saved", description: `${entryCount} ${entryLabel(switchFormat).toLowerCase()} entries saved.` });
      return response.data;
    } catch (error) {
      toast({ title: "List save failed", description: error.message || "Could not save names.", variant: "destructive" });
      return null;
    } finally {
      setSavingEntries(false);
    }
  };

  const saveMaps = async () => {
    if (!canModerate || savingMaps) return;
    const mapPools = {
      snd: mapsFromText(mapDrafts.snd),
      hp: mapsFromText(mapDrafts.hp),
      overload: mapsFromText(mapDrafts.overload),
    };
    if (Object.values(mapPools).some((maps) => maps.length === 0)) {
      toast({ title: "Maps required", description: "Add at least one map for SND, HP, and Overload.", variant: "destructive" });
      return;
    }
    setSavingMaps(true);
    try {
      const response = await base44.functions.invoke("updateStreamerTournamentMaps", {
        tournament_id: tournament.id,
        map_pools: mapPools,
      });
      if (!response.data?.success) {
        toast({ title: "Map save failed", description: response.data?.error || "Could not save maps.", variant: "destructive" });
        return;
      }
      setTournament(response.data.tournament);
      setMapDrafts(mapDraftsFromTournament(response.data.tournament));
      mapsDirtyRef.current = false;
      setMapsDirty(false);
      await loadLobby(false);
      toast({ title: "Maps saved", description: `${[...new Set([...mapPools.snd, ...mapPools.hp, ...mapPools.overload])].length} maps available across all modes.` });
    } catch (error) {
      toast({ title: "Map save failed", description: error.message || "Could not save maps.", variant: "destructive" });
    } finally {
      setSavingMaps(false);
    }
  };

  const spinDraw = async () => {
    if (!canModerate || generating || spinning) return;
    if (!canGenerate) {
      toast({
        title: "Need more entries",
        description: isFourVFour ? "Add an even number of duos, at least four." : "Add an even number of players, at least four.",
        variant: "destructive",
      });
      return;
    }

    setShowBigDraw(true);
    setSpinning(true);
    setSpinTeams(previewTeams(entriesDraft, switchFormat));
    const interval = window.setInterval(() => setSpinTeams(previewTeams(entriesDraft, switchFormat)), 150);
    await new Promise((resolve) => window.setTimeout(resolve, 2200));
    window.clearInterval(interval);
    try {
      const response = await base44.functions.invoke("rollStreamerSwitchTeams", {
        tournament_id: tournament.id,
        switch_format: switchFormat,
        entries: entriesDraft,
      });
      if (!response.data?.success) {
        toast({ title: "Spin failed", description: response.data?.error || "Could not roll switch teams.", variant: "destructive" });
        return;
      }
      setTournament(response.data.tournament);
      setTeamDrafts(response.data.teams || []);
      setSpinTeams(response.data.teams || []);
      setParticipants([]);
      setMatches([]);
      setEntriesDraft(response.data.tournament?.switch_entries || entriesDraft);
      entriesDirtyRef.current = false;
      setEntriesDirty(false);
      teamsDirtyRef.current = false;
      setTeamsDirty(false);
      toast({ title: "Teams rolled", description: `${response.data.teams?.length || generatedTeamCount} teams are ready to review.` });
      await loadLobby(false);
    } catch (error) {
      toast({ title: "Spin failed", description: error.message || "Could not roll switch teams.", variant: "destructive" });
    } finally {
      setSpinning(false);
    }
  };

  const updateTeamDraft = (teamIndex, nextTeam) => {
    setTeamDrafts((current) => current.map((team, index) => index === teamIndex ? nextTeam : team));
    teamsDirtyRef.current = true;
    setTeamsDirty(true);
  };

  const updateTeamPlayer = (teamIndex, playerIndex, value) => {
    const team = teamDrafts[teamIndex];
    if (!team) return;
    const players = teamPlayerSlots(team, requiredTeamPlayers);
    players[playerIndex] = value;
    updateTeamDraft(teamIndex, { ...team, player_names: players });
  };

  const removeDraftTeam = (teamIndex) => {
    setTeamDrafts((current) => current.filter((_, index) => index !== teamIndex).map((team, index) => ({ ...team, seed: index + 1 })));
    teamsDirtyRef.current = true;
    setTeamsDirty(true);
  };

  const addDraftTeam = () => {
    setTeamDrafts((current) => [
      ...current,
      {
        id: `local-team-${Date.now()}`,
        name: `Team ${current.length + 1}`,
        seed: current.length + 1,
        player_names: Array.from({ length: requiredTeamPlayers }, () => ""),
      },
    ]);
    teamsDirtyRef.current = true;
    setTeamsDirty(true);
  };

  const saveTeams = async () => {
    if (!canModerate || savingTeams) return null;
    setSavingTeams(true);
    try {
      const response = await base44.functions.invoke("saveStreamerSwitchTeams", {
        tournament_id: tournament.id,
        switch_format: switchFormat,
        teams: teamDrafts,
      });
      if (!response.data?.success) {
        toast({ title: "Team save failed", description: response.data?.error || "Could not save teams.", variant: "destructive" });
        return null;
      }
      setTournament(response.data.tournament);
      setTeamDrafts(response.data.teams || []);
      teamsDirtyRef.current = false;
      setTeamsDirty(false);
      setMatches([]);
      setParticipants([]);
      toast({ title: "Teams saved", description: "Draft teams are ready for the bracket lock." });
      return response.data;
    } catch (error) {
      toast({ title: "Team save failed", description: error.message || "Could not save teams.", variant: "destructive" });
      return null;
    } finally {
      setSavingTeams(false);
    }
  };

  const lockBracket = async () => {
    if (!canModerate || generating || spinning) return;
    if (!canLockBracket) {
      toast({ title: "Teams incomplete", description: `Each team needs exactly ${requiredTeamPlayers} players before locking the bracket.`, variant: "destructive" });
      return;
    }
    setGenerating(true);
    try {
      const response = await base44.functions.invoke("generateStreamerSwitchBracket", {
        tournament_id: tournament.id,
        switch_format: switchFormat,
        entries: entriesDraft,
        teams: teamDrafts,
      });
      if (!response.data?.success) {
        toast({ title: "Bracket failed", description: response.data?.error || "Could not lock switch bracket.", variant: "destructive" });
        return;
      }
      setTournament(response.data.tournament);
      setParticipants(response.data.participants || []);
      setMatches(response.data.matches || []);
      setTeamDrafts(response.data.tournament?.switch_teams || teamDrafts);
      teamsDirtyRef.current = false;
      setTeamsDirty(false);
      toast({ title: "Switcheroo bracket live", description: `${response.data.teams?.length || teamDrafts.length} teams locked.` });
      await loadLobby(false);
    } catch (error) {
      toast({ title: "Bracket failed", description: error.message || "Could not lock switch bracket.", variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const advanceMatch = async (match, winnerSlot) => {
    if (!canModerate || advancingId) return;
    setAdvancingId(match.id);
    try {
      const response = await base44.functions.invoke("advanceStreamerTournamentMatch", {
        tournament_match_id: match.id,
        winner_slot: winnerSlot,
      });
      if (!response.data?.success) {
        toast({ title: "Advance failed", description: response.data?.error || "Could not advance winner.", variant: "destructive" });
        return;
      }
      toast({ title: "Winner advanced", description: `${response.data.match?.winner_name || "Winner"} moved forward.` });
      await loadLobby(false);
    } catch (error) {
      toast({ title: "Advance failed", description: error.message || "Could not advance winner.", variant: "destructive" });
    } finally {
      setAdvancingId("");
    }
  };

  const overturnMatch = async (match) => {
    if (!canModerate || overturningId || !isCompleted(match)) return;
    const currentWinnerId = String(match.winner_id || "");
    const correctedSlot = currentWinnerId === String(match.team_a_id) ? "team_b" : "team_a";
    const correctedName = correctedSlot === "team_a" ? match.team_a_name : match.team_b_name;
    const defaultReason = "Result overturned by streamer host after review";
    const reason = typeof window !== "undefined"
      ? window.prompt(`Overturn this match and grant the win to ${correctedName || "the other team"}?`, defaultReason)
      : defaultReason;
    if (reason === null) return;

    setOverturningId(match.id);
    try {
      const response = await base44.functions.invoke("overturnStreamerTournamentMatch", {
        tournament_match_id: match.id,
        winner_slot: correctedSlot,
        reason: reason || defaultReason,
      });
      if (!response.data?.success) {
        toast({ title: "Overturn failed", description: response.data?.error || "Could not overturn this result.", variant: "destructive" });
        return;
      }
      toast({ title: "Result overturned", description: response.data.message || `${correctedName || "The other team"} was granted the win.` });
      await loadLobby(false);
    } catch (error) {
      toast({ title: "Overturn failed", description: error.message || "Could not overturn this result.", variant: "destructive" });
    } finally {
      setOverturningId("");
    }
  };

  const handleModerate = async (targetUser, action) => {
    if (!canModerate || busyUserId) return;
    setBusyUserId(targetUser.user_id);
    try {
      const response = await base44.functions.invoke("moderateStreamerTournamentUser", {
        tournament_id: tournament.id,
        user_id: targetUser.user_id,
        action,
      });
      if (!response.data?.success) {
        toast({ title: "Moderation failed", description: response.data?.error || "Could not update lobby moderation.", variant: "destructive" });
        return;
      }
      setTournament(response.data.tournament);
      toast({ title: action === "unban" ? "User unbanned" : "User banned", description: `${targetUser.user_name} was ${action === "unban" ? "unbanned from" : "banned from"} this lobby.` });
      await loadLobby(false);
    } catch (error) {
      toast({ title: "Moderation failed", description: error.message || "Could not update lobby moderation.", variant: "destructive" });
    } finally {
      setBusyUserId("");
    }
  };

  const handleTournamentAction = async (action) => {
    if (!isHost && !staffRoles.has(user?.role)) return;
    const isDelete = action === "deleteTournament";
    const label = isDelete ? "delete" : "cancel";
    if (typeof window !== "undefined" && !window.confirm(`${isDelete ? "Delete" : "Cancel"} ${tournament.name}?`)) return;

    setTournamentAction(action);
    try {
      const response = await base44.functions.invoke(action, {
        tournament_id: tournament.id,
        reason: `Streamer ${label}`,
      });
      if (!response.data?.success) {
        toast({ title: `Could not ${label} lobby`, description: response.data?.error || "Try again in a moment.", variant: "destructive" });
        return;
      }
      toast({ title: isDelete ? "Lobby deleted" : "Lobby cancelled", description: isDelete ? "The switcheroo lobby was removed." : "The switcheroo lobby is cancelled." });
      if (isDelete) {
        navigate("/streamer-tournaments", { replace: true });
      } else {
        setTournament(response.data.tournament);
      }
    } catch (error) {
      toast({ title: `Could not ${label} lobby`, description: error.message || "Try again in a moment.", variant: "destructive" });
    } finally {
      setTournamentAction("");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-cyan/20 border-t-cyan rounded-full animate-spin mx-auto mb-4" />
          <p className="text-vapor">Loading streamer lobby...</p>
        </div>
      </div>
    );
  }

  if (!tournament || !isStreamerTournament(tournament)) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="glass max-w-md rounded-xl border border-white/5 p-8 text-center">
          <Monitor className="mx-auto mb-4 h-12 w-12 text-vapor/30" />
          <h1 className="mb-2 text-2xl font-black">Streamer Lobby Not Found</h1>
          <Link to="/streamer-tournaments" className="text-cyan hover:underline">Back to streamer tournaments</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="streamer-lobby-screen min-h-screen py-8 text-white">
      <style>{`
        .streamer-lobby-screen {
          position: relative;
          overflow: hidden;
          background:
            radial-gradient(circle at 12% 6%, rgba(20,216,255,0.16), transparent 28%),
            radial-gradient(circle at 82% 12%, rgba(165,108,255,0.14), transparent 28%),
            linear-gradient(180deg, #050910 0%, #080D15 46%, #03060A 100%);
        }
        .streamer-lobby-screen::before {
          content: "";
          position: fixed;
          inset: 0;
          pointer-events: none;
          background-image:
            linear-gradient(rgba(255,255,255,0.026) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.026) 1px, transparent 1px);
          background-size: 54px 54px;
          mask-image: linear-gradient(180deg, rgba(0,0,0,0.75), rgba(0,0,0,0.2));
        }
        .streamer-lobby-screen::after {
          content: "";
          position: fixed;
          inset: 0;
          pointer-events: none;
          background: linear-gradient(120deg, transparent 0%, rgba(20,216,255,0.045) 45%, transparent 62%);
          animation: streamerSweep 7s ease-in-out infinite;
        }
        .streamer-hero,
        .streamer-panel {
          position: relative;
          overflow: hidden;
          border: 1px solid rgba(20,216,255,0.13);
          background:
            linear-gradient(135deg, rgba(20,216,255,0.09), rgba(255,255,255,0.035) 42%, rgba(165,108,255,0.06)),
            rgba(8,13,21,0.76);
          box-shadow: 0 24px 80px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.045);
          backdrop-filter: blur(14px);
        }
        .streamer-panel::before,
        .streamer-hero::before {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          background: linear-gradient(110deg, transparent, rgba(255,255,255,0.08), transparent);
          transform: translateX(-120%);
          animation: streamerPanelScan 6s ease-in-out infinite;
        }
        .streamer-mini-card {
          border: 1px solid rgba(255,255,255,0.07);
          background: linear-gradient(135deg, rgba(255,255,255,0.045), rgba(20,216,255,0.045));
        }
        .streamer-title-glow {
          text-shadow: 0 0 32px rgba(20,216,255,0.16);
        }
        @keyframes streamerPanelScan {
          0%, 55% { transform: translateX(-120%); }
          82%, 100% { transform: translateX(120%); }
        }
        @keyframes streamerSweep {
          0%, 100% { opacity: .18; transform: translateX(-18%); }
          50% { opacity: .42; transform: translateX(18%); }
        }
      `}</style>
      <div className="mx-auto max-w-[1500px] px-4 lg:px-6">
        <div className="streamer-hero mb-6 flex flex-col gap-4 rounded-2xl p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <Link to="/streamer-tournaments" className="mb-4 inline-flex items-center gap-2 text-xs font-black uppercase tracking-wider text-vapor hover:text-cyan">
              <ArrowLeft className="h-3.5 w-3.5" /> Streamer Tournaments
            </Link>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-lg border border-blue-400/25 bg-blue-500/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-blue-300">
                <Monitor className="h-3.5 w-3.5" /> Switcheroo Lobby
              </span>
              <span className="inline-flex items-center gap-2 rounded-lg border border-cyan/25 bg-cyan/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-cyan">
                <Shuffle className="h-3.5 w-3.5" /> {switchFormat}
              </span>
              {isHost && (
                <span className="inline-flex items-center gap-2 rounded-lg border border-green/25 bg-green/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-green">
                  <Shield className="h-3.5 w-3.5" /> Your Lobby
                </span>
              )}
            </div>
            <h1 className="streamer-title-glow truncate text-3xl font-black tracking-tight lg:text-5xl">{tournament.name}</h1>
            <p className="mt-1 text-sm text-vapor">Hosted by {tournament.host_name || tournament.created_by_name || "Streamer"}</p>
          </div>
          {(isHost || staffRoles.has(user?.role)) && (
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handleTournamentAction("cancelTournament")}
                disabled={tournamentAction === "cancelTournament" || tournament.status === "cancelled"}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-orange/20 bg-orange/10 px-4 text-xs font-black uppercase tracking-wider text-orange hover:bg-orange/15 disabled:opacity-50"
              >
                {tournamentAction === "cancelTournament" ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleTournamentAction("deleteTournament")}
                disabled={tournamentAction === "deleteTournament"}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-red-400/20 bg-red-500/10 px-4 text-xs font-black uppercase tracking-wider text-red-300 hover:bg-red-500/15 disabled:opacity-50"
              >
                {tournamentAction === "deleteTournament" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Delete
              </button>
            </div>
          )}
        </div>

        {tournament.status === "cancelled" && (
          <div className="mb-6 rounded-xl border border-orange/20 bg-orange/10 px-5 py-4 text-sm font-semibold text-orange">
            This streamer switcheroo has been cancelled by the host.
          </div>
        )}

        {viewerBanned && (
          <div className="mb-6 rounded-xl border border-red-400/20 bg-red-500/10 px-5 py-4 text-sm font-semibold text-red-300">
            You can still view this streamer lobby, but the streamer host has banned you from posting in chat.
          </div>
        )}

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="space-y-6">
            <section className="streamer-panel rounded-2xl p-5">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <DetailRow icon={Clock} label="Starts" value={formatDate(tournament.start_date)} />
                <DetailRow icon={Users} label="Generated Teams" value={`${tournament.registered_teams || 0}/${tournament.max_teams || 0}`} />
                <DetailRow icon={UserCheck} label="Switch Format" value={switchFormat} />
                <DetailRow icon={Monitor} label="Mode" value={modeLabels[tournament.game_mode] || tournament.game_mode || "Mode TBD"} />
              </div>
              {tournament.description && <p className="mt-5 text-sm leading-6 text-vapor">{tournament.description}</p>}
            </section>

            {canModerate ? (
              <section className="streamer-panel rounded-2xl p-5">
                <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-sm font-black uppercase tracking-wider">Switcheroo Board</h2>
                    <p className="mt-1 text-xs text-vapor">{isFourVFour ? "Add duos, then roll two duos into each 4v4 team." : "Add players, then roll two names into each 2v2 team."}</p>
                  </div>
                  <span className="rounded-md border border-cyan/20 bg-cyan/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-cyan">
                    {entryCount} {entryLabel(switchFormat).toLowerCase()} entries / {generatedTeamCount} teams
                  </span>
                </div>

                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_310px]">
                  <div className="space-y-4">
                    <div className={`grid gap-3 ${isFourVFour ? "sm:grid-cols-[1fr_1fr_auto]" : "sm:grid-cols-[1fr_auto]"}`}>
                      <input
                        ref={entryPlayerOneRef}
                        value={entryDraft.player_one}
                        onChange={(event) => setEntryDraft((current) => ({ ...current, player_one: event.target.value }))}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" && !isFourVFour) {
                            event.preventDefault();
                            addEntry();
                          }
                        }}
                        className="min-w-0 rounded-lg border border-cyan/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-cyan/35"
                        placeholder={isFourVFour ? "Duo player 1" : "Player name"}
                      />
                      {isFourVFour && (
                        <input
                          value={entryDraft.player_two}
                          onChange={(event) => setEntryDraft((current) => ({ ...current, player_two: event.target.value }))}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              addEntry();
                            }
                          }}
                          className="min-w-0 rounded-lg border border-cyan/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-cyan/35"
                          placeholder="Duo player 2"
                        />
                      )}
                      <button
                        type="button"
                        onClick={addEntry}
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-cyan/25 bg-cyan/10 px-4 text-xs font-black uppercase tracking-wider text-cyan hover:bg-cyan/15"
                      >
                        <Plus className="h-4 w-4" /> Add
                      </button>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-2">
                      {entriesDraft.length === 0 ? (
                        <div className="rounded-lg border border-cyan/10 bg-black/20 px-4 py-6 text-center text-sm text-vapor sm:col-span-2">
                          No names added yet.
                        </div>
                      ) : entriesDraft.map((entry, index) => (
                        <div key={entry.id} className="streamer-mini-card flex items-center justify-between gap-3 rounded-lg px-3 py-2">
                          <div className="min-w-0">
                            <p className="text-[10px] font-black uppercase tracking-wider text-vapor">{entryLabel(switchFormat)} {index + 1}</p>
                            <p className="truncate text-sm font-bold">{entryNames(entry).join(" / ")}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeEntry(entry.id)}
                            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-red-400/20 bg-red-500/10 text-red-300 hover:bg-red-500/15"
                            aria-label="Remove entry"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-xl border border-cyan/20 bg-cyan/[0.06] p-4 shadow-[0_0_35px_rgba(20,216,255,0.08)]">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <p className="text-[10px] font-black uppercase tracking-wider text-cyan">Draft Teams</p>
                      <Shuffle className={`h-4 w-4 text-cyan ${spinning ? "animate-spin" : ""}`} />
                    </div>
                    <div className="min-h-[142px] space-y-2">
                      {(spinning ? spinTeams : teamDrafts).slice(0, 5).map((team, index) => (
                        <div key={`${team.id || team.name}-${index}`} className="streamer-mini-card rounded-lg px-3 py-2">
                          <p className="text-[10px] font-black uppercase tracking-wider text-vapor">{team.name || `Team ${index + 1}`}</p>
                          <p className="truncate text-sm font-bold text-white">{team.label || teamLabel(team)}</p>
                        </div>
                      ))}
                      {!spinning && teamDrafts.length === 0 && entryCount >= 4 && (
                        <div className="flex min-h-[130px] items-center justify-center text-center text-sm text-vapor">
                          Spin the draw to reveal teams before locking the bracket.
                        </div>
                      )}
                      {entryCount < 4 && teamDrafts.length === 0 && (
                        <div className="flex min-h-[130px] items-center justify-center text-center text-sm text-vapor">
                          Add {isFourVFour ? "four duos" : "four players"} to unlock the draw.
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowBigDraw(true)}
                      disabled={teamDrafts.length === 0 && spinTeams.length === 0}
                      className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-cyan/25 bg-cyan/10 px-4 text-xs font-black uppercase tracking-wider text-cyan hover:bg-cyan/15 disabled:opacity-50"
                    >
                      <Maximize2 className="h-4 w-4" /> Big Draw Screen
                    </button>
                  </div>
                </div>

                <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={saveEntries}
                    disabled={savingEntries || spinning || generating}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-white/10 bg-black/30 px-4 text-xs font-black uppercase tracking-wider text-white hover:border-cyan/25 disabled:opacity-50"
                  >
                    {savingEntries ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Save Names
                  </button>
                  <button
                    type="button"
                    onClick={spinDraw}
                    disabled={!canGenerate || savingEntries || spinning || generating}
                    className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-cyan px-4 text-xs font-black uppercase tracking-wider text-background disabled:opacity-50"
                  >
                    {spinning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shuffle className="h-4 w-4" />}
                    {teamDrafts.length > 0 ? "Rerun Spin" : "Spin Teams"}
                  </button>
                  <button
                    type="button"
                    onClick={lockBracket}
                    disabled={!canLockBracket || savingEntries || spinning || generating}
                    className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg border border-green/25 bg-green/10 px-4 text-xs font-black uppercase tracking-wider text-green hover:bg-green/15 disabled:opacity-50"
                  >
                    {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trophy className="h-4 w-4" />}
                    Lock Bracket
                  </button>
                </div>

                <DraftTeamsEditor
                  teams={teamDrafts}
                  playerCount={requiredTeamPlayers}
                  canModerate={canModerate}
                  saving={savingTeams}
                  dirty={teamsDirty}
                  onPlayerChange={updateTeamPlayer}
                  onTeamNameChange={(teamIndex, value) => updateTeamDraft(teamIndex, { ...teamDrafts[teamIndex], name: value })}
                  onRemoveTeam={removeDraftTeam}
                  onAddTeam={addDraftTeam}
                  onSave={saveTeams}
                />
              </section>
            ) : (
              <section className="streamer-panel rounded-2xl p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h2 className="text-sm font-black uppercase tracking-wider">Switcheroo Entries</h2>
                  <span className="text-xs text-vapor">{entryCount} listed</span>
                </div>
                {entriesDraft.length === 0 ? (
                  <div className="rounded-lg border border-cyan/10 bg-black/20 px-4 py-6 text-center text-sm text-vapor">The streamer has not added names yet.</div>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {entriesDraft.map((entry, index) => (
                      <div key={entry.id} className="streamer-mini-card rounded-lg px-3 py-2">
                        <p className="text-[10px] font-black uppercase tracking-wider text-vapor">{entryLabel(switchFormat)} {index + 1}</p>
                        <p className="truncate text-sm font-bold">{entryNames(entry).join(" / ")}</p>
                      </div>
                    ))}
                  </div>
                )}
                <DraftTeamsViewer teams={teamDrafts} onOpenBigDraw={() => setShowBigDraw(true)} />
              </section>
            )}

            <section className="streamer-panel rounded-2xl p-5">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-sm font-black uppercase tracking-wider">Maps</h2>
                  <p className="mt-1 text-xs text-vapor">{combinedMapsFromDraft(mapDrafts).length || defaultStreamerMaps.length} maps across SND, HP, and Overload</p>
                </div>
                {canModerate && (
                  <button
                    type="button"
                    onClick={saveMaps}
                    disabled={savingMaps}
                    className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-cyan/25 bg-cyan/10 px-4 text-xs font-black uppercase tracking-wider text-cyan hover:bg-cyan/15 disabled:opacity-50"
                  >
                    {savingMaps ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Save Maps
                  </button>
                )}
              </div>
              {canModerate ? (
                <div className="grid gap-3 md:grid-cols-3">
                  {["snd", "hp", "overload"].map((poolKey) => (
                    <label key={poolKey} className="block space-y-1">
                      <span className="text-[10px] font-black uppercase tracking-wider text-vapor">{mapPoolLabels[poolKey]}</span>
                      <textarea
                        value={mapDrafts[poolKey]}
                        onChange={(event) => {
                          setMapDrafts((current) => ({ ...current, [poolKey]: event.target.value }));
                          mapsDirtyRef.current = true;
                          setMapsDirty(true);
                        }}
                        rows={6}
                        className="w-full resize-y rounded-lg border border-cyan/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-cyan/35"
                        placeholder={`${mapPoolLabels[poolKey]}, one per line`}
                      />
                    </label>
                  ))}
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-3">
                  {["snd", "hp", "overload"].map((poolKey) => (
                    <div key={poolKey}>
                      <p className="mb-2 text-[10px] font-black uppercase tracking-wider text-vapor">{mapPoolLabels[poolKey]}</p>
                      <MapPills maps={mapsFromText(mapDrafts[poolKey])} fallback={defaultStreamerMapPools[poolKey]} />
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="streamer-panel rounded-2xl p-5">
              <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-sm font-black uppercase tracking-wider">Live Bracket</h2>
                  <p className="mt-1 text-xs text-vapor">{matches.length} matches / {participants.length} generated teams</p>
                </div>
                <span className={`inline-flex w-fit items-center gap-2 rounded-md border px-3 py-1.5 text-[10px] font-black uppercase tracking-wider ${
                  tournament.status === "completed"
                    ? "border-green/25 bg-green/10 text-green"
                    : tournament.switch_bracket_generated
                      ? "border-cyan/25 bg-cyan/10 text-cyan"
                      : "border-white/10 bg-secondary text-vapor"
                }`}>
                  {tournament.status === "completed" ? <Trophy className="h-3.5 w-3.5" /> : <Radio className="h-3.5 w-3.5" />}
                  {tournament.status === "completed" ? "Completed" : tournament.switch_bracket_generated ? "Live" : "Waiting"}
                </span>
              </div>

              {matchesByRound.length === 0 ? (
                <div className="rounded-xl border border-cyan/10 bg-black/20 px-5 py-12 text-center">
                  <Swords className="mx-auto mb-3 h-10 w-10 text-vapor/30" />
                  <p className="text-sm text-vapor">The bracket will appear here after the streamer rolls teams.</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {matchesByRound.map(([round, roundMatches]) => (
                    <div key={round}>
                      <div className="mb-3 flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-cyan" />
                        <h3 className="text-xs font-black uppercase tracking-wider text-white">{roundTitle(round, matchesByRound.length)}</h3>
                      </div>
                      <div className="grid gap-3 lg:grid-cols-2">
                        {roundMatches.map((match) => (
                          <BracketMatch
                            key={match.id}
                            match={match}
                            participantByKey={participantByKey}
                            canAdvance={canModerate && hasBothTeams(match) && !isCompleted(match)}
                            canOverturn={canModerate && hasBothTeams(match) && isCompleted(match)}
                            advancing={advancingId === match.id}
                            overturning={overturningId === match.id}
                            onAdvance={advanceMatch}
                            onOverturn={overturnMatch}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          <div className="space-y-6">
            <MatchChat
              conversationId={tournament.id}
              matchType="streamer_tournament"
              accent="cyan"
              title="Streamer Lobby Chat"
              placeholder="Chat in the streamer lobby..."
              disabledReason={viewerBanned ? "You are banned from posting in this lobby" : ""}
              live
              heightClass="h-[620px]"
              sticky={false}
            />

            <section className="streamer-panel rounded-2xl p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-sm font-black uppercase tracking-wider">Chat Moderation</h2>
                <span className="text-[10px] font-black uppercase tracking-wider text-vapor">{canModerate ? "Enabled" : "Host only"}</span>
              </div>
              {!canModerate ? (
                <p className="text-sm text-vapor">The streamer host can moderate this lobby chat.</p>
              ) : (
                <div className="space-y-4">
                  <ModerationList
                    title="Recent Chatters"
                    empty="No viewers have chatted yet."
                    users={chatters}
                    bannedUserIds={bannedUserIds}
                    busyUserId={busyUserId}
                    onModerate={handleModerate}
                  />
                  <ModerationList
                    title="Banned From Chat"
                    empty="No local bans."
                    users={bannedUsers.map((entry) => ({ user_id: entry.user_id, user_name: entry.user_name || "Viewer" }))}
                    bannedUserIds={bannedUserIds}
                    busyUserId={busyUserId}
                    onModerate={handleModerate}
                    bannedList
                  />
                </div>
              )}
            </section>
          </div>
        </div>
      </div>

      {showBigDraw && (
        <BigDrawOverlay
          tournament={tournament}
          teams={spinning ? spinTeams : teamDrafts}
          spinning={spinning}
          canModerate={canModerate}
          canSpin={canGenerate && !spinning && !generating}
          canLock={canLockBracket && !spinning && !generating}
          onSpin={spinDraw}
          onLock={lockBracket}
          onClose={() => setShowBigDraw(false)}
        />
      )}
    </div>
  );
}

function DraftTeamsEditor({
  teams,
  playerCount,
  canModerate,
  saving,
  dirty,
  onPlayerChange,
  onTeamNameChange,
  onRemoveTeam,
  onAddTeam,
  onSave,
}) {
  if (!canModerate) return null;

  return (
    <div className="mt-6 rounded-xl border border-cyan/10 bg-black/20 p-4">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-black uppercase tracking-wider">Editable Draft Teams</h3>
          <p className="mt-1 text-xs text-vapor">Replace names here if someone drops and a new player joins before the bracket is locked.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onAddTeam}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-white/10 bg-black/30 px-3 text-[10px] font-black uppercase tracking-wider text-vapor hover:border-cyan/25 hover:text-cyan"
          >
            <Plus className="h-3.5 w-3.5" /> Add Team
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving || teams.length === 0}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-cyan/25 bg-cyan/10 px-3 text-[10px] font-black uppercase tracking-wider text-cyan hover:bg-cyan/15 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            {dirty ? "Save Teams" : "Teams Saved"}
          </button>
        </div>
      </div>

      {teams.length === 0 ? (
        <div className="rounded-lg border border-cyan/10 bg-black/20 px-4 py-6 text-center text-sm text-vapor">
          Spin teams to edit the draw before locking the bracket.
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {teams.map((team, teamIndex) => {
            const players = teamPlayerSlots(team, playerCount);
            return (
              <div key={team.id || teamIndex} className="streamer-mini-card rounded-xl p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Edit3 className="h-4 w-4 text-cyan" />
                  <input
                    value={team.name || `Team ${teamIndex + 1}`}
                    onChange={(event) => onTeamNameChange(teamIndex, event.target.value)}
                    className="min-w-0 flex-1 rounded-lg border border-cyan/10 bg-black/30 px-3 py-2 text-sm font-black outline-none focus:border-cyan/35"
                  />
                  <button
                    type="button"
                    onClick={() => onRemoveTeam(teamIndex)}
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-red-400/20 bg-red-500/10 text-red-300 hover:bg-red-500/15"
                    aria-label="Remove team"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {players.map((player, playerIndex) => (
                    <input
                      key={`${team.id || teamIndex}-${playerIndex}`}
                      value={player}
                      onChange={(event) => onPlayerChange(teamIndex, playerIndex, event.target.value)}
                      className="min-w-0 rounded-lg border border-cyan/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-cyan/35"
                      placeholder={`Player ${playerIndex + 1}`}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DraftTeamsViewer({ teams, onOpenBigDraw }) {
  if (!teams.length) return null;

  return (
    <div className="mt-5 rounded-xl border border-cyan/15 bg-cyan/[0.04] p-4">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-black uppercase tracking-wider">Rolled Teams</h3>
          <p className="mt-1 text-xs text-vapor">The streamer can still reroll or edit these before the bracket is locked.</p>
        </div>
        <button
          type="button"
          onClick={onOpenBigDraw}
          className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-cyan/25 bg-cyan/10 px-3 text-[10px] font-black uppercase tracking-wider text-cyan hover:bg-cyan/15"
        >
          <Maximize2 className="h-3.5 w-3.5" /> Big Draw
        </button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {teams.map((team, index) => (
          <div key={team.id || index} className="streamer-mini-card rounded-lg px-3 py-2">
            <p className="text-[10px] font-black uppercase tracking-wider text-vapor">{team.name || `Team ${index + 1}`}</p>
            <p className="truncate text-sm font-bold">{teamLabel(team)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

const drawAccents = [
  { hex: "#14D8FF", rgb: "20,216,255", soft: "rgba(20,216,255,0.12)" },
  { hex: "#168BFF", rgb: "22,139,255", soft: "rgba(22,139,255,0.12)" },
  { hex: "#A56CFF", rgb: "165,108,255", soft: "rgba(165,108,255,0.12)" },
  { hex: "#F2B928", rgb: "242,185,40", soft: "rgba(242,185,40,0.12)" },
  { hex: "#28E38B", rgb: "40,227,139", soft: "rgba(40,227,139,0.12)" },
  { hex: "#FF4F9A", rgb: "255,79,154", soft: "rgba(255,79,154,0.12)" },
];

function drawAccent(index) {
  return drawAccents[index % drawAccents.length];
}

function captainNames(team) {
  const names = teamNames(team);
  const captains = names.length >= 4 ? [names[0], names[2]] : [names[0]];
  return [...new Set(captains.filter(Boolean))];
}

function captainTitle(team) {
  return captainNames(team).join(" + ") || team?.name || "Captain";
}

function orderedDrawPlayers(team) {
  const names = teamNames(team);
  if (names.length >= 4) {
    return [names[0], names[2], names[1], names[3]].filter(Boolean);
  }
  return names;
}

function drawDensity(teamCount) {
  if (teamCount >= 17) {
    return {
      name: "mega",
      cardMin: "158px",
      gap: "8px",
      cardClass: "p-2",
      badgeClass: "h-8 w-8 text-xl left-2 top-2",
      tabClass: "h-6 w-24 text-[9px] -mt-2 mb-2",
      emblemWrapClass: "hidden",
      emblemClass: "h-12 w-12 rounded-xl",
      emblemIconClass: "h-7 w-7",
      titleClass: "hidden",
      captainClass: "hidden",
      playersClass: "mt-9 gap-1 content-start",
      playerRowClass: "px-2 py-1 text-[15px] leading-5",
      playerIconClass: "h-5 w-5",
    };
  }
  if (teamCount >= 13) {
    return {
      name: "compact",
      cardMin: "180px",
      gap: "10px",
      cardClass: "p-3",
      badgeClass: "h-10 w-10 text-2xl left-3 top-3",
      tabClass: "h-7 w-28 text-[10px] -mt-3 mb-2",
      emblemWrapClass: "mt-3",
      emblemClass: "h-16 w-16 rounded-2xl",
      emblemIconClass: "h-9 w-9",
      titleClass: "mt-3 text-xl",
      captainClass: "mt-1.5 px-2 py-0.5 text-[8px]",
      playersClass: "mt-3 grid-cols-2 gap-1.5 content-start",
      playerRowClass: "px-2 py-1 text-[15px] leading-5",
      playerIconClass: "h-5 w-5",
    };
  }
  if (teamCount >= 9) {
    return {
      name: "dense",
      cardMin: "210px",
      gap: "10px",
      cardClass: "p-2.5",
      badgeClass: "h-9 w-9 text-xl left-3 top-3",
      tabClass: "h-6 w-24 text-[9px] -mt-2.5 mb-1",
      emblemWrapClass: "mt-1",
      emblemClass: "h-12 w-12 rounded-xl",
      emblemIconClass: "h-7 w-7",
      titleClass: "mt-1.5 text-lg",
      captainClass: "mt-1 px-2 py-0.5 text-[8px]",
      playersClass: "mt-2 grid-cols-2 gap-1.5 content-start",
      playerRowClass: "px-2 py-1 text-[15px] leading-5",
      playerIconClass: "h-5 w-5",
    };
  }
  return {
    name: "showcase",
    cardMin: "280px",
    gap: "20px",
    cardClass: "p-5",
    badgeClass: "h-16 w-16 text-4xl left-5 top-5",
    tabClass: "h-10 w-40 text-sm -mt-5 mb-5",
    emblemWrapClass: "mt-5",
    emblemClass: "h-40 w-40 rounded-[28px]",
    emblemIconClass: "h-20 w-20",
    titleClass: "mt-6 text-4xl",
    captainClass: "mt-3 px-3 py-1 text-[10px]",
    playersClass: "mt-6 gap-2 content-end",
    playerRowClass: "px-3 py-3 text-lg",
    playerIconClass: "h-8 w-8",
  };
}

function drawGridColumns(teamCount) {
  if (teamCount <= 1) return 1;
  if (teamCount <= 4) return teamCount;
  if (teamCount <= 8) return 4;
  if (teamCount <= 12) return 5;
  if (teamCount <= 16) return 6;
  return 7;
}

function BigDrawOverlay({ tournament, teams, spinning, canModerate, canSpin, canLock, onSpin, onLock, onClose }) {
  const visibleTeams = teams.length ? teams : [];
  const totalPlayers = visibleTeams.reduce((total, team) => total + teamNames(team).length, 0);
  const density = drawDensity(visibleTeams.length);
  const gridColumns = drawGridColumns(visibleTeams.length);
  const gridRows = Math.max(1, Math.ceil(visibleTeams.length / gridColumns));
  const crowded = visibleTeams.length >= 9;
  const mega = visibleTeams.length >= 17;

  return (
    <div className={`switch-draw-screen fixed inset-0 z-50 overflow-hidden bg-[#03070C] text-white ${spinning ? "is-spinning" : ""}`}>
      <style>{`
        .switch-draw-screen {
          background:
            radial-gradient(circle at 18% 8%, rgba(20,216,255,0.14), transparent 26%),
            radial-gradient(circle at 78% 12%, rgba(165,108,255,0.13), transparent 24%),
            linear-gradient(180deg, #03070C 0%, #060A10 48%, #020409 100%);
        }
        .switch-draw-grid {
          background-image:
            linear-gradient(rgba(255,255,255,0.028) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.028) 1px, transparent 1px);
          background-size: 56px 56px;
        }
        .switch-reveal-line {
          position: relative;
          overflow: hidden;
        }
        .switch-reveal-line::before,
        .switch-reveal-line::after {
          content: "";
          position: absolute;
          top: 50%;
          height: 1px;
          width: 38%;
          background: linear-gradient(90deg, transparent, rgba(20,216,255,0.46), transparent);
        }
        .switch-reveal-line::before { left: 0; }
        .switch-reveal-line::after { right: 0; }
        .switch-team-card {
          position: relative;
          overflow: hidden;
          border: 1px solid rgba(var(--team-rgb),0.46);
          background:
            radial-gradient(circle at 50% 24%, rgba(var(--team-rgb),0.25), transparent 31%),
            linear-gradient(180deg, rgba(var(--team-rgb),0.11), rgba(255,255,255,0.025) 45%, rgba(var(--team-rgb),0.075));
          box-shadow: 0 30px 90px rgba(0,0,0,0.34), 0 0 42px rgba(var(--team-rgb),0.12);
          animation: switchCardIn 520ms cubic-bezier(.2,.9,.25,1) both;
        }
        .switch-team-card::before {
          content: "";
          position: absolute;
          inset: -1px;
          background: linear-gradient(110deg, transparent 0%, rgba(255,255,255,0.20) 45%, transparent 60%);
          transform: translateX(-120%);
          animation: switchScan 3.2s ease-in-out infinite;
          opacity: .5;
        }
        .switch-team-card::after {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(180deg, transparent, rgba(0,0,0,0.28));
          pointer-events: none;
        }
        .switch-team-inner {
          position: relative;
          z-index: 1;
        }
        .switch-team-tab {
          clip-path: polygon(0 0, 100% 0, 82% 100%, 18% 100%);
          background: linear-gradient(180deg, rgba(var(--team-rgb),0.22), rgba(var(--team-rgb),0.06));
          border: 1px solid rgba(var(--team-rgb),0.30);
          border-top: 0;
        }
        .switch-emblem {
          background:
            radial-gradient(circle, rgba(var(--team-rgb),0.42), transparent 63%),
            linear-gradient(135deg, rgba(var(--team-rgb),0.18), rgba(255,255,255,0.04));
          filter: drop-shadow(0 0 28px rgba(var(--team-rgb),0.30));
          animation: switchFloat 3s ease-in-out infinite;
        }
        .switch-player-row {
          border: 1px solid rgba(var(--team-rgb),0.13);
          background: linear-gradient(90deg, rgba(var(--team-rgb),0.12), rgba(255,255,255,0.035));
        }
        .switch-player-row-captain {
          border-color: rgba(var(--team-rgb),0.42);
          background: linear-gradient(90deg, rgba(var(--team-rgb),0.28), rgba(255,255,255,0.07));
          box-shadow: inset 0 0 0 1px rgba(var(--team-rgb),0.14), 0 0 18px rgba(var(--team-rgb),0.12);
        }
        .is-spinning .switch-team-card {
          animation: switchCardIn 360ms cubic-bezier(.2,.9,.25,1) both, switchShake 700ms ease-in-out infinite;
        }
        .switch-team-card-mega::before {
          opacity: .16;
          animation-duration: 5.5s;
        }
        .switch-team-card-mega .switch-emblem {
          animation: none;
        }
        @keyframes switchCardIn {
          from { opacity: 0; transform: translateY(26px) scale(.96); filter: blur(6px); }
          to { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
        }
        @keyframes switchScan {
          0%, 45% { transform: translateX(-120%); }
          70%, 100% { transform: translateX(120%); }
        }
        @keyframes switchFloat {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }
        @keyframes switchShake {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          25% { transform: translateY(-2px) rotate(-.35deg); }
          75% { transform: translateY(2px) rotate(.35deg); }
        }
      `}</style>
      <div className={`switch-draw-grid flex h-screen flex-col px-4 sm:px-7 ${crowded ? "py-3" : "py-6"}`}>
        <div className={`flex shrink-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between ${crowded ? "mb-3" : "mb-7"}`}>
          <div className="min-w-0">
            <p className={`${mega ? "text-[10px]" : "text-xs"} font-black uppercase tracking-[0.48em] text-cyan`}>Topfragg Switcheroo</p>
            <h2 className={`mt-2 max-w-[920px] break-words font-black uppercase leading-[0.92] tracking-normal text-white ${
              mega ? "text-3xl sm:text-4xl lg:text-5xl" : crowded ? "text-4xl sm:text-5xl lg:text-6xl" : "text-5xl sm:text-6xl lg:text-7xl"
            }`}>
              {tournament?.name || "Streamer Draw"}
            </h2>
            <p className={`font-semibold text-vapor ${crowded ? "mt-2 text-sm" : "mt-4 text-base sm:text-lg"}`}>
              {spinning ? "Mixing squads live. Nobody is safe until the board stops." : "Teams are on the board. Lock them when the room is ready."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {canModerate && (
              <>
                <button
                  type="button"
                  onClick={onSpin}
                  disabled={!canSpin}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-cyan px-6 text-xs font-black uppercase tracking-wider text-background shadow-[0_0_28px_rgba(20,216,255,0.24)] disabled:opacity-50"
                >
                  {spinning ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                  Rerun Spin
                </button>
                <button
                  type="button"
                  onClick={onLock}
                  disabled={!canLock}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-green/30 bg-green/10 px-6 text-xs font-black uppercase tracking-wider text-green shadow-[0_0_28px_rgba(34,197,94,0.11)] disabled:opacity-50"
                >
                  <Trophy className="h-4 w-4" /> Lock Bracket
                </button>
              </>
            )}
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-12 w-12 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-vapor hover:text-white"
              aria-label="Close big draw"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className={`switch-reveal-line shrink-0 rounded-xl border px-5 text-center font-black uppercase tracking-[0.32em] ${crowded ? "mb-3 py-2 text-xs" : "mb-7 py-4"} ${
          spinning ? "border-cyan/35 bg-cyan/10 text-cyan animate-pulse" : "border-cyan/15 bg-white/[0.035] text-blue-200"
        }`}>
          {spinning ? "Spinning teams..." : `${visibleTeams.length} teams revealed`}
        </div>

        {visibleTeams.length === 0 ? (
          <div className="flex min-h-[52vh] items-center justify-center rounded-2xl border border-white/5 bg-white/[0.035] text-center">
            <div>
              <Shuffle className="mx-auto mb-4 h-16 w-16 text-vapor/35" />
              <p className="text-2xl font-black">No teams rolled yet.</p>
            </div>
          </div>
        ) : (
          <div
            className="grid min-h-0 flex-1"
            style={{
              gridTemplateColumns: `repeat(${gridColumns}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${gridRows}, minmax(0, 1fr))`,
              gap: density.gap,
            }}
          >
            {visibleTeams.map((team, index) => {
              const accent = drawAccent(index);
              const players = orderedDrawPlayers(team);
              const captains = captainNames(team);
              const captainSet = new Set(captains.map((name) => name.toLowerCase()));
              return (
                <div
                  key={team.id || index}
                  className={`switch-team-card switch-team-card-${density.name} min-h-0 rounded-2xl ${density.cardClass}`}
                  style={{
                    "--team-rgb": accent.rgb,
                    "--team-hex": accent.hex,
                    animationDelay: `${index * 90}ms`,
                  }}
                >
                  <div className="switch-team-inner flex h-full flex-col">
                    <div className={`absolute flex items-center justify-center rounded-lg border font-black ${density.badgeClass}`} style={{ borderColor: accent.hex, color: "#fff", background: accent.soft }}>
                      {index + 1}
                    </div>
                    <div className={`switch-team-tab mx-auto flex items-center justify-center font-black uppercase tracking-wider ${density.tabClass}`} style={{ color: accent.hex }}>
                      Team {index + 1}
                    </div>
                    <div className={`flex justify-center ${density.emblemWrapClass}`}>
                      <div className={`switch-emblem flex items-center justify-center border ${density.emblemClass}`} style={{ borderColor: accent.hex }}>
                        <Shield className={density.emblemIconClass} style={{ color: accent.hex }} />
                      </div>
                    </div>
                    <div className="text-center">
                      <h3 className={`truncate font-black uppercase leading-none ${density.titleClass}`} style={{ color: accent.hex }}>
                        {captainTitle(team)}
                      </h3>
                      <div className={`inline-flex items-center gap-1.5 rounded-full border font-black uppercase tracking-wider ${density.captainClass}`} style={{ borderColor: `rgba(${accent.rgb},0.28)`, color: accent.hex, background: accent.soft }}>
                        <Trophy className="h-3.5 w-3.5" /> {captains.length > 1 ? "Captains" : "Captain"}
                      </div>
                    </div>
                    <div className={`grid flex-1 overflow-hidden ${density.playersClass}`}>
                      {players.map((player, playerIndex) => {
                        const isCaptain = captainSet.has(String(player).toLowerCase());
                        return (
                        <div key={`${player}-${playerIndex}`} className={`switch-player-row ${isCaptain ? "switch-player-row-captain" : ""} flex items-center gap-2 rounded-lg ${density.playerRowClass}`}>
                          <span className={`inline-flex shrink-0 items-center justify-center rounded-full ${density.playerIconClass}`} style={{ color: accent.hex, background: accent.soft }}>
                            {isCaptain ? <Trophy className={mega ? "h-3 w-3" : "h-4 w-4"} /> : <Users className={mega ? "h-3 w-3" : "h-4 w-4"} />}
                          </span>
                          <span className="min-w-0 truncate font-black text-white">{player}</span>
                        </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className={`grid shrink-0 gap-3 rounded-2xl border border-white/10 bg-white/[0.035] ${crowded ? "mt-3 p-3 md:grid-cols-[1fr_0.5fr_0.5fr_0.5fr]" : "mt-6 p-5 md:grid-cols-[1.4fr_0.6fr_0.6fr_0.7fr]"}`}>
          <div className="flex items-center gap-4">
            <div className={`${crowded ? "hidden sm:flex h-10 w-10" : "flex h-14 w-14"} items-center justify-center rounded-lg border border-cyan/15 bg-cyan/10 text-cyan`}>
              <Sparkles className={crowded ? "h-5 w-5" : "h-6 w-6"} />
            </div>
            <p className={`${crowded ? "text-xs" : "text-sm"} font-semibold text-vapor`}>Review the teams above. Rerun the spin or lock the bracket when ready.</p>
          </div>
          <DetailStat label="Total Players" value={totalPlayers} icon={Users} compact={crowded} />
          <DetailStat label="Teams" value={visibleTeams.length} icon={Shield} compact={crowded} />
          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-vapor">Status</p>
            <p className={`${crowded ? "mt-1 text-sm" : "mt-2 text-lg"} font-black uppercase ${spinning ? "text-cyan" : "text-green"}`}>
              {spinning ? "Rolling" : "Ready"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailStat({ label, value, icon: Icon, compact = false }) {
  return (
    <div className="border-white/10 md:border-l md:pl-6">
      <p className="text-[10px] font-black uppercase tracking-wider text-vapor">{label}</p>
      <p className={`${compact ? "mt-1 text-sm" : "mt-2 text-xl"} flex items-center gap-2 font-black text-white`}>
        <Icon className={compact ? "h-4 w-4 text-vapor" : "h-5 w-5 text-vapor"} /> {value}
      </p>
    </div>
  );
}

function roundTitle(round, totalRounds) {
  if (round === totalRounds) return "Final";
  if (round === totalRounds - 1) return "Semi Final";
  return `Round ${round}`;
}

function teamPlayers(match, side, participantByKey) {
  const participant = participantByKey.get(String(match?.[`${side}_participant_id`] || ""))
    || participantByKey.get(String(match?.[`${side}_id`] || ""));
  const members = Array.isArray(participant?.members) ? participant.members : [];
  const names = members.map((member) => member.display_name || member.user_name || member.username).filter(Boolean);
  return names.length ? names : Array.isArray(participant?.switch_player_names) ? participant.switch_player_names : [];
}

function BracketMatch({ match, participantByKey, canAdvance, canOverturn, advancing, overturning, onAdvance, onOverturn }) {
  const teamAPlayers = teamPlayers(match, "team_a", participantByKey);
  const teamBPlayers = teamPlayers(match, "team_b", participantByKey);
  const winnerId = String(match.winner_id || "");
  const correctedWinnerName = winnerId === String(match.team_a_id) ? match.team_b_name : match.team_a_name;

  return (
    <div className="streamer-mini-card rounded-xl p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-wider text-vapor">Match {match.match_number || "-"}</p>
          <p className="text-sm font-black">{match.team_a_name || "TBD"} vs {match.team_b_name || "TBD"}</p>
        </div>
        <span className={`rounded border px-2 py-1 text-[10px] font-black uppercase tracking-wider ${
          isCompleted(match)
            ? "border-green/25 bg-green/10 text-green"
            : hasBothTeams(match)
              ? "border-cyan/25 bg-cyan/10 text-cyan"
              : "border-white/10 bg-secondary text-vapor"
        }`}>
          {isCompleted(match) ? "Done" : hasBothTeams(match) ? "Ready" : "Pending"}
        </span>
      </div>

      <div className="space-y-2">
        <BracketTeam
          label="Team A"
          name={match.team_a_name || "TBD"}
          players={teamAPlayers}
          active={winnerId && winnerId === String(match.team_a_id)}
          score={match.team_a_score}
          canAdvance={canAdvance}
          advancing={advancing}
          onAdvance={() => onAdvance(match, "team_a")}
        />
        <BracketTeam
          label="Team B"
          name={match.team_b_name || "TBD"}
          players={teamBPlayers}
          active={winnerId && winnerId === String(match.team_b_id)}
          score={match.team_b_score}
          canAdvance={canAdvance}
          advancing={advancing}
          onAdvance={() => onAdvance(match, "team_b")}
        />
      </div>

      <div className="mt-4">
        <p className="mb-2 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-vapor">
          <MapIcon className="h-3.5 w-3.5 text-cyan" /> Maps
        </p>
        <MapPills maps={(match.maps || []).map((row) => row.map).filter(Boolean)} compact fallback={[]} />
      </div>
      {canOverturn && (
        <button
          type="button"
          onClick={() => onOverturn(match)}
          disabled={overturning}
          className="mt-4 inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-amber-300/25 bg-amber-400/10 px-3 text-[10px] font-black uppercase tracking-wider text-amber-200 hover:bg-amber-400/15 disabled:opacity-50"
        >
          {overturning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
          Overturn to {correctedWinnerName || "Other Team"}
        </button>
      )}
    </div>
  );
}

function BracketTeam({ label, name, players, active, score, canAdvance, advancing, onAdvance }) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${
      active
        ? "border-green/30 bg-green/10"
        : "border-cyan/10 bg-black/25"
    }`}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-wider text-vapor">{label}</p>
          <p className="truncate text-sm font-black">{name}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {score !== undefined && score !== null && <span className="font-mono text-sm font-black text-white">{score}</span>}
          {active && <CheckCircle2 className="h-4 w-4 text-green" />}
          {canAdvance && (
            <button
              type="button"
              onClick={onAdvance}
              disabled={advancing}
              className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-cyan/25 bg-cyan/10 px-2.5 text-[10px] font-black uppercase tracking-wider text-cyan hover:bg-cyan/15 disabled:opacity-50"
            >
              {advancing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trophy className="h-3.5 w-3.5" />}
              Win
            </button>
          )}
        </div>
      </div>
      {players.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {players.map((player) => (
            <span key={player} className="rounded border border-cyan/10 bg-black/25 px-2 py-1 text-[10px] font-bold text-vapor">
              {player}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function MapPills({ maps, compact = false, fallback = defaultStreamerMaps }) {
  const visibleMaps = maps.length ? maps : fallback;
  if (visibleMaps.length === 0) {
    return <p className="text-xs font-bold text-vapor">Maps pending</p>;
  }
  return (
    <div className="flex flex-wrap gap-2">
      {visibleMaps.map((map, index) => (
        <span key={`${map}-${index}`} className={`rounded-md border border-cyan/15 bg-cyan/10 font-bold text-cyan ${compact ? "px-2 py-1 text-[10px]" : "px-3 py-1.5 text-xs"}`}>
          {map}
        </span>
      ))}
    </div>
  );
}

function DetailRow({ icon: Icon, label, value }) {
  return (
    <div className="streamer-mini-card rounded-lg p-3">
      <div className="mb-1 flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-vapor">
        <Icon className="h-3.5 w-3.5 text-blue-300" /> {label}
      </div>
      <p className="truncate text-sm font-bold text-white">{value}</p>
    </div>
  );
}

function ModerationList({ title, empty, users, bannedUserIds, busyUserId, onModerate, bannedList = false }) {
  return (
    <div>
      <p className="mb-2 text-[10px] font-black uppercase tracking-wider text-vapor">{title}</p>
      {users.length === 0 ? (
        <div className="rounded-lg border border-cyan/10 bg-black/20 px-4 py-3 text-sm text-vapor">{empty}</div>
      ) : (
        <div className="space-y-2">
          {users.map((row) => {
            const banned = bannedUserIds.has(String(row.user_id));
            const action = banned || bannedList ? "unban" : "ban";
            return (
              <div key={row.user_id} className="streamer-mini-card flex items-center justify-between gap-3 rounded-lg px-3 py-2">
                <span className="min-w-0 truncate text-sm font-semibold">{row.user_name}</span>
                <button
                  type="button"
                  onClick={() => onModerate(row, action)}
                  disabled={busyUserId === row.user_id}
                  className={`inline-flex shrink-0 items-center gap-1 rounded-md border px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider disabled:opacity-50 ${
                    action === "unban"
                      ? "border-green/20 bg-green/10 text-green"
                      : "border-red-400/20 bg-red-500/10 text-red-300"
                  }`}
                >
                  {busyUserId === row.user_id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : action === "unban" ? <Unlock className="h-3.5 w-3.5" /> : <Ban className="h-3.5 w-3.5" />}
                  {action}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
