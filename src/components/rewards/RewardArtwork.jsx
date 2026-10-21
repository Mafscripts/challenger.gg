import DarkMatterArtwork, { rewardMaterialFor } from "./DarkMatterArtwork";
import React, { useEffect, useRef, useState, useSyncExternalStore } from "react";

// Shared motion budget for SVG images and the WebGL loop materials.
// Shared observers avoid one page/visibility listener per inventory card.
const firstDrop = /^\/assets\/rewards\/(?:first-drop\/(ion-rift|frost-crown|venom-edge|emerald-vault|crimson-ghost|sovereign-aegis|prism-champion)|first-drop-v2\/first-drop-[a-z0-9-]+)\.svg$/;
// Refresh revised SVG compositions without changing catalog or owned item URLs.
const animationRevision = "crisp-3";
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
// Keep a large catalog from running every material animation at once.
function allocateMotion() {
  const visible = [...observers.values()].filter((entry) => entry.intersecting).sort((a,b) => b.priority - a.priority);
  let materials = 0;
  const eligible = visible.filter((entry) => !entry.material || ++materials <= 2);
  const playing = new Set(eligible.slice(0,6));
  observers.forEach((entry) => { const next = playing.has(entry); if (entry.running !== next) { entry.running = next; entry.listener(next); } });
}
function prioritize(node, hovered) {
  const entry = observers.get(node);
  if (entry) { entry.priority = entry.basePriority + (hovered ? 10 : 0); allocateMotion(); }
}
function observe(node, listener, priority, material = false) {
  const entry = { listener, priority, material, basePriority: priority, intersecting: false, running: false };
  observers.set(node, entry);
  if (!("IntersectionObserver" in window)) { entry.intersecting = true; allocateMotion(); }
  else {
    observer ||= new IntersectionObserver((entries) => {
      entries.forEach((item) => { const record = observers.get(item.target); if (record) record.intersecting = item.isIntersecting && item.intersectionRatio >= .05; });
      allocateMotion();
    }, { threshold: .05 });
    observer.observe(node);
  }
  return () => { observers.delete(node); observer?.unobserve(node); allocateMotion(); if (!observers.size) { observer?.disconnect(); observer = null; } };
}
export default function RewardArtwork({ src, alt = "", animate = true, priority = 0, onError, onPointerEnter, onPointerLeave, ...props }) {
  const ref = useRef(null), [visible, setVisible] = useState(false), [brokenAnimation, setBrokenAnimation] = useState(false);
  const material = rewardMaterialFor(src);
  const ownsAnimation = typeof src === "string" && firstDrop.test(src);
  const enabled = ownsAnimation && animate && !brokenAnimation;
  const motion = useSyncExternalStore(enabled ? subscribe : noopSubscribe, enabled ? active : inactive, inactive);
  useEffect(() => { setBrokenAnimation(false); }, [src]);
  useEffect(() => { setVisible(false); if (enabled && ref.current) return observe(ref.current, setVisible, priority, Boolean(material)); }, [src, enabled, priority, material]);
  const poster = ownsAnimation ? src.replace(/\.svg$/, ".webp") : src;
  const playing = enabled && visible && motion;
  if (material) return <DarkMatterArtwork ref={ref} src={poster} material={material} playing={playing} priority={priority} alt={alt}
    onPointerEnter={(event) => { prioritize(ref.current, true); onPointerEnter?.(event); }}
    onPointerLeave={(event) => { prioritize(ref.current, false); onPointerLeave?.(event); }}
    onError={onError} {...props} />;
  return <img ref={ref} src={playing ? `${src}?v=${animationRevision}` : poster} alt={alt} loading="lazy" decoding="async" onPointerEnter={(event) => { prioritize(ref.current, true); onPointerEnter?.(event); }} onPointerLeave={(event) => { prioritize(ref.current, false); onPointerLeave?.(event); }} onError={(event) => { if (playing) setBrokenAnimation(true); else onError?.(event); }} {...props} />;
}
