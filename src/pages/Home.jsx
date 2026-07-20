import { lazy, Suspense, useEffect, useRef, useState } from "react";
import HeroSection from "@/components/home/HeroSection";

const WhySection = lazy(() => import("@/components/home/WhySection"));
const RankedPreview = lazy(() => import("@/components/home/RankedPreview"));
const TournamentsPreview = lazy(() => import("@/components/home/TournamentsPreview"));
const MarketplacePreview = lazy(() => import("@/components/home/MarketplacePreview"));
const PremiumPreview = lazy(() => import("@/components/home/PremiumPreview"));
const FeaturedPlayers = lazy(() => import("@/components/home/FeaturedPlayers"));
const LiveMatches = lazy(() => import("@/components/home/LiveMatches"));
const NewsFeed = lazy(() => import("@/components/home/NewsFeed"));
const FAQSection = lazy(() => import("@/components/home/FAQSection"));

function DeferredSection({ children, minHeight = 520 }) {
  const rootRef = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (visible) return undefined;
    if (!("IntersectionObserver" in window)) {
      setVisible(true);
      return undefined;
    }

    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      setVisible(true);
      observer.disconnect();
    }, { rootMargin: "700px 0px" });

    if (rootRef.current) observer.observe(rootRef.current);
    return () => observer.disconnect();
  }, [visible]);

  const fallback = <div aria-hidden="true" style={{ minHeight }} />;

  return (
    <div ref={rootRef} className="render-lazy">
      {visible ? <Suspense fallback={fallback}>{children}</Suspense> : fallback}
    </div>
  );
}

export default function Home() {
  return (
    <div className="min-h-screen">
      <HeroSection />
      <DeferredSection minHeight={500}><WhySection /></DeferredSection>
      <DeferredSection><RankedPreview /></DeferredSection>
      <DeferredSection><TournamentsPreview /></DeferredSection>
      <DeferredSection><MarketplacePreview /></DeferredSection>
      <DeferredSection><PremiumPreview /></DeferredSection>
      <DeferredSection><FeaturedPlayers /></DeferredSection>
      <DeferredSection><LiveMatches /></DeferredSection>
      <DeferredSection minHeight={420}><NewsFeed /></DeferredSection>
      <DeferredSection minHeight={620}><FAQSection /></DeferredSection>
    </div>
  );
}
