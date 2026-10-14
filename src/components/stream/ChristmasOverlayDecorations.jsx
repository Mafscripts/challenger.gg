import React from "react";
import { Snowflake } from "lucide-react";

// Fixed positions and negative delays keep the scene continuous across live stat updates.
const snowflakes = Array.from({ length: 24 }, (_, index) => ({
  "--snow-left": `${(index * 43 + 7) % 100}%`,
  "--snow-drift": `${12 + (index % 5) * 9}px`,
  "--snow-duration": `${8 + (index % 7) * 1.3}s`,
  "--snow-delay": `${-index * 1.7}s`,
  "--snow-size": `${index % 4 === 0 ? 8 : 2 + index % 3}px`,
}));

export default function ChristmasOverlayDecorations() {
  return <div className="stream-xmas-decor" aria-hidden="true">
    <div className="stream-xmas-lights">{Array.from({ length: 38 }, (_, index) => <i key={index} style={{ "--light-delay": `${-index * .37}s` }} />)}</div>
    <div className="stream-xmas-snow">{snowflakes.map((motion, index) => <span key={index} className="stream-xmas-flake" data-crystal={index % 4 === 0} style={motion}>{index % 4 === 0 && <Snowflake size={8} strokeWidth={1.5} />}</span>)}</div>
    <div className="stream-xmas-ribbon" />
  </div>;
}

export function ChristmasBrandMark({ children }) {
  return <span className="stream-xmas-brand-mark">
    {children}
    <svg className="stream-xmas-hat" viewBox="0 0 52 30" fill="none" aria-hidden="true">
      <path d="M8 23C10 15 13 6 26 5c8-1 13 2 17 9l-5 4c-3-4-5-6-8-5l4 10H8Z" fill="#dc3048" />
      <path d="M13 19c3-7 6-10 13-11" stroke="#f16a78" strokeWidth="2" strokeLinecap="round" />
      <rect x="5" y="20" width="32" height="8" rx="4" fill="#fffdf6" />
      <path d="M9 26h24" stroke="#d5e3d8" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="43" cy="17" r="5.5" fill="#fffdf6" />
    </svg>
    <svg className="stream-xmas-holly" viewBox="0 0 32 24" fill="none" aria-hidden="true">
      <path d="m16 16-7 1-1-4-5-2 4-3-1-5 5 1 4-3 2 6 4 2-5 7Z" fill="#46a56b" />
      <path d="m17 16 6 3 2-4 5-1-3-4 2-4-5-1-3-4-3 5-4 1 3 9Z" fill="#277c4d" />
      <path d="m9 7 7 9m9-9-8 9" stroke="#8bc98e" strokeWidth="1" />
      <circle cx="14" cy="17" r="3" fill="#ec3d50" /><circle cx="19" cy="17" r="3" fill="#c9233d" /><circle cx="16.5" cy="21" r="2.5" fill="#e93649" />
    </svg>
  </span>;
}

export function ChristmasPlayerScene() {
  return <svg className="stream-xmas-player-scene" viewBox="0 0 112 68" fill="none" aria-hidden="true">
    <path d="m20 23-10 15h5L5 52h30L25 38h5L20 23Z" fill="#7dc896" />
    <path d="m91 17-12 17h6L72 54h38L97 34h6L91 17Z" fill="#69b789" />
    <path d="m58 11-14 20h7L34 54h48L65 31h7L58 11Z" fill="#c8e5c6" />
    <path d="m44 31 14-3 14 3M35 53l23-4 23 4" stroke="#fffdf5" strokeWidth="2" strokeLinecap="round" />
    <path className="stream-xmas-tree-star" d="m58 3 2 4 5 .7-3.5 3.4.8 4.9-4.3-2.3-4.3 2.3.8-4.9L51 7.7l5-.7 2-4Z" fill="#ffe2a1" />
    <circle cx="51" cy="38" r="2" fill="#f16a78" /><circle cx="64" cy="45" r="2" fill="#f16a78" />
    <path d="M58 55v5M20 53v5M91 55v4" stroke="#c8e5c6" strokeWidth="3" />
    <path d="M4 62c17-4 31 3 51 0s35-1 53 1" stroke="#d9ecdb" strokeWidth="1.5" strokeLinecap="round" />
  </svg>;
}
