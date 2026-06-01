import { DocsRoutePage } from "@/components/docs-route-page";

export default function GuidesIndexPage() {
  return (
    <DocsRoutePage
      eyebrow="Docs / Guides"
      title="Start"
      summary="Run Signal first, then build your first app."
      canonicalHref="https://diogoangelim.github.io/signal/docs/start/quick-start"
      primaryLabel="Open quick start"
      primaryHref="/docs/start/quick-start"
    >
      <ul className="space-y-2 text-sm leading-6 text-muted-foreground">
        <li>Quick Start</li>
        <li>Build Your First App</li>
        <li>HTTP Server</li>
      </ul>
    </DocsRoutePage>
  );
}
