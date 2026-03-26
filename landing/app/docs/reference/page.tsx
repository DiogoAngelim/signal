import { DocsRoutePage } from "@/components/docs-route-page";

export default function ReferenceIndexPage() {
  return (
    <DocsRoutePage
      eyebrow="Docs / Reference"
      title="Reference"
      summary="The reference section covers the envelope, capabilities, errors, and conformance guidance for Signal v1."
      canonicalHref="https://diogoangelim.github.io/signal/docs/reference/envelope"
      primaryLabel="Open the envelope reference"
      primaryHref="/docs/reference/envelope"
    >
      <ul className="space-y-2 text-sm leading-6 text-muted-foreground">
        <li>Envelope</li>
        <li>Capabilities</li>
        <li>Errors</li>
        <li>Conformance</li>
      </ul>
    </DocsRoutePage>
  );
}
