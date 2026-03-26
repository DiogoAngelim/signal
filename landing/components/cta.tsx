import { ArrowRight, BookOpen, Zap } from "lucide-react";

export function CTA() {
  return (
    <section className="relative py-32">
      {/* Background */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-gradient-to-r from-primary/20 via-secondary/10 to-accent/20 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto max-w-4xl px-6 text-center">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-primary via-secondary to-accent mb-8 glow-amber">
          <Zap className="w-10 h-10 text-white" />
        </div>

        <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-balance">
          Read the protocol,{" "}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-secondary to-accent">
            then run it locally
          </span>{" "}
          .
        </h2>

        <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto text-pretty">
          Start with the quickstart, inspect the envelope, and compare the
          reference runtime with your own implementation.
        </p>

        <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
          <a
            href="/docs/guides/quickstart"
            className="group inline-flex items-center justify-center gap-2 px-8 py-4 bg-gradient-to-r from-primary via-secondary to-accent text-white font-semibold rounded-xl hover:opacity-90 transition-all glow-amber"
          >
            <BookOpen className="w-5 h-5" />
            Quickstart
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </a>
          <a
            href="https://github.com/DiogoAngelim/signal"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 px-8 py-4 border border-border bg-card/50 text-foreground font-semibold rounded-xl hover:bg-card hover:border-muted-foreground/30 transition-all"
          >
            <BookOpen className="w-5 h-5" />
            Repository
          </a>
        </div>
      </div>
    </section>
  );
}
