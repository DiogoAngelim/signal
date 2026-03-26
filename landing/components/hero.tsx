import { ArrowRight, Book, Copy, Terminal } from "lucide-react";
import { NeuralIllustration } from "./neural-illustration";

export function Hero() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-20">
      {/* Texture overlay */}
      <div className="absolute inset-0 noise-texture" />

      {/* Gradient mesh background */}
      <div className="absolute inset-0" />

      {/* Ambient glow spots */}
      <div className="absolute top-1/3 left-1/4 w-[400px] h-[400px] bg-[radial-gradient(circle,rgba(223,114,71,0.09)_0%,transparent_60%)] blur-2xl animate-pulse-glow" />
      <div className="absolute bottom-1/4 right-1/3 w-[300px] h-[300px] bg-[radial-gradient(circle,rgba(39,102,166,0.12)_0%,transparent_60%)] blur-2xl animate-pulse-glow" style={{ animationDelay: "3s" }} />

      <div className="relative z-10 mx-auto max-w-7xl px-6 py-20">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left content */}
          <div className="text-center lg:text-left">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-card/60 border border-border/50 backdrop-blur-sm mb-8 inner-glow">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
              </span>
              <span className="text-sm text-muted-foreground">Signal Protocol v1</span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight tracking-tight text-balance">
              <span className="text-foreground">A transport-agnostic application protocol for </span>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-secondary to-accent">
                queries, mutations, and events
              </span>
            </h1>

            <p className="mt-6 text-lg text-muted-foreground max-w-xl mx-auto lg:mx-0 text-pretty leading-relaxed">
              Signal defines the envelope, naming rules, result model,
              idempotency behavior, and binding surface for application
              messages. It is designed for real flows like payment capture,
              escrow release, user onboarding, and read-model queries. The Node
              reference runtime shows one way to implement the contract.
            </p>

            <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
              <a
                href="#use-cases"
                className="group inline-flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-primary via-secondary to-accent text-white font-semibold rounded-lg hover:opacity-90 transition-all glow-amber"
              >
                Explore use cases
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </a>
              <a
                href="https://github.com/DiogoAngelim/signal"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 border border-border/60 bg-card/40 backdrop-blur-sm text-foreground font-semibold rounded-lg hover:bg-card/70 hover:border-brain-core-glow/50 transition-all"
              > <Book> </Book>
                View the Repository
              </a>
            </div>

            <div className="mt-8 flex flex-wrap justify-center lg:justify-start gap-2 text-xs text-muted-foreground">
              <span className="px-3 py-1 rounded-full bg-card/60 border border-border/50 backdrop-blur-sm">
                Payment capture
              </span>
              <span className="px-3 py-1 rounded-full bg-card/60 border border-border/50 backdrop-blur-sm">
                Escrow release
              </span>
              <span className="px-3 py-1 rounded-full bg-card/60 border border-border/50 backdrop-blur-sm">
                User onboarding
              </span>
              <span className="px-3 py-1 rounded-full bg-card/60 border border-border/50 backdrop-blur-sm">
                Read-model queries
              </span>
            </div>

            {/* Install command */}
            <div className="mt-10 inline-flex items-center gap-3 px-4 py-3 rounded-lg bg-card/60 border border-border/50 backdrop-blur-sm font-mono text-sm inner-glow">
              <Terminal className="w-4 h-4 text-primary" />
              <code className="text-muted-foreground">
                pnpm add <span className="text-foreground">@signal/sdk-node</span>{" "}
                <span className="text-muted-foreground"># reference runtime</span>
              </code>
              <button
                className="ml-2 text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Copy install command"
              >
                <Copy className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Right - Abstract Neural Illustration */}
          <div className="relative flex items-center justify-center">
            <NeuralIllustration />
          </div>
        </div>
      </div>
    </section>
  );
}
