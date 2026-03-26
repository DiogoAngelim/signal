import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";

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
      <div className="signal-grid absolute inset-0 opacity-70" />
      <div className="relative z-10 mx-auto flex min-h-screen max-w-4xl flex-col px-6 py-10">
        <header className="flex items-center justify-between gap-6 border-b border-white/8 pb-6">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.35em] text-muted-foreground">
              {eyebrow}
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              {title}
            </h1>
          </div>
          <Link
            href="/"
            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
          >
            Home
          </Link>
        </header>

        <section className="grid flex-1 gap-8 py-10 lg:grid-cols-[1.4fr_0.6fr]">
          <div className="space-y-6">
            <p className="max-w-2xl text-lg leading-8 text-muted-foreground">{summary}</p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <a
                href={canonicalHref}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-semibold text-background transition-transform hover:-translate-y-0.5"
              >
                Open the docs site
                <ArrowRight className="h-4 w-4" />
              </a>
              <a
                href={primaryHref}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-white/10"
              >
                {primaryLabel}
              </a>
            </div>
          </div>

          <aside className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur">
            <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
              Canonical
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
