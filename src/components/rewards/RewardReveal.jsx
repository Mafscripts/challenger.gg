import RewardArtwork from "./RewardArtwork";
import React, { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import { Gift, Sparkles, Volume2, VolumeX } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { rewardLabel } from "@/lib/competitionRewards";
import "@/styles/reward-reveal.css";
function Celebration() {
  const ref = useRef(null);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const canvas = ref.current, ctx = canvas.getContext("2d"); if (!ctx) return;
    const w = window.innerWidth, h = window.innerHeight, scale = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = w * scale; canvas.height = h * scale; ctx.scale(scale, scale);
    const colors = ["#b495ff", "#29d8ff", "#f2eeff", "#63ffbc", "#ffd778"];
    const confetti = Array.from({ length: 90 }, (_, i) => ({ x: Math.random() * w, y: Math.random() * h * .6 - h * .3, speed: 90 + Math.random() * 160, color: colors[i % colors.length], angle: Math.random() * 6.28 }));
    const bursts = [0, .65, 1.3].map((delay, index) => ({ delay, x: w * (.2 + .3 * index), y: h * (.18 + Math.random() * .2), color: colors[index], particles: Array.from({ length: 28 }, (_, i) => ({ angle: i / 28 * Math.PI * 2, speed: 80 + Math.random() * 110 })) }));
    const started = performance.now(); let frame;
    const draw = (now) => {
      const t = (now - started) / 1000; ctx.clearRect(0, 0, w, h);
      if (t > 3.4) return;
      ctx.globalAlpha = Math.min(1, 3.4 - t);
      for (const p of confetti) { ctx.save(); ctx.translate(p.x + Math.sin(t * 2 + p.angle) * 25, p.y + t * p.speed); ctx.rotate(p.angle + t * 2); ctx.fillStyle = p.color; ctx.fillRect(-3, -5, 6, 10); ctx.restore(); }
      for (const burst of bursts) { const age = t - burst.delay; if (age < 0 || age > 1.3) continue; ctx.globalAlpha = (1 - age / 1.3) * Math.min(1, 3.4 - t); ctx.fillStyle = burst.color;
        for (const p of burst.particles) { ctx.beginPath(); ctx.arc(burst.x + Math.cos(p.angle) * p.speed * age, burst.y + Math.sin(p.angle) * p.speed * age + 35 * age * age, 2, 0, Math.PI * 2); ctx.fill(); }
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw); return () => cancelAnimationFrame(frame);
  }, []);
  return <canvas className="reward-celebration" ref={ref} aria-hidden="true" />;
}
function Card({ item, chosen = false, moving = false }) {
  const [failed, setFailed] = useState(false);
  return <article className={`reward-draw-card${chosen ? " reward-draw-chosen" : ""}`} data-rarity={item.rarity}><div>{item.image_url && !failed ? <RewardArtwork animate={!moving} src={item.image_url} alt="" loading={moving || chosen ? "eager" : "lazy"} decoding="async" onError={() => setFailed(true)} /> : <Gift size={60} />}</div><small>{item.rarity || "Reward"}</small><strong>{item.name}</strong><p>{item.reward ? rewardLabel(item.reward) : "Two months Premium"}</p></article>;
}
export default function RewardReveal() {
  const { user } = useAuth(), location = useLocation(), navigate = useNavigate(), client = useQueryClient();
  const [preview, setPreview] = useState(null);
  const [selected, setSelected] = useState(""), [phase, setPhase] = useState("ready"), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [sound, setSound] = useState(() => { try { return localStorage.getItem("topfragg:reward-sound") !== "off"; } catch { return true; } });
  const track = useRef(null), audio = useRef(null), winPlayed = useRef(false);
  const pending = useQuery({ queryKey: ["reward-grants", user?.id], queryFn: async () => (await base44.functions.invoke("getMyRewardGrants", {})).data?.grants || [], enabled: Boolean(user?.id), staleTime: 30000, refetchInterval: 60000, refetchIntervalInBackground: false, retry: false });
  const reveal = useQuery({ queryKey: ["reward-reveal", user?.id, selected], queryFn: async () => {
    const { data } = await base44.functions.invoke("getRewardReveal", { grant_id: selected }); if (!data?.success) throw new Error(data?.error || "Could not load your cards"); return data;
  }, enabled: Boolean(user?.id && selected && !preview), staleTime: Infinity, retry: false });
  const revealData = preview || reveal.data;
  useEffect(() => { const id = new URLSearchParams(location.search).get("reward"); if (id && user?.id) { setPreview(null); setPhase("ready"); setSelected(id); } }, [location.search, user?.id]);
  useEffect(() => { const refresh = () => { void client.invalidateQueries({ queryKey: ["reward-grants", user?.id] }); }; window.addEventListener("topfragg:notifications-updated", refresh); return () => window.removeEventListener("topfragg:notifications-updated", refresh); }, [client, user?.id]);
  useEffect(() => {
    const show = (event) => {
      const cards = event.detail?.cards;
      if (!Array.isArray(cards) || !cards.length) return;
      const item = cards[Math.floor(Math.random() * cards.length)];
      setPreview({ cards, grant: { id: "preview", item, title: "Admin animation preview" } });
      setError(""); setPhase("ready"); setSelected("preview");
    };
    window.addEventListener("topfragg:reward-preview", show);
    return () => window.removeEventListener("topfragg:reward-preview", show);
  }, []);
  useEffect(() => () => { void audio.current?.close().catch(() => {}); }, []);
  const chime = () => {
    if (!sound || !audio.current || winPlayed.current) return; winPlayed.current = true;
    const ctx = audio.current;
    [523.25, 659.25, 783.99, 1046.5].forEach((frequency, i) => { const oscillator = ctx.createOscillator(), gain = ctx.createGain(), at = ctx.currentTime + i * .12;
      oscillator.type = "triangle"; oscillator.frequency.value = frequency; gain.gain.setValueAtTime(0, at); gain.gain.linearRampToValueAtTime(.08, at + .025); gain.gain.exponentialRampToValueAtTime(.001, at + .85);
      oscillator.connect(gain); gain.connect(ctx.destination); oscillator.start(at); oscillator.stop(at + .9);
    });
  };
  useEffect(() => {
    if (phase !== "spinning" || !track.current || !revealData) return;
    const strip = track.current, width = strip.firstElementChild.getBoundingClientRect().width, viewport = strip.parentElement.clientWidth;
    const n = revealData.cards.length, winner = revealData.cards.findIndex((card) => card.id === revealData.grant.item.id);
    const steps = Math.ceil(32 / n) * n + winner, gap = 16, center = (viewport - width) / 2;
    const animation = strip.animate([{ transform: `translateX(${center}px)` }, { transform: `translateX(${center - steps * (width + gap)}px)` }], { duration: 6500, easing: "cubic-bezier(.1,.72,.12,1)", fill: "forwards" });
    animation.onfinish = () => setPhase("won");
    const resize = () => setPhase("won"); window.addEventListener("resize", resize, { once: true });
    return () => { animation.cancel(); window.removeEventListener("resize", resize); };
  }, [phase, revealData]);
  useEffect(() => { if (phase === "won") chime(); }, [phase]);
  const start = async () => {
    if (!revealData || phase !== "ready") return; winPlayed.current = false;
    if (sound) { try { const Audio = window.AudioContext || window.webkitAudioContext; if (Audio) { audio.current ||= new Audio(); await audio.current.resume(); } } catch {} }
    setPhase(window.matchMedia("(prefers-reduced-motion: reduce)").matches || !Element.prototype.animate ? "won" : "spinning");
  };
  const close = () => {
    setSelected(""); setPreview(null); setPhase("ready"); setError("");
    if (new URLSearchParams(location.search).has("reward")) { const params = new URLSearchParams(location.search); params.delete("reward"); navigate({ pathname: location.pathname, search: params.toString(), hash: location.hash }, { replace: true }); }
  };
  const collect = async () => {
    if (preview) { close(); return; }
    setBusy(true); setError("");
    try { const { data } = await base44.functions.invoke("acknowledgeReward", { grant_id: selected }); if (!data?.success) throw new Error(data?.error || "Could not finish");
      await client.invalidateQueries({ queryKey: ["reward-grants", user.id] }); await client.invalidateQueries({ queryKey: ["trade-inventory"] }); close();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  if (!user?.id) return null;
  const data = revealData, deck = data?.cards || [], n = deck.length, winner = deck.findIndex((card) => card.id === data?.grant.item.id);
  const total = n ? Math.ceil(32 / n) * n + winner + 3 : 0;
  return <>
    {!selected && pending.data?.length > 0 && <button className="reward-inbox site-hover" onClick={() => { setPreview(null); setPhase("ready"); setSelected(pending.data[0].id); }}><Gift size={21} /><span><strong>Your reward is ready</strong><small>{pending.data.length > 1 ? `${pending.data.length} rewards waiting` : "Open your cards"}</small></span><Sparkles size={16} /></button>}
    <Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open) close(); }}><DialogContent className="reward-reveal-dialog">
      <div className="reward-reveal-heading"><p><Sparkles size={14} />{data?.grant.title || "Your competition reward"}</p><DialogTitle>{phase === "won" ? preview ? "Preview complete." : "This one is yours." : "Your next reward awaits."}</DialogTitle><DialogDescription>{preview ? "Animation preview only. No item is awarded." : phase === "won" ? "Your reward has been added to your account." : "Watch the cards slow down to reveal the item you won."}</DialogDescription></div>
      <button className="reward-sound" aria-label={sound ? "Mute reward sound" : "Enable reward sound"} aria-pressed={sound} onClick={() => setSound((value) => { try { localStorage.setItem("topfragg:reward-sound", value ? "off" : "on"); } catch {} return !value; })}>{sound ? <Volume2 size={18} /> : <VolumeX size={18} />}</button>
      {!preview && reveal.isPending ? <p className="reward-reveal-status" role="status">Loading your cards…</p> : !preview && reveal.error ? <div className="reward-reveal-status" role="alert">{reveal.error.message}<button onClick={() => reveal.refetch()}>Try again</button></div> : data && <>
        {phase === "spinning" ? <div className="reward-draw-window" aria-label="Revealing your reward"><div className="reward-draw-pointer" /><div className="reward-draw-track" ref={track}>{Array.from({ length: total }, (_, index) => <Card key={index} item={deck[index % n]} moving />)}</div></div> : phase === "won" ? <div className="reward-draw-result" role="status"><Card item={data.grant.item} chosen /><p>{data.grant.item.description}</p>{data.grant.expires_at && <small>Bonus active until {new Date(data.grant.expires_at).toLocaleDateString()}</small>}</div> : <div className="reward-draw-intro"><Gift size={60} /><p>{deck.length} {deck.length === 1 ? "card" : "cards"} in this drop</p></div>}
        {phase !== "won" && <details className="reward-pool-preview"><summary>Cards in this drop ({deck.length})</summary><div>{deck.map((item) => <Card key={item.id} item={item} />)}</div></details>}
        {error && <p role="alert" className="reward-reveal-status">{error}</p>}
        <footer>{phase === "won" ? <button className="reward-reveal-primary site-hover" onClick={collect} disabled={busy}>{busy ? "Saving…" : "Continue"}</button> : phase === "spinning" ? <button className="reward-reveal-secondary" onClick={() => setPhase("won")}>Skip animation</button> : <button className="reward-reveal-primary site-hover" onClick={start}><Gift size={17} />Open my cards</button>}</footer>
      </>}
    </DialogContent></Dialog>
    {selected && phase === "won" && <Celebration />}
  </>;
}
