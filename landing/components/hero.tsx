import Image from "next/image";
import { ArrowRight, Copy, Terminal } from "lucide-react";

export function Hero() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-20">
      {/* Background gradient orbs */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-[600px] h-[600px] bg-primary/10 rounded-full blur-3xl animate-pulse-glow" />
        <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-secondary/20 rounded-full blur-3xl animate-pulse-glow" style={{ animationDelay: "2s" }} />
      </div>

      <div className="relative z-10 mx-auto max-w-7xl px-6 py-20">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left content */}
          <div className="text-center lg:text-left">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-muted border border-border mb-8">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
              </span>
              <span className="text-sm text-muted-foreground">
                Production-ready v1.0
              </span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight tracking-tight text-balance">
              <span className="text-foreground">Backend framework for the </span>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-accent to-primary glow-text">
                serverless era
              </span>
            </h1>

            <p className="mt-6 text-lg text-muted-foreground max-w-xl mx-auto lg:mx-0 text-pretty">
              Meteor-like developer experience redesigned for stateless, serverless, 
              database-agnostic environments. No magic, no long-lived connections - 
              just explicit, deterministic backend code.
            </p>

            <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
              <a
                href="#code"
                className="group inline-flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-primary to-accent text-background font-semibold rounded-lg hover:opacity-90 transition-all glow-amber"
              >
                Get Started
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </a>
              <a
                href="https://github.com/DiogoAngelim/signal"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 border border-border bg-card/50 text-foreground font-semibold rounded-lg hover:bg-card hover:border-muted-foreground/30 transition-all"
              >
                View on GitHub
              </a>
            </div>

            {/* Install command */}
            <div className="mt-10 inline-flex items-center gap-3 px-4 py-3 rounded-lg bg-card border border-border font-mono text-sm">
              <Terminal className="w-4 h-4 text-primary" />
              <code className="text-muted-foreground">
                npm install <span className="text-foreground">@digelo/signal</span>
              </code>
              <button
                className="ml-2 text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Copy install command"
              >
                <Copy className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Right - Hero image */}
          <div className="relative flex items-center justify-center">
            <div className="relative w-full max-w-lg aspect-square">
              {/* Glow behind image */}
              <div className="absolute inset-0 bg-gradient-to-br from-primary/30 via-transparent to-secondary/30 rounded-full blur-3xl" />
              
              <Image
                src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/image-QzvFGVrQe6Hro7ph68q05FJXGr9McO.png"
                alt="Signal - Neural network visualization representing intelligent backend framework"
                fill
                className="object-contain"
                priority
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
