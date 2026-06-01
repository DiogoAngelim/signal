import { DocsRoutePage } from "@/components/docs-route-page";

export default function EnvelopePage() {
  return (
    <DocsRoutePage
      eyebrow="Docs / Reference"
      title="Protocol"
      summary="Every Signal message is a named, versioned envelope with a payload and optional context."
      canonicalHref="https://diogoangelim.github.io/signal/docs/reference/protocol"
      primaryLabel="Open API reference"
      primaryHref="/docs/reference/api"
    >
      <pre className="overflow-x-auto rounded-2xl border border-white/10 bg-black/20 p-4 text-xs leading-6 text-foreground">
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
