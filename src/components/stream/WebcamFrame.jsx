import React, { useId } from "react";
import TopfraggLogo from "@/components/brand/TopfraggLogo";
import { websiteOrigin } from "@/lib/appEnvironment";
import "@/styles/webcam-overlay.css";

export const WEBCAM_THEMES = [{ key: "cyan", label: "Topfragg Neon" }, { key: "tokyo", label: "Tokyo Midnight" }, { key: "gold", label: "Gold Signature" }];
export const webcamDimensions = ratio => ({ width: 672, height: ratio === "4:3" ? 560 : 440, cameraWidth: 640, cameraHeight: ratio === "4:3" ? 480 : 360, cameraX: 16, cameraY: 24 });
export const webcamOverlayUrl = (id, theme, ratio) => `${websiteOrigin}/overlay/webcam/${encodeURIComponent(id)}?theme=${WEBCAM_THEMES.some(item => item.key === theme) ? theme : "cyan"}&ratio=${ratio === "4:3" ? "4:3" : "16:9"}`;

export default function WebcamFrame({ name, theme = "cyan", ratio = "16:9", stale = false }) {
  const shineId = `webcam-${useId().replace(/:/g, "")}`;
  const { width, height, cameraHeight } = webcamDimensions(ratio);
  const perimeter = 2 * (652 + cameraHeight + 12);
  const sparks = Array.from({ length: 44 }, (_, index) => {
    const distance = index / 44 * perimeter;
    const h = cameraHeight + 12;
    const [x, y, dx, dy] = distance < 652 ? [10 + distance, 18, 0, -1]
      : distance < 652 + h ? [662, 18 + distance - 652, 1, 0]
        : distance < 1304 + h ? [662 - (distance - 652 - h), cameraHeight + 30, 0, 1]
          : [10, cameraHeight + 30 - (distance - 1304 - h), -1, 0];
    return { "--spark-x": `${x}px`, "--spark-y": `${y}px`, "--spark-dx": `${dx * 9}px`, "--spark-dy": `${dy * 9}px`, "--spark-delay": `${index * -.37}s`, "--spark-duration": `${3.8 + index % 5 * .55}s` };
  });
  return <div className="webcam-frame" data-theme={theme} style={{ width, height, "--camera-height": `${cameraHeight}px` }}>
    <svg className="webcam-frame-traces" width={width} height={height} viewBox={`0 0 ${width} ${height}`} fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={`${shineId}-gradient`} x1="0" y1="0" x2="1" y2=".2">
          <stop offset="30%" stopColor="white" stopOpacity="0" /><stop offset="43%" stopColor="white" stopOpacity=".12" /><stop offset="50%" stopColor="white" stopOpacity=".8" /><stop offset="57%" stopColor="white" stopOpacity=".12" /><stop offset="70%" stopColor="white" stopOpacity="0" />
        </linearGradient>
        <mask id={`${shineId}-mask`} maskUnits="userSpaceOnUse" x="0" y="0" width={width} height={height}>
          <rect className="webcam-shine-mask" x="-672" y="0" width="2016" height={height} fill={`url(#${shineId}-gradient)`} />
        </mask>
      </defs>
      <rect className="webcam-frame-base" x="10" y="18" width="652" height={cameraHeight + 12} rx="5" />
      <rect className="webcam-frame-rim" x="10" y="18" width="652" height={cameraHeight + 12} rx="5" />
      <g mask={`url(#${shineId}-mask)`}>
        <rect className="webcam-frame-soft-glow" x="10" y="18" width="652" height={cameraHeight + 12} rx="5" />
        <rect className="webcam-frame-soft-shine" x="10" y="18" width="652" height={cameraHeight + 12} rx="5" />
      </g>
      <path className="webcam-frame-corners" d={`M 10 52 V 18 H 50 M 622 18 H 662 V 52 M 10 ${cameraHeight - 10} V ${cameraHeight + 30} H 50 M 622 ${cameraHeight + 30} H 662 V ${cameraHeight - 10}`} />
    </svg>
    <div className="webcam-frame-sparks" aria-hidden="true">{sparks.map((style, index) => <i key={index} style={style} data-star={index % 4 === 0 || undefined} />)}{[[10,18],[662,18],[10,cameraHeight + 30],[662,cameraHeight + 30]].map(([x,y], index) => <span key={index} className="webcam-frame-flare" style={{ left: x, top: y, animationDelay: `${index * -2.5}s` }} />)}</div>
    <div className="webcam-frame-brand"><TopfraggLogo showWordmark={false} markClassName="webcam-frame-logo" /><strong>TOP<span>FRAGG</span>.GG</strong></div>
    <div className="webcam-frame-signature"><strong title={name}>{name}</strong></div>
    {stale && <span className="webcam-frame-reconnecting">Reconnecting · saved name</span>}
  </div>;
}
