import { DocsRoutePage } from "@/components/docs-route-page";

export default function IntroductionPage() {
  return (
    <DocsRoutePage
      eyebrow="Docs / Introduction"
      title="What Is Signal?"
      summary="Signal helps applications communicate through Queries, Mutations, and Events using a predictable protocol."
      canonicalHref="https://diogoangelim.github.io/signal/docs/what-is-signal"
      primaryLabel="Open quick start"
      primaryHref="/docs/start/quick-start"
    >
      <ul className="space-y-2 text-sm leading-6 text-muted-foreground">
        <li>Queries ask for data.</li>
        <li>Mutations change data.</li>
        <li>Events announce facts.</li>
      </ul>
    </DocsRoutePage>
  );
}
