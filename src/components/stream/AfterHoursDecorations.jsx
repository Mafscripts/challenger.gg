import React from "react";
import "@/styles/after-hours-overlays.css";

export default function AfterHoursDecorations({ theme }) {
  return <div className={`afterhours-fx afterhours-${theme}`} aria-hidden="true">
    {theme === "miami-vice" && <><span className="miami-sunset" /><span className="miami-road" /><span className="miami-horizon" /></>}
    {theme === "venom-core" && <div className="venom-filaments">{Array.from({ length: 6 }, (_, n) => <span key={n} style={{ "--n": n }} />)}</div>}
    {theme === "ember-forge" && <><span className="forge-metal" /><span className="forge-seam forge-seam-top" /><span className="forge-seam forge-seam-bottom" /></>}
    {theme === "astral-gate" && <><span className="astral-portal astral-portal-left" /><span className="astral-portal astral-portal-right" /><span className="astral-nebula" /></>}
    <div className="afterhours-particles">{Array.from({ length: 20 }, (_, n) => <i key={n} style={{ "--n": n, "--x": `${(n * 41) % 100}%`, "--y": `${(n * 23) % 80}px`, "--delay": `${n * -.43}s` }} />)}</div>
  </div>;
}
