import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import PlayerStatsBar, { PLAYER_OVERLAY_WIDTH, usePlayerOverlay } from "@/components/stream/PlayerStatsBar";

export default function PlayerOverlay() {
  const { identifier } = useParams();
  const [width, setWidth] = useState(window.innerWidth);
  const { data, error, loading, stale } = usePlayerOverlay(identifier);
  useEffect(() => {
    const resize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  const scale = Math.min(1, Math.max(1, width - 16) / PLAYER_OVERLAY_WIDTH);
  return <main className="stream-overlay-page">
    {data ? <div className="stream-overlay-canvas" style={{ width: PLAYER_OVERLAY_WIDTH, transform: `scale(${scale})` }}><PlayerStatsBar data={data} stale={stale} /></div> : <div className="stream-overlay-status" role="status">{loading ? "Loading Topfragg player…" : error}</div>}
  </main>;
}
