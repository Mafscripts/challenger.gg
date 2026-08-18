import React, { lazy, Suspense, useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";

const Navbar = lazy(() => import("./Navbar"));
const Footer = lazy(() => import("./Footer"));
const Sidebar = lazy(() => import("./Sidebar"));

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

export default function PageLayout() {
  const { isAuthenticated } = useAuth();

  return (
    <div className={`relative min-h-screen overflow-x-clip text-foreground ${isAuthenticated ? "app-shell-auth" : "app-shell-public"}`}>
      <div className="page-ambient" aria-hidden="true" />
      {isAuthenticated && (
        <Suspense fallback={null}>
          <Sidebar />
        </Suspense>
      )}
      <Suspense fallback={<div className="fixed inset-x-0 top-0 z-50 h-16 bg-background/95" />}>
        <Navbar />
      </Suspense>
      <main className="app-content relative z-[1] pt-16">
        <Outlet />
      </main>
      <div className="app-footer-wrap relative z-[1]">
        <DeferredFooter />
      </div>
    </div>
  );
}
