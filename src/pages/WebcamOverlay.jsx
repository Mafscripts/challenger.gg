import React, { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { usePlayerOverlay } from "@/hooks/usePlayerOverlay";
import WebcamFrame, { WEBCAM_THEMES, webcamDimensions } from "@/components/stream/WebcamFrame";

export default function WebcamOverlay() {
  const { identifier } = useParams();
  const [params] = useSearchParams();
  const ratio = params.get("ratio") === "4:3" ? "4:3" : "16:9";
  const theme = WEBCAM_THEMES.some(item => item.key === params.get("theme")) ? params.get("theme") : "cyan";
  const { data, loading, error, stale } = usePlayerOverlay(identifier);
  const dimensions = webcamDimensions(ratio);
  const [viewport, setViewport] = useState({ width: window.innerWidth, height: window.innerHeight });
  useEffect(() => {
    const resize = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  const scale = Math.min(viewport.width / dimensions.width, viewport.height / dimensions.height);
  return <main className="webcam-overlay-page">{data ? <div style={{ width: dimensions.width, height: dimensions.height, transform: `scale(${scale})`, transformOrigin: "top left" }}><WebcamFrame name={data.player.display_name || data.player.username} theme={theme} ratio={ratio} stale={stale} /></div> : <div className="stream-overlay-status" role="status">{loading ? "Loading webcam frame…" : error}</div>}</main>;
}
