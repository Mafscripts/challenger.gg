import React, { lazy, Suspense, useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import PageLoader from "@/components/ui/PageLoader";
import Navbar from "./Navbar";
import { NavigationLayoutProvider, useNavigationLayout } from "./NavigationLayoutProvider";
import "@/styles/navigation-layout.css";
import CompetitionRouteFrame from "@/components/competition/CompetitionRouteFrame";
import NativeTabBar from "./NativeTabBar";
import { isNativeApp } from "@/lib/nativeApp";
import { publicCommerceEnabled } from "@/lib/commerce";
import CommercePausedNotice from "@/components/commerce/CommercePausedNotice";

const RewardReveal = lazy(() => import("@/components/rewards/RewardReveal"));
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
  return <PageLoader />;
}

export default function PageLayout() {
  const { user } = useAuth();
  return <NavigationLayoutProvider key={user?.id || "guest"}><PageLayoutShell /></NavigationLayoutProvider>;
}

function PageLayoutShell() {
  const { isAuthenticated } = useAuth();
  const { layout } = useNavigationLayout();
  const location = useLocation();
  const isAdminRoute = location.pathname.startsWith("/admin");
  const isCurrencyRoom = /^\/(wagers-match|8s-match|tournament-match)(\/|$)/.test(location.pathname);

  return (
    <div className={`app-style-arena app-season-mw4 relative min-h-screen overflow-x-clip text-foreground ${isAuthenticated ? "app-shell-auth" : "app-shell-public"} ${isAdminRoute ? "app-shell-admin" : ""} ${!isNativeApp && isAuthenticated && layout === "sidebar" ? "app-layout-sidebar" : "app-layout-topbar"}`}>
      <div className="page-ambient" aria-hidden="true" />
      <Navbar />
      <main className="app-content relative z-[1] min-w-0 overflow-x-clip pt-16">
        <Suspense fallback={<RouteFallback />}>
          <div className="route-stage">
            {!publicCommerceEnabled && isCurrencyRoom && <CommercePausedNotice compact className="mx-4 mb-3 mt-5" />}
            <CompetitionRouteFrame><Outlet /></CompetitionRouteFrame>
          </div>
        </Suspense>
      </main>
      <NativeTabBar />
      {isAuthenticated && <Suspense fallback={null}><RewardReveal /></Suspense>}
      <div className="app-footer-wrap relative z-[1]">
        <DeferredFooter />
      </div>
    </div>
  );
}
