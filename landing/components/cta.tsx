import { ArrowRight, Github, BookOpen, Zap } from "lucide-react";

export function CTA() {
  return (
    <section className="relative py-32">
      {/* Background */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-gradient-to-r from-primary/20 via-accent/10 to-primary/20 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto max-w-4xl px-6 text-center">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-primary to-accent mb-8 glow-amber">
          <Zap className="w-10 h-10 text-background" />
        </div>

        <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-balance">
          Ready to build{" "}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent">
            production-grade
          </span>{" "}
          backends?
        </h2>

        <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto text-pretty">
          Join developers who are shipping faster with Signal. Explicit,
          deterministic, and built for the serverless era.
        </p>

        <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
          <a
            href="https://github.com/DiogoAngelim/signal"
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex items-center justify-center gap-2 px-8 py-4 bg-gradient-to-r from-primary to-accent text-background font-semibold rounded-xl hover:opacity-90 transition-all glow-amber"
          >
            <Github className="w-5 h-5" />
            Star on GitHub
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </a>
          <a
            href="https://github.com/DiogoAngelim/signal#-quick-start"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 px-8 py-4 border border-border bg-card/50 text-foreground font-semibold rounded-xl hover:bg-card hover:border-muted-foreground/30 transition-all"
          >
            <BookOpen className="w-5 h-5" />
            Read the Docs
          </a>
        </div>
      </div>
    </section>
  );
}
