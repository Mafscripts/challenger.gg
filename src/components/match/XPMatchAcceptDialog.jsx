import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Users, Zap } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { hasActivisionId, activisionIdRequiredMessage } from "@/lib/activision";
import { loadCaptainXPTeams, xpTeamsForMatch } from "@/lib/xpTeams";
import { xpMatchTeamSize } from "@/lib/xpMatchRating";
import XPTeamSelect from "./XPTeamSelect";

export default function XPMatchAcceptDialog({ match, user, requestedTeamId, onClose, onJoined }) {
  const [teams, setTeams] = useState([]);
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [acceptError, setAcceptError] = useState("");
  const [accepting, setAccepting] = useState(false);
  const [retry, setRetry] = useState(0);
  const eligible = xpTeamsForMatch(teams, match);
  const selectedTeam = eligible.find((team) => team.id === selectedTeamId);
  const returnTo = `/matchfinder?category=xp&acceptXP=${encodeURIComponent(match.id)}`;
  const createTeamUrl = `/teams?create=xp&roster=${xpMatchTeamSize(match)}&returnTo=${encodeURIComponent(returnTo)}`;

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError("");
    loadCaptainXPTeams(user?.id).then((rows) => {
      if (!active) return;
      const choices = xpTeamsForMatch(rows, match);
      setTeams(rows);
      setSelectedTeamId(choices.find((team) => team.id === requestedTeamId)?.id || (choices.length === 1 ? choices[0].id : ""));
    }).catch(() => {
      if (active) setLoadError("Your XP teams could not be loaded. Try again.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [user?.id, match, requestedTeamId, retry]);

  const accept = async (event) => {
    event.preventDefault();
    if (accepting || loading || !selectedTeam) return;
    setAcceptError("");
    if (!hasActivisionId(user)) { setAcceptError(activisionIdRequiredMessage); return; }
    setAccepting(true);
    try {
      const response = await base44.functions.invoke("acceptXPMatch", { xp_match_id: match.id, team_id: selectedTeam.id });
      if (!response.data?.success) throw new Error(response.data?.error || "This XP match could not be accepted.");
      onJoined(response.data.xp_match_id || match.id);
    } catch (error) {
      setAcceptError(error.message || "This XP match could not be accepted. Try again.");
    } finally { setAccepting(false); }
  };

  return <Dialog open onOpenChange={(open) => { if (!open && !accepting) onClose(); }}>
    <DialogContent className="max-w-md border-purple-300/25 bg-card" onEscapeKeyDown={(event) => { if (accepting) event.preventDefault(); }} onInteractOutside={(event) => { if (accepting) event.preventDefault(); }}>
      <DialogHeader>
        <p className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-purple-300"><Zap className="h-4 w-4" />XP Matches</p>
        <DialogTitle>Choose your XP team</DialogTitle>
        <DialogDescription>{match.team_size} · {match.game_mode_display || match.game_mode} · Best of {match.best_of || 1}</DialogDescription>
      </DialogHeader>
      {loading ? <p className="py-5 text-center text-sm text-vapor" role="status">Loading your XP teams…</p> : loadError ? <div role="alert" className="space-y-3 text-sm text-vapor"><p>{loadError}</p><button type="button" onClick={() => setRetry((value) => value + 1)} className="site-hover rounded-lg border border-purple-300/25 px-4 py-2 text-xs font-bold text-purple-300">Try again</button></div> : eligible.length ? (
        <form onSubmit={accept} className="space-y-4">
          <label className="block text-xs font-bold text-vapor">Your team
            <XPTeamSelect className="mt-2" teams={eligible} value={selectedTeamId} disabled={accepting} onValueChange={(value) => { setSelectedTeamId(value); setAcceptError(""); }} />
          </label>
          {selectedTeam && <div className="rounded-xl border border-white/10 bg-black/15 p-4"><p className="flex items-center gap-2 text-xs font-bold text-white"><Users className="h-4 w-4 text-purple-300" />{selectedTeam.name}</p><p className="mt-2 text-xs leading-5 text-vapor">{selectedTeam.members.map((member) => member.user_name || member.username || "Player").join(" · ")}</p></div>}
          {acceptError && <p role="alert" className="rounded-lg border border-red-400/25 bg-red-400/5 p-3 text-xs text-red-300">{acceptError}</p>}
          <button type="submit" disabled={accepting || !selectedTeam} className="site-hover xp-match-primary w-full px-4 py-3 text-xs font-black disabled:cursor-not-allowed disabled:opacity-50">{accepting ? "Accepting…" : "Accept with this team"}</button>
        </form>
      ) : <div className="space-y-4 rounded-xl border border-purple-300/20 bg-purple-300/5 p-4"><p className="text-sm font-bold text-white">No complete XP team fits the open slots.</p><p className="text-xs leading-5 text-vapor">Use a team you captain with a full active roster. For 1v1, select a one-player XP team.</p><div className="flex flex-wrap gap-2"><Link to="/teams" className="site-hover rounded-lg border border-white/10 px-3 py-2 text-xs font-bold text-vapor">Your teams</Link><Link to={createTeamUrl} className="site-hover rounded-lg border border-purple-300/25 px-3 py-2 text-xs font-bold text-purple-300">Create XP team</Link></div></div>}
    </DialogContent>
  </Dialog>;
}
