import { DocsRoutePage } from "@/components/docs-route-page";

export default function IntroductionPage() {
  return (
    <DocsRoutePage
      eyebrow="Docs / Introduction"
      title="Introduction"
      summary="Signal is a transport-agnostic application protocol for versioned queries, explicit mutations, and immutable events."
      canonicalHref="https://diogoangelim.github.io/signal/docs/introduction"
      primaryLabel="Open the envelope reference"
      primaryHref="/docs/reference/envelope"
    >
      <ul className="space-y-2 text-sm leading-6 text-muted-foreground">
        <li>Queries are read-only.</li>
        <li>Mutations declare idempotency.</li>
        <li>Events are immutable facts.</li>
      </ul>
    </DocsRoutePage>
  );
}
