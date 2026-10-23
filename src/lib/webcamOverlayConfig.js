import { websiteOrigin } from "./appEnvironment";

export const WEBCAM_THEMES = [{ key: "cyan", label: "Topfragg Neon" }, { key: "tokyo", label: "Tokyo Midnight" }, { key: "gold", label: "Gold Signature" }];
export const webcamDimensions = ratio => ({ width: 672, height: ratio === "4:3" ? 560 : 440, cameraWidth: 640, cameraHeight: ratio === "4:3" ? 480 : 360, cameraX: 16, cameraY: 24 });
export const webcamOverlayUrl = (id, theme, ratio) => `${websiteOrigin}/overlay/webcam/${encodeURIComponent(id)}?theme=${WEBCAM_THEMES.some(item => item.key === theme) ? theme : "cyan"}&ratio=${ratio === "4:3" ? "4:3" : "16:9"}`;
