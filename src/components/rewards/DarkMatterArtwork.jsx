import React, { forwardRef, useEffect, useRef, useState } from 'react';
import './dark-matter-artwork.css';
import suppliedLoops from '../../../content/rewards/material-loops.json';

// Each actual supplied loop is tied to its own item and material mask.
const materialBySource = new Map(suppliedLoops.map((item) => [
  `/assets/rewards/first-drop-v2/${item.id}.svg`,
  { ...item, video: `/assets/rewards/material-loops/${item.slug}.mp4`, mask: `/assets/rewards/first-drop-v2/${item.id}.material.webp?v=2` },
]));
export const rewardMaterialFor = (src) => materialBySource.get(src);
const materialModule = '/assets/rewards/dark-matter-material.js?v=2';
let modulePromise;

const DarkMatterArtwork = forwardRef(function DarkMatterArtwork({ src, material: materialConfig, playing, priority = 0, alt, className = '', style, onPointerEnter, onPointerLeave, ...imageProps }, ref) {
  const canvas = useRef(null), renderer = useRef(null);
  const [ready, setReady] = useState(false), [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [src]);
  useEffect(() => {
    setReady(false);
    if (!playing || failed || !canvas.current) return;
    let cancelled = false, material;
    // No shader module, textures or WebGL context until this item is visible.
    modulePromise ||= import(/* @vite-ignore */ materialModule).catch((error) => { modulePromise = null; throw error; });
    modulePromise.then(({ createDarkMatterRenderer }) => {
      if (cancelled) return;
      material = createDarkMatterRenderer(canvas.current, {
        source: src, mask: materialConfig.mask, video: materialConfig.video, zoom: materialConfig.zoom, priority,
        onReady: () => { if (!cancelled) setReady(true); },
        onPause: () => { if (!cancelled) setReady(false); },
        onFailure: () => { if (!cancelled) { setReady(false); setFailed(true); } },
      });
      renderer.current = material;
    }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; renderer.current = null; material?.dispose(); };
  }, [src, materialConfig, playing, priority, failed]);
  const drawing = ready && playing && !failed;
  return <picture ref={ref} className={`reward-material-artwork ${className}`} style={style}
    onPointerEnter={(event) => { renderer.current?.setPriority(priority + 10); onPointerEnter?.(event); }}
    onPointerLeave={(event) => { renderer.current?.setPriority(priority); onPointerLeave?.(event); }}>
    <img {...imageProps} src={src} alt={alt} />
    {playing && !failed && <canvas ref={canvas} width="1" height="1" aria-hidden="true" style={{ opacity: drawing ? 1 : 0 }} />}
  </picture>;
});
export default DarkMatterArtwork;
