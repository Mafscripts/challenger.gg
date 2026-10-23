import React, { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";

// Unmounting the iframe stops its animation, rendering and live-stat polling.
export default function OverlayPreview({ children, label }) {
  const container = useRef(null);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) setPlaying(false);
    });
    observer.observe(container.current);
    const onVisibility = () => { if (document.hidden) setPlaying(false); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
  return <div className="overlay-preview-player" ref={container}>
    {playing ? <>{children}<button type="button" className="overlay-preview-pause" onClick={() => setPlaying(false)} aria-label={`Pause ${label}`}><Pause size={13} />Pause preview</button></>
      : <button type="button" className="overlay-preview-play" onClick={() => setPlaying(true)} aria-label={`Play ${label}`}><Play size={16} /><span>Play preview</span></button>}
  </div>;
}
