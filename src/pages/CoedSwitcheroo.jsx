import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Check, ChevronDown, Copy, ExternalLink, Headphones, Link2, Mars, Plus, RefreshCw, RotateCcw, Shuffle, Trash2, Users, Venus, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import AnimatedNameWheel from "@/components/competition/AnimatedNameWheel";
import { partyCandidates, partyCapacity, partyGenderQuota, partySide, partySpinning, partyValidation } from "@/lib/partyWheel";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import "@/styles/party-rooms.css";

const modeName = (mode) => mode === "coed" ? "Co-ed" : "Switcheroo";
const canManage = (room, user) => room.owner_id === user?.id || user?.is_admin || ["admin", "super_admin", "ceo"].includes(user?.admin_role) || ["admin", "super_admin", "ceo"].includes(user?.role);
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

function TeamCard({ team, room, players, manager, disabled, act, voiceUrl }) {
  const [name, setName] = useState(team.name);
  useEffect(() => setName(team.name), [team.name]);
  const quota = partyGenderQuota(room, team.id);
  return <section className="party-panel party-team-card"><header>
    {manager ? <form onSubmit={(e) => { e.preventDefault(); if (name.trim() && name.trim() !== team.name) void act("rename_team", { team_id: team.id, name }); }}><label className="sr-only" htmlFor={`name-${team.id}`}>Team name</label><input id={`name-${team.id}`} value={name} disabled={disabled} onChange={(e) => setName(e.target.value)} maxLength={32} onBlur={() => { if (name.trim() && name.trim() !== team.name) void act("rename_team", { team_id: team.id, name }); }} /><button type="submit" className="sr-only">Save name</button></form> : <h3>{team.name}</h3>}
    <span>{players.length}/{room.team_size}</span>
    {manager && room.status === "open" && room.teams.length > 2 && <button className="party-icon-button" title={`Remove ${team.name}`} disabled={disabled} onClick={() => act("remove_team", { team_id: team.id })}><X /></button>}
  </header>{room.mode === "coed" && <p className="party-team-quota"><Mars />{quota.male}<Venus />{quota.female}</p>}
    <ol className="party-team-slots">{Array.from({ length: room.team_size }, (_, index) => <li key={index} className={players[index] ? "is-filled" : ""}><span>{index + 1}</span>{players[index] ? <><Gender value={players[index].gender} /><strong>{players[index].name}</strong>{players[index].user_id && <Link2 className="party-linked-icon" aria-label="Account linked" />}</> : <span>Waiting for the wheel</span>}</li>)}</ol>
    {voiceUrl && <a href={voiceUrl} target="_blank" rel="noopener noreferrer" className="party-team-voice"><Headphones />Team voice<ExternalLink /></a>}
  </section>;
}

function PartyRoom() {
  const { id } = useParams(); const { user } = useAuth();
  const [data, setData] = useState(null), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [busy, setBusy] = useState(false), [names, setNames] = useState(""), [gender, setGender] = useState("male");
  const [notice, setNotice] = useState(""), [confirm, setConfirm] = useState(null), [clock, setClock] = useState(Date.now());
  const [offset, setOffset] = useState(0);
  const refresh = useCallback(async () => {
    const start = Date.now(); const result = await base44.party.get(id);
    setOffset(Date.parse(result.server_time) - (start + Date.now()) / 2);
    setData((previous) => !previous || result.room.revision >= previous.room.revision ? result : previous);
  }, [id]);
  useEffect(() => {
    let active = true, running = false;
    const load = async () => {
      if (running || document.visibilityState === "hidden") return;
      running = true;
      try { const start = Date.now(), result = await base44.party.get(id); if (active) { setData((previous) => !previous || result.room.revision >= previous.room.revision ? result : previous); setOffset(Date.parse(result.server_time) - (start + Date.now()) / 2); } }
      catch (error) { if (active) setError(error.message); }
      finally { running = false; if (active) setLoading(false); }
    };
    void load(); const poll = setInterval(load, 2000);
    window.addEventListener("focus", load); document.addEventListener("visibilitychange", load);
    return () => { active = false; clearInterval(poll); window.removeEventListener("focus", load); document.removeEventListener("visibilitychange", load); };
  }, [id]);
  useEffect(() => { const timer = setInterval(() => setClock(Date.now()), 200); return () => clearInterval(timer); }, []);
  const room = data?.room, voice = data?.voice;
  const manager = room && canManage(room, user), spinning = room && partySpinning(room, clock + offset);
  const act = async (action, input = {}) => {
    if (busy || !room) return false;
    setBusy(true); setError(""); setNotice("");
    try { const result = await base44.party.change(id, { action, revision: room.revision, ...input }); setData((previous) => ({ ...previous, room: result.room })); setConfirm(null); return true; }
    catch (error) { setError(error.message); if (error.status === 409) await refresh().catch(() => {}); return false; }
    finally { setBusy(false); }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(window.location.href); setNotice("Invite link copied. Players can open it and link their own slot."); }
    catch { setNotice(`Share this room: ${window.location.href}`); }
  };
  const entries = useMemo(() => room ? partyCandidates(room) : [], [room]);
  if (loading) return <div className="party-page party-empty" role="status">Loading room…</div>;
  if (!room) return <div className="party-page"><p className="party-error">{error || "Room not found"}</p><Link to="/coed-switcheroo" className="party-button">Back to rooms</Link></div>;
  const disabled = busy || spinning || room.status === "closed", own = room.players.find((player) => player.user_id === user?.id);
  const visiblePlayers = room.players.map((player) => spinning && room.spin?.selected_id === player.id ? { ...player, side: null } : player);
  const unpicked = visiblePlayers.filter((player) => !player.side);
  const nextTeam = room.teams.find((team) => team.id === partySide(room));
  const spinTeam = room.teams.find((team) => team.id === room.spin?.side);
  const invalid = partyValidation(room);
  const allReady = room.status === "ready" && !spinning;
  const editable = !room.players.some((player) => player.side);
  return <div className="party-page"><Link to="/coed-switcheroo" className="party-back">← Your rooms</Link>
    <header className="arena-page-header party-room-heading"><div><p className="party-eyebrow">{modeName(room.mode)} · Round {room.round}</p><h1>{room.title}</h1><p>Hosted by {room.owner_name} · {room.teams.length} teams · {room.team_size} players per team</p></div><div className="party-actions"><button className="party-button" onClick={copy}><Copy />Invite players</button>{manager && room.status !== "closed" && <button className="party-icon-button" title="Close room" disabled={disabled} onClick={() => setConfirm("close")}><X /></button>}</div></header>
    {error && <p className="party-error" role="alert">{error}</p>}{notice && <p className="party-notice" role="status">{notice}</p>}
    {confirm && <div className="party-confirm"><p>{confirm === "close" ? "Close this room and release its Discord channels?" : allReady ? "Save this round and spin new teams?" : "Clear this draw and return all players to the pool?"}</p><button className="party-button party-primary" disabled={disabled} onClick={() => act(confirm === "close" ? "close" : "reset")}>Confirm</button><button className="party-button" onClick={() => setConfirm(null)}>Keep current round</button></div>}
    {room.status === "closed" && <p className="party-notice">This room is closed. Its temporary Discord channels are being cleaned up.</p>}
    <details className="party-panel party-help"><summary>How {modeName(room.mode)} works<ChevronDown /></summary><p>Add your teams and enter one player name per line. The host spins once for each player; teams fill in turn. {room.mode === "coed" ? "Choose Male or Female for every player. Teams have equal numbers where possible; teams of three alternate between two men / one woman and one man / two women." : "Each new round uses the previous teams to prefer different teammates where possible. With limited players, some partnerships can repeat."} Share the room link to watch the same live draw.</p><p>For Discord, each person opens the room, chooses This is me on their own name and joins the Waiting Room. After the final spin, the bot moves connected players into their assigned private voice. Names without a linked account can still be drawn.</p></details>
    <div className="party-draw-grid"><section className="party-panel party-wheel-panel"><div className="party-section-heading"><h2>{spinning ? `Picking for ${spinTeam?.name}` : allReady ? "Teams are ready" : `Next: ${nextTeam?.name}`}</h2><span className="party-count">{visiblePlayers.filter((player) => player.side).length}/{partyCapacity(room)} picked</span></div>
      <AnimatedNameWheel entries={entries} spin={room.spin} serverOffset={offset} />
      {manager ? <div className="party-wheel-controls"><button className="party-button party-primary party-spin-button" disabled={disabled || Boolean(invalid) || allReady} onClick={() => act("spin")}><Shuffle />{spinning ? "Spinning…" : allReady ? "Draw complete" : "Spin the wheel"}</button><button className="party-button" disabled={disabled || !room.players.some((player) => player.side)} onClick={() => setConfirm("reset")}><RotateCcw />{allReady ? "New round" : "Reset draw"}</button></div> : <p className="party-muted party-centered">The host controls the wheel. Your view updates automatically.</p>}
      {invalid && room.status !== "closed" && <p className="party-validation">{invalid}</p>}
    </section><section className="party-panel party-player-panel"><div className="party-section-heading"><h2>Player pool</h2><span className="party-count">{room.players.length}/{partyCapacity(room)}</span></div>
      {manager && editable && room.status !== "closed" && <form className="party-add-players" onSubmit={async (e) => { e.preventDefault(); const values = names.split(/\r?\n/).map((name) => name.trim()).filter(Boolean); if (await act("add", { names: values, gender: room.mode === "coed" ? gender : null })) setNames(""); }}>
        <label className="party-label">Player names<textarea rows={3} className="party-field" placeholder={"Enter a name\nOne player per line"} value={names} onChange={(e) => setNames(e.target.value)} maxLength={2400} disabled={disabled} /></label>
        <div className="party-actions">{room.mode === "coed" && <Select value={gender} onValueChange={setGender} disabled={disabled}><SelectTrigger className="party-select"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="male">♂ Male players</SelectItem><SelectItem value="female">♀ Female players</SelectItem></SelectContent></Select>}<button className="party-button party-primary" disabled={disabled || !names.trim() || room.players.length === partyCapacity(room)}><Plus />Add names</button></div>
      </form>}
      <div className="party-player-list">{unpicked.map((player) => <div key={player.id} className="party-player-row"><Gender value={player.gender} /><strong>{player.name}</strong>
        {player.user_id ? <span className="party-link-state"><Check />{player.user_id === user?.id ? "You" : "Linked"}</span> : !own && <button className="party-claim" disabled={disabled} onClick={() => act("claim", { player_id: player.id })}>This is me</button>}
        {manager && editable && room.status !== "closed" && <>{room.mode === "coed" && <button className="party-icon-button" title="Change Male / Female" disabled={disabled} onClick={() => act("gender", { player_id: player.id, gender: player.gender === "male" ? "female" : "male" })}>{player.gender === "male" ? <Venus /> : <Mars />}</button>}<button className="party-icon-button" title={`Remove ${player.name}`} disabled={disabled} onClick={() => act("remove", { player_id: player.id })}><Trash2 /></button></>}
      </div>)}</div>
      {!unpicked.length && <p className="party-empty">{allReady ? "Every player has a team." : "No players in the pool yet."}</p>}
      {!editable && !own && room.players.some((player) => !player.user_id) && <details className="party-late-claim"><summary>Link your player slot<ChevronDown /></summary>{room.players.filter((player) => !player.user_id).map((player) => <button className="party-claim" key={player.id} disabled={disabled} onClick={() => act("claim", { player_id: player.id })}>I am {player.name}</button>)}</details>}
      {own && <p className="party-own-slot"><Link2 />Linked as {own.name}<button disabled={disabled} onClick={() => act("leave")}>Unlink</button></p>}
    </section></div>
    <details className="party-panel party-discord" open={Boolean(own)}><summary><Headphones />Discord team voice<span>{voice?.fresh ? "Connected to bot" : "Checking bot status"}</span><ChevronDown /></summary><div className="party-discord-body"><p>Link only your own player slot. Join this room's Waiting Room to be moved into your assigned team voice.</p><div className="party-actions">{voice?.waiting_room_url ? <a className="party-button party-discord-button" href={voice.waiting_room_url} target="_blank" rel="noopener noreferrer"><Headphones />Waiting Room<ExternalLink /></a> : <span className="party-muted">{!voice?.enabled ? "Discord voice is not enabled for these rooms yet." : !voice?.configured ? "Discord voice needs a configured voice category." : "The bot is preparing your private voice channels…"}</span>}<Link to="/settings#settings-discord" className="party-button"><Link2 />Account Settings</Link></div>{voice?.error && <p className="party-error">{voice.error}</p>}{own && <p className="party-muted">Your voice: {voice?.players?.find((player) => player.user_id === user.id)?.status?.replaceAll("_", " ") || "checking"}</p>}</div></details>
    <div className="party-teams-heading"><h2>Teams <span>{room.teams.length}</span></h2>{manager && editable && room.status !== "closed" && <div className="party-actions"><TeamSize value={room.team_size} onChange={(size) => act("format", { team_size: size })} disabled={disabled} /><button className="party-button party-primary" disabled={disabled || room.teams.length >= 16} onClick={() => act("add_team")}><Plus />Add team</button></div>}</div>
    <div className="party-team-grid">{room.teams.map((team) => <TeamCard key={team.id} team={team} room={room} players={visiblePlayers.filter((player) => player.side === team.id)} manager={manager} disabled={disabled} act={act} voiceUrl={voice?.team_urls?.[team.id]} />)}</div>
    {room.history.length > 0 && <details className="party-panel party-history"><summary>Previous rounds <span>{room.history.length}</span><ChevronDown /></summary>{room.history.map((round) => <div key={round.round}><h3>Round {round.round}</h3><div className="party-history-teams">{round.teams.map((team) => <p key={team.id}><strong>{team.name}</strong><span>{round.players.filter((player) => player.side === team.id).map((player) => player.name).join(", ")}</span></p>)}</div></div>)}</details>}
  </div>;
}
export default function CoedSwitcheroo() {
  const { id } = useParams();
  return id ? <PartyRoom key={id} /> : <CreateRoom />;
}
