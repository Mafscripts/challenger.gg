import React, { useEffect, useRef, useState } from "react";
import { Camera, Check, Copy, ExternalLink } from "lucide-react";
import { WEBCAM_THEMES, webcamDimensions, webcamOverlayUrl } from "@/components/stream/WebcamFrame";
import OverlayPreview from "@/components/stream/OverlayPreview";

export default function WebcamOverlaySection({ user }) {
  const [theme, setTheme] = useState("cyan");
  const [ratio, setRatio] = useState("16:9");
  const [status, setStatus] = useState("");
  const input = useRef(null);
  const dimensions = webcamDimensions(ratio);
  const url = webcamOverlayUrl(user.id, theme, ratio);
  useEffect(() => { setStatus(""); }, [url]);
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setStatus("Copied"); }
    catch { input.current?.select(); setStatus("Copy the selected URL manually."); }
  };
  return <section className="glass stream-overlay-settings">
    <header><span className="stream-overlay-settings-mark"><Camera size={22} /></span><div><h3>Animated webcam frame</h3><p>Original Topfragg branding, your name centered below your camera.</p></div></header>
    <div className="stream-overlay-settings-body">
      <div className="webcam-frame-controls"><label>Frame style<select value={theme} onChange={event => setTheme(event.target.value)}>{WEBCAM_THEMES.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label><label>Camera shape<select value={ratio} onChange={event => setRatio(event.target.value)}><option value="16:9">16:9 · widescreen</option><option value="4:3">4:3 · classic</option></select></label></div>
      <div className="stream-overlay-preview-heading"><strong>Your webcam frame</strong><a href={url} target="_blank" rel="noopener noreferrer">Open preview<ExternalLink size={14} /></a></div>
      <div className="webcam-frame-preview" style={{ aspectRatio: `${dimensions.width} / ${dimensions.height}` }}><OverlayPreview label="webcam frame preview"><iframe src={url} title="Animated Topfragg webcam frame preview" tabIndex={-1} /></OverlayPreview></div>
      <p className="stream-overlay-preview-caption">The checkerboard shows transparency. Your camera stays visible through the center. Animated light travels around the edge; the frame never accesses your webcam.</p>
      <label className="stream-overlay-url-label" htmlFor="webcam-overlay-url">Your webcam browser source URL</label>
      <div className="stream-overlay-url"><input ref={input} id="webcam-overlay-url" readOnly value={url} onFocus={event => event.target.select()} /><button type="button" onClick={copy}>{status === "Copied" ? <Check size={16} /> : <Copy size={16} />}{status === "Copied" ? "Copied" : "Copy URL"}</button></div>
      <p className="stream-overlay-copy-status" role="status">{status}</p>
      <div className="stream-overlay-setup"><h4>Add your frame in OBS</h4><ol><li>Add a <strong>Browser Source</strong> using this URL. Set its size to <strong>{dimensions.width} × {dimensions.height}</strong>.</li><li>Place your webcam <strong>below the frame</strong> in the Sources list. Set the camera to <strong>{dimensions.cameraWidth} × {dimensions.cameraHeight}</strong>.</li><li>Position the camera <strong>16 pixels right and 24 pixels down</strong> from the frame’s top-left corner.</li><li>Select both sources and group them. Resize the group to fit your stream layout.</li></ol><p>The camera opening is {ratio}; branding and your name sit outside it. Your public display name updates automatically.</p></div>
    </div>
  </section>;
}
