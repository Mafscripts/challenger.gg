import React, { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Check, ChevronDown, Copy, ExternalLink, Headphones, Link2, Mars, Plus, RefreshCw, Shuffle, Trash2, Users, Venus, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import PartyDrawStage from "@/components/competition/PartyDrawStage";
import PartyTeamCount from "@/components/competition/PartyTeamCount";
import { PartyBracket } from "@/components/competition/PartyBracket";
import { PartyAddDuo, PartyAddPlayers } from "@/components/competition/PartyPlayerEntry";
import PartyManagement from "@/components/competition/PartyManagement";
import { effectiveRoleForUser, hasRolePower } from "@/lib/roles";
import { partyCapacity, partyDrawEntries, partySpinEnds, partySpinning, partyValidation } from "@/lib/partyWheel";
import { submitPartyRoomAction } from "@/lib/partyRoomActions";
import { mergeRoomUpdate } from "@/lib/partyRoomUpdates";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import "@/styles/party-rooms.css";

const loadMatchRoom = () => import("@/components/competition/PartyMatchRoom");
const PartyMatchRoomView = lazy(loadMatchRoom);
const modeName = (mode) => mode === "coed" ? "Co-ed" : "Switcheroo";
const canManage = (room, user) => room.owner_id === user?.id || hasRolePower(effectiveRoleForUser(user), "admin");
function Gender({ value }) {
  return value === "male" ? <span className="party-gender is-male" title="Male"><Mars /><span className="sr-only">Male</span></span> : value === "female" ? <span className="party-gender is-female" title="Female"><Venus /><span className="sr-only">Female</span></span> : null;
}
function TeamSize({ value, onChange, disabled }) {
  return <Select value={String(value)} onValueChange={(value) => onChange(Number(value))} disabled={disabled}><SelectTrigger className="party-select"><SelectValue /></SelectTrigger><SelectContent>{[2, 3, 4].map((size) => <SelectItem key={size} value={String(size)}>{size} players per team</SelectItem>)}</SelectContent></Select>;
}

function CreateRoom() {
  const navigate = useNavigate();
  const [mode, setMode] = useState("coed"), [size, setSize] = useState(2), [title, setTitle] = useState("");
  const [rooms, setRooms] = useState([]), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const refresh = useCallback(async () => {
    setLoading(true);
    try { setRooms((await base44.party.list()).rooms); setError(""); }
    catch (error) { setError(error.message || "Rooms could not be loaded."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  const create = async (event) => {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError("");
    try { const data = await base44.party.create({ mode, team_size: size, title }); navigate(`/coed-switcheroo/${data.room.id}`); }
    catch (error) { setError(error.message); }
    finally { setBusy(false); }
  };
  return <div className="party-page"><header className="arena-page-header party-page-heading"><p className="party-eyebrow">Topfragg community nights</p><h1>Co-ed & Switcheroo</h1><p>Your players. Your teams. Let the wheel decide.</p></header>
    <div className="party-home-grid"><form onSubmit={create} className="party-panel"><h2>Create your room</h2><p className="party-muted">Start with two teams, then add more teams and fill in your players.</p>
      <div className="party-mode-options"><button type="button" aria-pressed={mode === "coed"} onClick={() => setMode("coed")}><span><Mars /><Venus /></span><strong>Co-ed</strong><small>Mixed teams with balanced male / female slots</small></button><button type="button" aria-pressed={mode === "switcheroo"} onClick={() => setMode("switcheroo")}><Shuffle /><strong>Switcheroo</strong><small>Spin fresh teams and change partners each round</small></button></div>
      <label className="party-label">Room name<input className="party-field" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={32} placeholder={mode === "coed" ? "Friday Co-ed" : "Switcheroo night"} /></label>
      <label className="party-label">Team size<TeamSize value={size} onChange={setSize} /></label>
      {error && <p className="party-error" role="alert">{error}</p>}
      <button className="party-button party-primary party-full" disabled={busy}><Plus />{busy ? "Creating…" : "Create room"}</button>
    </form><section className="party-panel"><div className="party-section-heading"><h2>Your rooms</h2><button className="party-icon-button" title="Refresh rooms" onClick={refresh} disabled={loading}><RefreshCw /></button></div>
      {loading ? <p className="party-muted" role="status">Loading your rooms…</p> : rooms.length ? <div className="party-room-list">{rooms.map((room) => <Link key={room.id} to={`/coed-switcheroo/${room.id}`}><span className="party-mode-icon">{room.mode === "coed" ? <Users /> : <Shuffle />}</span><span><strong>{room.title}</strong><small>{modeName(room.mode)} · {room.teams.length} teams · {room.players.length}/{partyCapacity(room)} players</small></span><ExternalLink /></Link>)}</div> : <p className="party-empty">No active rooms yet. Create a room or open an invite from your host.</p>}
      <div className="party-info"><Headphones /><p>Players can link their own slot to their Topfragg account and join the private Discord Waiting Room. The bot moves connected players to their team when the draw is complete.</p></div>
    </section></div>
  </div>;
}

function PartyRoom() {
  const { id, matchId } = useParams(); const { user } = useAuth();
  // A direct match link downloads its UI while the room request is in flight.
  useEffect(() => { if (matchId) void loadMatchRoom().catch(() => {}); }, [matchId]);
  const [data, setData] = useState(null), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(""), [confirm, setConfirm] = useState(null), [, setClock] = useState(0);
  const [offset, setOffset] = useState(0);
  const refresh = useCallback(async () => {
    const start = Date.now(); const result = await base44.party.get(id, matchId);
    setOffset(Date.parse(result.server_time) - (start + Date.now()) / 2);
    setData((previous) => mergeRoomUpdate(previous, result));
  }, [id, matchId]);
  useEffect(() => {
    let active = true, running = false;
    const load = async () => {
      if (running || document.visibilityState === "hidden") return;
      running = true;
      try { const start = Date.now(), result = await base44.party.get(id, matchId); if (active) { setData((previous) => mergeRoomUpdate(previous, result)); setOffset(Date.parse(result.server_time) - (start + Date.now()) / 2); } }
      catch (error) { if (active) setError(error.message); }
      finally { running = false; if (active) setLoading(false); }
    };
    void load(); const poll = setInterval(load, 2000);
    window.addEventListener("focus", load); document.addEventListener("visibilitychange", load);
    return () => { active = false; clearInterval(poll); window.removeEventListener("focus", load); document.removeEventListener("visibilitychange", load); };
  }, [id, matchId]);
  const room = data?.room, voice = data?.voice;
  // Only the wheel needs animation frames. The rest of the room updates once at reveal.
  useEffect(() => {
    if (!room?.spin) return;
    const remaining = partySpinEnds(room) - Date.now() - offset;
    if (remaining <= 0) return;
    const timer = setTimeout(() => setClock((value) => value + 1), Math.ceil(remaining) + 1);
    return () => clearTimeout(timer);
  }, [room?.spin?.id, room?.spin?.started_at, room?.spin?.duration_ms, offset]);
  const manager = room && canManage(room, user), spinning = room && partySpinning(room, Date.now() + offset);
  const act = async (action, input = {}) => {
    if (busy || !room) return false;
    setBusy(true); setError(""); setNotice("");
    try { const result = await submitPartyRoomAction(base44.party, room, action, input, matchId); setData((previous) => previous && result.room.revision < previous.room.revision ? previous : ({ ...previous, room: result.room })); setConfirm(null); return true; }
    catch (error) { setError(error.message); if (error.status === 409) await refresh().catch(() => {}); return false; }
    finally { setBusy(false); }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(window.location.href); setNotice("Invite link copied. Players can open it and link their own slot."); }
    catch { setNotice(`Share this room: ${window.location.href}`); }
  };
  const entries = useMemo(() => room ? partyDrawEntries(room) : [], [room]);
  const invalid = useMemo(() => room ? partyValidation(room) : null, [room]);
  if (loading) return <div className="party-page party-empty" role="status">Loading room…</div>;
  if (!room) return <div className="party-page"><p className="party-error">{error || "Room not found"}</p><Link to="/coed-switcheroo" className="party-button">Back to rooms</Link></div>;
  const disabled = busy || spinning || room.status === "closed", own = room.players.find((player) => player.user_id === user?.id);
  const visiblePlayers = room.players.map((player) => spinning && (room.spin?.selected_ids || [room.spin?.selected_id]).includes(player.id) ? { ...player, side: null } : player);
  const unpicked = visiblePlayers.filter((player) => !player.side);
  const allReady = room.status === "ready" && !spinning;
  const editable = !room.players.some((player) => player.side);
  if (matchId) return <Suspense fallback={<div className="party-page party-empty" role="status">Loading matchroom…</div>}><PartyMatchRoomView key={`${room.round}:${matchId}`} room={room} matchId={matchId} user={user} manager={manager} disabled={disabled} managementDisabled={busy || room.status === "closed"} act={act} voice={voice} error={error} notice={notice} /></Suspense>;
  return <div className="party-page party-studio-page"><Link to="/coed-switcheroo" className="party-back">← Your rooms</Link>
    <header className="arena-page-header party-room-heading"><div><p className="party-eyebrow">{modeName(room.mode)} · Round {room.round}</p><h1>{room.title}</h1><p>Hosted by {room.owner_name} · {room.teams.length} teams · {room.team_size} players per team</p></div><div className="party-actions"><button className="party-button" onClick={copy}><Copy />Invite players</button>{manager && room.status !== "closed" && <button className="party-icon-button" title="Close room" disabled={disabled} onClick={() => setConfirm("close")}><X /></button>}</div></header>
    {error && <p className="party-error" role="alert">{error}</p>}{notice && <p className="party-notice" role="status">{notice}</p>}
    <Dialog open={Boolean(confirm)} onOpenChange={(open) => { if (!open && !busy) setConfirm(null); }}><DialogContent className="party-control-dialog border-white/10 bg-card text-foreground sm:max-w-md"><DialogHeader><DialogTitle>{confirm === "close" ? "Close this room?" : "Start a new draw?"}</DialogTitle><DialogDescription>{confirm === "close" ? "This closes the room and releases its temporary Discord channels." : "Your current results are saved to previous rounds. All players, linked accounts and fixed duos stay in the room, ready for a new spin."}</DialogDescription></DialogHeader>{error && <p className="party-error" role="alert">{error}</p>}<div className="party-actions justify-end"><button type="button" className="party-button" disabled={busy} onClick={() => setConfirm(null)}>Cancel</button><button type="button" className="party-button party-primary" disabled={busy} onClick={() => act(confirm === "close" ? "close" : "reset")}>{busy ? "Please wait…" : confirm === "close" ? "Close room" : "Start new draw"}</button></div></DialogContent></Dialog>
    {room.status === "closed" && <p className="party-notice">This room is closed. Its temporary Discord channels are being cleaned up.</p>}
    <details className="party-panel party-help"><summary>How {modeName(room.mode)} works<ChevronDown /></summary><p>Choose website players or enter guest names. Add a fixed duo to keep two players together. One spin draws every team. All teams are revealed together when the wheel stops. {room.mode === "coed" ? "Choose Male or Female for every player. Teams have equal numbers where possible; teams of three alternate between two men / one woman and one man / two women." : "Each new round prefers different teammates where possible. Fixed duos stay together; other partnerships can repeat when the roster is limited."} Share the room link to watch the same live draw.</p><p>Once the draw is complete, choose single elimination without a losers bracket or double elimination with a losers bracket, then press Start bracket. Open any match to see its roster, report scores and chat. Matching reports from both teams advance the winner automatically; the host or an admin can confirm a result.</p><p>For Discord, each person opens the room, chooses This is me on their own name and joins the Waiting Room. When the spin finishes, the bot moves connected players into their assigned private voice. Names without a linked account can still be drawn.</p></details>
    {!room.bracket && <PartyDrawStage room={room} entries={entries} offset={offset} spinning={spinning} allReady={allReady} manager={manager} disabled={disabled} invalid={invalid} act={act} voice={voice} error={error} onReset={() => { setError(""); setConfirm("reset"); }} settings={manager && editable && room.status !== "closed" ? <div className="party-studio-setup-controls"><label className="party-label">Players per team<TeamSize value={room.team_size} onChange={(size) => act("format", { team_size: size })} disabled={disabled} /></label><PartyTeamCount room={room} disabled={disabled} act={act} /></div> : null}><section className="party-panel party-player-panel"><div className="party-section-heading"><h2>Player pool</h2><span className="party-count">{room.players.length}/{partyCapacity(room)}</span></div>
      {manager && editable && room.status !== "closed" && <PartyAddPlayers room={room} disabled={disabled} act={act} />}
      {manager && editable && room.status !== "closed" && <PartyAddDuo room={room} disabled={disabled} act={act} />}
      <div className="party-player-list">{unpicked.map((player) => <div key={player.id} className="party-player-row"><Gender value={player.gender} /><strong>{player.name}</strong>{player.duo_id && <span className="party-duo-tag" title={room.players.filter((entry) => entry.duo_id === player.duo_id).map((entry) => entry.name).join(" + ")}>Duo</span>}
        {player.user_id ? <span className="party-link-state"><Check />{player.user_id === user?.id ? "You" : "Linked"}</span> : !own && <button className="party-claim" disabled={disabled} onClick={() => act("claim", { player_id: player.id })}>This is me</button>}
        {manager && editable && room.status !== "closed" && <>{player.duo_id && <button className="party-icon-button" title="Unlink this duo" disabled={disabled} onClick={() => act("unpair", { player_id: player.id })}><Link2 /></button>}{room.mode === "coed" && <button className="party-icon-button" title="Change Male / Female" disabled={disabled} onClick={() => act("gender", { player_id: player.id, gender: player.gender === "male" ? "female" : "male" })}>{player.gender === "male" ? <Venus /> : <Mars />}</button>}<button className="party-icon-button" title={`Remove ${player.name}`} disabled={disabled} onClick={() => act("remove", { player_id: player.id })}><Trash2 /></button></>}
      </div>)}</div>
      {!unpicked.length && <p className="party-empty">{allReady ? "Every player has a team." : "No players in the pool yet."}</p>}
      {!editable && !own && room.players.some((player) => !player.user_id) && <details className="party-late-claim"><summary>Link your player slot<ChevronDown /></summary>{room.players.filter((player) => !player.user_id).map((player) => <button className="party-claim" key={player.id} disabled={disabled} onClick={() => act("claim", { player_id: player.id })}>I am {player.name}</button>)}</details>}
      {own && <p className="party-own-slot"><Link2 />Linked as {own.name}<button disabled={disabled} onClick={() => act("leave")}>Unlink</button></p>}
    </section></PartyDrawStage>}
    <PartyBracket room={room} manager={manager} disabled={disabled} act={act} onNewRound={() => { setError(""); setConfirm("reset"); }} />
    {manager && room.status !== "closed" && <PartyManagement room={room} disabled={busy} act={act} error={error} />}
    {room.bracket && room.status !== "closed" && <section className="party-panel party-bracket-linking">{own ? <p className="party-own-slot"><Link2 />Linked as {own.name}<button disabled={disabled} onClick={() => act("leave")}>Unlink</button></p> : <details className="party-late-claim"><summary>Link your player slot to chat, report scores and use Discord<ChevronDown /></summary>{room.players.filter((player) => !player.user_id).map((player) => <button className="party-claim" key={player.id} disabled={disabled} onClick={() => act("claim", { player_id: player.id })}>I am {player.name}</button>)}</details>}</section>}
    <details className="party-panel party-discord" open={Boolean(own)}><summary><Headphones />Discord team voice<span>{voice?.fresh ? "Connected to bot" : "Checking bot status"}</span><ChevronDown /></summary><div className="party-discord-body"><p>Link only your own player slot. Join this room's Waiting Room to be moved into your assigned team voice.</p><div className="party-actions">{voice?.waiting_room_url ? <a className="party-button party-discord-button" href={voice.waiting_room_url} target="_blank" rel="noopener noreferrer"><Headphones />Waiting Room<ExternalLink /></a> : <span className="party-muted">{!voice?.enabled ? "Discord voice is not enabled for these rooms yet." : !voice?.configured ? "Discord voice needs a configured voice category." : "The bot is preparing your private voice channels…"}</span>}<Link to="/settings#settings-discord" className="party-button"><Link2 />Account Settings</Link></div>{voice?.error && <p className="party-error">{voice.error}</p>}{own && <p className="party-muted">Your voice: {voice?.players?.find((player) => player.user_id === user.id)?.status?.replaceAll("_", " ") || "checking"}</p>}</div></details>
    {room.history.length > 0 && <details className="party-panel party-history"><summary>Previous rounds <span>{room.history.length}</span><ChevronDown /></summary>{room.history.map((round) => <div key={round.round}><h3>Round {round.round}</h3><div className="party-history-teams">{round.teams.map((team) => <p key={team.id}><strong>{team.name}</strong><span>{round.players.filter((player) => player.side === team.id).map((player) => player.name).join(", ")}</span></p>)}</div></div>)}</details>}
  </div>;
}
export default function CoedSwitcheroo() {
  const { id } = useParams();
  return id ? <PartyRoom key={id} /> : <CreateRoom />;
}
