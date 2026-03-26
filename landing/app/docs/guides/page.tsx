import { DocsRoutePage } from "@/components/docs-route-page";

export default function GuidesIndexPage() {
  return (
    <DocsRoutePage
      eyebrow="Docs / Guides"
      title="Guides"
      summary="The guide routes exist on the landing site so they do not 404. Each one points to the canonical docs page and keeps the public surface consistent."
      canonicalHref="https://diogoangelim.github.io/signal/docs/guides/quickstart"
      primaryLabel="Open quickstart"
      primaryHref="/docs/guides/quickstart"
    >
      <ul className="space-y-2 text-sm leading-6 text-muted-foreground">
        <li>Quickstart</li>
        <li>Define your first query</li>
        <li>Define your first mutation</li>
        <li>Emit and consume events</li>
      </ul>
    </DocsRoutePage>
  );
}
