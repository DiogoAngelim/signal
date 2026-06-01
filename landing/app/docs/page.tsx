import { DocsRoutePage } from "@/components/docs-route-page";

export default function DocsHomePage() {
  return (
    <DocsRoutePage
      eyebrow="Docs"
      title="Signal docs"
      summary="Start with What Is Signal?, then run the Quick Start, then build your first app."
      canonicalHref="https://diogoangelim.github.io/signal/docs/what-is-signal"
      primaryLabel="Start here"
      primaryHref="/docs/what-is-signal"
    >
      <ul className="space-y-2 text-sm leading-6 text-muted-foreground">
        <li>What Is Signal?</li>
        <li>Quick Start</li>
        <li>Build Your First App</li>
      </ul>
    </DocsRoutePage>
  );
}
