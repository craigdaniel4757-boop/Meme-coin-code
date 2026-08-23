import { FAQ } from "@/components/landing/faq";
import { FeatureGrid } from "@/components/landing/feature-grid";
import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { SampleReportTeaser } from "@/components/landing/sample-report-teaser";

export default function LandingPage() {
  return (
    <div>
      <Hero />
      <HowItWorks />
      <FeatureGrid />
      <SampleReportTeaser />
      <FAQ />
    </div>
  );
}
