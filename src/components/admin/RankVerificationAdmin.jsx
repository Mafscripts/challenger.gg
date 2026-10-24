import React, { useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Loader2, RefreshCw, Search, UserRound } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { screenshotRankFor, screenshotRanks } from "@/lib/screenshotRanks";
import { ScreenshotRankPill } from "@/components/profile/ScreenshotRank";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { effectiveRoleForUser } from "@/lib/roles";
import { playerDisplayName } from "@/lib/playerIdentity";
import { notifyAdminChanged, openAdminPlayer } from "@/lib/adminWorkspace";
import { toast } from "@/components/ui/use-toast";

export default function RankVerificationAdmin({ user }) {
  const [selected, setSelected] = useState(null), [filter, setFilter] = useState("manual_review");
  const [rank, setRank] = useState(""), [reason, setReason] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [images, setImages] = useState({});
  const [preview, setPreview] = useState("");
  const [playerSearch, setPlayerSearch] = useState(""), [playerTerm, setPlayerTerm] = useState("");
  const [loadingPlayer, setLoadingPlayer] = useState(false), [imageErrors, setImageErrors] = useState({});
  const selectionId = useRef(0);
  const query = useInfiniteQuery({
    queryKey: ["admin-console", user?.id, effectiveRoleForUser(user), "rankVerifications", filter],
    initialPageParam: null,
    queryFn: ({ pageParam }) => base44.rankVerification.list(filter, pageParam),
    getNextPageParam: page => page.next_cursor || undefined,
    staleTime: 30000, retry: false, refetchOnWindowFocus: false,
  });
  const rows = useMemo(() => [...new Map((query.data?.pages || []).flatMap(page => page.rows).map(row => [row.user_id, row])).values()], [query.data]);
  const loading = query.isFetching;
  useEffect(() => { const timer = setTimeout(() => setPlayerTerm(playerSearch.trim()), 300); return () => clearTimeout(timer); }, [playerSearch]);
  const playerQuery = useQuery({
    queryKey: ["admin-console", user?.id, effectiveRoleForUser(user), "rankPlayerSearch", playerTerm],
    enabled: playerTerm.length >= 2,
    queryFn: async () => {
      const { data } = await base44.functions.invoke("getAdminUsers", { search: playerTerm, include_security: false, include_wallets: false });
      if (!data?.success) throw new Error(data?.error || "Could not find players.");
      return data.rows;
    }, staleTime: 30000, retry: false, refetchOnWindowFocus: false,
  });
  useEffect(() => () => { selectionId.current++; }, []);
  const loadImages = async (player, requestId) => {
    const attempts = player.attempts.filter((attempt) => attempt.has_image);
    const results = await Promise.allSettled(attempts.map((attempt) => base44.rankVerification.image(player.user_id, attempt.id)));
    if (requestId === selectionId.current) {
      setImages(Object.fromEntries(results.flatMap((result, index) => result.status === "fulfilled" ? [[attempts[index].id, result.value.image]] : [])));
      setImageErrors(Object.fromEntries(results.flatMap((result, index) => result.status === "rejected" ? [[attempts[index].id, result.reason.message || "Could not load screenshot."]] : [])));
    }
  };
  const retryImages = async () => {
    if (!selected || busy || loadingPlayer) return;
    const requestId = selectionId.current;
    setLoadingPlayer(true);
    try { await loadImages(selected, requestId); }
    finally { if (requestId === selectionId.current) setLoadingPlayer(false); }
  };
  const choose = async (userId) => {
    if (busy) return;
    const requestId = ++selectionId.current;
    setSelected(null); setImages({}); setImageErrors({}); setReason(""); setError(""); setLoadingPlayer(true); setPreview("");
    try {
      const player = await base44.rankVerification.player(userId);
      if (requestId !== selectionId.current) return;
      setSelected(player); setRank(player.status === "manual_review" && player.top250_request ? "top250" : player.rank || "");
      await loadImages(player, requestId);
    } catch (error) { if (requestId === selectionId.current) setError(error.message); }
    finally { if (requestId === selectionId.current) setLoadingPlayer(false); }
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
      setSelected({ ...result, user_name: player.user_name }); setReason("");
      if (action === "reset") { setImages({}); setImageErrors({}); }
      notifyAdminChanged({ userId: player.user_id });
      toast({ title: action === "set_rank" ? "Player rank updated" : action === "reject" ? "Rank request declined" : "Rank review reset", description: `${player.user_name} has been notified.` });
    } catch (error) { setError(error.message); }
    finally { setBusy(false); }
  };
  return <section className="rounded-xl border border-white/10 bg-card p-4 sm:p-6">
    <h2 className="text-xl font-black">Verify Rank</h2><p className="mt-2 text-sm text-vapor">Review Legend (Top 250) requests and assign the rank after verification. Players can set Titan (Diamond), Master (Crimson) and Apex (Iridescent) themselves in Settings.</p>
    <div className="mt-5 flex flex-wrap gap-3">
      <select aria-label="Rank review filter" value={filter} onChange={(event) => setFilter(event.target.value)} className="rounded-lg border border-white/10 bg-background p-2 text-sm"><option value="manual_review">Awaiting review</option><option value="all">All rank submissions</option></select>
      <button type="button" disabled={loading} onClick={() => query.refetch()} className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-bold disabled:opacity-40"><RefreshCw size={14} className={loading ? "animate-spin" : ""} />Refresh submissions</button>
    </div>
    <div className="mt-4 rounded-xl border border-white/10 bg-background/30 p-3"><label className="flex items-center gap-2 text-xs font-bold"><Search size={14} className="text-cyan" /><span>Find a player to adjust their rank</span></label><input aria-label="Find player for rank review" value={playerSearch} maxLength={100} onChange={event => setPlayerSearch(event.target.value)} placeholder="Enter at least 2 characters: player name or account reference…" className="mt-2 w-full rounded-lg border border-white/10 bg-background p-2 text-sm" />
      {playerTerm.length >= 2 && <div className="mt-2 space-y-1">{playerQuery.isPending && <p role="status" className="text-xs text-vapor">Finding players…</p>}{playerQuery.isError && <p role="alert" className="text-xs text-orange">{playerQuery.error.message} <button type="button" onClick={() => playerQuery.refetch()} className="font-bold text-cyan">Retry</button></p>}{playerQuery.data?.slice(0, 10).map(player => <button key={player.id} type="button" disabled={busy} onClick={() => { void choose(player.id); setPlayerSearch(""); setPlayerTerm(""); }} className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-xs hover:bg-cyan/10 disabled:opacity-40"><strong>{playerDisplayName(player)}</strong><span className="text-cyan">Review player →</span></button>)}{playerQuery.isSuccess && !playerQuery.data.length && <p className="text-xs text-vapor">No players found. Try a different name or account reference.</p>}{playerQuery.data?.length > 10 && <p className="text-xs text-vapor">Showing 10 results. Enter more of the player's name to narrow the list.</p>}</div>}
    </div>
    {error && <p role="alert" className="mt-4 text-sm text-orange">{error}</p>}
    {query.isError && <p role="alert" className="mt-4 text-sm text-orange">{query.error.message} <button type="button" disabled={loading} onClick={() => query.isFetchNextPageError ? query.fetchNextPage() : query.refetch()} className="font-bold text-cyan">Retry submissions</button></p>}
    <div className="mt-5 grid gap-5 xl:grid-cols-[300px_1fr]">
      <div className="space-y-2">{rows.map((row) => <button type="button" key={row.user_id} disabled={busy} onClick={() => void choose(row.user_id)} className={`w-full rounded-xl border p-3 text-left ${selected?.user_id === row.user_id ? "border-purple-400/40 bg-purple-400/10" : "border-white/10"}`}><span className="block text-sm font-bold">{row.user_name}</span><span className="mt-1 block text-xs text-vapor">{row.top250_request ? "Legend request · " : ""}{row.status.replaceAll("_", " ")}</span><span className="mt-2 block"><ScreenshotRankPill rank={row.rank} /></span></button>)}{!loading && !rows.length && !query.isError && <p className="text-sm text-vapor">No rank submissions in this list.</p>}{loading && <p role="status" className="text-sm text-vapor">Loading submissions…</p>}{query.hasNextPage && <button type="button" disabled={loading} onClick={() => query.fetchNextPage()} className="text-xs font-bold text-cyan">Load next 50 submissions</button>}</div>
      {loadingPlayer && !selected && <p role="status" className="flex items-center gap-2 text-sm text-vapor"><Loader2 size={16} className="animate-spin" />Loading player…</p>}
      {!selected && !loadingPlayer && <p className="text-sm text-vapor">Open a submission or find a player to review their rank.</p>}
      {selected && <div className="min-w-0 rounded-xl border border-white/10 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-lg font-black">{selected.user_name}</h3><div className="flex flex-wrap gap-2"><button type="button" onClick={() => openAdminPlayer(selected.user_id)} className="inline-flex items-center gap-1.5 rounded-lg border border-cyan/20 px-3 py-2 text-xs font-bold text-cyan"><UserRound size={13} />Player dossier</button><button type="button" disabled={busy || loadingPlayer} onClick={() => void choose(selected.user_id)} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs font-bold disabled:opacity-40"><RefreshCw size={13} />Reload player</button></div></div><div className="mt-2"><ScreenshotRankPill rank={selected.rank} /></div>
        <p className="mt-2 text-xs text-vapor">{selected.status.replaceAll("_", " ")}{selected.top250_request ? " · Legend requested" : ""}</p>
        {selected.top250_request && <div className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/5 p-3"><p className="text-xs font-bold text-amber-200">Legend (Top 250) request · {new Date(selected.top250_request.submitted_at).toLocaleString()}</p><p className="mt-2 whitespace-pre-wrap break-words text-xs text-vapor">{selected.top250_request.note || "No message provided."}</p>{!selected.top250_request.has_image && <p className="mt-2 text-xs text-vapor">No screenshot attached.</p>}</div>}
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">{selected.attempts.filter((attempt) => attempt.has_image).map((attempt) => <figure key={attempt.id} className="overflow-hidden rounded-lg border border-white/10 bg-black/20">{images[attempt.id] ? <button type="button" aria-label="Enlarge rank screenshot" onClick={() => setPreview(images[attempt.id])} className="block w-full"><img src={images[attempt.id]} alt="Player rank screenshot" className="h-40 w-full object-contain" /></button> : <div className="flex h-40 flex-col items-center justify-center gap-2 p-3 text-center text-xs text-vapor">{imageErrors[attempt.id] ? <><p role="alert">{imageErrors[attempt.id]}</p><button type="button" disabled={loadingPlayer || busy} onClick={() => void retryImages()} className="font-bold text-cyan">{loadingPlayer ? "Loading screenshots…" : "Retry screenshots"}</button></> : "Loading screenshot…"}</div>}<figcaption className="p-2 text-[10px] text-vapor">{screenshotRankFor(attempt.rank)?.label || "Not confirmed"} · {new Date(attempt.submitted_at).toLocaleString()}</figcaption></figure>)}</div>
        <label className="mt-5 block text-xs font-bold">Profile rank<select aria-label="Profile rank" value={rank} onChange={(event) => setRank(event.target.value)} className="mt-2 block w-full rounded-lg border border-white/10 bg-background p-2 text-sm"><option value="">No rank / remove rank</option>{screenshotRanks.map((rank) => <option key={rank.id} value={rank.id}>{rank.label} ({rank.gameLabel})</option>)}</select></label>
        <label className="mt-3 block text-xs font-bold">Reason<textarea aria-label="Reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} rows={2} className="mt-2 block w-full rounded-lg border border-white/10 bg-background p-2 text-sm" /></label>
        <div className="mt-4 flex flex-wrap gap-2">{[["set_rank", "Approve / set rank"], ["reject", "Reject request"], ["reset", "Reset review"]].map(([action, label]) => <button key={action} type="button" disabled={busy || reason.trim().length < 3} onClick={() => void review(action)} className="rounded-lg border border-purple-400/30 bg-purple-400/10 px-3 py-2 text-xs font-bold text-purple-200 disabled:opacity-40">{label}</button>)}</div>
        <p className="mt-2 text-xs text-vapor">Enter a reason of at least 3 characters to enable a review action. The player receives your decision and reason.</p>
        {selected.review_reason && <p className="mt-3 text-xs text-vapor">Last review: {selected.review_reason}</p>}
      </div>}
    </div>
    <Dialog open={Boolean(preview)} onOpenChange={(open) => { if (!open) setPreview(""); }}><DialogContent className="admin-action-dialog max-w-5xl"><DialogTitle>Rank screenshot</DialogTitle><DialogDescription>Review the uploaded emblem before assigning a rank.</DialogDescription>{preview && <img src={preview} alt="Full rank screenshot submitted by player" className="max-h-[75vh] w-full object-contain" />}</DialogContent></Dialog>
  </section>;
}
