import React, { useEffect, useRef, useState } from "react";

let scriptPromise;

const loadTurnstile = () => {
  if (window.turnstile) return new Promise((resolve) => window.turnstile.ready(() => resolve(window.turnstile)));
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    const fail = () => {
      window.clearTimeout(timeout);
      script.remove();
      scriptPromise = null;
      reject(new Error("Security check could not load"));
    };
    const timeout = window.setTimeout(fail, 20000);
    script.onerror = fail;
    script.onload = () => {
      if (!window.turnstile) return fail();
      window.turnstile.ready(() => {
        window.clearTimeout(timeout);
        resolve(window.turnstile);
      });
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
        "error-callback": () => {
          invalidate("error");
          return true;
        },
      });
    }).catch(() => invalidate("error"));
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
