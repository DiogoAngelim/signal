import { DocsRoutePage } from "@/components/docs-route-page";

export default function DocsHomePage() {
  return (
    <DocsRoutePage
      eyebrow="Docs"
      title="Signal docs"
      summary="This route exists so links from the landing site resolve locally. The full protocol documentation lives in the Docusaurus docs site."
      canonicalHref="https://diogoangelim.github.io/signal/docs/introduction"
      primaryLabel="Read introduction"
      primaryHref="/docs/introduction"
    >
      <ul className="space-y-2 text-sm leading-6 text-muted-foreground">
        <li>Protocol overview and terms.</li>
        <li>Envelope, result, and error references.</li>
        <li>Guides for quickstart and bindings.</li>
      </ul>
    </DocsRoutePage>
  );
}
