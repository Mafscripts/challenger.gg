import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, Check, ExternalLink, Headphones, Link2, Mars, Maximize2, Minimize2, RotateCcw, Shuffle, Sparkles, Users, Venus, Volume2, VolumeX } from "lucide-react";
import AnimatedNameWheel from "@/components/competition/AnimatedNameWheel";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createPartyWheelAudio } from "@/lib/partyWheelAudio";
import { createPartyFireworks } from "@/lib/partyFireworks";
import { partyCapacity } from "@/lib/partyWheel";

const preference = (name, fallback) => {
  try { const saved = localStorage.getItem(`topfragg-wheel-${name}`); return saved === null ? fallback : saved === "true"; }
  catch { return fallback; }
};

function DrawnTeam({ room, team, index, manager, disabled, act, voice }) {
  const [name, setName] = useState(team.name);
  useEffect(() => setName(team.name), [team.name]);
  const save = async () => { if (!disabled && name.trim() && name.trim() !== team.name) await act("rename_team", { team_id: team.id, name }); };
  return <section style={{ "--team-accent": index % 2 === 0 ? "var(--orange)" : "var(--cyan)" }}>
    <header><span>{String(index + 1).padStart(2, "0")}</span>{manager ? <form onSubmit={(event) => { event.preventDefault(); void save(); }}><label className="sr-only" htmlFor={`draw-team-${team.id}`}>Team {index + 1} name</label><input id={`draw-team-${team.id}`} value={name} onChange={(event) => setName(event.target.value)} onBlur={save} maxLength={32} disabled={disabled} /><button type="submit" className="sr-only">Save team name</button></form> : <h3>{team.name}</h3>}</header>
    <ul>{room.players.filter((player) => player.side === team.id).map((player) => <li key={player.id}>{player.gender === "male" ? <Mars className="text-cyan" /> : player.gender === "female" ? <Venus className="text-fuchsia-300" /> : <Users />}<strong>{player.name}</strong>{player.duo_id && <small>Duo</small>}{player.user_id && <Link2 className="text-cyan" aria-label="Website account" />}</li>)}</ul>
    {voice?.team_urls?.[team.id] && <a className="party-team-voice" href={voice.team_urls[team.id]} target="_blank" rel="noopener noreferrer"><Headphones />Team voice<ExternalLink /></a>}
  </section>;
}

export default function PartyDrawStage({ room, entries, offset, spinning, allReady, manager, disabled, invalid, act, onReset, settings, children, voice, error }) {
  const [sound, setSound] = useState(() => preference("sound", true));
  const [celebrate, setCelebrate] = useState(() => preference("confetti", true));
  const [focused, setFocused] = useState(false), [reveal, setReveal] = useState(false);
  const [mounted, setMounted] = useState(false);
  const audio = useRef(null), canvas = useRef(null), confetti = useRef(null), celebrated = useRef(null), alive = useRef(false);
  const fireworksCanvas = useRef(null), fireworks = useRef(null);
  const effects = useRef({ celebrate, spinId: room.spin?.id });
  effects.current = { celebrate, spinId: room.spin?.id };
  const canSpin = manager && !disabled && !invalid && !allReady;
  useEffect(() => {
    alive.current = true;
    setMounted(true);
    const engine = createPartyWheelAudio(); audio.current = engine;
    return () => { alive.current = false; fireworks.current?.stop(); engine.close(); confetti.current?.reset(); };
  }, []);
  useEffect(() => {
    audio.current?.mute(!sound);
    try { localStorage.setItem("topfragg-wheel-sound", String(sound)); localStorage.setItem("topfragg-wheel-confetti", String(celebrate)); } catch { /* Preferences are optional. */ }
    if (!celebrate) { confetti.current?.reset(); fireworks.current?.stop(); }
  }, [sound, celebrate]);
  const spin = () => {
    if (!canSpin) return;
    if (sound) void audio.current?.unlock();
    setReveal(false);
    void act("spin");
  };
  useEffect(() => {
    const key = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter" && canSpin) { event.preventDefault(); spin(); }
      if (event.key === "Escape") setFocused(false);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  useEffect(() => { setReveal(false); confetti.current?.reset(); fireworks.current?.stop(); }, [room.spin?.id]);
  const finish = async (id) => {
    if (celebrated.current === id || room.spin?.id !== id || room.status !== "ready") return;
    celebrated.current = id;
    audio.current?.finish(); setReveal(true);
    if (!celebrate || window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return;
    if (fireworksCanvas.current) {
      fireworks.current ||= createPartyFireworks(fireworksCanvas.current, {
        onLaunch: () => audio.current?.fireworkLaunch(), onBurst: () => audio.current?.fireworkBurst(),
        onStop: () => audio.current?.stopFireworks(),
      });
      fireworks.current.start();
    }
    try {
      const { default: createConfetti } = await import("canvas-confetti");
      if (!alive.current || !canvas.current || !effects.current.celebrate || effects.current.spinId !== id) return;
      confetti.current ||= createConfetti.create(canvas.current, { resize: true, useWorker: true });
      const options = { colors: ["#05d5f5", "#ff8a35", "#f5d97a", "#c6fbff"], disableForReducedMotion: true, zIndex: 80, ticks: 220, gravity: .8, scalar: 1.05 };
      void confetti.current({ ...options, particleCount: 100, spread: 70, angle: 60, origin: { x: 0, y: .65 } });
      void confetti.current({ ...options, particleCount: 100, spread: 70, angle: 120, origin: { x: 1, y: .65 } });
      void confetti.current({ ...options, particleCount: 65, spread: 100, startVelocity: 35, origin: { x: .5, y: .3 } });
    } catch { /* The teams remain usable if a browser cannot load the effect. */ }
  };
  const continueTo = (target) => { setReveal(false); requestAnimationFrame(() => document.getElementById(target)?.scrollIntoView({ behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ? "auto" : "smooth", block: "start" })); };
  return <>
    {mounted && createPortal(<><canvas ref={canvas} className="party-draw-confetti" aria-hidden="true" /><canvas ref={fireworksCanvas} className="party-draw-confetti party-draw-fireworks" aria-hidden="true" /></>, document.body)}
    <div className={`party-draw-studio ${focused ? "is-focused" : ""}`}>
      <section className="party-panel party-wheel-panel">
        <div className="party-studio-toolbar">
          <span className="party-studio-live"><i />{spinning ? "LIVE DRAW" : allReady ? "DRAW COMPLETE" : "TEAM DRAW"}</span>
          <div className="party-actions">
            <button type="button" className="party-studio-toggle" aria-pressed={sound} title={sound ? "Mute wheel sounds" : "Enable wheel sounds"} onClick={() => { setSound(!sound); audio.current?.mute(sound); if (!sound) void audio.current?.unlock(); }}>{sound ? <Volume2 /> : <VolumeX />}<span>Sound</span></button>
            <button type="button" className="party-studio-toggle" aria-pressed={celebrate} aria-label="Confetti and animated fireworks" title="Confetti and animated fireworks" onClick={() => setCelebrate(!celebrate)}><Sparkles /><span>Confetti</span></button>
            <button type="button" className="party-studio-toggle" aria-pressed={focused} onClick={() => setFocused(!focused)}>{focused ? <Minimize2 /> : <Maximize2 />}<span>{focused ? "Show players" : "Focus wheel"}</span></button>
          </div>
        </div>
        <div className="party-studio-title"><p className="party-eyebrow">{room.mode === "coed" ? "Co-ed" : "Switcheroo"} · Round {room.round}</p><h2>{spinning ? "Let the wheel decide." : allReady ? "Your teams. Your next win." : "Who’s on your team?"}</h2><p>{spinning ? "One spin. Every player. All teams revealed together." : allReady ? "The draw is locked in. Get your squad ready." : "Add your players and duos, then spin to draw every team."}</p></div>
        <AnimatedNameWheel entries={entries} spin={room.spin} serverOffset={offset} onTick={() => audio.current?.tick()} onFinish={finish} onSpin={spin} disabled={!canSpin} spinning={spinning} />
        <div className="party-wheel-controls">
          {allReady ? <><button type="button" className="party-button party-primary party-spin-button" onClick={() => setReveal(true)}><Users />View drawn teams</button>{manager && room.teams.length >= 2 && <a className="party-button" href="#party-bracket">Choose bracket<ArrowRight /></a>}</> : manager ? <button type="button" className="party-button party-primary party-spin-button" disabled={!canSpin} onClick={spin}><Shuffle />{spinning ? "Drawing all teams…" : "Spin & draw all teams"}</button> : <p className="party-muted party-centered">The host controls the wheel. Watch the same live draw.</p>}
          {manager && <button type="button" className="party-button" disabled={disabled || !room.players.some((player) => player.side)} onClick={onReset}><RotateCcw />New draw</button>}
        </div>
        {invalid && room.status !== "closed" ? <p className="party-validation">{invalid}</p> : <p className="party-studio-hint">{spinning ? "Sit back. Your teams are on their way." : manager && !allReady ? "Click the wheel or press Ctrl + Enter to spin." : "Fixed duos stay together. Discord voice follows your team."}</p>}
        <div className="party-studio-stats"><span><Users /><strong>{room.players.length}/{partyCapacity(room)}</strong> players</span><span><Shuffle /><strong>{room.teams.length}</strong> teams</span><span><Check /><strong>{room.team_size}v{room.team_size}</strong> format</span></div>
      </section>
      <aside className="party-studio-inputs">
        <section className="party-panel party-studio-setup"><div className="party-section-heading"><h2>Room setup</h2><span className="party-count">{room.teams.length} teams</span></div>{settings || <p className="party-muted">{room.team_size} players per team · {room.mode === "coed" ? "Balanced male / female teams" : "Fresh teammates each round"}</p>}</section>
        {children}
      </aside>
    </div>
    <Dialog open={reveal && allReady} onOpenChange={setReveal}>
      <DialogContent className="party-draw-reveal border-white/10 bg-card text-foreground sm:max-w-[940px]">
        <DialogHeader><div className="party-reveal-emblem"><Sparkles /></div><p className="party-eyebrow">Round {room.round} · All teams drawn</p><DialogTitle className="text-2xl font-black sm:text-3xl">Meet your teams.</DialogTitle><DialogDescription>The wheel has spoken. {room.players.length} players, {room.teams.length} teams. Let’s play.</DialogDescription></DialogHeader>
        <div className="party-reveal-teams">{room.teams.map((team, index) => <DrawnTeam key={team.id} room={room} team={team} index={index} manager={manager} disabled={disabled} act={act} voice={voice} />)}</div>
        {error && <p className="party-error" role="alert">{error}</p>}
        <div className="party-reveal-footer"><p>Same draw for everyone. Fixed duos stay together.</p><div className="party-actions"><button type="button" className="party-button" onClick={() => setReveal(false)}>Done<Check /></button>{manager && room.teams.length >= 2 && <button type="button" className="party-button party-primary" onClick={() => continueTo("party-bracket")}>Choose bracket<ArrowRight /></button>}</div></div>
      </DialogContent>
    </Dialog>
  </>;
}
