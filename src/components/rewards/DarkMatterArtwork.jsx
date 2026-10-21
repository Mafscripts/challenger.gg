import React, { forwardRef, useEffect, useRef, useState } from 'react';
import './dark-matter-artwork.css';

// Pilot material: its authored mask is tied to this exact illustration.
export const darkMatterSource = '/assets/rewards/first-drop-v2/first-drop-ion-rift-15.svg';
const materialMask = '/assets/rewards/first-drop-v2/first-drop-ion-rift-15.material.webp';
const materialModule = '/assets/rewards/dark-matter-material.js?v=1';
let modulePromise;

const DarkMatterArtwork = forwardRef(function DarkMatterArtwork({ src, playing, priority, alt, className = '', style, onPointerEnter, onPointerLeave, ...imageProps }, ref) {
  const canvas = useRef(null), renderer = useRef(null);
  const [ready, setReady] = useState(false), [failed, setFailed] = useState(false);
  useEffect(() => {
    setReady(false);
    if (!playing || failed || !canvas.current) return;
    let cancelled = false, material;
    // No shader module, textures or WebGL context until this item is visible.
    modulePromise ||= import(/* @vite-ignore */ materialModule);
    modulePromise.then(({ createDarkMatterRenderer }) => {
      if (cancelled) return;
      material = createDarkMatterRenderer(canvas.current, {
        source: src, mask: materialMask, priority,
        onReady: () => { if (!cancelled) setReady(true); },
        onFailure: () => { if (!cancelled) { setReady(false); setFailed(true); } },
      });
      renderer.current = material;
    }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; renderer.current = null; material?.dispose(); };
  }, [src, playing, priority, failed]);
  const drawing = ready && playing && !failed;
  return <picture ref={ref} className={`reward-material-artwork ${className}`} style={style}
    onPointerEnter={(event) => { renderer.current?.setPriority(priority + 10); onPointerEnter?.(event); }}
    onPointerLeave={(event) => { renderer.current?.setPriority(priority); onPointerLeave?.(event); }}>
    <img {...imageProps} src={src} alt={alt} />
    {playing && !failed && <canvas ref={canvas} width="1" height="1" aria-hidden="true" style={{ opacity: drawing ? 1 : 0 }} />}
  </picture>;
});
export default DarkMatterArtwork;
