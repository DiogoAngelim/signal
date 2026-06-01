import { DocsRoutePage } from "@/components/docs-route-page";

export default function QuickstartPage() {
  return (
    <DocsRoutePage
      eyebrow="Docs / Guides"
      title="Quick Start"
      summary="Install dependencies, start the reference server, send one Query, publish one Event, and observe it."
      canonicalHref="https://diogoangelim.github.io/signal/docs/start/quick-start"
      primaryLabel="Build your first app"
      primaryHref="/docs/build/first-app"
    >
      <pre className="overflow-x-auto rounded-2xl border border-white/10 bg-black/20 p-4 text-xs leading-6 text-foreground">
        <code>{`pnpm install
pnpm --filter @signal/reference-server... build
pnpm --filter @signal/reference-server start`}</code>
      </pre>
    </DocsRoutePage>
  );
}
