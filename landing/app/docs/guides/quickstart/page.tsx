import { DocsRoutePage } from "@/components/docs-route-page";

export default function QuickstartPage() {
  return (
    <DocsRoutePage
      eyebrow="Docs / Guides"
      title="Quick Start"
      summary="Start the reference server, run one small workflow, and inspect what happened."
      canonicalHref="https://diogoangelim.github.io/signal/docs/start/quick-start"
      primaryLabel="Build your first app"
      primaryHref="/docs/build/first-app"
    >
      <pre className="overflow-x-auto rounded-lg border border-border bg-muted p-4 text-xs leading-6 text-foreground">
        <code>{`pnpm install
pnpm --filter @signal/reference-server... build
pnpm --filter @signal/reference-server start`}</code>
      </pre>
    </DocsRoutePage>
  );
}
