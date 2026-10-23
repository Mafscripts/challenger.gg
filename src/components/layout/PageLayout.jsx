import React, { lazy, Suspense, useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import PageLoader from "@/components/ui/PageLoader";
import Navbar from "./Navbar";
import { NavigationLayoutProvider, useNavigationLayout } from "./NavigationLayoutProvider";
import "@/styles/navigation-layout.css";
import NativeTabBar from "./NativeTabBar";
import { isNativeApp } from "@/lib/nativeApp";
import { publicCommerceEnabled } from "@/lib/commerce";
import CommercePausedNotice from "@/components/commerce/CommercePausedNotice";

const RewardReveal = lazy(() => import("@/components/rewards/RewardReveal"));
const LiveSupport = lazy(() => import("@/components/support/LiveSupport"));
const Footer = lazy(() => import("./Footer"));
const CompetitionRouteFrame = lazy(() => import("@/components/competition/CompetitionRouteFrame"));

function CompetitionFrame({ children }) {
  const { pathname } = useLocation();
  if (!["/ranked", "/xp", "/wagers", "/ranked/8s"].includes(pathname)) return children;
  return <Suspense fallback={<RouteFallback />}><CompetitionRouteFrame>{children}</CompetitionRouteFrame></Suspense>;
}

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
  const { user, authChecked, isLoadingAuth } = useAuth();
  if (!authChecked || (isLoadingAuth && !user)) return <PageLoader fullscreen label="Checking your session" />;
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
            <CompetitionFrame><Outlet /></CompetitionFrame>
          </div>
        </Suspense>
      </main>
      <NativeTabBar />
      <Suspense fallback={null}><LiveSupport /></Suspense>
      {isAuthenticated && <Suspense fallback={null}><RewardReveal /></Suspense>}
      <div className="app-footer-wrap relative z-[1]">
        <DeferredFooter />
      </div>
    </div>
  );
}
