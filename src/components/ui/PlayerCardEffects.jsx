import React, { useEffect, useRef } from "react";
import { playerCardTheme } from "@/lib/playerCards";

// Small decorative layers only: no canvas loop, no layout animation and no input interception.
export default function PlayerCardEffects({ player }) {
  const theme = playerCardTheme(player);
  const element = useRef(null);
  useEffect(() => {
    const node = element.current;
    if (!node) return;
    let visible = true;
    const update = () => { node.dataset.motionPaused = String(!visible || document.hidden); };
    const observer = typeof IntersectionObserver === "function" ? new IntersectionObserver(entries => { visible = entries[0].isIntersecting; update(); }, { rootMargin: "60px" }) : null;
    observer?.observe(node);
    const card = node.parentElement;
    let frame;
    const updateLayout = () => {
      const { width, height } = card.getBoundingClientRect();
      const ratio = width / Math.max(1, height);
      const layout = ratio < 7 ? "compact" : ratio > 16 ? "wide" : "row";
      if (card.dataset.cardLayout !== layout) card.dataset.cardLayout = layout;
    };
    const resize = typeof ResizeObserver === "function" ? new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(updateLayout);
    }) : null;
    if (card) resize?.observe(card, { box: "border-box" });
    document.addEventListener("visibilitychange", update); update();
    return () => { observer?.disconnect(); resize?.disconnect(); cancelAnimationFrame(frame); document.removeEventListener("visibilitychange", update); };
  }, [theme?.id]);
  if (!theme) return null;
  const count = { rain: 16, embers: 12, tide: 14, solar: 8, snow: 16, mist: 7, fireflies: 12, chrome: 9, lava: 12, petals: 12, tracer: 10, road: 12, dust: 16, contrail: 8, bubbles: 14, moon: 10, harbor: 16, sand: 16, orbit: 12, speed: 14, signal: 12, gears: 8, jelly: 14, runes: 10, vinyl: 8, crumbs: 12, "duck-stars": 10, "noodle-steam": 8, sleepy: 6, goober: 10, toast: 12, "ash-crown": 16, celestial: 14, relic: 14, prism: 12, forge: 16, "pixel-stars": 14, tape: 12, "pixel-rain": 16, "scan-surf": 12 }[theme.motion] ?? 8;
  return <span ref={element} className="pc-atmosphere" data-atmosphere={theme.motion} aria-hidden="true">
    <i className="pc-scene-light" /><i className="pc-scene-haze" />
    {Array.from({ length: count }, (_, index) => <i key={index} className="pc-mote" style={{ "--mote-x": `${38 + ((index * 17) % 58)}%`, "--mote-y": `${12 + ((index * 23) % 72)}%`, "--mote-delay": `${-index * 2.73}s`, "--mote-time": `${4.5 + (index % 4) * 1.3}s`, "--mote-drift": `${index % 2 ? -28 : 34}px` }} />)}
  </span>;
}
