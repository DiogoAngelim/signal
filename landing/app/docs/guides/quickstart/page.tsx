import { DocsRoutePage } from "@/components/docs-route-page";

export default function QuickstartPage() {
  return (
    <DocsRoutePage
      eyebrow="Docs / Guides"
      title="Quickstart"
      summary="Install the workspace, start the reference server, and send a query or mutation against the HTTP binding."
      canonicalHref="https://diogoangelim.github.io/signal/docs/guides/quickstart"
      primaryLabel="Open the HTTP binding guide"
      primaryHref="https://diogoangelim.github.io/signal/docs/guides/http-binding"
    >
      <pre className="overflow-x-auto rounded-2xl border border-white/10 bg-black/20 p-4 text-xs leading-6 text-foreground">
        <code>{`pnpm install
pnpm build
pnpm --filter @signal/reference-server start`}</code>
      </pre>
    </DocsRoutePage>
  );
}
