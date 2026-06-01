import { DocsRoutePage } from "@/components/docs-route-page";

export default function IntroductionPage() {
  return (
    <DocsRoutePage
      eyebrow="Docs / Introduction"
      title="What Is Signal?"
      summary="Signal helps teams understand what is happening across a workflow before they ask the system to act again."
      canonicalHref="https://diogoangelim.github.io/signal/docs/what-is-signal"
      primaryLabel="Open quick start"
      primaryHref="/docs/start/quick-start"
    >
      <ul className="space-y-2 text-sm leading-6 text-muted-foreground">
        <li>Queries observe current state.</li>
        <li>Mutations describe durable changes.</li>
        <li>Events preserve facts for later readers.</li>
      </ul>
    </DocsRoutePage>
  );
}
