import { CircleDot, GitBranch } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t border-border bg-background py-10">
      <div className="mx-auto flex max-w-7xl flex-col gap-5 px-6 text-sm text-muted-foreground sm:px-8 md:flex-row md:items-center md:justify-between lg:px-12">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card text-primary">
            <CircleDot className="h-4 w-4" />
          </span>
          <span className="font-semibold text-foreground">Signal</span>
          <span>Protocol v1</span>
        </div>

        <div className="flex flex-wrap items-center gap-5">
          <a
            href="/docs/what-is-signal"
            className="transition-colors hover:text-foreground"
          >
            Docs
          </a>
          <a
            href="https://github.com/DiogoAngelim/signal"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 transition-colors hover:text-foreground"
          >
            <GitBranch className="h-4 w-4" />
            GitHub
          </a>
          <span>Maintained by Diogo Angelim</span>
        </div>
      </div>
    </footer>
  );
}
