import React, { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { screenshotRanks } from "@/lib/screenshotRanks";
import { ScreenshotRankPill } from "@/components/profile/ScreenshotRank";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

export default function RankVerificationAdmin({ users }) {
  const [rows, setRows] = useState([]), [selected, setSelected] = useState(null), [filter, setFilter] = useState("manual_review");
  const [rank, setRank] = useState(""), [reason, setReason] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [images, setImages] = useState({}), [cursor, setCursor] = useState(null), [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState("");
  const selectionId = useRef(0), listId = useRef(0);
  const load = async (nextCursor = null) => {
    const requestId = ++listId.current;
    setLoading(true); setError("");
    try {
      const result = await base44.rankVerification.list(filter, nextCursor);
      if (requestId !== listId.current) return;
      setRows((current) => nextCursor ? [...current, ...result.rows] : result.rows); setCursor(result.next_cursor);
    } catch (error) { if (requestId === listId.current) setError(error.message); }
    finally { if (requestId === listId.current) setLoading(false); }
  };
  useEffect(() => { void load(); return () => { listId.current++; selectionId.current++; }; }, [filter]);
  const choose = async (userId) => {
    const requestId = ++selectionId.current;
    setSelected(null); setImages({}); setReason(""); setError("");
    try {
      const player = await base44.rankVerification.player(userId);
      if (requestId !== selectionId.current) return;
      setSelected(player); setRank(player.status === "manual_review" && player.top250_request ? "top250" : player.rank || "");
      const entries = await Promise.all(player.attempts.filter((attempt) => attempt.has_image).map(async (attempt) => [attempt.id, (await base44.rankVerification.image(player.user_id, attempt.id)).image]));
      if (requestId === selectionId.current) setImages(Object.fromEntries(entries));
    } catch (error) { if (requestId === selectionId.current) setError(error.message); }
  };
  useEffect(() => {
    const playerId = new URLSearchParams(window.location.search).get("player");
    if (playerId) void choose(playerId);
  }, []);
  const review = async (action) => {
    if (!selected || busy) return;
    const player = selected;
    setBusy(true); setError("");
    try {
      const result = await base44.rankVerification.review(player.user_id, { action, rank: rank || null, reason, expected_updated_date: player.updated_date || null });
      setSelected({ ...result, user_name: player.user_name }); setReason(""); void load();
    } catch (error) { setError(error.message); }
    finally { setBusy(false); }
  };
  return <section className="rounded-xl border border-white/10 bg-card p-4 sm:p-6">
    <h2 className="text-xl font-black">Verify Rank</h2><p className="mt-2 text-sm text-vapor">Review Top 250 requests and assign the rank after verification. Players can set Diamond, Crimson and Iridescent themselves in Settings.</p>
    <div className="mt-5 flex flex-wrap gap-3">
      <select aria-label="Rank review filter" value={filter} onChange={(event) => setFilter(event.target.value)} className="rounded-lg border border-white/10 bg-background p-2 text-sm"><option value="manual_review">Awaiting review</option><option value="all">All rank submissions</option></select>
      <button type="button" onClick={() => void load()} className="rounded-lg border border-white/10 px-3 text-xs font-bold">Refresh</button>
      <select aria-label="Choose player to change game rank" value={selected?.user_id || ""} disabled={busy} onChange={(event) => { if (event.target.value) void choose(event.target.value); }} className="min-w-0 rounded-lg border border-white/10 bg-background p-2 text-sm"><option value="">Choose player to adjust rank</option>{users.map((user) => <option key={user.id} value={user.id}>{user.display_name || user.username || user.id}</option>)}</select>
    </div>
    {error && <p role="alert" className="mt-4 text-sm text-orange">{error}</p>}
    <div className="mt-5 grid gap-5 xl:grid-cols-[300px_1fr]">
      <div className="space-y-2">{rows.map((row) => <button type="button" key={row.user_id} disabled={busy} onClick={() => void choose(row.user_id)} className={`w-full rounded-xl border p-3 text-left ${selected?.user_id === row.user_id ? "border-purple-400/40 bg-purple-400/10" : "border-white/10"}`}><span className="block text-sm font-bold">{row.user_name}</span><span className="mt-1 block text-xs text-vapor">{row.top250_request ? "Top 250 request · " : ""}{row.status.replaceAll("_", " ")}</span><span className="mt-2 block"><ScreenshotRankPill rank={row.rank} /></span></button>)}{!loading && !rows.length && <p className="text-sm text-vapor">No rank submissions in this list.</p>}{loading && <p className="text-sm text-vapor">Loading submissions…</p>}{cursor && <button type="button" disabled={loading} onClick={() => void load(cursor)} className="text-xs font-bold text-cyan">Load more</button>}</div>
      {selected && <div className="min-w-0 rounded-xl border border-white/10 p-4">
        <h3 className="text-lg font-black">{selected.user_name}</h3><div className="mt-2"><ScreenshotRankPill rank={selected.rank} /></div>
        <p className="mt-2 text-xs text-vapor">{selected.status.replaceAll("_", " ")}{selected.top250_request ? " · Top 250 requested" : ""}</p>
        {selected.top250_request && <div className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/5 p-3"><p className="text-xs font-bold text-amber-200">Top 250 request · {new Date(selected.top250_request.submitted_at).toLocaleString()}</p><p className="mt-2 whitespace-pre-wrap break-words text-xs text-vapor">{selected.top250_request.note || "No message provided."}</p>{!selected.top250_request.has_image && <p className="mt-2 text-xs text-vapor">No screenshot attached.</p>}</div>}
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">{selected.attempts.filter((attempt) => attempt.has_image).map((attempt) => <figure key={attempt.id} className="overflow-hidden rounded-lg border border-white/10 bg-black/20">{images[attempt.id] ? <button type="button" aria-label="Enlarge rank screenshot" onClick={() => setPreview(images[attempt.id])} className="block w-full"><img src={images[attempt.id]} alt="Player rank screenshot" className="h-40 w-full object-contain" /></button> : <div className="flex h-40 items-center justify-center text-xs text-vapor">Loading screenshot…</div>}<figcaption className="p-2 text-[10px] text-vapor">{attempt.rank || "Not confirmed"} · {new Date(attempt.submitted_at).toLocaleString()}</figcaption></figure>)}</div>
        <label className="mt-5 block text-xs font-bold">Profile rank<select value={rank} onChange={(event) => setRank(event.target.value)} className="mt-2 block w-full rounded-lg border border-white/10 bg-background p-2 text-sm"><option value="">No rank / remove rank</option>{screenshotRanks.map((rank) => <option key={rank.id} value={rank.id}>{rank.label}</option>)}</select></label>
        <label className="mt-3 block text-xs font-bold">Reason<textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} rows={2} className="mt-2 block w-full rounded-lg border border-white/10 bg-background p-2 text-sm" /></label>
        <div className="mt-4 flex flex-wrap gap-2">{[["set_rank", "Approve / set rank"], ["reject", "Reject request"], ["reset", "Reset review"]].map(([action, label]) => <button key={action} type="button" disabled={busy || reason.trim().length < 3} onClick={() => void review(action)} className="rounded-lg border border-purple-400/30 bg-purple-400/10 px-3 py-2 text-xs font-bold text-purple-200 disabled:opacity-40">{label}</button>)}</div>
        {selected.review_reason && <p className="mt-3 text-xs text-vapor">Last review: {selected.review_reason}</p>}
      </div>}
    </div>
    <Dialog open={Boolean(preview)} onOpenChange={(open) => { if (!open) setPreview(""); }}><DialogContent className="max-w-5xl"><DialogTitle>Rank screenshot</DialogTitle><DialogDescription>Review the uploaded emblem before assigning a rank.</DialogDescription>{preview && <img src={preview} alt="Full rank screenshot submitted by player" className="max-h-[75vh] w-full object-contain" />}</DialogContent></Dialog>
  </section>;
}
