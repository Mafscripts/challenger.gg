import React from "react";

export default function TopfraggLogo({
  className = "",
  markClassName = "",
  wordmarkClassName = "",
  showWordmark = true,
}) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <span className={`relative inline-flex h-9 w-9 shrink-0 items-center justify-center ${markClassName}`} aria-hidden="true">
        <svg viewBox="0 0 44 44" className="h-full w-full" role="img">
          <defs>
            <linearGradient id="topfraggMarkStroke" x1="7" y1="6" x2="37" y2="39" gradientUnits="userSpaceOnUse">
              <stop stopColor="#14D8FF" />
              <stop offset="0.58" stopColor="#00FF8A" />
              <stop offset="1" stopColor="#FF8200" />
            </linearGradient>
            <radialGradient id="topfraggMarkGlow" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(23 19) rotate(90) scale(24)">
              <stop stopColor="#14D8FF" stopOpacity="0.28" />
              <stop offset="1" stopColor="#020408" stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect x="2.5" y="2.5" width="39" height="39" rx="10" fill="#071018" stroke="#183342" />
          <rect x="3" y="3" width="38" height="38" rx="9.5" fill="url(#topfraggMarkGlow)" />
          <path
            d="M22 7.75 34.25 12.5v9.45c0 7.25-5.08 11.6-12.25 14.3-7.17-2.7-12.25-7.05-12.25-14.3V12.5L22 7.75Z"
            fill="#08141D"
            stroke="url(#topfraggMarkStroke)"
            strokeWidth="2"
          />
          <path d="M14 16.25h16M22 16.25v13.5M16.5 23h11" stroke="#EAFBFF" strokeWidth="3" strokeLinecap="round" />
          <path d="M22 16.25v13.5M16.5 23h11" stroke="#14D8FF" strokeWidth="1.15" strokeLinecap="round" />
          <circle cx="33" cy="10.25" r="2.3" fill="#FF8200" />
        </svg>
      </span>
      {showWordmark && (
        <span className={`font-black leading-none tracking-normal text-white ${wordmarkClassName}`}>
          Top<span className="text-cyan">fragg</span><span className="text-orange">.gg</span>
        </span>
      )}
    </span>
  );
}
