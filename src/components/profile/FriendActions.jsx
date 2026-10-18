import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Check, Clock3, Loader2, UserMinus, UserPlus, Users, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import "@/styles/profile-friends.css";

export default function FriendActions({ userId, currentUserId }) {
  const [state, setState] = useState({ status: "loading" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(false);
  useEffect(() => {
    let active = true;
    setState({ status: "loading" });
    setError("");
    setConfirmRemove(false);
    if (!userId || userId === currentUserId) return () => { active = false; };
    const refresh = async () => {
      if (document.visibilityState === "hidden") return;
      try {
        const data = await base44.profile.friendship(userId);
        if (active) { setState(data); setError(""); }
      } catch { if (active) { setState({ status: "error" }); setError("Friend status could not be loaded."); } }
    };
    void refresh();
    const timer = setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    window.addEventListener("topfragg:friends-updated", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      active = false; clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("topfragg:friends-updated", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [userId, currentUserId]);

  const act = async (action) => {
    if (busy) return;
    setBusy(true); setError("");
    try { setState(await base44.profile.changeFriendship(userId, action)); setConfirmRemove(false); }
    catch (error) { setError(error.message || "Could not update friend request."); }
    finally { setBusy(false); }
  };
  if (!currentUserId || currentUserId === userId) return null;
  return <div className="friend-profile-actions">
    <div className="friend-buttons">
      {state.status === "loading" && <button className="friend-action" disabled><Loader2 className="animate-spin" />Loading…</button>}
      {state.status === "none" && <button className="friend-action friend-action-primary" disabled={busy} onClick={() => act("send")}><UserPlus />{busy ? "Sending…" : "Add friend"}</button>}
      {state.status === "outgoing" && <><span className="friend-status"><Clock3 />Request sent</span><button className="friend-action" disabled={busy} onClick={() => act("cancel")}>Cancel request</button></>}
      {state.status === "incoming" && <><span className="friend-status">Wants to be your friend</span><button className="friend-action friend-action-primary" disabled={busy} onClick={() => act("accept")}><Check />Accept</button><button className="friend-action" disabled={busy} onClick={() => act("decline")}><X />Decline</button></>}
      {state.status === "friends" && (confirmRemove ? <><span className="friend-status">Remove this friend?</span><button className="friend-action friend-action-danger" disabled={busy} onClick={() => act("remove")}><UserMinus />Remove</button><button className="friend-action" disabled={busy} onClick={() => setConfirmRemove(false)}>Keep friend</button></> : <button className="friend-action friend-action-connected" disabled={busy} onClick={() => setConfirmRemove(true)} title="Manage friendship"><Check />Friends</button>)}
      {state.status === "unavailable" && <span className="friend-status">Friend requests unavailable</span>}
      {state.status === "error" && <button className="friend-action" onClick={() => window.dispatchEvent(new CustomEvent("topfragg:friends-updated"))}>Retry friend status</button>}
    </div>
    {error && <p className="friend-error" role="alert">{error}</p>}
  </div>;
}

export function FriendRequestsPanel({ userId }) {
  const [data, setData] = useState({ requests: [], next_offset: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    const refresh = async () => {
      if (document.visibilityState === "hidden") return;
      try { const page = await base44.profile.friendRequests(); if (active) { setData(page); setError(""); } }
      catch { if (active) setError("Friend requests could not be loaded."); }
      finally { if (active) setLoading(false); }
    };
    void refresh();
    const timer = setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    window.addEventListener("topfragg:friends-updated", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { active = false; clearInterval(timer); window.removeEventListener("focus", refresh); window.removeEventListener("topfragg:friends-updated", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [userId, revision]);
  const act = async (request, action) => {
    if (busy) return;
    setBusy(request.id); setError("");
    try { await base44.profile.changeFriendship(request.player.id, action); setData((current) => ({ ...current, requests: current.requests.filter((row) => row.id !== request.id) })); }
    catch (error) { setError(error.message || "Could not update friend request."); }
    finally { setBusy(""); }
  };
  const loadMore = async () => {
    if (loadingMore || data.next_offset === null) return;
    setLoadingMore(true);
    try {
      const page = await base44.profile.friendRequests(data.next_offset);
      setData((current) => ({ ...page, requests: [...new Map([...current.requests, ...page.requests].map((row) => [row.id, row])).values()] }));
    } catch { setError("More requests could not be loaded."); }
    finally { setLoadingMore(false); }
  };
  return <section className="pd-panel friend-requests-panel">
    <div className="friend-requests-heading"><Users /><h2>Friend requests</h2><span>Incoming & sent</span></div>
    {error && <p className="friend-error" role="alert">{error} <button onClick={() => setRevision((value) => value + 1)}>Retry</button></p>}
    {loading ? <p className="pd-empty" role="status">Loading friend requests…</p> : data.requests.length ? <div className="friend-request-list">{data.requests.map((request) => <article key={request.id} className="friend-request-row">
      <Link className="friend-request-player" to={`/profile/${encodeURIComponent(request.player.username || request.player.id)}`}><span className="friend-request-avatar">{request.player.avatar_url ? <img src={request.player.avatar_url} alt="" /> : request.player.name.charAt(0).toUpperCase()}</span><span><strong>{request.player.name}</strong><small>{request.direction === "incoming" ? "Sent you a friend request" : "Waiting for their response"}</small></span></Link>
      <div className="friend-buttons">{request.direction === "incoming" ? <><button className="friend-action friend-action-primary" disabled={Boolean(busy)} onClick={() => act(request, "accept")}><Check />Accept</button><button className="friend-action" disabled={Boolean(busy)} onClick={() => act(request, "decline")}><X />Decline</button></> : <button className="friend-action" disabled={Boolean(busy)} onClick={() => act(request, "cancel")}>Cancel request</button>}</div>
    </article>)}</div> : !error && <p className="pd-empty">No pending friend requests. Visit a player's profile and choose Add friend.</p>}
    {data.next_offset !== null && <button className="pd-view-all" disabled={loadingMore} onClick={loadMore}>{loadingMore ? "Loading…" : "Load next 25 requests"}</button>}
  </section>;
}
