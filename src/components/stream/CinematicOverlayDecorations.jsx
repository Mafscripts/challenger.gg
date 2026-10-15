import React from "react";

// Deterministic positions keep decorative loops stable when live data refreshes.
const particles = Array.from({ length: 14 }, (_, index) => ({
  "--particle-x": `${3 + index * 7}%`,
  "--particle-y": `${10 + (index * 17) % 62}px`,
  "--particle-delay": `${-index * 1.3}s`,
  "--particle-duration": `${5 + index % 5}s`,
  "--particle-size": `${2 + index % 3}px`,
}));

export default function CinematicOverlayDecorations({ theme }) {
  return <div className="cinema-scene" aria-hidden="true">
    {theme === "solar" && <>
      <div className="solar-corona"><i /><i /><i /></div>
      <div className="solar-stream solar-stream-one" /><div className="solar-stream solar-stream-two" />
      <div className="cinema-particles solar-embers">{particles.map((style, index) => <i key={index} style={style} />)}</div>
    </>}
    {theme === "hologram" && <>
      <div className="hologram-grid" />
      <div className="hologram-radar"><i /><i /><i /></div>
      <div className="hologram-scan" /><div className="hologram-scan hologram-scan-secondary" />
      <div className="hologram-ticks" />
    </>}
    {theme === "quantum" && <>
      <div className="quantum-nebula quantum-nebula-one" /><div className="quantum-nebula quantum-nebula-two" />
      <div className="quantum-geometry">{Array.from({ length: 5 }, (_, index) => <i key={index} style={{ "--shape-index": index }} />)}</div>
      <div className="cinema-particles quantum-particles">{particles.map((style, index) => <i key={index} style={style} />)}</div>
      <div className="quantum-wave" />
    </>}
    <div className="cinema-edge cinema-edge-top"><i /></div>
    <div className="cinema-edge cinema-edge-bottom"><i /></div>
  </div>;
}

export function CinematicWordmark() {
  return <>{[..."TOPFRAGG.GG"].map((letter, index) => <span key={index} aria-hidden="true" style={{ "--glyph-index": index }}>{letter}</span>)}</>;
}
