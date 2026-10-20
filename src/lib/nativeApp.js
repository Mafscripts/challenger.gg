import { Capacitor } from "@capacitor/core";
import { isNativeBuild, validateMobileStartUrl } from "./appEnvironment";

export const NATIVE_RESUME_EVENT = "topfragg:native-resume";
export const isNativeApp = isNativeBuild && Capacitor.isNativePlatform();

export async function openAppBrowser(url) {
  const parsed = new URL(url);
  if (!["https:", "http:"].includes(parsed.protocol)) throw new Error("This link cannot be opened.");
  if (!isNativeApp) { window.open(parsed.href, "_blank", "noopener,noreferrer"); return; }
  const { Browser } = await import("@capacitor/browser");
  await Browser.open({ url: parsed.href, toolbarColor: "#08111b", presentationStyle: "fullscreen" });
}

export async function connectAccount(provider, webConnect) {
  if (!isNativeApp) {
    const response = await webConnect();
    window.location.assign(response.authorization_url);
    return;
  }
  const { base44 } = await import("@/api/base44Client");
  const response = await base44.mobileOAuth.createTicket(provider);
  await openAppBrowser(validateMobileStartUrl(response.start_url));
}

export async function initializeNativeApp() {
  if (!isNativeApp) return;
  document.documentElement.classList.add("topfragg-native");
  const [{ App }, { Browser }, { SplashScreen }, { StatusBar, Style }] = await Promise.all([
    import("@capacitor/app"), import("@capacitor/browser"), import("@capacitor/splash-screen"), import("@capacitor/status-bar"),
  ]);
  let lastResume = 0;
  const resume = () => {
    if (Date.now() - lastResume < 750) return;
    lastResume = Date.now();
    window.dispatchEvent(new Event(NATIVE_RESUME_EVENT));
  };
  await App.addListener("appStateChange", ({ isActive }) => { if (isActive) resume(); });
  await Browser.addListener("browserFinished", resume);
  // Keep external sites and sign-in pages out of the application's WebView.
  document.addEventListener("click", event => {
    const anchor = event.target.closest?.("a[href]");
    if (!anchor || event.defaultPrevented || anchor.hasAttribute("download")) return;
    const url = new URL(anchor.href, window.location.href);
    if (["http:", "https:"].includes(url.protocol) && url.origin !== window.location.origin) {
      event.preventDefault();
      void openAppBrowser(url.href).catch(() => {});
    }
  });
  await Promise.allSettled([StatusBar.setStyle({ style: Style.Dark }), SplashScreen.hide()]);
}
