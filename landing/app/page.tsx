import { Header } from "@/components/header";
import { Hero } from "@/components/hero";
import { Features } from "@/components/features";
import { CodeExample } from "@/components/code-example";
import { Architecture } from "@/components/architecture";
import { Deployment } from "@/components/deployment";
import { CTA } from "@/components/cta";
import { Footer } from "@/components/footer";
import { StarField } from "@/components/star-field";

export default function HomePage() {
  return (
    <div className="relative min-h-screen bg-background overflow-hidden">
      <StarField />
      <Header />
      <main>
        <Hero />
        <Features />
        <CodeExample />
        <Architecture />
        <Deployment />
        <CTA />
      </main>
      <Footer />
    </div>
  );
}
