import { Architecture } from "@/components/architecture";
import { CodeExample } from "@/components/code-example";
import { CosmicBackground } from "@/components/cosmic-background";
import { CTA } from "@/components/cta";
import { Deployment } from "@/components/deployment";
import { Features } from "@/components/features";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { Hero } from "@/components/hero";

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
