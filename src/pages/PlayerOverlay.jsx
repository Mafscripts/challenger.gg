import React, { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import PlayerStatsBar, { PLAYER_OVERLAY_WIDTH, usePlayerOverlay } from "@/components/stream/PlayerStatsBar";

export default function PlayerOverlay() {
  const { identifier } = useParams();
  const [searchParams] = useSearchParams();
  const theme = searchParams.get("theme") === "orange" ? "orange" : "blue";
  const [width, setWidth] = useState(window.innerWidth);
  const { data, error, loading, stale } = usePlayerOverlay(identifier);
  useEffect(() => {
    const resize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  const canvasWidth = Math.max(PLAYER_OVERLAY_WIDTH, width);
  const scale = Math.max(1, width) / canvasWidth;
  return <main className="stream-overlay-page">
    {data ? <div className="stream-overlay-canvas" style={{ width: canvasWidth, transform: `scale(${scale})` }}><PlayerStatsBar data={data} stale={stale} theme={theme} /></div> : <div className="stream-overlay-status" role="status">{loading ? "Loading Topfragg player…" : error}</div>}
  </main>;
}
