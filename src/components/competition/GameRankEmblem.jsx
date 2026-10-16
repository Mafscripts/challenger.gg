import React from "react";

// Original vector insignia stay sharp on compact player cards.
function Emblem({ children, className, ...props }) {
  return <svg viewBox="0 0 40 40" fill="none" className={`shrink-0 ${className || "h-7 w-7"}`} aria-hidden="true" {...props}>{children}</svg>;
}

export function TitanEmblem(props) {
  return <Emblem {...props}>
    <path d="M20 2 34 10v15L20 38 6 25V10Z" fill="currentColor" fillOpacity=".12" stroke="currentColor" strokeWidth="1.5" />
    <path d="m20 6 10 7v10L20 33 10 23V13Z" fill="currentColor" fillOpacity=".25" />
    <path d="m20 9 8 10-8 12-8-12Z" fill="currentColor" />
    <path d="m20 9 8 10h-8Z" fill="white" fillOpacity=".7" />
    <path d="M20 19v12l-8-12Z" fill="black" fillOpacity=".3" />
    <path d="M4 14v9m32-9v9" stroke="currentColor" strokeWidth="2" />
  </Emblem>;
}

export function MasterEmblem(props) {
  return <Emblem {...props}>
    <path d="m20 3 12 9v13L20 37 8 25V12Z" fill="currentColor" fillOpacity=".18" stroke="currentColor" strokeWidth="1.5" />
    <path d="m2 10 10 6v6L2 17Zm0 11 10 6v5L2 26Zm36-11-10 6v6l10-5Zm0 11-10 6v5l10-6Z" fill="currentColor" fillOpacity=".6" />
    <path d="m20 8 7 12-7-3-7 3Zm0 12 7 4-7 9-7-9Z" fill="currentColor" />
    <path d="m20 8 7 12-7-3Zm0 12 7 4-7 9Z" fill="white" fillOpacity=".45" />
  </Emblem>;
}

export function ApexEmblem(props) {
  return <Emblem {...props}>
    <path d="M20 2 36 27 20 38 4 27Z" fill="currentColor" fillOpacity=".12" stroke="currentColor" strokeWidth="1.5" />
    <path d="m20 7 12 20-12-6-12 6Z" fill="currentColor" />
    <path d="m20 7 12 20-12-6Z" fill="white" fillOpacity=".55" />
    <path d="m20 25 8 4-8 6-8-6Z" fill="currentColor" fillOpacity=".8" />
    <path d="m4 11 5 9-5 6-3-5Zm32 0-5 9 5 6 3-5Z" fill="currentColor" fillOpacity=".6" />
    <path d="m20 12 3 7h-6Z" fill="black" fillOpacity=".3" />
  </Emblem>;
}

export function LegendEmblem(props) {
  return <Emblem {...props}>
    <path d="m20 3 11 9-2 17-9 9-9-9-2-17Z" fill="currentColor" fillOpacity=".16" stroke="currentColor" strokeWidth="1.5" />
    <path d="m1 10 10 5 2 12-8-5Zm38 0-10 5-2 12 8-5ZM5 25l10 7v4l-8-6Zm30 0-10 7v4l8-6Z" fill="currentColor" fillOpacity=".65" />
    <path d="m11 9 5 4 4-8 4 8 5-4-2 9H13Z" fill="currentColor" />
    <path d="m20 19 2.5 4.5 5 .8-3.6 3.6.8 5.1-4.7-2.4-4.7 2.4.8-5.1-3.6-3.6 5-.8Z" fill="currentColor" />
    <path d="m20 19 2.5 4.5 5 .8-7.5 2.4Zm0-14 4 8 5-4-2 9h-7Z" fill="white" fillOpacity=".5" />
  </Emblem>;
}

export const gameRankEmblems = { diamond: TitanEmblem, crimson: MasterEmblem, iridescent: ApexEmblem, top250: LegendEmblem };
