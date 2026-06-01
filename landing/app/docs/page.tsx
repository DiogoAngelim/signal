import { DocsRoutePage } from "@/components/docs-route-page";

export default function DocsHomePage() {
  return (
    <DocsRoutePage
      eyebrow="Docs"
      title="Signal docs"
      summary="Start with the current understanding, then run one small workflow and inspect the evidence."
      canonicalHref="https://diogoangelim.github.io/signal/docs/what-is-signal"
      primaryLabel="Start here"
      primaryHref="/docs/what-is-signal"
    >
      <ul className="space-y-2 text-sm leading-6 text-muted-foreground">
        <li>What Signal helps you understand</li>
        <li>How to run a first workflow</li>
        <li>Where the implementation details live</li>
      </ul>
    </DocsRoutePage>
  );
}
