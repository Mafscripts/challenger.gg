import React, { useEffect, useRef, useState } from "react";
import { Check, Copy, ExternalLink, MonitorPlay } from "lucide-react";
import { PLAYER_OVERLAY_HEIGHT, PLAYER_OVERLAY_WIDTH, playerOverlayUrl } from "@/components/stream/PlayerStatsBar";
import "@/styles/stream-overlay-settings.css";

export default function StreamOverlaySection({ user }) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  const [previewWidth, setPreviewWidth] = useState(0);
  const previewRef = useRef(null);
  const urlRef = useRef(null);
  const resetRef = useRef(null);
  const url = playerOverlayUrl(user.id);
  useEffect(() => {
    const element = previewRef.current;
    const observer = new ResizeObserver(entries => setPreviewWidth(entries[0].contentRect.width));
    observer.observe(element);
    return () => { observer.disconnect(); window.clearTimeout(resetRef.current); };
  }, []);
  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setCopyError("");
      window.clearTimeout(resetRef.current);
      resetRef.current = window.setTimeout(() => setCopied(false), 2500);
    } catch {
      urlRef.current?.select();
      setCopyError("Copy the selected URL manually.");
    }
  };
  const previewScale = previewWidth / PLAYER_OVERLAY_WIDTH;
  return <section className="glass stream-overlay-settings">
    <header><span className="stream-overlay-settings-mark"><MonitorPlay size={22} /></span><div><h3>Twitch player overlay</h3><p>Your live Topfragg stats, ready for your stream.</p></div><span className="stream-overlay-settings-status">Auto updates</span></header>
    <div className="stream-overlay-settings-body">
      <div className="stream-overlay-preview-heading"><strong>Your player bar</strong><a href={url} target="_blank" rel="noopener noreferrer">Open full preview<ExternalLink size={14} /></a></div>
      <div className="stream-overlay-preview" ref={previewRef} style={{ height: previewWidth ? PLAYER_OVERLAY_HEIGHT * previewScale + 16 : 80 }}>
        {previewWidth > 0 && <iframe src={url} title="Live Topfragg player overlay preview" width={PLAYER_OVERLAY_WIDTH} height={PLAYER_OVERLAY_HEIGHT} tabIndex={-1} style={{ transform: `scale(${previewScale})` }} />}
      </div>
      <p className="stream-overlay-preview-caption">Own logo, TOPFRAGG.GG, avatar, animated name, earnings, record, rank and all six trophy counters. Updates every 15 seconds.</p>
      <label className="stream-overlay-url-label" htmlFor="stream-overlay-url">Your browser source URL</label>
      <div className="stream-overlay-url"><input ref={urlRef} id="stream-overlay-url" readOnly value={url} onFocus={event => event.target.select()} /><button type="button" onClick={copyUrl}>{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? "Copied" : "Copy URL"}</button></div>
      <p className="stream-overlay-copy-status" role="status">{copyError || (copied ? "Overlay URL copied." : "")}</p>
      <div className="stream-overlay-setup"><h4>Set it up in OBS or Streamlabs</h4><ol><li>Add a <strong>Browser Source</strong> to your scene and paste this URL.</li><li>Set the source size to <strong>{PLAYER_OVERLAY_WIDTH} × {PLAYER_OVERLAY_HEIGHT}</strong>, then resize it on your canvas.</li><li>Place it at the top of your stream. The area around the bar is transparent.</li></ol><p>No login or Twitch connection is needed in OBS. This URL shows your public player stats.</p><a href="https://obsproject.com/kb/browser-source" target="_blank" rel="noopener noreferrer">OBS browser source guide<ExternalLink size={12} /></a></div>
    </div>
  </section>;
}
