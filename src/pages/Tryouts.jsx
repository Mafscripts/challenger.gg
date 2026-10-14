import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, ChevronRight, Crosshair, Flag, Gamepad2, GripVertical, Loader2, LockKeyhole, Map as MapIcon, MessageSquare, Play, Plus, RefreshCw, RotateCcw, Send, ShieldCheck, Sparkles, Swords, Trophy, Users, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "@/components/ui/use-toast";
import PageLoader from "@/components/ui/PageLoader";
import UserBadges from "@/components/ui/UserBadges";
import { hasActivisionId } from "@/lib/activision";
import { TRYOUT_CAPACITY, TRYOUT_TEAM_SIZE, canAccessTryouts, canManageTryouts, tryoutSeriesScore, tryoutTeamLabel } from "@/lib/tryouts";
import "@/styles/tryouts.css";

const statusLabel = { lobby: "Registration open", live: "Match live", completed: "Completed", cancelled: "Cancelled" };
const enter = { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.35 } };

function ScoreEditor({ map, index, busy, onSave }) {
  const [alpha, setAlpha] = useState("");
  const [bravo, setBravo] = useState("");
  return <form className="tryout-score-editor" onSubmit={(event) => { event.preventDefault(); onSave({ map_index: index, alpha_score: Number(alpha), bravo_score: Number(bravo) }); }}>
    <label><span>Alpha</span><input type="number" min="0" max="250" required value={alpha} onChange={(event) => setAlpha(event.target.value)} aria-label={`Alpha score for ${map.name}`} /></label>
    <span className="tryout-score-separator">:</span>
    <label><span>Bravo</span><input type="number" min="0" max="250" required value={bravo} onChange={(event) => setBravo(event.target.value)} aria-label={`Bravo score for ${map.name}`} /></label>
    <button className="tryout-icon-button" type="submit" disabled={busy} aria-label={`Save result for ${map.name}`}><Check size={16} /></button>
  </form>;
}

function PlayerCard({ player, admin, editable, busy, dragging, onDragStart, onDragEnd, onDrop, onMove, onRemove }) {
  return <article className={`tryout-player ${dragging === player.user_id ? "is-dragging" : ""}`} draggable={admin && editable && !busy}
    onDragStart={(event) => { event.dataTransfer.setData("text/plain", player.user_id); event.dataTransfer.effectAllowed = "move"; onDragStart(player.user_id); }}
    onDragEnd={onDragEnd} onDragOver={(event) => { if (admin && editable && !busy) event.preventDefault(); }}
    onDrop={(event) => { if (!admin || !editable || busy) return; event.preventDefault(); event.stopPropagation(); onDrop(event.dataTransfer.getData("text/plain"), player.team, player.user_id); }}>
    {admin && editable && <GripVertical className="tryout-drag-handle" size={15} />}
    <div className="tryout-player-avatar">{player.avatar_url ? <img src={player.avatar_url} alt="" /> : player.user_name.slice(0, 2).toUpperCase()}</div>
    <div className="tryout-player-identity"><strong>{player.user_name}</strong><span title={player.activision_id}>{player.activision_id}</span></div>
    {admin && editable && <div className="tryout-player-actions">
      <select value={player.team} disabled={busy} aria-label={`Team for ${player.user_name}`} onChange={(event) => onMove(player.user_id, event.target.value)}>
        <option value="bench">Waiting</option><option value="alpha">Alpha</option><option value="bravo">Bravo</option>
      </select>
      <button type="button" onClick={() => onRemove(player.user_id)} disabled={busy} aria-label={`Remove ${player.user_name}`}><X size={14} /></button>
    </div>}
  </article>;
}

export default function Tryouts() {
  const { id: roomId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const admin = canManageTryouts(user);
  const allowed = canAccessTryouts(user);
  const [rooms, setRooms] = useState([]);
  const [room, setRoom] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [denied, setDenied] = useState(false);
  const [busy, setBusy] = useState("");
  const [name, setName] = useState("Challengers Try out");
  const [message, setMessage] = useState("");
  const [dragging, setDragging] = useState("");
  const [dropTeam, setDropTeam] = useState("");
  const draggingRef = useRef(false);
  const pendingRef = useRef(false);
  const mutationRevision = useRef(0);
  const routeRef = useRef(roomId);
  const chatEnd = useRef(null);
  routeRef.current = roomId;

  const load = useCallback(async (quiet = false) => {
    if (!allowed || pendingRef.current || draggingRef.current) return;
    if (!quiet) setLoading(true);
    const route = roomId;
    const revision = mutationRevision.current;
    try {
      const { data } = await base44.functions.invoke(roomId ? "getTryoutRoom" : "getTryouts", roomId ? { room_id: roomId } : {});
      if (routeRef.current !== route || pendingRef.current || draggingRef.current || mutationRevision.current !== revision) return;
      if (roomId) setRoom(data.room); else setRooms(data.rooms);
      setError(""); setDenied(false);
    } catch (failure) {
      if (routeRef.current !== route) return;
      setError(failure.message || "Could not load Try outs.");
      if (failure.status === 403) { setDenied(true); setRoom(null); setRooms([]); }
    } finally { if (routeRef.current === route) setLoading(false); }
  }, [allowed, roomId]);

  useEffect(() => {
    setRoom(null); setRooms([]); setMessage(""); setError(""); setDenied(false);
    if (!allowed) { setLoading(false); return undefined; }
    load();
    const timer = window.setInterval(() => { if (document.visibilityState !== "hidden") load(true); }, 5000);
    return () => window.clearInterval(timer);
  }, [allowed, load]);

  useEffect(() => {
    const feed = chatEnd.current?.parentElement;
    if (feed) feed.scrollTo({ top: feed.scrollHeight, behavior: "smooth" });
  }, [room?.messages?.length]);

  const action = async (kind, values = {}, targetId = roomId) => {
    if (pendingRef.current) return false;
    mutationRevision.current += 1;
    pendingRef.current = true; setBusy(kind);
    let refresh = false;
    try {
      const { data } = await base44.functions.invoke("updateTryoutRoom", { room_id: targetId, action: kind, expected_version: room?.version, ...values });
      if (data.room && routeRef.current === targetId) setRoom(data.room);
      setError("");
      if (kind === "join") navigate(`/try-outs/${targetId}`);
      if (kind === "leave") navigate("/try-outs");
      return true;
    } catch (failure) {
      toast({ title: "Could not update Try out", description: failure.message, variant: "destructive" });
      if (failure.status === 403) { setDenied(true); setRoom(null); }
      if (failure.status === 409) refresh = true;
      return false;
    } finally {
      pendingRef.current = false; setBusy("");
      if (refresh) load(true);
    }
  };

  const create = async (event) => {
    event.preventDefault();
    if (pendingRef.current) return;
    pendingRef.current = true; setBusy("create");
    try {
      const { data } = await base44.functions.invoke("createTryoutRoom", { name });
      navigate(`/try-outs/${data.room.id}`);
    } catch (failure) { toast({ title: "Could not create Try out", description: failure.message, variant: "destructive" }); }
    finally { pendingRef.current = false; setBusy(""); }
  };

  const drop = (userId, team, swapId) => {
    draggingRef.current = false; setDragging(""); setDropTeam("");
    if (room?.players.find((player) => player.user_id === userId)?.team === team) return;
    if (userId && userId !== swapId) action("move", { user_id: userId, team, ...(swapId ? { swap_user_id: swapId } : {}) });
  };
  const stopDrag = () => { draggingRef.current = false; setDragging(""); setDropTeam(""); };
  const confirmAction = (kind, prompt) => { if (window.confirm(prompt)) action(kind); };

  if (!allowed || denied) return <div className="tryouts-page"><section className="tryout-access-gate"><LockKeyhole size={38} /><h1>{denied ? "Try outs access unavailable" : "Challengers access required"}</h1><p>{denied ? error || "Join a session from the Try outs page first." : "Try outs is reserved for players with the Challengers badge and Topfragg admins."}</p><Link to={allowed ? "/try-outs" : "/profile"} className="tryout-button">{allowed ? "Back to Try outs" : "Back to profile"} <ArrowRight size={15} /></Link></section></div>;
  if (loading && !room && !rooms.length) return <PageLoader label="Loading Try outs" />;

  const score = tryoutSeriesScore(room?.maps);
  const editable = room?.status === "lobby";
  const nextMap = room?.maps.findIndex((map) => map.alpha_score === null);
  const teamReady = room && ["alpha", "bravo"].every((team) => room.players.filter((player) => player.team === team).length === TRYOUT_TEAM_SIZE);
  const me = room?.players.find((player) => player.user_id === user.id);

  const playerProps = {
    admin, editable, busy: Boolean(busy), dragging,
    onDragStart: (id) => { draggingRef.current = true; setDragging(id); }, onDragEnd: stopDrag, onDrop: drop,
    onMove: (id, team) => action("move", { user_id: id, team }),
    onRemove: (id) => action("remove", { user_id: id }),
  };
  const teamColumn = (team) => {
    const players = room.players.filter((player) => player.team === team);
    return <section key={team} className={`tryout-team tryout-team-${team} ${dropTeam === team ? "is-drop-target" : ""}`}
      onDragOver={(event) => { if (admin && editable && !busy) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDropTeam(team); } }}
      onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setDropTeam(""); }}
      onDrop={(event) => { if (!admin || !editable || busy) return; event.preventDefault(); drop(event.dataTransfer.getData("text/plain"), team); }}>
      <div className="tryout-team-heading"><div><span>{team === "bench" ? "Player pool" : "4v4 roster"}</span><h2>{tryoutTeamLabel(team)}</h2></div><strong>{players.length}{team !== "bench" && <>/{TRYOUT_TEAM_SIZE}</>}</strong></div>
      <div className="tryout-player-list">{players.map((player) => <PlayerCard key={player.user_id} player={player} {...playerProps} />)}
        {team !== "bench" && Array.from({ length: Math.max(0, TRYOUT_TEAM_SIZE - players.length) }, (_, index) => <div className="tryout-empty-slot" key={`empty-${index}`}><Plus size={14} />{admin && editable ? "Drop a player here" : "Awaiting player"}</div>)}
        {team === "bench" && !players.length && <div className="tryout-empty-slot"><Users size={16} />{editable ? "Players appear here when they join" : "No waiting players"}</div>}
      </div>
    </section>;
  };

  return <main className="tryouts-page">
    <motion.section {...enter} className={`tryout-hero ${room?.status === "live" ? "is-live" : ""}`}>
      <div className="tryout-hero-art" aria-hidden="true" /><div className="tryout-hero-grid" aria-hidden="true" />
      <div className="tryout-hero-content">
        {roomId && <Link className="tryout-back" to="/try-outs"><ArrowLeft size={14} />All Try outs</Link>}
        <div className="tryout-eyebrow"><span className="tryout-signal" />TOPFRAGG CHALLENGERS <span className="tryout-access-tag"><LockKeyhole size={11} />INVITE ONLY</span></div>
        <h1>{room ? room.name : <>Try <span>outs</span><span className="tryout-title-dot">.</span></>}</h1>
        <p>{room ? "Your opportunity to stand out. Bring your best game." : "Earn your place. Show your talent. Step into the Challengers arena."}</p>
        <div className="tryout-format-pills"><span><Gamepad2 size={14} />Black Ops 7</span><span><Crosshair size={14} />Hardpoint only</span><span><Flag size={14} />Best of 3</span><span><Users size={14} />4v4</span></div>
      </div>
      <div className="tryout-hero-emblem" aria-hidden="true"><div className="tryout-orbit" /><Swords size={64} /><span>CHALLENGERS</span></div>
    </motion.section>

    {error && <div className="tryout-notice" role="alert">{error}<button type="button" className="tryout-icon-button" onClick={() => load()} aria-label="Retry loading"><RefreshCw size={16} /></button></div>}

    {!roomId && <>
      <div className="tryout-overview-intro"><div><span className="tryout-section-label">The proving ground</span><h2>Choose your session</h2><p>Join the waiting room. An admin will place you in a team.</p></div><span className="tryout-connection"><Check size={14} />Activision ID required</span></div>
      {!hasActivisionId(user) && <div className="tryout-notice"><Gamepad2 size={19} /><span>Add your Activision ID to join a try out.</span><Link className="tryout-text-link" to="/settings">Open gaming settings <ArrowRight size={14} /></Link></div>}
      {admin && <form className="tryout-create-panel" onSubmit={create}><div><ShieldCheck size={21} /><span><strong>Admin controls</strong><small>Create a session, build your teams and run the series.</small></span></div><input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} required aria-label="Try out name" placeholder="Session name" /><button className="tryout-button" disabled={Boolean(busy)}><Plus size={16} />Create Try out</button></form>}
      <div className="tryout-session-grid">{rooms.map((entry, index) => <motion.article {...enter} transition={{ duration: 0.35, delay: Math.min(index * 0.04, 0.25) }} key={entry.id} className={`tryout-session-card status-${entry.status}`}>
        <div className="tryout-session-top"><span className={`tryout-status status-${entry.status}`}><span />{statusLabel[entry.status]}</span><Crosshair size={22} /></div>
        <h3>{entry.name}</h3><p>Black Ops 7 · Hardpoint · BO3</p>
        <div className="tryout-session-rosters"><span>ALPHA<strong>{entry.alpha_count}/4</strong></span><span className="tryout-vs">VS</span><span>BRAVO<strong>{entry.bravo_count}/4</strong></span></div>
        <div className="tryout-session-footer"><span><Users size={13} />{entry.player_count}/{TRYOUT_CAPACITY} players</span>{admin || entry.joined ? <Link className="tryout-text-link" to={`/try-outs/${entry.id}`}>Open matchroom <ChevronRight size={16} /></Link> : <button className="tryout-text-link" disabled={Boolean(busy) || entry.status !== "lobby" || entry.player_count >= TRYOUT_CAPACITY || !hasActivisionId(user)} onClick={() => action("join", {}, entry.id)}>{entry.status === "lobby" ? entry.player_count >= TRYOUT_CAPACITY ? "Full" : "Join Try out" : "Closed"}<ArrowRight size={15} /></button>}</div>
      </motion.article>)}</div>
      {!rooms.length && !error && <div className="tryout-empty-state"><Swords size={36} /><h3>The next opportunity is coming.</h3><p>{admin ? "Create the first session to open the waiting room." : "Your Challengers access is ready. Check back when an admin opens a session."}</p></div>}
    </>}

    {room && <>
      <motion.section {...enter} className="tryout-scoreboard"><div className="tryout-score-team alpha"><span>TEAM</span><h2>ALPHA</h2></div><div className="tryout-score-center"><span className={`tryout-status status-${room.status}`}><span />{statusLabel[room.status]}</span><div><strong>{score.alpha}</strong><span>:</span><strong>{score.bravo}</strong></div><small>{room.winner ? `${tryoutTeamLabel(room.winner)} wins the series` : "First to 2 map wins"}</small></div><div className="tryout-score-team bravo"><span>TEAM</span><h2>BRAVO</h2></div></motion.section>
      {room.winner && <div className="tryout-winner"><Trophy size={22} /><span><strong>{tryoutTeamLabel(room.winner)}</strong> takes the series {score.alpha}–{score.bravo}.</span></div>}
      <div className="tryout-room-toolbar"><div>{admin ? <><ShieldCheck size={16} /><span>{editable ? "Drag players into a team. Drop onto another player to swap." : "Teams are locked while the series is live or complete."}</span></> : <><Sparkles size={16} /><span>{me?.team === "bench" ? "You are in the waiting room. An admin will assign your team." : `You are playing for ${tryoutTeamLabel(me?.team)}.`}</span></>}</div><div className="tryout-toolbar-actions">
        {admin && editable && <><button className="tryout-button secondary" disabled={Boolean(busy)} onClick={() => action("maps")}><MapIcon size={14} />{room.maps.length ? "Regenerate maps" : "Generate maps"}</button><button className="tryout-button" disabled={Boolean(busy) || !teamReady || room.maps.length !== 3} onClick={() => action("start")}><Play size={14} />Start match</button></>}
        {admin && !me && editable && <button className="tryout-button secondary" disabled={Boolean(busy) || !hasActivisionId(user)} title={!hasActivisionId(user) ? "Add your Activision ID in Settings > Gaming IDs to join as a player" : "Join the waiting room as a player"} onClick={() => action("join")}><Users size={14} />Join as player</button>}
        {me && editable && <button className="tryout-button secondary" disabled={Boolean(busy)} onClick={() => action("leave")}>Leave</button>}
        {admin && !["lobby", "cancelled"].includes(room.status) && <button className="tryout-icon-button" disabled={Boolean(busy)} onClick={() => confirmAction("reset", "Reset this series and clear all map results? Teams return to the lobby.")} aria-label="Reset series"><RotateCcw size={16} /></button>}
        {admin && !["completed", "cancelled"].includes(room.status) && <button className="tryout-icon-button" disabled={Boolean(busy)} onClick={() => confirmAction("cancel", "Cancel this Try out and close its matchroom?")} aria-label="Cancel Try out"><X size={16} /></button>}
      </div></div>
      {busy && <p className="tryout-saving" role="status"><Loader2 size={13} className="animate-spin" />Updating matchroom...</p>}

      <div className="tryout-room-layout"><div className="tryout-room-main"><div className="tryout-team-grid">{teamColumn("alpha")}{teamColumn("bravo")}</div>{teamColumn("bench")}
        <section className="tryout-map-section"><div className="tryout-section-heading"><div><span className="tryout-section-label">The battlefield</span><h2>Hardpoint map series</h2></div><span className="tryout-mini-tag">BO7 · BO3</span></div>
          {!room.maps.length ? <div className="tryout-empty-state small"><MapIcon size={26} /><p>{admin ? "Generate three maps from the Black Ops 7 Hardpoint pool." : "Your admin will generate the three Hardpoint maps."}</p></div> : <div className="tryout-map-grid">{room.maps.map((map, index) => <article key={`${map.name}-${index}`} className={`tryout-map-card ${room.status === "live" && nextMap === index ? "is-active" : ""}`}>
            <div className="tryout-map-image">{map.image && <img src={map.image} alt={map.name} loading="lazy" />}<span>MAP {index + 1}</span>{map.alpha_score !== null && <div className="tryout-map-result"><Check size={13} />FINAL</div>}</div>
            <div className="tryout-map-details"><span>HARDPOINT</span><h3>{map.name}</h3>{map.alpha_score !== null ? <div className="tryout-map-score"><strong className={map.alpha_score > map.bravo_score ? "winner" : ""}>{map.alpha_score}</strong><span>:</span><strong className={map.bravo_score > map.alpha_score ? "winner" : ""}>{map.bravo_score}</strong></div> : admin && room.status === "live" && nextMap === index ? <ScoreEditor key={`${room.id}-${room.version}-${index}`} map={map} index={index} busy={Boolean(busy)} onSave={(values) => action("score", values)} /> : <p>{room.status === "completed" ? "Not played" : room.status === "live" && nextMap === index ? "Up next" : "Awaiting match"}</p>}</div>
          </article>)}</div>}
        </section>
      </div><aside className="tryout-room-sidebar"><section className="tryout-chat"><header><div><MessageSquare size={16} /><h2>Matchroom chat</h2></div><span className="tryout-mini-tag">PRIVATE</span></header><div className="tryout-chat-feed" role="log" aria-label="Matchroom messages" aria-live="polite">
        {!room.messages.length && <div className="tryout-chat-empty"><MessageSquare size={28} /><p>Coordinate your match.<br />Keep it competitive. Keep it respectful.</p></div>}
        {room.messages.map((entry) => <div className={`tryout-chat-message ${entry.user_id === user.id ? "is-own" : ""}`} key={entry.id}><div><strong>{entry.user_name}</strong>{entry.is_admin && <ShieldCheck size={11} />}<time>{new Date(entry.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time></div><p>{entry.text}</p></div>)}<div ref={chatEnd} />
      </div><form onSubmit={async (event) => { event.preventDefault(); if (await action("chat", { message })) setMessage(""); }}><input value={message} onChange={(event) => setMessage(event.target.value)} maxLength={1500} placeholder={room.status === "cancelled" ? "Room closed" : "Message your team..."} aria-label="Matchroom message" disabled={room.status === "cancelled"} /><button className="tryout-icon-button" disabled={Boolean(busy) || !message.trim() || room.status === "cancelled"} aria-label="Send message"><Send size={16} /></button></form></section>
        <section className="tryout-rules-card"><span className="tryout-section-label">Match briefing</span><h3>Make every map count.</h3><p>4v4 · Hardpoint only · First to 2 map wins. Admins manage teams and record results.</p><div><Gamepad2 size={14} />Your Activision ID is your game identity.</div><UserBadges user={{ badges: [{ type: "challengers", name: "Challengers" }] }} size="xs" showTooltip={false} /></section>
      </aside></div>
    </>}
  </main>;
}
