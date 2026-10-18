import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { partyWheelFrame, partyWheelIsLive } from "@/lib/partyWheelAnimation";

const colors = ["#07556b", "#27344c", "#713b24", "#3f315c", "#176061", "#243d58", "#574324", "#493551"];
const point = (angle, radius) => [200 + radius * Math.cos(angle * Math.PI / 180), 200 + radius * Math.sin(angle * Math.PI / 180)];

// Outcomes and timing remain server-owned; effects only present the shared draw.
export default function AnimatedNameWheel({ entries = [], spin, serverOffset = 0, onTick, onFinish, onSpin, disabled = true, spinning = false }) {
  const gradient = useId().replaceAll(":", "");
  const [clock, setClock] = useState(() => Date.now());
  const [reducedMotion, setReducedMotion] = useState(false);
  const callbacks = useRef({ onTick, onFinish });
  const observed = useRef(new Set()), completed = useRef(null);
  callbacks.current = { onTick, onFinish };
  const segments = spin?.entries || entries, count = Math.max(1, segments.length), slice = 360 / count;
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
      const segment = Math.floor(state.rotation / slice);
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
  }, [spin?.id, serverOffset, count, slice, reducedMotion]);
  const { progress, rotation, finished } = partyWheelFrame(spin, count, clock, serverOffset, reducedMotion);
  const allTeams = spin?.scope === "all_teams";
  const paths = useMemo(() => segments.map((entry, index) => {
    const a = -90 + index * slice, b = a + slice;
    const [sx, sy] = point(a, 183), [ex, ey] = point(b, 183);
    return { entry, angle: a + slice / 2, d: `M200 200 L${sx} ${sy} A183 183 0 ${slice > 180 ? 1 : 0} 1 ${ex} ${ey} Z` };
  }), [segments, slice]);
  return <div className={`party-wheel-wrap ${spinning ? "is-spinning" : ""}`}>
    <div className="party-wheel-disc">
    <div className="party-wheel-halo" aria-hidden="true" />
    <span className="party-wheel-pointer" aria-hidden="true" />
    <svg viewBox="0 0 400 400" className="party-wheel" role="img" aria-label={finished && allTeams ? `All ${spin.team_count} teams are ready` : spinning ? "Drawing all teams" : "Team selection wheel"}>
      <defs>
        <radialGradient id={`${gradient}-core`}><stop stopColor="#244451" /><stop offset="1" stopColor="#0b151f" /></radialGradient>
        <linearGradient id={`${gradient}-rim`} x2="1" y2="1"><stop stopColor="#2dcce2" stopOpacity=".65" /><stop offset=".45" stopColor="#193340" /><stop offset="1" stopColor="#fc8a3b" stopOpacity=".55" /></linearGradient>
      </defs>
      <circle cx="200" cy="200" r="197" fill="#08121c" stroke={`url(#${gradient}-rim)`} strokeWidth="5" />
      <circle cx="200" cy="200" r="190" fill="none" stroke="#c6f9ff" strokeOpacity=".3" strokeWidth="2" strokeDasharray="1 9" />
      <g transform={`rotate(${rotation} 200 200)`}>
        {!segments.length && <circle cx="200" cy="200" r="183" fill="#101f2c" />}
        {count === 1 && segments.length > 0 ? <circle cx="200" cy="200" r="183" fill={colors[0]} /> : paths.map(({ entry, d }, index) => <path key={entry.id} d={d} fill={colors[index % colors.length]} stroke="#a6eaff" strokeOpacity=".14" strokeWidth="1" />)}
        {paths.map(({ entry, angle }) => {
          const radial = count > 10;
          const [x, y] = point(angle, radial ? 127 : 119);
          const textAngle = radial ? angle + (angle > 90 && angle < 270 ? 180 : 0) : angle + 90;
          const maxLength = count > 24 ? 13 : count > 10 ? 18 : 22;
          return <text key={entry.id} x={x} y={y} fill="#f0faff" textAnchor="middle" dominantBaseline="central" fontSize={count > 32 ? 5.5 : count > 16 ? 7.5 : count > 10 ? 9 : 11} fontWeight="800" transform={`rotate(${textAngle} ${x} ${y})`}><title>{entry.name}</title>{entry.name.length > maxLength ? `${entry.name.slice(0, maxLength - 1)}…` : entry.name}</text>;
        })}
      </g>
      <circle cx="200" cy="200" r="48" fill={`url(#${gradient}-core)`} stroke="#2ecfe5" strokeOpacity=".5" strokeWidth="1.5" />
    </svg>
    <button type="button" className="party-wheel-hub" disabled={disabled} onClick={onSpin} aria-label="Spin to draw all teams"><span>TOP<span>FRAGG</span></span><strong>{spinning ? "DRAWING" : finished ? "READY" : "SPIN"}</strong><small>{spinning ? "ALL TEAMS" : "THE WHEEL"}</small></button>
    </div>
    <p className="party-wheel-result" aria-live="polite">{spin && progress < 1 ? "Drawing your teams…" : finished && allTeams ? `All ${spin.team_count} teams are ready` : segments.length ? "Your next team starts here." : "Add players. Build teams. Let it spin."}</p>
  </div>;
}
