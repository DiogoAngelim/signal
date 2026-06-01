import { DocsRoutePage } from "@/components/docs-route-page";

export default function ReferenceIndexPage() {
  return (
    <DocsRoutePage
      eyebrow="Docs / Reference"
      title="Reference"
      summary="Find packages, functions, protocol fields, and errors after the workflow is clear."
      canonicalHref="https://diogoangelim.github.io/signal/docs/reference/api"
      primaryLabel="Open API reference"
      primaryHref="/docs/reference/api"
    >
      <ul className="space-y-2 text-sm leading-6 text-muted-foreground">
        <li>Public API surface</li>
        <li>Protocol envelope</li>
        <li>Failure language</li>
      </ul>
    </DocsRoutePage>
  );
}
