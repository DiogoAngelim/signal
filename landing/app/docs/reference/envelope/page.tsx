import { DocsRoutePage } from "@/components/docs-route-page";

export default function EnvelopePage() {
  return (
    <DocsRoutePage
      eyebrow="Docs / Reference"
      title="Protocol"
      summary="Every Signal message keeps intent, payload, and context visible enough to explain later."
      canonicalHref="https://diogoangelim.github.io/signal/docs/reference/protocol"
      primaryLabel="Open API reference"
      primaryHref="/docs/reference/api"
    >
      <pre className="overflow-x-auto rounded-lg border border-border bg-muted p-4 text-xs leading-6 text-foreground">
        <code>{`{
  "protocol": "signal.v1",
  "kind": "query",
  "name": "note.get.v1",
  "payload": {}
}`}</code>
      </pre>
    </DocsRoutePage>
  );
}
