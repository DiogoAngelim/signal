import { DocsRoutePage } from "@/components/docs-route-page";

export default function ReferenceIndexPage() {
  return (
    <DocsRoutePage
      eyebrow="Docs / Reference"
      title="Reference"
      summary="Find the packages, functions, protocol fields, and errors most Signal apps use."
      canonicalHref="https://diogoangelim.github.io/signal/docs/reference/api"
      primaryLabel="Open API reference"
      primaryHref="/docs/reference/api"
    >
      <ul className="space-y-2 text-sm leading-6 text-muted-foreground">
        <li>API</li>
        <li>Protocol</li>
        <li>Errors</li>
      </ul>
    </DocsRoutePage>
  );
}
