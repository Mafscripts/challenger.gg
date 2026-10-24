import PlayerCardEffects from "@/components/ui/PlayerCardEffects";
import React, { useEffect, useState } from "react";
import { Check, Image, Loader2, Save, Sparkles } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { playerCardThemes, playerCardAppearance, playerCardTheme, playerCardCollections } from "@/lib/playerCards";
import PlayerAvatarImage from "@/components/ui/PlayerAvatarImage";
import "@/styles/player-cards.css";

export default function PlayerCardSection({ user, onUserUpdate }) {
  const [draft, setDraft] = useState(user?.player_card_theme || "");
  const [motion, setMotion] = useState(user?.player_card_motion || "auto");
  const [collection, setCollection] = useState("all");
  const [saving, setSaving] = useState(false), [notice, setNotice] = useState(null);
  useEffect(() => { setDraft(user?.player_card_theme || ""); setMotion(user?.player_card_motion || "auto"); setNotice(null); }, [user?.id, user?.player_card_theme, user?.player_card_motion]);
  const name = user?.display_name || user?.full_name || user?.username || "Your name";
  const selected = playerCardTheme(draft);
  const save = async () => {
    if (saving) return;
    setSaving(true); setNotice(null);
    try {
      await base44.auth.updateMe({ player_card_theme: draft, player_card_motion: motion });
      window.dispatchEvent(new CustomEvent("topfragg:profile-updated", { detail: { userId: user.id, playerCardTheme: draft, playerCardMotion: motion } }));
      await onUserUpdate?.();
      setNotice({ success: true, message: "Player card saved. Your style appears in match rooms for everyone." });
    } catch (error) { setNotice({ success: false, message: error.message || "Could not save your player card." }); }
    finally { setSaving(false); }
  };
  const identity = <><span className="h-10 w-10 shrink-0 overflow-hidden rounded-xl border border-white/20"><PlayerAvatarImage user={user} src={user?.avatar_url} /></span><span className="min-w-0"><strong className="block truncate text-sm font-black text-white">{name}</strong><span className="mt-1 block text-[9px] font-bold uppercase tracking-wider text-cyan">Player card</span></span></>;
  return <section className="player-card-settings" aria-label="Custom player cards">
    <header className="flex items-start justify-between gap-4"><div className="flex items-center gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-cyan/20 bg-cyan/10 text-cyan"><Image size={21} /></span><div><h2 className="text-lg font-black">Player card studio</h2><p className="mt-1 text-xs leading-5 text-vapor">Original artwork. Signature motion. Your style in every match room.</p></div></div><span className="hidden items-center gap-1 rounded-full border border-cyan/20 px-3 py-1.5 text-[10px] font-bold text-cyan sm:flex"><Sparkles size={12} />{playerCardThemes.length} animated styles</span></header>
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3"><label className="flex items-center gap-3 text-xs font-bold">Animation<select value={motion} onChange={event => { setMotion(event.target.value); setNotice(null); }} disabled={saving} className="rounded-lg border border-white/15 bg-background px-3 py-2"><option value="auto">Auto · follow device preference</option><option value="on">On · show animations</option><option value="off">Off · static artwork</option></select></label><span className="text-[10px] text-vapor">Choose On if your device normally reduces motion.</span></div>
    <div className="player-card-preview-title"><span>LIVE MATCH PREVIEW</span><span>{selected?.name || "Classic"}</span></div>
    <div {...playerCardAppearance(draft, motion)} className="player-card-full-preview"><PlayerCardEffects player={draft} /><div className="flex min-w-0 items-center gap-3">{identity}</div><div><small>ACTIVISION ID</small><strong className="truncate">{user?.activision_id || "Your Activision ID"}</strong></div><div><small>RECORD PREVIEW</small><strong>12W / 4L</strong></div><div><small>RANK PREVIEW</small><strong style={{ color: selected?.accent || "#40dcff" }}>Diamond</strong></div></div>
    <p className="mt-2 text-[10px] leading-5 text-vapor">Sample record and rank are for preview only. Real match data stays unchanged. Hover a style to animate its artwork.</p>
    <div className="player-card-collections" role="group" aria-label="Card collections">
      {playerCardCollections.map(item => <button type="button" key={item.id} data-collection={item.id} aria-pressed={collection === item.id} onClick={() => setCollection(item.id)}>{item.name}<span>{playerCardThemes.filter(theme => item.id === "all" || (theme.collection || "signature") === item.id).length}</span></button>)}
    </div>
    <div className="player-card-gallery" role="group" aria-label="Choose your player card">
      {playerCardThemes.filter(theme => collection === "all" || (theme.collection || "signature") === collection).map(theme => <button key={theme.id} type="button" className="player-card-option" data-collection={theme.collection || "signature"} style={{ "--pc-option": theme.accent }} aria-pressed={draft === theme.id} onClick={() => { setDraft(theme.id); setNotice(null); }} disabled={saving}>
        <span {...playerCardAppearance(theme.id, motion)} className="player-card-tile"><PlayerCardEffects player={theme.id} />{identity}</span>
        <span className="player-card-option-meta"><span>{theme.collection && <span className="player-card-collection-label">{theme.collection === "legendary" && <Sparkles size={10} />}{theme.collection} collection</span>}<strong>{theme.name}</strong><small>{theme.detail}</small></span>{draft === theme.id && <Check size={17} style={{ color: theme.accent }} />}</span>
      </button>)}
    </div>
    <footer className="mt-5 flex flex-wrap items-center justify-between gap-3"><button type="button" className="rounded-lg border border-white/15 px-4 py-2.5 text-xs font-bold text-vapor hover:text-white disabled:opacity-50" disabled={saving} onClick={() => { setDraft(""); setNotice(null); }} aria-pressed={!draft}>Classic · no artwork</button><button type="button" disabled={saving || (draft === (user?.player_card_theme || "") && motion === (user?.player_card_motion || "auto"))} onClick={save} className="inline-flex items-center gap-2 rounded-lg bg-cyan px-5 py-2.5 text-xs font-black text-background disabled:opacity-50">{saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}Save player card</button></footer>
    {notice && <p role={notice.success ? "status" : "alert"} className={`mt-4 text-sm ${notice.success ? "text-green" : "text-red-400"}`}>{notice.message}</p>}
  </section>;
}
