import { Hero } from "@/components/sections/Hero";
import { GiftIncentive } from "@/components/sections/GiftIncentive";
import { HowItWorks } from "@/components/sections/HowItWorks";
import { ProductDemo } from "@/components/sections/ProductDemo";
import { Features } from "@/components/sections/Features";
import { Results } from "@/components/sections/Results";
import { PromotionTypes } from "@/components/sections/PromotionTypes";
import { Comparison } from "@/components/sections/Comparison";
import { Integrations } from "@/components/sections/Integrations";
import { Pricing } from "@/components/sections/Pricing";
import { FAQ } from "@/components/sections/FAQ";

export default function Home() {
  return (
    <main className="min-w-0 flex-1 overflow-x-clip">
      <Hero />
      <HowItWorks />
      <ProductDemo />
      <GiftIncentive />
      <Features />
      <Results />
      <PromotionTypes />
      <Comparison />
      <Integrations />
      <Pricing />
      <FAQ />
    </main>
  );
}
