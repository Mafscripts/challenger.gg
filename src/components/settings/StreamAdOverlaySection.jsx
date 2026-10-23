import React, { useEffect, useRef, useState } from "react";
import { Check, Copy, Download, ExternalLink, MonitorPlay } from "lucide-react";
import { websiteOrigin } from "@/lib/appEnvironment";
import OverlayPreview from "@/components/stream/OverlayPreview";

export default function StreamAdOverlaySection() {
  const url = `${websiteOrigin}/stream/topfragg-ad.html`;
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [width, setWidth] = useState(0);
  const previewRef = useRef(null);
  const inputRef = useRef(null);
  const timerRef = useRef(null);
  useEffect(() => {
    const observer = new ResizeObserver(entries => setWidth(entries[0].contentRect.width));
    observer.observe(previewRef.current);
    return () => { observer.disconnect(); window.clearTimeout(timerRef.current); };
  }, []);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true); setError("");
      window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => setCopied(false), 2500);
    } catch { inputRef.current?.select(); setError("Copy the selected URL manually."); }
  };
  const scale = Math.min(1, Math.max(0, width - 16) / 480);
  return <section className="glass stream-overlay-settings">
    <header><span className="stream-overlay-settings-mark"><MonitorPlay size={22} /></span><div><h3>TopFragg stream advert</h3><p>The compact animated promo for your stream.</p></div><span className="stream-overlay-settings-status">480 × 140</span></header>
    <div className="stream-overlay-settings-body">
      <div className="stream-overlay-preview-heading"><strong>Live advert preview</strong><a href={url} target="_blank" rel="noopener noreferrer">Open full preview<ExternalLink size={14} /></a></div>
      <div ref={previewRef} className="stream-ad-preview" style={{ height: width ? 140 * scale + 16 : 156 }}>
        {width > 0 && <OverlayPreview label="stream advert preview"><iframe src={url} title="Animated TopFragg stream advert preview" width="480" height="140" tabIndex={-1} style={{ transform: `scale(${scale})` }} /></OverlayPreview>}
      </div>
      <p className="stream-overlay-preview-caption">Your TopFragg logo turns smoothly every 24 seconds. The advert cycles through free-entry tournaments, 5 free credits for the first 250 sign-ups, XP ladders, cash prizes and topfragg.gg.</p>
      <label className="stream-overlay-url-label" htmlFor="stream-ad-url">Advert browser source URL</label>
      <div className="stream-overlay-url"><input ref={inputRef} id="stream-ad-url" readOnly value={url} onFocus={event => event.target.select()} /><button type="button" onClick={copy}>{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? "Copied" : "Copy URL"}</button></div>
      <p className="stream-overlay-copy-status" role="status">{error || (copied ? "Advert URL copied." : "")}</p>
      <div className="stream-overlay-setup"><h4>Add the advert to OBS or Streamlabs</h4><ol><li>Add a <strong>Browser Source</strong> and paste the advert URL above.</li><li>Set width to <strong>480</strong>, height to <strong>140</strong> and FPS to <strong>30</strong>.</li><li>Place it in a corner of your stream. Scale the source down if you prefer it smaller.</li></ol><p>The background is transparent. No login, chroma key or Twitch connection is needed.</p><a href={url} download="topfragg-stream-ad.html"><Download size={14} />Download standalone HTML</a></div>
    </div>
  </section>;
}
