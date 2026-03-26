import { DocsRoutePage } from "@/components/docs-route-page";

export default function EnvelopePage() {
  return (
    <DocsRoutePage
      eyebrow="Docs / Reference"
      title="Envelope"
      summary="Every Signal message uses the same normalized envelope with protocol, kind, name, messageId, timestamp, and payload."
      canonicalHref="https://diogoangelim.github.io/signal/docs/reference/envelope"
      primaryLabel="Open capabilities"
      primaryHref="https://diogoangelim.github.io/signal/docs/reference/capabilities"
    >
      <pre className="overflow-x-auto rounded-2xl border border-white/10 bg-black/20 p-4 text-xs leading-6 text-foreground">
        <code>{`{
  "protocol": "signal.v1",
  "kind": "mutation",
  "name": "payment.capture.v1",
  "messageId": "…",
  "timestamp": "…",
  "payload": {}
}`}</code>
      </pre>
    </DocsRoutePage>
  );
}
