import HeroSection from "@/components/home/HeroSection";
import PublicHomeOverview from "@/components/home/PublicHomeOverview";

export default function Home() {
  return (
    <div className="min-h-screen">
      <HeroSection />
      <PublicHomeOverview />
    </div>
  );
}
