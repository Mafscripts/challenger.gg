import React, { useEffect, useMemo, useState } from "react";

const colors = ["#123c4a", "#194d59", "#213447", "#3b2c4b", "#3c3536", "#203f42", "#334259", "#403550"];
const point = (angle, radius) => [200 + radius * Math.cos(angle * Math.PI / 180), 200 + radius * Math.sin(angle * Math.PI / 180)];

// The server supplies the selected player and timestamps; the animation only
// visualizes that committed result. Every viewer lands on the same name.
export default function AnimatedNameWheel({ entries = [], spin, serverOffset = 0 }) {
  const [clock, setClock] = useState(() => Date.now());
  const [reducedMotion] = useState(() => typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches));
  useEffect(() => {
    if (!spin) return;
    let frame;
    const tick = () => {
      setClock(Date.now());
      if (Date.now() + serverOffset < Date.parse(spin.started_at) + spin.duration_ms) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [spin?.id, serverOffset]);
  const segments = spin?.entries || entries;
  const index = segments.findIndex((entry) => entry.id === spin?.selected_id);
  const count = Math.max(1, segments.length), slice = 360 / count;
  const progress = spin ? Math.max(0, Math.min(1, (clock + serverOffset - Date.parse(spin.started_at)) / spin.duration_ms)) : 0;
  const eased = 1 - (1 - progress) ** 4;
  const rotation = spin && index >= 0 ? (360 * (spin.turns || 6) + (360 - (index + .5) * slice)) * (reducedMotion ? progress === 1 ? 1 : 0 : eased) : 0;
  const selected = spin && progress === 1 ? segments[index] : null;
  const paths = useMemo(() => segments.map((entry, i) => {
    const a = -90 + i * slice, b = a + slice;
    const [sx, sy] = point(a, 185), [ex, ey] = point(b, 185);
    return { entry, angle: a + slice / 2, d: `M200 200 L${sx} ${sy} A185 185 0 ${slice > 180 ? 1 : 0} 1 ${ex} ${ey} Z` };
  }), [segments, slice]);
  return <div className="party-wheel-wrap">
    <span className="party-wheel-pointer" aria-hidden="true" />
    <svg viewBox="0 0 400 400" className="party-wheel" role="img" aria-label={selected ? `Wheel selected ${selected.name}` : "Player selection wheel"}>
      <defs><radialGradient id="party-wheel-core"><stop stopColor="#263c48" /><stop offset="1" stopColor="#0b151f" /></radialGradient></defs>
      <circle cx="200" cy="200" r="197" fill="#0b151f" stroke="#22c5e8" strokeOpacity=".25" strokeWidth="2" />
      <g transform={`rotate(${rotation} 200 200)`}>
        {count === 1 && segments.length > 0 ? <circle cx="200" cy="200" r="185" fill={colors[0]} /> : paths.map(({ entry, d }, i) => <path key={entry.id} d={d} fill={colors[i % colors.length]} stroke="#0b151f" strokeWidth="1.5" />)}
        {paths.map(({ entry, angle }) => {
          const [x, y] = point(angle, 126);
          const textAngle = count > 12 ? angle + (angle > 90 && angle < 270 ? 180 : 0) : angle + 90;
          return <text key={entry.id} x={x} y={y} fill="#eefaff" textAnchor="middle" dominantBaseline="central" fontSize={count > 16 ? 9 : count > 8 ? 11 : 13} fontWeight="700" transform={`rotate(${textAngle} ${x} ${y})`}>{entry.name.length > 17 ? `${entry.name.slice(0, 16)}…` : entry.name}</text>;
        })}
      </g>
      <circle cx="200" cy="200" r="43" fill="url(#party-wheel-core)" stroke="#26cfeb" strokeOpacity=".5" strokeWidth="2" />
      <text x="200" y="197" textAnchor="middle" fill="#22d3ee" fontSize="12" fontWeight="900" letterSpacing="1">TOPFRAGG</text>
      <text x="200" y="213" textAnchor="middle" fill="#94a3b8" fontSize="8" fontWeight="700">TEAM SPINNER</text>
    </svg>
    <p className="party-wheel-result" aria-live="polite">{spin && progress < 1 ? "Spinning…" : selected ? selected.name : segments.length ? "Ready to spin" : "Add your players to get started"}</p>
  </div>;
}
