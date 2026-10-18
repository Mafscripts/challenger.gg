import React, { useEffect, useId, useRef, useState } from "react";
import { partyWheelFrame, partyWheelIsLive } from "@/lib/partyWheelAnimation";

const point = (angle, radius) => [200 + radius * Math.cos(angle * Math.PI / 180), 200 + radius * Math.sin(angle * Math.PI / 180)];
const blades = Array.from({ length: 24 }, (_, index) => {
  const a = -90 + index * 15 + 1.4, b = a + 12.2;
  const [sx, sy] = point(a, 177), [ex, ey] = point(b, 177);
  const [ix, iy] = point(b + 17, 72), [jx, jy] = point(a + 17, 72);
  return { d: `M${sx} ${sy} A177 177 0 0 1 ${ex} ${ey} L${ix} ${iy} A72 72 0 0 0 ${jx} ${jy} Z`, accent: index % 6 === 0 };
});

// Outcomes and timing remain server-owned; effects only present the shared draw.
export default function AnimatedNameWheel({ entries = [], spin, serverOffset = 0, onTick, onFinish, onSpin, disabled = true, spinning = false }) {
  const gradient = useId().replaceAll(":", "");
  const [clock, setClock] = useState(() => Date.now());
  const [reducedMotion, setReducedMotion] = useState(false);
  const callbacks = useRef({ onTick, onFinish });
  const observed = useRef(new Set()), completed = useRef(null);
  callbacks.current = { onTick, onFinish };
  const segments = spin?.entries || entries, count = Math.max(1, segments.length);
  useEffect(() => {
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(Boolean(media?.matches));
    update(); media?.addEventListener?.("change", update);
    return () => media?.removeEventListener?.("change", update);
  }, []);
  useEffect(() => {
    if (!spin) { setClock(Date.now()); return; }
    let frame, previousTick;
    const live = partyWheelIsLive(spin, Date.now(), serverOffset);
    if (live) observed.current.add(spin.id);
    const tick = () => {
      const now = Date.now(), state = partyWheelFrame(spin, count, now, serverOffset, reducedMotion);
      setClock(now);
      const segment = Math.floor(state.rotation / 15);
      if (live && !reducedMotion && state.progress > 0 && state.progress < 1 && previousTick !== undefined && segment !== previousTick) callbacks.current.onTick?.();
      previousTick = segment;
      if (!state.finished) frame = requestAnimationFrame(tick);
      else if (observed.current.has(spin.id) && completed.current !== spin.id) {
        completed.current = spin.id;
        if (now + serverOffset - (Date.parse(spin.started_at) + spin.duration_ms) < 2500) callbacks.current.onFinish?.(spin.id);
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [spin?.id, serverOffset, count, reducedMotion]);
  const { progress, rotation, finished } = partyWheelFrame(spin, count, clock, serverOffset, reducedMotion);
  const allTeams = spin?.scope === "all_teams";
  return <div className={`party-wheel-wrap ${spinning ? "is-spinning" : finished ? "is-ready" : ""}`}>
    <div className="party-wheel-disc">
    <div className="party-wheel-halo" aria-hidden="true" />
    <span className="party-wheel-pointer" aria-hidden="true" />
    <svg viewBox="0 0 400 400" className="party-wheel" role="img" aria-label={finished && allTeams ? `All ${spin.team_count} teams are ready` : spinning ? "Drawing all teams" : "Topfragg visual team spinner"}>
      <defs>
        <radialGradient id={`${gradient}-core`}><stop stopColor="#244451" /><stop offset="1" stopColor="#0b151f" /></radialGradient>
        <linearGradient id={`${gradient}-rim`} x2="1" y2="1"><stop stopColor="#2dcce2" stopOpacity=".65" /><stop offset=".45" stopColor="#193340" /><stop offset="1" stopColor="#fc8a3b" stopOpacity=".55" /></linearGradient>
        <radialGradient id={`${gradient}-blade`}><stop offset=".25" stopColor="#0d202c" /><stop offset=".8" stopColor="#163e4e" /><stop offset="1" stopColor="#256074" /></radialGradient>
        <radialGradient id={`${gradient}-accent`}><stop offset=".25" stopColor="#16202a" /><stop offset=".85" stopColor="#583b28" /><stop offset="1" stopColor="#b16b37" /></radialGradient>
        <radialGradient id={`${gradient}-surface`}><stop stopColor="#173341" /><stop offset="1" stopColor="#07131d" /></radialGradient>
      </defs>
      <circle cx="200" cy="200" r="197" fill="#08121c" stroke={`url(#${gradient}-rim)`} strokeWidth="5" />
      <circle cx="200" cy="200" r="188" fill={`url(#${gradient}-surface)`} stroke="#24cee7" strokeOpacity=".2" strokeWidth="1" />
      <circle cx="200" cy="200" r="192" fill="none" stroke="#c6f9ff" strokeOpacity=".4" strokeWidth="2" strokeDasharray="1 7.38" />
      <g transform={`rotate(${rotation} 200 200)`}>
        {blades.map(({ d, accent }, index) => <path key={index} d={d} fill={`url(#${gradient}-${accent ? "accent" : "blade"})`} stroke={accent ? "#ffa65d" : "#63dbea"} strokeOpacity=".24" strokeWidth=".65" />)}
        <circle cx="200" cy="200" r="180" fill="none" stroke="#1dd5f1" strokeWidth="2" strokeOpacity=".7" strokeDasharray="32 15.12" />
        <circle cx="200" cy="200" r="180" fill="none" stroke="#ff9b46" strokeWidth="3" strokeDasharray="12 270.74" strokeDashoffset="-28" />
        {[0, 90, 180, 270].map((angle) => { const [x, y] = point(angle, 158); return <path key={angle} d={`M${x - 3} ${y} l3 -5 3 5 -3 5 Z`} fill="#a8f4ff" opacity=".75" transform={`rotate(${angle + 90} ${x} ${y})`} />; })}
      </g>
      <g transform={`rotate(${-rotation * .35} 200 200)`}>
        <circle cx="200" cy="200" r="102" fill="none" stroke="#53d9ec" strokeOpacity=".16" strokeWidth="1" />
        <circle cx="200" cy="200" r="99" fill="none" stroke="#55d7e9" strokeOpacity=".4" strokeWidth="1.5" strokeDasharray="1 12" />
        <circle cx="200" cy="200" r="62" fill="none" stroke="#35daf1" strokeOpacity=".65" strokeWidth="2" strokeDasharray="55 42.39" />
      </g>
      <circle cx="200" cy="200" r="53" fill="#091923" stroke="#78e5f2" strokeOpacity=".16" strokeWidth="1" />
      <circle cx="200" cy="200" r="48" fill={`url(#${gradient}-core)`} stroke="#2ecfe5" strokeOpacity=".5" strokeWidth="1.5" />
    </svg>
    <button type="button" className="party-wheel-hub" disabled={disabled} onClick={onSpin} aria-label="Spin to draw all teams"><span>TOP<span>FRAGG</span></span><strong>{spinning ? "DRAWING" : finished ? "READY" : "SPIN"}</strong><small>{spinning ? "ALL TEAMS" : "THE WHEEL"}</small></button>
    </div>
    <p className="party-wheel-result" aria-live="polite">{spin && progress < 1 ? "Drawing your teams…" : finished && allTeams ? `All ${spin.team_count} teams are ready` : segments.length ? "Your next team starts here." : "Add players. Build teams. Let it spin."}</p>
  </div>;
}
