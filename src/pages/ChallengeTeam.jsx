import React, { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Check, Crosshair, Headphones, LockKeyhole, Plus, RefreshCw, ShieldCheck, Swords, Trophy, User, Users, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "@/components/ui/use-toast";
import CreateTeamModal from "@/components/teams/CreateTeamModal";
import { challengeRank, challengeRoomPath, CHALLENGE_RANKS } from "@/lib/challengeRanks";
import "@/styles/challenge-team.css";

const invoke = async (name, payload = {}) => {
  const { data } = await base44.functions.invoke(name, payload);
  if (!data?.success) throw new Error(data?.error || "Could not complete this action");
  return data;
};
const statusName = (value) => ({ open: "Open challenge", ready_check: "Join Discord", in_progress: "In progress", awaiting_confirmation: "Confirm score", disputed: "Staff review", completed: "Completed", cancelled: "Cancelled" }[value] || value);
const voiceName = (value) => ({ in_waiting_room: "In lobby voice", in_team_voice: "In team voice", not_linked: "Discord not connected", not_in_waiting_room: "Join lobby voice", move_failed: "Move pending", checking: "Checking voice" }[value] || "Waiting for voice update");
function Rank({ xp = 0 }) { const rank = challengeRank(xp); return <span className="cat-rank" style={{ "--rank-color": rank.color }}><ShieldCheck size={13} />{rank.name}<b>{xp.toLocaleString()} XP</b></span>; }
function Dialog({ title, onClose, children }) {
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const escape = (event) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", escape);
    return () => { document.body.style.overflow = previous; document.removeEventListener("keydown", escape); };
  }, [onClose]);
  return <div className="cat-dialog-backdrop" onClick={onClose}><section className="cat-dialog" role="dialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()}><header><h2>{title}</h2><button type="button" onClick={onClose} aria-label="Close dialog"><X size={19} /></button></header>{children}</section></div>;
}
function StakesNotice() { return <div className="cat-stakes"><span className="cat-stakes-icon"><LockKeyhole size={19} /></span><div><strong>Raise the stakes. Coming later.</strong><p>Cash stakes are planned for Challenge a Team. For now, every challenge is free and played for XP.</p></div><button type="button" disabled>Cash stakes disabled</button></div>; }

export default function ChallengeTeam() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const cache = useQueryClient();
  const [tab, setTab] = useState("challenges");
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
  return <div className="competition-page cat-page min-h-screen py-8"><div className="cat-container mx-auto w-full max-w-[1600px] px-4 lg:px-6">
    {id && <Link to="/challenge-a-team" className="cat-back"><ArrowLeft size={14} />Challenge a Team</Link>}
    <header className={`cat-hero ${id ? "cat-hero-room" : ""}`}>
      <div><p className="cat-eyebrow"><Crosshair size={14} />TOPFRAGG / CHALLENGE A TEAM <span>NEW</span></p><h1>{id ? <>{match?.alpha_team?.name || "Your squad"}<span className="cat-vs"> vs </span>{match?.bravo_team?.name || "Solo challengers"}</> : <>Your squad.<br /><em>Their next challenge.</em></>}</h1><p>{id ? `${match?.size || "—"}v${match?.size || "—"} · ${match?.game_name || "Loading game"} · ${match?.format_name || ""}` : "Post your roster. Face another team or a side of solo challengers. Build your own legacy, one win at a time."}</p>
      {!id && <div className="cat-hero-actions"><button className="cat-button cat-primary" onClick={() => { setTeamId(""); setPosting(true); }}><Plus size={16} />Post a challenge</button><button className="cat-button" onClick={() => setCreateTeam(true)}><Users size={16} />Create a roster</button></div>}
      </div><div className="cat-hero-mark" aria-hidden="true"><Crosshair size={88} /><span>01—04 / TEAM CHALLENGES</span></div>
    </header>
    {!data?.voice_enabled && !overview.isPending && <div className="cat-warning"><Headphones size={18} /><span>Discord voice is not enabled yet. Matches can be posted, but starting requires the Discord bot and voice configuration.</span></div>}
    {!user?.discord_user_id && <div className="cat-warning"><Headphones size={18} /><span>Connect Discord and join the Topfragg server to play.</span><Link to="/settings">Connect Discord <ArrowRight size={13} /></Link></div>}
    {(overview.error || room.error) && <div className="cat-warning" role="alert"><span>{(room.error || overview.error).message}</span><button className="cat-button" onClick={() => { overview.refetch(); if (id) room.refetch(); }}><RefreshCw size={14} />Retry</button></div>}
    {id ? room.isPending ? <div className="cat-empty" role="status">Loading challenge room…</div> : match && <ChallengeRoom key={match.id} match={match} user={user} busy={busy} action={action} onJoin={openJoin} /> : <>
      <nav className="cat-tabs" aria-label="Challenge a Team sections">{[["challenges", "Challenges", Swords], ["standings", "Leaderboards", Trophy], ["rosters", "My rosters", Users]].map(([value, label, Icon]) => <button key={value} aria-pressed={tab === value} onClick={() => setTab(value)}><Icon size={16} />{label}</button>)}</nav>
      {overview.isPending ? <div className="cat-empty" role="status">Loading team challenges…</div> : tab === "challenges" ? <>
        <div className="cat-section-heading"><div><p className="cat-eyebrow">THE CHALLENGE BOARD</p><h2>Pick your opposition.</h2></div><span>{active.length} challenges</span></div>
        <div className="cat-board">{active.map((entry) => <article className="cat-match-card" key={entry.id}><div className="cat-card-top"><span className="cat-format">{entry.size}v{entry.size}</span><span className="cat-status" data-status={entry.status}>{statusName(entry.status)}</span></div><h3>{entry.alpha_team.name}</h3><p>{entry.game_name} · {entry.format_name}</p><Rank xp={entry.alpha_xp || 0} /><div className="cat-opposition"><Users size={15} /><span>{entry.bravo_team?.name || `${entry.players.filter((player) => player.side === "bravo").length}/${entry.size} solo challengers`}</span></div><div className="cat-card-bottom">{entry.is_member || entry.status !== "open" ? <Link className="cat-button cat-primary" to={challengeRoomPath(entry.id)}>Open room <ArrowRight size={14} /></Link> : <button className="cat-button cat-primary" onClick={() => openJoin(entry)}>Accept challenge <ArrowRight size={14} /></button>}<span>FREE / XP</span></div></article>)}</div>
        {!active.length && <div className="cat-empty"><Crosshair size={32} /><h3>The board is yours.</h3><p>Post the first challenge with your complete solo, duo, trio or squad roster.</p><button className="cat-button cat-primary" onClick={() => setPosting(true)}>Post a challenge</button></div>}
        {(data?.matches || []).some((entry) => ["completed", "cancelled"].includes(entry.status)) && <section className="cat-panel cat-history"><h2>Your recent challenges</h2>{data.matches.filter((entry) => ["completed", "cancelled"].includes(entry.status)).slice(0, 20).map((entry) => <Link key={entry.id} to={challengeRoomPath(entry.id)}><span>{entry.alpha_team.name} vs {entry.bravo_team?.name || "Solo challengers"}</span><strong>{entry.score ? `${entry.score.alpha}–${entry.score.bravo}` : statusName(entry.status)}</strong><ArrowRight size={14} /></Link>)}</section>}
      </> : tab === "standings" ? <>
        <div className="cat-section-heading"><div><p className="cat-eyebrow">A LADDER OF YOUR OWN</p><h2>Earn your place.</h2></div><div className="cat-segment">{["teams", "solos"].map((value) => <button key={value} aria-pressed={ladder === value} onClick={() => setLadder(value)}>{value === "teams" ? "Team standings" : "Solo standings"}</button>)}</div></div>
        <div className="cat-panel cat-xp-explainer"><Trophy size={22} /><div><strong>Win smarter. Climb higher.</strong><p>Higher XP means smaller win rewards. Beating a stronger opponent earns more; losing to a lower-XP opponent costs more. Team entries earn team XP. Solo joins and one-player rosters also earn individual solo XP. XP never falls below zero.</p></div></div>
        <div className="cat-panel cat-table-wrap"><table className="cat-table"><thead><tr><th>#</th><th>{ladder === "teams" ? "Team" : "Player"}</th><th>Rank / XP</th><th>W–L</th><th>Win %</th></tr></thead><tbody>{ladderRows.map((row, index) => <tr key={row.id} data-own={(data?.my_standings || []).some((own) => own.id === row.id)}><td>{String(index + 1).padStart(2, "0")}</td><td><Link to={row.kind === "team" ? `/teams?team=${encodeURIComponent(row.subject_id)}` : `/profile/${encodeURIComponent(row.subject_id)}`}>{row.name}</Link></td><td><Rank xp={row.xp} /></td><td>{row.wins}–{row.losses}</td><td>{row.wins + row.losses ? Math.round(row.wins / (row.wins + row.losses) * 100) : 0}%</td></tr>)}</tbody></table>{!ladderRows.length && <div className="cat-empty">Complete your first challenge to enter this leaderboard.</div>}</div>
        <div className="cat-rank-track">{CHALLENGE_RANKS.map((rank) => <div key={rank.name} style={{ "--rank-color": rank.color }}><ShieldCheck size={20} /><strong>{rank.name}</strong><span>{rank.xp.toLocaleString()} XP</span></div>)}</div>
      </> : <>
        <div className="cat-section-heading"><div><p className="cat-eyebrow">YOUR IDENTITY. YOUR ROSTER.</p><h2>Build the team to beat.</h2></div><button className="cat-button cat-primary" onClick={() => setCreateTeam(true)}><Plus size={15} />Create a roster</button></div>
        <div className="cat-board">{teams.map((team) => <article key={team.id} className="cat-match-card"><span className="cat-format">{team.roster_size}v{team.roster_size}</span><h3>{team.name}</h3><p>[{team.tag}] · {team.captain_id === user?.id ? "You are the captain" : "Team member"}</p><div className="cat-roster-rank"><Rank xp={data?.my_standings?.find((row) => row.kind === "team" && row.subject_id === team.id)?.xp || 0} /></div><Link className="cat-button" to={`/teams?team=${encodeURIComponent(team.id)}`}><Users size={15} />Manage roster & invites</Link></article>)}</div>{!teams.length && <div className="cat-empty"><Users size={30} /><h3>Create your Challenge a Team roster.</h3><p>Choose Solo, Duo, Trio or Squad. Invite your players from Teams. Only a complete roster can post or accept as a team.</p><button className="cat-button cat-primary" onClick={() => setCreateTeam(true)}>Create roster</button></div>}
      </>}
      <StakesNotice />
    </>}
    <CreateTeamModal isOpen={createTeam} onClose={() => setCreateTeam(false)} user={user} defaultTeamType="challenge" defaultRosterSize={4} lockTeamType title="Create a Challenge a Team roster" description="Solo, duo, trio or squad. This roster has its own team XP." onCreated={(team) => { cache.invalidateQueries({ queryKey: ["challenge-overview"] }); navigate(`/teams?team=${encodeURIComponent(team.id)}`); }} />
    {posting && <Dialog title="Post a challenge" onClose={() => !busy && setPosting(false)}><form onSubmit={post} className="cat-form"><p>Only the captain of a complete roster can post. Everyone needs an Activision ID and connected Discord.</p><label>Your roster<select value={teamId || captained[0]?.id || ""} onChange={(event) => setTeamId(event.target.value)} required><option value="" disabled>Choose your team</option>{captained.map((team) => <option key={team.id} value={team.id}>{team.name} · {team.roster_size}v{team.roster_size}</option>)}</select></label>{!captained.length && <button type="button" className="cat-button" onClick={() => { setPosting(false); setCreateTeam(true); }}>Create your roster first</button>}<label>Game<select value={game?.id || ""} onChange={(event) => { setGameId(event.target.value); setFormatId(""); }} required>{games.map((entry) => <option key={entry.id} value={entry.id}>{entry.name} {entry.number}</option>)}</select></label><label>Series<select value={selectedFormat?.id || ""} onChange={(event) => setFormatId(event.target.value)} required>{formats.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label><p className="cat-note">Team size follows your roster: 1v1, 2v2, 3v3 or 4v4. Free entry. Maps are revealed once both sides are in Discord.</p><button className="cat-button cat-primary" disabled={busy || !captained.length || !game}>{busy ? "Posting…" : "Post challenge"}<ArrowRight size={15} /></button></form></Dialog>}
    {joining && <Dialog title={`Accept ${joining.size}v${joining.size} challenge`} onClose={() => !busy && setJoining(null)}><div className="cat-form"><p>Take on <strong>{joining.alpha_team.name}</strong>. Join individually or enter your complete {joining.size}-player roster.</p><button className="cat-button cat-primary" disabled={busy} onClick={() => join("solo")}><User size={16} />Join as solo</button><p className="cat-note">Solo entries fill the opposing side together and earn solo XP. The first solo becomes captain.</p><div className="cat-form-divider">OR BRING YOUR TEAM</div><label>Your team<select value={teamId || captained.filter((team) => Number(team.roster_size) === joining.size)[0]?.id || ""} onChange={(event) => setTeamId(event.target.value)}><option value="" disabled>Choose a matching roster</option>{captained.filter((team) => Number(team.roster_size) === joining.size).map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label><button className="cat-button" disabled={busy || !captained.some((team) => Number(team.roster_size) === joining.size)} onClick={() => join("team")}><Users size={16} />Join as team</button><p className="cat-note">A team needs the entire opposing side empty. Team entries earn team XP.</p></div></Dialog>}
  </div></div>;
}

function ChallengeRoom({ match, user, busy, action, onJoin }) {
  const [alpha, setAlpha] = useState("");
  const [bravo, setBravo] = useState("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [adminOpen, setAdminOpen] = useState(false);
  const me = match.players.find((player) => player.user_id === user?.id);
  const closed = ["completed", "cancelled"].includes(match.status);
  const full = match.players.length === match.size * 2;
  const reportable = ["in_progress", "awaiting_confirmation"].includes(match.status);
  const scorePayload = { alpha: alpha === "" ? null : Number(alpha), bravo: bravo === "" ? null : Number(bravo) };
  const scoreValid = alpha !== "" && bravo !== "";
  const xp = (side) => match.ratings?.filter((row) => row.side === side) || [];
  const voice = match.voice;
  return <>
    <div className="cat-room-status"><span className="cat-status" data-status={match.status}>{statusName(match.status)}</span><span>ROOM #{match.id.slice(-6).toUpperCase()}</span>{match.score && <strong>{match.score.alpha}<small>:</small>{match.score.bravo}</strong>}<span>{match.size * 2} players · BO{match.best_of}</span></div>
    <StakesNotice />
    {match.cancel_reason && <div className="cat-warning">Cancelled: {match.cancel_reason}</div>}
    {!me && match.status === "open" && <button className="cat-button cat-primary cat-join-room" onClick={() => onJoin(match)}>Accept this challenge <ArrowRight size={15} /></button>}
    <div className="cat-room-layout"><div>
      <div className="cat-rosters">{["alpha", "bravo"].map((side) => <section key={side} className={`cat-panel cat-roster cat-roster-${side}`}><header><p className="cat-eyebrow">{side === "alpha" ? "THE DEFENDING ROSTER" : "THE CHALLENGING SIDE"}</p><h2>{match[`${side}_team`]?.name || "Solo challengers"}</h2><p>{match.players.filter((player) => player.side === side).length}/{match.size} players · {match[`${side}_team`] ? "Team XP" : "Individual solo XP"}</p>{xp(side).filter((row) => row.kind === "team").map((row) => <Rank key={row.id} xp={row.xp} />)}</header>{Array.from({ length: match.size }, (_, index) => {
        const player = match.players.filter((row) => row.side === side)[index];
        const state = voice?.players?.find((row) => row.user_id === player?.user_id);
        const change = match.xp_changes?.find((row) => row.kind === "solo" ? row.subject_id === player?.user_id : row.subject_id === player?.team_id);
        return player ? <div key={player.user_id} className="cat-player"><span className="cat-player-avatar">{player.avatar_url ? <img src={player.avatar_url} alt="" /> : player.user_name.slice(0, 2).toUpperCase()}</span><div><Link to={`/profile/${encodeURIComponent(player.username || player.user_id)}`}>{player.user_name}</Link><small>{player.captain ? "CAPTAIN" : "PLAYER"} · {player.activision_id}</small>{voice && <span className="cat-voice-state" data-ready={["in_team_voice", "in_waiting_room"].includes(state?.status)}><Headphones size={11} />{voiceName(state?.status)}</span>}{(!player.team_id || match.size === 1) && xp(side).find((row) => row.subject_id === player.user_id) && <Rank xp={xp(side).find((row) => row.subject_id === player.user_id).xp} />}</div>{change && <b className={change.delta >= 0 ? "cat-positive" : "cat-negative"}>{change.delta >= 0 ? "+" : ""}{change.delta} XP</b>}{match.can_manage && !player.team_id && ["open", "ready_check"].includes(match.status) && <button type="button" disabled={busy} onClick={() => action("kick", { user_id: player.user_id })} aria-label={`Remove ${player.user_name}`}><X size={14} /></button>}</div> : <div key={`empty-${index}`} className="cat-empty-slot"><Plus size={15} />Waiting for a challenger</div>;
      })}</section>)}</div>
      {voice && !voice.closed && !closed && <section className="cat-panel cat-voice-panel"><Headphones size={24} /><div><h2>Your Discord match hub</h2><p>{match.status === "in_progress" || match.status === "awaiting_confirmation" ? "Team voices are separate. Join the lobby if you reconnect; the bot moves you to your team." : "Join this room’s private lobby voice. Once every player is present, a captain can start the match."}</p>{voice.error && <p className="cat-negative">{voice.error}</p>}<div className="cat-voice-links">{voice.waiting_room_url ? <a className="cat-button cat-primary" href={voice.waiting_room_url} target="_blank" rel="noreferrer">Join Discord lobby <ArrowRight size={14} /></a> : <span className="cat-note">{voice.enabled ? "The bot is preparing your private lobby voice…" : "Discord voice is not enabled yet."}</span>}{me && (me.side === "alpha" ? voice.alpha_url : voice.bravo_url) && <a className="cat-button" href={me.side === "alpha" ? voice.alpha_url : voice.bravo_url} target="_blank" rel="noreferrer">Your team voice</a>}{(me?.captain || match.can_manage) && match.status === "ready_check" && <button className="cat-button" disabled={busy || !full || !voice.fresh || voice.players.some((player) => player.status !== "in_waiting_room")} onClick={() => action("start")}><Check size={15} />Start match</button>}</div></div></section>}
      <section className="cat-panel cat-map-section"><div className="cat-section-heading"><h2>The battleground</h2><span>{match.game_name} · {match.format_name}</span></div>{match.series_maps?.length ? <div className="cat-maps">{match.series_maps.map((map, index) => <article key={`${map.id}-${index}`}><div className="cat-map-art" style={{ backgroundImage: `linear-gradient(0deg,#0d1520,transparent),url("${map.image}")` }}><span>MAP {index + 1}</span><h3>{map.name}</h3></div><p>{map.mode_name}</p></article>)}</div> : <div className="cat-empty"><LockKeyhole size={25} /><p>Maps are locked until both complete rosters join the Discord waiting room and a captain starts.</p></div>}</section>
      {(me?.captain && reportable || match.can_manage && !closed && match.started_at) && <section className="cat-panel cat-score-panel"><h2>{match.can_manage ? "Score reporting & review" : "Report the series result"}</h2><p>Use the same left-to-right score for both reports. XP is awarded only after both captains agree, or after a staff decision.</p><div className="cat-score-inputs"><label>{match.alpha_team.name}<input aria-label="Alpha series score" type="number" min="0" max={Math.floor(match.best_of / 2) + 1} value={alpha} onChange={(event) => setAlpha(event.target.value)} /></label><span>:</span><label>{match.bravo_team?.name || "Solo challengers"}<input aria-label="Bravo series score" type="number" min="0" max={Math.floor(match.best_of / 2) + 1} value={bravo} onChange={(event) => setBravo(event.target.value)} /></label></div>{Object.entries(match.reports || {}).map(([side, score]) => <p key={side} className="cat-note">{side === "alpha" ? match.alpha_team.name : match.bravo_team?.name || "Solo captain"} reported {score.alpha}–{score.bravo}</p>)}{me?.captain && reportable && <button className="cat-button cat-primary" disabled={busy || !scoreValid} onClick={() => action("report", scorePayload)}>Submit score</button>}</section>}
      {match.status === "disputed" && <div className="cat-warning"><ShieldCheck size={20} />This result needs staff review. XP remains pending until staff resolves the score.</div>}
      {match.xp_changes?.length > 0 && <section className="cat-panel"><h2>XP awarded</h2><div className="cat-results">{match.xp_changes.map((change) => <div key={change.id}><span>{change.name}<small>{change.kind === "team" ? "Team standing" : "Solo standing"}</small></span><Rank xp={change.new_xp} /><strong className={change.delta >= 0 ? "cat-positive" : "cat-negative"}>{change.delta >= 0 ? "+" : ""}{change.delta} XP</strong></div>)}</div></section>}
      {me && !me.team_id && ["open", "ready_check"].includes(match.status) && <button className="cat-button" disabled={busy} onClick={() => action("leave")}>Leave solo slot</button>}
      {(match.can_manage || me?.captain && ["open", "ready_check"].includes(match.status)) && <section className="cat-panel cat-admin-panel"><button className="cat-admin-toggle" onClick={() => setAdminOpen(!adminOpen)}><ShieldCheck size={17} />{match.can_manage ? "Staff controls" : "Lobby controls"}<span>{adminOpen ? "−" : "+"}</span></button>{adminOpen && <div className="cat-form"><label>Reason<textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Explain the cancellation, correction or revert" maxLength={500} /></label><div className="cat-control-row">{!closed && <button className="cat-button cat-danger" disabled={busy || reason.trim().length < 5} onClick={() => action("cancel", { reason })}>Cancel challenge</button>}{match.can_manage && ["in_progress", "awaiting_confirmation", "disputed"].includes(match.status) && <button className="cat-button" disabled={busy || !scoreValid || reason.trim().length < 5} onClick={() => action("resolve", { ...scorePayload, reason })}>Resolve with entered score</button>}{match.can_admin && match.status === "completed" && <button className="cat-button cat-danger" disabled={busy || reason.trim().length < 5} onClick={() => action("revert", { reason })}>Revert result & XP</button>}</div><p className="cat-note">Staff actions are recorded. XP reverts are blocked when a newer match depends on this result.</p></div>}</section>}
    </div><aside className="cat-panel cat-chat"><header><h2>Room comms</h2><span>PRIVATE</span></header>{match.is_member || match.can_manage ? <><div className="cat-chat-log" role="log" aria-label="Challenge room chat">{(match.messages || []).map((entry) => <div key={entry.id}><strong>{entry.user_name}{entry.staff && <ShieldCheck size={11} />}</strong><p>{entry.text}</p><time>{new Date(entry.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time></div>)}{!match.messages?.length && <p>Plan your match with the other players. Keep it respectful.</p>}</div><form onSubmit={async (event) => { event.preventDefault(); if (await action("chat", { message })) setMessage(""); }}><input aria-label="Room message" value={message} onChange={(event) => setMessage(event.target.value)} placeholder={closed ? "Room closed" : "Message the room…"} maxLength={1000} disabled={closed} /><button type="submit" className="cat-button" disabled={busy || closed || !message.trim()} aria-label="Send room message"><ArrowRight size={16} /></button></form></> : <div className="cat-empty"><LockKeyhole size={24} /><p>Join this challenge to access room chat and Discord voice.</p></div>}</aside></div>
  </>;
}
