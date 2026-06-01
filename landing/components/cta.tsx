import { ArrowRight, BookOpen, GitBranch } from "lucide-react";

export function CTA() {
  return (
    <section className="border-t border-border bg-muted py-20">
      <div className="mx-auto flex max-w-7xl flex-col gap-8 px-6 sm:px-8 lg:flex-row lg:items-end lg:justify-between lg:px-12">
        <div className="max-w-3xl">
          <p className="text-sm font-medium uppercase tracking-normal text-muted-foreground">
            Next step
          </p>
          <h2 className="mt-3 text-3xl font-semibold leading-tight tracking-normal text-foreground sm:text-4xl">
            Start with one understandable workflow.
          </h2>
          <p className="mt-4 text-base leading-7 text-muted-foreground">
            Run the reference path, inspect the returned result, and decide
            whether Signal makes the situation easier for your team to explain.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row lg:shrink-0">
          <a
            href="/docs/start/quick-start"
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <BookOpen className="h-4 w-4" />
            Quick start
            <ArrowRight className="h-4 w-4" />
          </a>
          <a
            href="https://github.com/DiogoAngelim/signal"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-border bg-card px-5 py-3 text-sm font-semibold text-foreground transition-colors hover:border-primary/50"
          >
            <GitBranch className="h-4 w-4" />
            Repository
          </a>
        </div>
      </div>
    </section>
  );
}
