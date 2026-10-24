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
    document.addEventListener("visibilitychange", update); update();
    return () => { observer?.disconnect(); document.removeEventListener("visibilitychange", update); };
  }, [theme?.id]);
  if (!theme) return null;
  const count = { rain: 7, embers: 6, tide: 4, solar: 3, snow: 7, mist: 0, fireflies: 6, chrome: 0, lava: 4, petals: 6 }[theme.motion];
  return <span ref={element} className="pc-atmosphere" data-atmosphere={theme.motion} aria-hidden="true">
    <i className="pc-scene-light" /><i className="pc-scene-haze" />
    {Array.from({ length: count }, (_, index) => <i key={index} className="pc-mote" style={{ "--mote-x": `${38 + ((index * 17) % 58)}%`, "--mote-y": `${12 + ((index * 23) % 72)}%`, "--mote-delay": `${-index * 2.73}s`, "--mote-time": `${10 + (index % 4) * 3}s`, "--mote-drift": `${index % 2 ? -14 : 19}px` }} />)}
  </span>;
}
