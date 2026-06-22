import HeroSection from "@/components/home/HeroSection";
import WhySection from "@/components/home/WhySection";
import RankedPreview from "@/components/home/RankedPreview";
import TournamentsPreview from "@/components/home/TournamentsPreview";
import MarketplacePreview from "@/components/home/MarketplacePreview";
import PremiumPreview from "@/components/home/PremiumPreview";
import FeaturedPlayers from "@/components/home/FeaturedPlayers";
import LiveMatches from "@/components/home/LiveMatches";
import NewsFeed from "@/components/home/NewsFeed";
import FAQSection from "@/components/home/FAQSection";

export default function Home() {
  return (
    <div className="min-h-screen">
      <HeroSection />
      <WhySection />
      <RankedPreview />
      <TournamentsPreview />
      <MarketplacePreview />
      <PremiumPreview />
      <FeaturedPlayers />
      <LiveMatches />
      <NewsFeed />
      <FAQSection />
    </div>
  );
}
