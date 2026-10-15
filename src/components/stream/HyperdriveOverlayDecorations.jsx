import React from "react";

// Fixed positions and stable keys keep every loop running across stats refreshes.
const streaks = Array.from({ length: 8 }, (_, index) => ({
  "--streak-top": `${7 + (index * 19) % 65}px`,
  "--streak-left": `${(index * 13) % 94}%`,
  "--streak-duration": `${5 + index % 4}s`,
  "--streak-delay": `${-index * 1.7}s`,
  "--streak-width": `${24 + (index % 3) * 19}px`,
}));

export function HyperdriveWordmark() {
  return <>{[..."TOPFRAGG.GG"].map((letter, index) => <span key={index} style={{ "--letter-index": index }} aria-hidden="true">{letter}</span>)}</>;
}

export default function HyperdriveOverlayDecorations() {
  return <div className="hyperdrive-atmosphere" aria-hidden="true">
    <div className="hyperdrive-grid" />
    <div className="hyperdrive-cloud hyperdrive-cloud-cyan" />
    <div className="hyperdrive-cloud hyperdrive-cloud-pink" />
    <div className="hyperdrive-streaks">{streaks.map((style, index) => <i key={index} style={style} />)}</div>
    <div className="hyperdrive-rail hyperdrive-rail-top"><i /></div>
    <div className="hyperdrive-rail hyperdrive-rail-bottom"><i /></div>
  </div>;
}
