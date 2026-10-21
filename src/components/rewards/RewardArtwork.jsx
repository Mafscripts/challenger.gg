import React, { useEffect, useRef, useState, useSyncExternalStore } from "react";

// The animation is inside the SVG image: only its luminous material moves.
// Shared observers avoid one page/visibility listener per inventory card.
const firstDrop = /^\/assets\/rewards\/first-drop\/(ion-rift|frost-crown|venom-edge|emerald-vault|crimson-ghost|sovereign-aegis|prism-champion)\.svg$/;
let observer;
const observers = new Map(), listeners = new Set();
let media;
const active = () => typeof document !== "undefined" && !document.hidden && !(media ||= window.matchMedia("(prefers-reduced-motion: reduce)")).matches;
const announce = () => listeners.forEach((listener) => listener());
const subscribe = (listener) => {
  if (!listeners.size) { media ||= window.matchMedia("(prefers-reduced-motion: reduce)"); document.addEventListener("visibilitychange", announce); media.addEventListener("change", announce); }
  listeners.add(listener);
  return () => { listeners.delete(listener); if (!listeners.size) { document.removeEventListener("visibilitychange", announce); media.removeEventListener("change", announce); } };
};
const inactive = () => false;
const noopSubscribe = () => () => {};
function observe(node, listener) {
  if (!("IntersectionObserver" in window)) { listener(true); return () => {}; }
  observer ||= new IntersectionObserver((entries) => entries.forEach((entry) => observers.get(entry.target)?.(entry.isIntersecting)), { threshold: .05 });
  observers.set(node, listener); observer.observe(node);
  return () => { observers.delete(node); observer.unobserve(node); if (!observers.size) { observer.disconnect(); observer = null; } };
}
export default function RewardArtwork({ src, alt = "", animate = true, onError, ...props }) {
  const ref = useRef(null), [visible, setVisible] = useState(false), [brokenAnimation, setBrokenAnimation] = useState(false);
  const ownsAnimation = typeof src === "string" && firstDrop.test(src);
  const enabled = ownsAnimation && animate && !brokenAnimation;
  const motion = useSyncExternalStore(enabled ? subscribe : noopSubscribe, enabled ? active : inactive, inactive);
  useEffect(() => { setBrokenAnimation(false); }, [src]);
  useEffect(() => { setVisible(false); if (enabled && ref.current) return observe(ref.current, setVisible); }, [src, enabled]);
  const poster = ownsAnimation ? src.replace(/\.svg$/, ".webp") : src;
  const playing = enabled && visible && motion;
  return <img ref={ref} src={playing ? src : poster} alt={alt} loading="lazy" decoding="async" onError={(event) => { if (playing) setBrokenAnimation(true); else onError?.(event); }} {...props} />;
}
