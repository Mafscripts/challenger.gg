import React, { useEffect, useState } from "react";
import { Award, Check, Loader2, Send, Upload, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { selfSelectableRanks } from "@/lib/screenshotRanks";
import { ScreenshotRankPill } from "@/components/profile/ScreenshotRank";

export default function GameRankSection({ user, onUserUpdate }) {
  const [state, setState] = useState(null), [rank, setRank] = useState("");
  const [note, setNote] = useState(""), [image, setImage] = useState(null);
  const [busy, setBusy] = useState(null), [error, setError] = useState(""), [message, setMessage] = useState("");
  const pending = state?.status === "manual_review";
  useEffect(() => {
    let active = true;
    setState(null); setError(""); setMessage(""); setNote(""); setImage(null);
    base44.rankVerification.me().then((result) => { if (active) { setState(result); setRank(result.rank || ""); } }).catch((error) => { if (active) setError(error.message); });
    return () => { active = false; };
  }, [user?.id]);
  const save = async () => {
    setBusy("save"); setError(""); setMessage("");
    try {
      const result = await base44.rankVerification.select(rank || null);
      setState(result); await onUserUpdate(); setMessage("Your game rank has been saved.");
    } catch (error) { setError(error.message); }
    finally { setBusy(null); }
  };
  const chooseImage = async (event) => {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file || busy) return;
    setError("");
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 2_000_000) { setError("Use a PNG, JPG or WebP screenshot up to 2 MB."); return; }
    setBusy("image");
    try {
      const data = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error("Could not read this screenshot.")); reader.readAsDataURL(file); });
      setImage({ data, name: file.name });
    } catch (error) { setError(error.message); }
    finally { setBusy(null); }
  };
  const request = async () => {
    setBusy("request"); setError(""); setMessage("");
    try {
      const result = await base44.rankVerification.requestTop250({ note, ...(image ? { image: image.data } : {}) });
      setState(result); setImage(null); setNote(""); setMessage("Your request has been sent to the admins. Your current rank stays active until they review it.");
    } catch (error) { setError(error.message); }
    finally { setBusy(null); }
  };
  return <section className="overflow-hidden rounded-xl border border-white/10 bg-card">
    <div className="flex items-center gap-3 border-b border-white/5 p-5 sm:p-6">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-orange/20 bg-orange/10 text-orange"><Award className="h-5 w-5" /></div>
      <div><h3 className="text-lg font-black">Game rank</h3><p className="mt-1 text-xs text-vapor">Choose your game rank. Top 250 is assigned after admin review.</p></div>
    </div>
    <div className="space-y-5 p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-3"><span className="text-xs font-bold text-vapor">Current rank</span>{state?.rank ? <ScreenshotRankPill rank={state.rank} /> : <span className="text-xs text-vapor">Not set</span>}</div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="min-w-0 flex-1 text-xs font-bold">Your rank<select aria-label="Your game rank" value={rank} disabled={!state || Boolean(busy)} onChange={(event) => setRank(event.target.value)} className="mt-2 block w-full rounded-xl border border-white/10 bg-background p-3 text-sm"><option value="">No rank</option>{selfSelectableRanks.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}{state?.rank === "top250" && <option value="top250" disabled>Top 250 · Admin assigned</option>}</select></label>
        <button type="button" onClick={save} disabled={!state || Boolean(busy) || rank === "top250" || rank === (state.rank || "")} className="inline-flex items-center justify-center gap-2 rounded-xl border border-orange/25 bg-orange/10 px-5 py-3 text-xs font-black text-orange disabled:opacity-40">{busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Save rank</button>
      </div>
      <p className="text-xs leading-5 text-vapor">Diamond, Crimson and Iridescent are saved immediately. Divisions I, II and III are not required.</p>
      <div className="rounded-xl border border-amber-300/20 bg-amber-300/5 p-4">
        <h4 className="flex items-center gap-2 text-sm font-black text-amber-200"><Award className="h-4 w-4" />Top 250 request</h4>
        {pending ? <p role="status" className="mt-2 text-xs leading-5 text-amber-200">Your rank request is awaiting admin review. You can still update your current rank below Top 250.</p> : state?.rank === "top250" ? <p className="mt-2 text-xs text-vapor">Top 250 has been assigned to your account by an admin.</p> : <>
          <p className="mt-2 text-xs leading-5 text-vapor">Send a request to the admins. You can add a screenshot and a short message to help them verify your rank.</p>
          <label className="mt-4 block text-xs font-bold">Message (optional)<textarea aria-label="Top 250 request message" value={note} disabled={!state || Boolean(busy)} onChange={(event) => setNote(event.target.value)} maxLength={500} rows={3} className="mt-2 block w-full rounded-lg border border-white/10 bg-background p-3 text-sm" /></label>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-bold ${!state || busy ? "pointer-events-none opacity-40" : ""}`}><Upload className="h-4 w-4" />Add screenshot<input type="file" aria-label="Top 250 screenshot" accept="image/png,image/jpeg,image/webp" disabled={!state || Boolean(busy)} onChange={chooseImage} className="sr-only" /></label>
            <span className="text-[11px] text-vapor">Optional · PNG, JPG or WebP · max 2 MB</span>
          </div>
          {image && <div className="mt-3 flex min-w-0 items-center gap-2"><span className="truncate text-xs text-vapor">{image.name}</span><button type="button" aria-label="Remove screenshot" disabled={Boolean(busy)} onClick={() => setImage(null)} className="shrink-0 p-1 text-vapor"><X className="h-4 w-4" /></button></div>}
          <button type="button" onClick={request} disabled={!state || Boolean(busy)} className="mt-4 inline-flex items-center gap-2 rounded-lg border border-amber-300/25 bg-amber-300/10 px-4 py-2.5 text-xs font-black text-amber-200 disabled:opacity-40">{busy === "request" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Request Top 250</button>
        </>}
        {state?.review_reason && <p className="mt-3 text-xs leading-5 text-vapor">Admin review: {state.review_reason}</p>}
      </div>
      {message && <p role="status" className="text-xs leading-5 text-green">{message}</p>}
      {error && <p role="alert" className="text-xs leading-5 text-orange">{error}</p>}
    </div>
  </section>;
}
