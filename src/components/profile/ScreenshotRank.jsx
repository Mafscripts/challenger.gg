import React, { useEffect, useRef, useState } from "react";
import { Award, Loader2, Upload } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { screenshotRankFor } from "@/lib/screenshotRanks";

export function ScreenshotRankPill({ rank }) {
  const config = screenshotRankFor(rank);
  return config ? <span title="Rank from an uploaded game screenshot" className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-black ${config.style}`}><Award className="h-3.5 w-3.5" aria-hidden="true" />{config.label}</span> : null;
}

export function ScreenshotRankUpload({ userId, onRankChange }) {
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const input = useRef(null);
  const activeUser = useRef(userId);
  activeUser.current = userId;
  useEffect(() => {
    let active = true;
    activeUser.current = userId;
    setState(null); setError(""); setMessage("");
    base44.rankVerification.me().then((result) => { if (active) setState(result); }).catch((error) => { if (active) setError(error.message); });
    return () => { active = false; activeUser.current = null; };
  }, [userId]);
  const locked = ["manual_review", "admin_locked", "rejected"].includes(state?.status);
  const upload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || busy) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 2_000_000) { setError("Use a PNG, JPG or WebP screenshot up to 2 MB."); return; }
    const owner = userId;
    setBusy(true); setError(""); setMessage("");
    try {
      const image = await new Promise((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error("Could not read this image.")); reader.readAsDataURL(file);
      });
      const result = await base44.rankVerification.submit(image);
      if (activeUser.current !== owner) return;
      setState(result); onRankChange(result.rank);
      setMessage(result.status === "approved" ? `${screenshotRankFor(result.rank)?.label} added to your profile.` : result.status === "manual_review" ? "Five checks could not confirm your rank. An admin will review your screenshots." : `Rank could not be confirmed (${result.failed_attempts}/5). Try a clearer screenshot of the rank card.`);
    } catch (error) { if (activeUser.current === owner) { setError(error.message); if (error.status === 409) base44.rankVerification.me().then((state) => { if (activeUser.current === owner) setState(state); }).catch(() => {}); } }
    finally { if (activeUser.current === owner) setBusy(false); }
  };
  return <div className="mt-4 rounded-xl border border-white/10 bg-card p-4 sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-sm font-black text-white">Game rank screenshot</h2><p className="mt-1 text-xs leading-5 text-vapor">Diamond, Crimson, Iridescent or Top 250. Upload a clear rank card; divisions I, II and III are ignored.</p></div>
      <button type="button" onClick={() => input.current?.click()} disabled={!state || busy || locked} className="inline-flex items-center gap-2 rounded-xl border border-purple-400/30 bg-purple-400/10 px-4 py-2.5 text-xs font-black text-purple-200 disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}{busy ? "Checking screenshot…" : "Upload rank screenshot"}</button>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" aria-label="Upload rank screenshot" onChange={upload} className="hidden" />
    </div>
    {state?.status === "manual_review" && <p className="mt-3 text-xs text-amber-300">Your screenshots are awaiting admin review. No further uploads are needed.</p>}
    {state?.status === "admin_locked" && <p className="mt-3 text-xs text-vapor">Your rank has been set by admin. Contact staff if it needs changing.</p>}
    {state?.status === "rejected" && <p className="mt-3 text-xs text-amber-300">Your submission was rejected. Contact staff to reopen verification.</p>}
    {state?.review_reason && <p className="mt-1 text-xs text-vapor">Admin: {state.review_reason}</p>}
    {!locked && <p className="mt-2 text-[11px] text-vapor">Shape and color are checked. After 5 unsuccessful checks, your screenshots go to admin review. PNG, JPG or WebP · max 2 MB.</p>}
    {message && <p role="status" className="mt-3 text-xs text-purple-200">{message}</p>}
    {error && <div role="alert" className="mt-3 flex items-center gap-3 text-xs text-orange"><p>{error}</p>{!state && <button type="button" onClick={() => base44.rankVerification.me().then((result) => { setState(result); setError(""); }).catch((error) => setError(error.message))} className="font-bold underline">Retry</button>}</div>}
  </div>;
}
