import React, { useEffect, useRef, useState } from "react";

let scriptPromise;
let scriptAttempt = 0;

const loadTurnstile = () => {
  if (scriptPromise) return scriptPromise;
  if (typeof window.turnstile?.render === "function") return Promise.resolve(window.turnstile);
  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const callbackName = `topfraggTurnstileLoaded${++scriptAttempt}`;
    let settled = false;
    const cleanUp = () => {
      window.clearTimeout(timeout);
      script.onload = null;
      script.onerror = null;
      delete window[callbackName];
    };
    const complete = () => {
      if (settled || typeof window.turnstile?.render !== "function") return;
      settled = true;
      cleanUp();
      resolve(window.turnstile);
    };
    script.src = `https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=${callbackName}`;
    script.async = true;
    const fail = (message) => {
      if (settled) return;
      settled = true;
      cleanUp();
      script.remove();
      scriptPromise = null;
      reject(new Error(message));
    };
    const timeout = window.setTimeout(() => fail("Cloudflare script did not become ready within 20 seconds"), 20000);
    window[callbackName] = complete;
    script.onerror = () => fail("Cloudflare script could not load; check the browser console for blocked requests");
    script.onload = () => {
      complete();
      if (!settled) fail("Cloudflare script loaded without the widget API");
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
};

export default function TurnstileCheck({ siteKey, onTokenChange, resetKey }) {
  const container = useRef(null);
  const [status, setStatus] = useState("loading");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let disposed = false;
    let widgetId;
    let api;
    setStatus("loading");
    onTokenChange("");
    const invalidate = (nextStatus) => {
      if (disposed) return;
      onTokenChange("");
      setStatus(nextStatus);
    };
    loadTurnstile().then((turnstile) => {
      if (disposed) return;
      api = turnstile;
      setStatus("ready");
      widgetId = api.render(container.current, {
        sitekey: siteKey,
        action: "register",
        theme: "dark",
        size: container.current.clientWidth < 300 ? "compact" : "flexible",
        "response-field": false,
        callback: (token) => {
          if (disposed) return;
          onTokenChange(token);
          setStatus("verified");
        },
        "expired-callback": () => invalidate("loading"),
        "timeout-callback": () => invalidate("error"),
        "error-callback": (errorCode) => {
          console.warn("[Turnstile] Security check failed:", errorCode);
          invalidate("error");
          return true;
        },
      });
    }).catch((error) => {
      console.warn("[Turnstile] Widget could not start:", error.message);
      invalidate("error");
    });
    return () => {
      disposed = true;
      if (widgetId !== undefined) api.remove(widgetId);
    };
  }, [siteKey, onTokenChange, resetKey, retry]);

  return (
    <div className="space-y-2 rounded-xl border border-white/10 bg-background/40 p-3">
      <div ref={container} />
      <p role="status" className="text-xs text-vapor">
        {status === "error" ? "The security check could not finish. Please retry."
          : status === "verified" ? "Security check complete."
          : status === "loading" ? "Loading security check..."
          : "Complete the security check to create your account."}
      </p>
      {status === "error" && (
        <button type="button" onClick={() => setRetry((value) => value + 1)} className="text-xs font-bold text-cyan hover:underline">
          Retry security check
        </button>
      )}
    </div>
  );
}
