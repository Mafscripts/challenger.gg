import React, { useEffect, useRef, useState } from "react";
import { Check, Copy, ExternalLink, MonitorPlay } from "lucide-react";
import { PLAYER_OVERLAY_HEIGHT, PLAYER_OVERLAY_WIDTH, PLAYER_OVERLAY_THEMES, playerOverlayUrl } from "@/components/stream/PlayerStatsBar";
import "@/styles/stream-overlay-settings.css";

export default function StreamOverlaySection({ user }) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  const [previewWidth, setPreviewWidth] = useState(0);
  const [theme, setTheme] = useState("blue");
  const previewRef = useRef(null);
  const urlRef = useRef(null);
  const resetRef = useRef(null);
  const url = playerOverlayUrl(user.id, theme);
  const selectedDesign = PLAYER_OVERLAY_THEMES.find(option => option.key === theme);
  useEffect(() => {
    setCopied(false);
    setCopyError("");
    window.clearTimeout(resetRef.current);
  }, [url]);
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
      <div className="stream-overlay-theme-picker" role="group" aria-label="Overlay theme"><span>Choose your overlay · {PLAYER_OVERLAY_THEMES.length} styles</span>{PLAYER_OVERLAY_THEMES.map(option => <button type="button" key={option.key} data-theme={option.key} aria-pressed={theme === option.key} onClick={() => setTheme(option.key)}><span className="stream-overlay-theme-swatch" aria-hidden="true" /><span className="stream-overlay-theme-copy"><strong>{option.label}</strong><small>{option.caption}</small></span>{theme === option.key && <Check size={14} aria-hidden="true" />}</button>)}</div>
      {selectedDesign?.description && <p className="stream-overlay-theme-description" role="status">{selectedDesign.description}</p>}
      <div className="stream-overlay-preview" ref={previewRef} style={{ height: previewWidth ? PLAYER_OVERLAY_HEIGHT * previewScale + 16 : 80 }}>
        {previewWidth > 0 && <iframe src={url} title="Live Topfragg player overlay preview" width={PLAYER_OVERLAY_WIDTH} height={PLAYER_OVERLAY_HEIGHT} tabIndex={-1} style={{ transform: `scale(${previewScale})` }} />}
      </div>
      <p className="stream-overlay-preview-caption">Own logo, TOPFRAGG.GG, player name, Ranked ELO, Free 8s ELO + SR, earnings, record and all six trophy counters. Live stats refresh every 15 seconds.</p>
      <label className="stream-overlay-url-label" htmlFor="stream-overlay-url">Your browser source URL</label>
      <div className="stream-overlay-url"><input ref={urlRef} id="stream-overlay-url" readOnly value={url} onFocus={event => event.target.select()} /><button type="button" onClick={copyUrl}>{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? "Copied" : "Copy URL"}</button></div>
      <p className="stream-overlay-copy-status" role="status">{copyError || (copied ? "Overlay URL copied." : "")}</p>
      <div className="stream-overlay-setup"><h4>Set it up in OBS or Streamlabs</h4><ol><li>Add a <strong>Browser Source</strong> to your scene and paste this URL.</li><li>Match the source width to your stream canvas: <strong>1920</strong> for 1080p or <strong>2560</strong> for 1440p. Set the height to <strong>{PLAYER_OVERLAY_HEIGHT}</strong>.</li><li>Align the source to the top-left of your canvas, at <strong>X: 0, Y: 0</strong>. The bar fills its width automatically.</li></ol><p>No login or Twitch connection is needed in OBS. The area around the bar is transparent, and the URL shows your public player stats.</p><a href="https://obsproject.com/kb/browser-source" target="_blank" rel="noopener noreferrer">OBS browser source guide<ExternalLink size={12} /></a></div>
    </div>
  </section>;
}
