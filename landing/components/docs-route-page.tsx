import { ArrowRight, Home } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

type DocsRoutePageProps = {
  eyebrow: string;
  title: string;
  summary: string;
  canonicalHref: string;
  primaryLabel: string;
  primaryHref: string;
  children?: ReactNode;
};

export function DocsRoutePage({
  eyebrow,
  title,
  summary,
  canonicalHref,
  primaryLabel,
  primaryHref,
  children,
}: DocsRoutePageProps) {
  return (
    <main className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div className="signal-grid absolute inset-0" />
      <div className="relative mx-auto flex min-h-screen max-w-5xl flex-col px-6 py-10 sm:px-8">
        <header className="flex items-center justify-between gap-6 border-b border-border pb-6">
          <div>
            <p className="text-sm font-medium uppercase tracking-normal text-muted-foreground">
              {eyebrow}
            </p>
            <h1 className="mt-3 text-4xl font-semibold leading-tight tracking-normal text-foreground">
              {title}
            </h1>
          </div>
          <Link
            href="/"
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:border-primary/50"
          >
            <Home className="h-4 w-4" />
            Home
          </Link>
        </header>

        <section className="grid flex-1 gap-8 py-10 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-6">
            <p className="max-w-2xl text-xl leading-8 text-foreground">
              {summary}
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <a
                href={canonicalHref}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Open docs site
                <ArrowRight className="h-4 w-4" />
              </a>
              <a
                href={primaryHref}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-border bg-card px-5 py-3 text-sm font-semibold text-foreground transition-colors hover:border-primary/50"
              >
                {primaryLabel}
              </a>
            </div>
          </div>

          <aside className="rounded-lg border border-border bg-card p-6">
            <p className="text-sm font-medium uppercase tracking-normal text-muted-foreground">
              Evidence path
            </p>
            <p className="mt-3 break-all text-sm leading-6 text-muted-foreground">
              {canonicalHref}
            </p>
            {children ? <div className="mt-6">{children}</div> : null}
          </aside>
        </section>
      </div>
    </main>
  );
}
