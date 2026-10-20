import React, { useState } from "react";
import useRouteSection from "@/hooks/useRouteSection";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Headphones, Plus, RefreshCw, Swords, Trophy, User, Users } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { CompetitionHeader } from "@/components/competition/CompetitionLadder";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "@/components/ui/use-toast";
import CreateTeamModal from "@/components/teams/CreateTeamModal";
import { challengeRoomPath, CHALLENGE_RANKS } from "@/lib/challengeRanks";
import ChallengeRoom, { challengeStatusName as statusName } from "@/components/challenge/ChallengeRoom";
import Rank from "@/components/challenge/ChallengeRankBadge";
import StakesNotice from "@/components/challenge/ChallengeStakesNotice";
import { primaryButton, secondaryButton, fieldClass } from "@/components/challenge/challengeStyles";
import { Dialog as DialogRoot, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

const invoke = async (name, payload = {}) => {
  const { data } = await base44.functions.invoke(name, payload);
  if (!data?.success) throw new Error(data?.error || "Could not complete this action");
  return data;
};
function Dialog({ title, onClose, children }) {
  return <DialogRoot open onOpenChange={(open) => { if (!open) onClose(); }}><DialogContent className="max-h-[90dvh] overflow-y-auto border-white/10 bg-card"><DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>Challenge a Team · Free entry · 1v1 to 4v4</DialogDescription></DialogHeader>{children}</DialogContent></DialogRoot>;
}
const rowGrid = "grid min-w-[940px] grid-cols-[minmax(150px,1fr)_minmax(220px,1.5fr)_minmax(140px,1fr)_minmax(150px,1fr)_200px] gap-5 px-5";
const sectionTitle = "text-sm font-black uppercase tracking-[0.14em]";
const noteClass = "text-xs leading-5 text-vapor";
const labelClass = "flex flex-col gap-2 text-xs font-bold text-vapor";
const panelClass = "competition-challenge-panel overflow-hidden rounded-2xl border border-white/[0.09] bg-card";

export default function ChallengeTeam() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const cache = useQueryClient();
  const [tab, setTab] = useRouteSection("tab", "challenges", ["challenges", "standings", "rosters"]);
  const [ladder, setLadder] = useState("teams");
  const [createTeam, setCreateTeam] = useState(false);
  const [posting, setPosting] = useState(false);
  const [joining, setJoining] = useState(null);
  const [busy, setBusy] = useState(false);
  const [teamId, setTeamId] = useState("");
  const [gameId, setGameId] = useState("bo7");
  const [formatId, setFormatId] = useState("cdl_bo3");
  const overview = useQuery({ queryKey: ["challenge-overview", user?.id], queryFn: () => invoke("getChallengeOverview"), enabled: Boolean(user?.id), refetchInterval: id ? 30000 : 15000, refetchIntervalInBackground: false });
  const room = useQuery({ queryKey: ["challenge-room", id, user?.id], queryFn: () => invoke("getChallengeRoom", { match_id: id }), enabled: Boolean(id && user?.id), refetchInterval: 4000, refetchIntervalInBackground: false });
  const data = overview.data;
  const teams = data?.teams || [];
  const captained = teams.filter((team) => team.captain_id === user?.id);
  const games = (data?.games || []).filter((game) => game.enabled);
  const game = games.find((entry) => entry.id === gameId) || games[0];
  const formats = game?.formats || [];
  const selectedFormat = formats.find((entry) => entry.id === formatId) || formats[0];
  const match = room.data?.match;
  const action = async (actionName, payload = {}) => {
    if (busy) return null;
    setBusy(true);
    try {
      const result = await invoke("challengeAction", { action: actionName, match_id: id, ...payload });
      await Promise.all([cache.invalidateQueries({ queryKey: ["challenge-overview"] }), cache.invalidateQueries({ queryKey: ["challenge-room"] }), cache.invalidateQueries({ queryKey: ["my-match-activity"] })]);
      window.dispatchEvent(new CustomEvent("topfragg:notifications-updated", { detail: { refresh: true } }));
      return result;
    } catch (error) { toast({ title: "Challenge a Team", description: error.message, variant: "destructive" }); return null; }
    finally { setBusy(false); }
  };
  const post = async (event) => {
    event.preventDefault();
    const result = await action("create", { team_id: teamId || captained[0]?.id, game_id: game?.id, format_id: selectedFormat?.id });
    if (result) { setPosting(false); navigate(challengeRoomPath(result.match.id)); }
  };
  const join = async (joinAs) => {
    const compatible = captained.filter((team) => Number(team.roster_size) === joining.size);
    const result = await action("join", { match_id: joining.id, join_as: joinAs, team_id: joinAs === "team" ? teamId || compatible[0]?.id : undefined });
    if (result) { setJoining(null); navigate(challengeRoomPath(result.match.id)); }
  };
  const openJoin = (entry) => { setTeamId(""); setJoining(entry); };
  const ladderRows = data?.standings?.[ladder] || [];
  const active = (data?.matches || []).filter((entry) => !["completed", "cancelled"].includes(entry.status));
  return <div className={id ? "match-room-theme min-h-screen bg-[#0b1016] py-6" : "competition-page competition-surface page-shell min-h-screen"} data-competition={id ? undefined : "challenge"}><div className="page-container">
    {!id && <CompetitionHeader mode="challenge" titleOverride="Challenge a Team" eyebrowOverride="Your squad. Your challenge." descriptionOverride="Your squad against a complete team or a side of solo challengers. Play 1v1, 2v2, 3v3 or 4v4 and climb your own XP ladder." action={<div className="competition-actions"><button className={primaryButton} onClick={() => { setTeamId(""); setPosting(true); }}><Plus className="h-4 w-4" />Post a challenge</button><button className={secondaryButton} onClick={() => setCreateTeam(true)}><Users className="h-4 w-4" />Create a roster</button></div>} />}
    {!id && <div className="my-5 grid gap-3 sm:grid-cols-3">{[
      { label: "Active challenges", value: overview.isPending ? "—" : active.length, detail: "In this competition", icon: Swords, tone: "purple" },
      { label: "Your rosters", value: overview.isPending ? "—" : teams.length, detail: "Build your next lineup", icon: Users, tone: "cyan" },
      { label: "Entry", value: "Free", detail: "1v1, 2v2, 3v3 & 4v4", icon: Trophy, tone: "gold" },
    ].map(({ label, value, detail, icon: Icon, tone }) => <div key={label} className="competition-stat-card" data-tone={tone}><div className="competition-stat-icon"><Icon size={21} /></div><div><p className="competition-stat-label">{label}</p><strong className="competition-stat-value">{value}</strong><p className="competition-stat-detail">{detail}</p></div></div>)}</div>}
    {!data?.voice_enabled && !overview.isPending && <div className="my-4 flex items-start gap-3 rounded-xl border border-orange/20 bg-orange/5 p-4 text-xs leading-5 text-vapor"><Headphones className="h-4 w-4 shrink-0 text-orange" /><p>Discord voice is not enabled yet. Matches can be posted, but starting requires the Discord bot and voice configuration.</p></div>}
    {!user?.discord_user_id && <div className="my-4 flex flex-wrap items-center gap-3 rounded-xl border border-purple-300/20 bg-purple-300/5 p-4"><Headphones className="h-4 w-4 text-purple-200" /><p className={`flex-1 ${noteClass}`}>Connect Discord and join the Topfragg server to play.</p><Link className={secondaryButton} to="/settings">Connect Discord<ArrowRight className="h-3.5 w-3.5" /></Link></div>}
    {(overview.error || room.error) && <div className="my-4 flex items-center justify-between gap-3 rounded-xl border border-orange/20 bg-orange/5 p-4" role="alert"><p className={noteClass}>{(room.error || overview.error).message}</p><button className={secondaryButton} onClick={() => { overview.refetch(); if (id) room.refetch(); }}><RefreshCw className="h-4 w-4" />Retry</button></div>}
    {id ? room.isPending ? <div className="py-16 text-center text-sm text-vapor" role="status">Loading challenge room…</div> : match && <ChallengeRoom key={match.id} match={match} user={user} busy={busy} action={action} onJoin={openJoin} onRefresh={() => room.refetch()} /> : <>
      <nav className="my-5 flex flex-wrap gap-2" aria-label="Challenge a Team sections">{[["challenges", "Challenges", Swords], ["standings", "Leaderboards", Trophy], ["rosters", "My rosters", Users]].map(([value, label, Icon]) => <button key={value} aria-pressed={tab === value} onClick={() => setTab(value)} className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-[10px] font-black uppercase tracking-wider ${tab === value ? "border-cyan/25 bg-cyan/10 text-cyan" : "border-white/10 bg-card text-vapor hover:text-white"}`}><Icon className="h-4 w-4" />{label}</button>)}</nav>
      {overview.isPending ? <div className="py-16 text-center text-sm text-vapor" role="status">Loading team challenges…</div> : tab === "challenges" ? <>
        <section className={panelClass}>
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] px-5 py-4"><h2 className={sectionTitle}>Challenge matchfinder</h2><span className="text-[10px] font-bold text-vapor">{active.length} challenges · Free entry</span></header>
          <div className="overflow-x-auto"><div className={`${rowGrid} border-b border-white/[0.06] bg-white/[0.015] py-3 text-[8px] font-black uppercase tracking-[0.16em] text-vapor`}><span>Game</span><span>Challenge</span><span>Challengers</span><span>Team rank / XP</span><span className="text-right">Action</span></div>
          {active.map((entry) => <article className={`${rowGrid} min-h-[92px] items-center border-b border-white/[0.055] py-4 last:border-b-0 hover:bg-white/[0.02]`} key={entry.id}>
            <div className="flex min-w-0 items-center gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-cyan/20 bg-cyan/10 text-cyan"><Swords className="h-4 w-4" /></span><div className="min-w-0"><p className="text-sm font-black">{entry.game_name}</p><p className="mt-1 text-[10px] text-vapor">{entry.size}v{entry.size} · {entry.format_name}</p></div></div>
            <div className="min-w-0"><h3 className="truncate text-sm font-black">{entry.alpha_team.name}</h3><p className="mt-1 text-[10px] text-vapor">{statusName(entry.status)}</p></div>
            <div className="min-w-0"><p className="truncate text-xs font-bold">{entry.bravo_team?.name || "Solo challengers"}</p><p className="mt-1 text-[10px] text-vapor">{entry.players.filter((player) => player.side === "bravo").length}/{entry.size} players</p></div>
            <Rank xp={entry.alpha_xp || 0} showXp />
            <div className="text-right">{entry.is_member || entry.status !== "open" ? <Link className={primaryButton} to={challengeRoomPath(entry.id)}>Open room<ArrowRight className="h-3.5 w-3.5" /></Link> : <button className={primaryButton} onClick={() => openJoin(entry)}>Accept challenge<ArrowRight className="h-3.5 w-3.5" /></button>}</div>
          </article>)}</div>
          {!active.length && <div className="flex flex-col items-center gap-3 px-5 py-14 text-center"><Swords className="h-8 w-8 text-vapor/30" /><h3 className="text-sm font-black">No open challenges right now.</h3><p className={noteClass}>Post the first challenge with your complete solo, duo, trio or squad roster.</p><button className={primaryButton} onClick={() => setPosting(true)}>Post a challenge</button></div>}
        </section>
        {(data?.matches || []).some((entry) => ["completed", "cancelled"].includes(entry.status)) && <section className={`mt-6 ${panelClass}`}><h2 className={`border-b border-white/[0.07] px-5 py-4 ${sectionTitle}`}>Your recent challenges</h2><div className="divide-y divide-white/[0.06]">{data.matches.filter((entry) => ["completed", "cancelled"].includes(entry.status)).slice(0, 20).map((entry) => <Link key={entry.id} to={challengeRoomPath(entry.id)} className="flex items-center gap-4 px-5 py-4 text-xs hover:bg-white/[0.02]"><span className="min-w-0 flex-1 font-bold">{entry.alpha_team.name} vs {entry.bravo_team?.name || "Solo challengers"}</span><strong className="font-mono text-cyan">{entry.score ? `${entry.score.alpha}–${entry.score.bravo}` : statusName(entry.status)}</strong><ArrowRight className="h-4 w-4 text-vapor" /></Link>)}</div></section>}
      </> : tab === "standings" ? <>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className={sectionTitle}>Challenge leaderboards</h2><div className="flex gap-1 rounded-lg border border-white/10 bg-card p-1">{["teams", "solos"].map((value) => <button key={value} aria-pressed={ladder === value} onClick={() => setLadder(value)} className={`rounded-md px-3 py-2 text-[10px] font-black ${ladder === value ? "bg-cyan/10 text-cyan" : "text-vapor"}`}>{value === "teams" ? "Team standings" : "Solo standings"}</button>)}</div></div>
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-cyan/20 bg-cyan/5 p-4"><Trophy className="h-5 w-5 shrink-0 text-cyan" /><p className={noteClass}>Higher XP means smaller win rewards. Beating a stronger opponent earns more; losing to a lower-XP opponent costs more. Team entries earn team XP. Solo joins and one-player rosters also earn individual solo XP. XP never falls below zero.</p></div>
        <div className={`${panelClass} overflow-x-auto`}><table className="w-full min-w-[640px] text-left text-xs"><thead className="border-b border-white/[0.07] bg-white/[0.015] text-[9px] font-black uppercase tracking-wider text-vapor"><tr>{["#",ladder === "teams" ? "Team" : "Player","Rank / XP","W–L","Win %"].map((label) => <th className="px-5 py-3" key={label}>{label}</th>)}</tr></thead><tbody className="divide-y divide-white/[0.055]">{ladderRows.map((row,index) => <tr key={row.id} className={(data?.my_standings || []).some((own) => own.id === row.id) ? "bg-cyan/[0.04]" : ""}><td className="px-5 py-4 font-mono text-vapor">{String(index+1).padStart(2,"0")}</td><td className="px-5 py-4 font-bold"><Link to={row.kind === "team" ? `/teams?team=${encodeURIComponent(row.subject_id)}` : `/profile/${encodeURIComponent(row.subject_id)}`}>{row.name}</Link></td><td className="px-5 py-4"><Rank xp={row.xp} showXp /></td><td className="px-5 py-4 font-mono">{row.wins}–{row.losses}</td><td className="px-5 py-4 font-mono">{row.wins+row.losses ? Math.round(row.wins/(row.wins+row.losses)*100) : 0}%</td></tr>)}</tbody></table>{!ladderRows.length && <p className="px-5 py-14 text-center text-xs text-vapor">Complete your first challenge to enter this leaderboard.</p>}</div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">{CHALLENGE_RANKS.map((rank) => <div key={rank.name} className="rounded-xl border border-white/[0.07] bg-card p-4"><Rank xp={rank.xp} showXp /></div>)}</div>
      </> : <>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className={sectionTitle}>Your challenge rosters</h2><button className={primaryButton} onClick={() => setCreateTeam(true)}><Plus className="h-4 w-4" />Create a roster</button></div>
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">{teams.map((team) => <article key={team.id} className="rounded-2xl border border-white/[0.09] bg-card p-5"><div className="flex items-center gap-3"><span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-cyan/20 bg-cyan/10 font-mono text-sm font-black text-cyan">{team.roster_size}v{team.roster_size}</span><div className="min-w-0"><h3 className="truncate text-lg font-black">{team.name}</h3><p className="mt-1 text-[10px] text-vapor">[{team.tag}] · {team.captain_id === user?.id ? "You are the captain" : "Team member"}</p></div></div><div className="my-5"><Rank xp={data?.my_standings?.find((row) => row.kind === "team" && row.subject_id === team.id)?.xp || 0} showXp /></div><Link className={secondaryButton} to={`/teams?team=${encodeURIComponent(team.id)}`}><Users className="h-4 w-4" />Manage roster & invites</Link></article>)}</div>
        {!teams.length && <div className="rounded-2xl border border-dashed border-white/10 bg-card px-6 py-14 text-center"><Users className="mx-auto h-8 w-8 text-vapor/30" /><h3 className="mt-4 text-lg font-black">Create your Challenge a Team roster.</h3><p className={`mx-auto mt-2 max-w-xl ${noteClass}`}>Choose Solo, Duo, Trio or Squad. Invite your players from Teams. Only a complete roster can post or accept as a team.</p><button className={`mt-5 ${primaryButton}`} onClick={() => setCreateTeam(true)}>Create roster</button></div>}
      </>}
      <div className="mt-6"><StakesNotice /></div>
    </>}
    <CreateTeamModal isOpen={createTeam} onClose={() => setCreateTeam(false)} user={user} defaultTeamType="challenge" defaultRosterSize={4} lockTeamType title="Create a Challenge a Team roster" description="Solo, duo, trio or squad. This roster has its own team XP." onCreated={(team) => { cache.invalidateQueries({ queryKey: ["challenge-overview"] }); navigate(`/teams?team=${encodeURIComponent(team.id)}`); }} />
    {posting && <Dialog title="Post a challenge" onClose={() => !busy && setPosting(false)}><form onSubmit={post} className="mt-3 space-y-5"><p className={noteClass}>Only the captain of a complete roster can post. Everyone needs an Activision ID and connected Discord.</p><label className={labelClass}>Your roster<select className={fieldClass} value={teamId || captained[0]?.id || ""} onChange={(event) => setTeamId(event.target.value)} required><option value="" disabled>Choose your team</option>{captained.map((team) => <option key={team.id} value={team.id}>{team.name} · {team.roster_size}v{team.roster_size}</option>)}</select></label>{!captained.length && <button type="button" className={secondaryButton} onClick={() => { setPosting(false); setCreateTeam(true); }}>Create your roster first</button>}<label className={labelClass}>Game<select className={fieldClass} value={game?.id || ""} onChange={(event) => { setGameId(event.target.value); setFormatId(""); }} required>{games.map((entry) => <option key={entry.id} value={entry.id}>{entry.name} {entry.number}</option>)}</select></label><label className={labelClass}>Series<select className={fieldClass} value={selectedFormat?.id || ""} onChange={(event) => setFormatId(event.target.value)} required>{formats.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label><p className={noteClass}>Team size follows your roster: 1v1, 2v2, 3v3 or 4v4. Free entry. Maps are revealed once both sides are in Discord.</p><button className={`w-full ${primaryButton}`} disabled={busy || !captained.length || !game}>{busy ? "Posting…" : "Post challenge"}<ArrowRight className="h-4 w-4" /></button></form></Dialog>}
    {joining && <Dialog title={`Accept ${joining.size}v${joining.size} challenge`} onClose={() => !busy && setJoining(null)}><div className="mt-3 space-y-4"><p className={noteClass}>Take on <strong>{joining.alpha_team.name}</strong>. Join individually or enter your complete {joining.size}-player roster.</p><button className={`w-full ${primaryButton}`} disabled={busy} onClick={() => join("solo")}><User className="h-4 w-4" />Join as solo</button><p className={noteClass}>Solo entries fill the opposing side together and earn solo XP. The first solo becomes captain.</p><p className="border-t border-white/10 pt-4 text-[9px] font-black uppercase tracking-wider text-vapor">Or bring your team</p><label className={labelClass}>Your team<select className={fieldClass} value={teamId || captained.filter((team) => Number(team.roster_size) === joining.size)[0]?.id || ""} onChange={(event) => setTeamId(event.target.value)}><option value="" disabled>Choose a matching roster</option>{captained.filter((team) => Number(team.roster_size) === joining.size).map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label><button className={`w-full ${secondaryButton}`} disabled={busy || !captained.some((team) => Number(team.roster_size) === joining.size)} onClick={() => join("team")}><Users className="h-4 w-4" />Join as team</button><p className={noteClass}>A team needs the entire opposing side empty. Team entries earn team XP.</p></div></Dialog>}
  </div></div>;
}
