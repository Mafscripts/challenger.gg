import React, { lazy, Suspense, useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";

const Navbar = lazy(() => import("./Navbar"));
const Footer = lazy(() => import("./Footer"));

function DeferredFooter() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const show = () => setReady(true);
    const handle = "requestIdleCallback" in window
      ? window.requestIdleCallback(show, { timeout: 2000 })
      : window.setTimeout(show, 900);
    return () => {
      if ("cancelIdleCallback" in window) window.cancelIdleCallback(handle);
      else window.clearTimeout(handle);
    };
  }, []);

  if (!ready) return null;
  return <Suspense fallback={null}><Footer /></Suspense>;
}

function RouteFallback() {
  return (
    <div className="route-loading-frame" aria-live="polite" aria-label="Loading page">
      <div className="route-loading-line" />
    </div>
  );
}

export default function PageLayout() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  const isAdminRoute = location.pathname.startsWith("/admin");

  return (
    <div className={`relative min-h-screen overflow-x-clip text-foreground ${isAuthenticated ? "app-shell-auth" : "app-shell-public"} ${isAdminRoute ? "app-shell-admin" : ""}`}>
      <div className="page-ambient" aria-hidden="true" />
      <Suspense fallback={<div className="fixed inset-x-0 top-0 z-50 h-16 bg-[#111821]" />}>
        <Navbar />
      </Suspense>
      <main className="app-content relative z-[1] min-w-0 overflow-x-clip pt-16">
        <Suspense fallback={<RouteFallback />}>
          <div key={location.pathname} className="route-stage route-page-enter">
            <Outlet />
          </div>
        </Suspense>
      </main>
      <div className="app-footer-wrap relative z-[1]">
        <DeferredFooter />
      </div>
    </div>
  );
}
