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
          <rect x="2.5" y="2.5" width="39" height="39" rx="10" fill="#071018" stroke="#183342" />
          <path
            d="M22 7.75 34.25 12.5v9.45c0 7.25-5.08 11.6-12.25 14.3-7.17-2.7-12.25-7.05-12.25-14.3V12.5L22 7.75Z"
            fill="#08141D"
            stroke="#14D8FF"
            strokeWidth="2"
          />
          <path d="M14 16.25h16M22 16.25v13.5M16.5 23h11" stroke="#EAFBFF" strokeWidth="2.6" strokeLinecap="round" />
          <circle cx="33" cy="10.25" r="2.3" fill="#FF8200" />
        </svg>
      </span>
      {showWordmark && (
        <span className={`font-black uppercase leading-none tracking-[-0.03em] text-white ${wordmarkClassName}`}>
          Top<span style={{ color: "#14D8FF" }}>fragg</span>
        </span>
      )}
    </span>
  );
}
