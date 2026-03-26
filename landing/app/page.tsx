import { Header } from "@/components/header";
import { Hero } from "@/components/hero";
import { Features } from "@/components/features";
import { CodeExample } from "@/components/code-example";
import { Deployment } from "@/components/deployment";
import { Architecture } from "@/components/architecture";
import { CTA } from "@/components/cta";
import { Footer } from "@/components/footer";
import { CosmicBackground } from "@/components/cosmic-background";

export default function HomePage() {
  return (
    <div className="relative min-h-screen bg-background overflow-hidden">
      <CosmicBackground />
      <Header />
      <main>
        <Hero />
        <Features />
        <CodeExample />
        <Deployment />
        <Architecture />
        <CTA />
      </main>
      <Footer />
    </div>
  );
}
