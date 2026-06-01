import { DocsRoutePage } from "@/components/docs-route-page";

export default function GuidesIndexPage() {
  return (
    <DocsRoutePage
      eyebrow="Docs / Guides"
      title="Start"
      summary="Run Signal first, then decide whether the returned result makes the workflow easier to explain."
      canonicalHref="https://diogoangelim.github.io/signal/docs/start/quick-start"
      primaryLabel="Open quick start"
      primaryHref="/docs/start/quick-start"
    >
      <ul className="space-y-2 text-sm leading-6 text-muted-foreground">
        <li>Run one workflow</li>
        <li>Register one read, one change, and one fact</li>
        <li>Expose the same behavior over HTTP</li>
      </ul>
    </DocsRoutePage>
  );
}
