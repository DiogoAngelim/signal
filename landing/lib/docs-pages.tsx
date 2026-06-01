import type { ReactNode } from "react";

export type DocsPageEntry = {
  slug: string[];
  eyebrow: string;
  title: string;
  summary: string;
  primaryLabel: string;
  primaryHref: string;
  canonicalHref: string;
  body?: ReactNode;
};

function bullets(items: string[]) {
  return (
    <ul className="space-y-2 text-sm leading-6 text-muted-foreground">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

function codeBlock(code: string) {
  return (
    <pre className="overflow-x-auto rounded-lg border border-border bg-muted p-4 text-xs leading-6 text-foreground">
      <code>{code}</code>
    </pre>
  );
}

export const docsPages: DocsPageEntry[] = [
  {
    slug: ["what-is-signal"],
    eyebrow: "Docs / Start",
    title: "What Is Signal?",
    summary:
      "Signal helps teams understand operational workflows by separating what reads, what changes, and what happened.",
    primaryLabel: "Open quick start",
    primaryHref: "/docs/start/quick-start",
    canonicalHref: "https://diogoangelim.github.io/signal/docs/what-is-signal",
    body: bullets([
      "Queries observe current state.",
      "Mutations describe intentional changes.",
      "Events preserve facts that other systems may need later.",
    ]),
  },
  {
    slug: ["start", "quick-start"],
    eyebrow: "Docs / Start",
    title: "Quick Start",
    summary:
      "Run one small workflow first, then inspect the result and the emitted facts.",
    primaryLabel: "Build first app",
    primaryHref: "/docs/build/first-app",
    canonicalHref:
      "https://diogoangelim.github.io/signal/docs/start/quick-start",
    body: codeBlock(`pnpm install
pnpm --filter @signal/reference-server... build
pnpm --filter @signal/reference-server start`),
  },
  {
    slug: ["build", "first-app"],
    eyebrow: "Docs / Build",
    title: "Build Your First App",
    summary:
      "Register one read, one change, and one fact before expanding the surface area.",
    primaryLabel: "Open HTTP server",
    primaryHref: "/docs/build/http-server",
    canonicalHref: "https://diogoangelim.github.io/signal/docs/build/first-app",
    body: bullets([
      "Use `defineQuery` when the caller only needs to understand state.",
      "Use `defineMutation` when the caller intends a durable change.",
      "Use `defineEvent` when other systems need a fact to remain visible.",
    ]),
  },
  {
    slug: ["build", "http-server"],
    eyebrow: "Docs / Build",
    title: "HTTP Server",
    summary:
      "Expose the same understanding layer through HTTP without changing operation handlers.",
    primaryLabel: "Open examples",
    primaryHref: "/docs/examples/runnable-examples",
    canonicalHref:
      "https://diogoangelim.github.io/signal/docs/build/http-server",
    body: codeBlock(`GET  /signal/capabilities
POST /signal/query/:name
POST /signal/mutation/:name`),
  },
  {
    slug: ["examples", "runnable-examples"],
    eyebrow: "Docs / Examples",
    title: "Runnable Examples",
    summary:
      "Run the examples before adopting the protocol inside a production workflow.",
    primaryLabel: "Core ideas",
    primaryHref: "/docs/understand/core-ideas",
    canonicalHref:
      "https://diogoangelim.github.io/signal/docs/examples/runnable-examples",
    body: codeBlock(`pnpm --filter @signal/examples... build
pnpm --filter @signal/examples minimal-runtime
pnpm --filter @signal/examples post-publication`),
  },
  {
    slug: ["understand", "core-ideas"],
    eyebrow: "Docs / Understand",
    title: "Core Ideas",
    summary:
      "Understand the four ideas that keep Signal readable before the implementation details appear.",
    primaryLabel: "Architecture",
    primaryHref: "/docs/understand/architecture",
    canonicalHref:
      "https://diogoangelim.github.io/signal/docs/understand/core-ideas",
    body: bullets([
      "Queries should make state visible without changing it.",
      "Mutations can require idempotency so retries remain understandable.",
      "Events should be safe for consumers that need to replay facts.",
    ]),
  },
  {
    slug: ["understand", "architecture"],
    eyebrow: "Docs / Understand",
    title: "Architecture",
    summary:
      "Application to Source to Signal to Runtime to Action to Adapter to Result, kept in that order for clarity.",
    primaryLabel: "API reference",
    primaryHref: "/docs/reference/api",
    canonicalHref:
      "https://diogoangelim.github.io/signal/docs/understand/architecture",
    body: bullets([
      "The runtime executes registered operations.",
      "Adapters expose the runtime through transports.",
      "Results are structured and predictable.",
    ]),
  },
  {
    slug: ["reference", "api"],
    eyebrow: "Docs / Reference",
    title: "API Reference",
    summary:
      "Find the packages and functions most teams need after the situation is clear.",
    primaryLabel: "Protocol reference",
    primaryHref: "/docs/reference/protocol",
    canonicalHref: "https://diogoangelim.github.io/signal/docs/reference/api",
    body: bullets([
      "`@signal/sdk-node` defines operations.",
      "`@signal/runtime` executes operations.",
      "`@signal/binding-http` exposes HTTP routes.",
    ]),
  },
  {
    slug: ["reference", "protocol"],
    eyebrow: "Docs / Reference",
    title: "Protocol Reference",
    summary:
      "A Signal message is a named, versioned envelope that preserves intent and context.",
    primaryLabel: "Errors",
    primaryHref: "/docs/reference/errors",
    canonicalHref:
      "https://diogoangelim.github.io/signal/docs/reference/protocol",
    body: codeBlock(`{
  "protocol": "signal.v1",
  "kind": "query",
  "name": "note.get.v1",
  "payload": {}
}`),
  },
  {
    slug: ["reference", "errors"],
    eyebrow: "Docs / Reference",
    title: "Errors",
    summary:
      "Signal failures return stable codes, categories, messages, and retry hints so failures can be explained.",
    primaryLabel: "Repository map",
    primaryHref: "/docs/contribute/repository-map",
    canonicalHref:
      "https://diogoangelim.github.io/signal/docs/reference/errors",
    body: bullets([
      "`VALIDATION_ERROR` means the request shape is wrong.",
      "`IDEMPOTENCY_CONFLICT` means a key was reused with different input.",
      "`UNSUPPORTED_OPERATION` means no operation matched the name.",
    ]),
  },
  {
    slug: ["contribute", "repository-map"],
    eyebrow: "Docs / Contribute",
    title: "Repository Map",
    summary:
      "See what is public, what is compatibility code, and where changes can be made with context.",
    primaryLabel: "Start again",
    primaryHref: "/docs/what-is-signal",
    canonicalHref:
      "https://diogoangelim.github.io/signal/docs/contribute/repository-map",
    body: bullets([
      "Public Signal code lives in `packages/protocol`, `runtime`, `sdk-node`, and adapters.",
      "The beginner server lives in `apps/reference-server`.",
      "Uncertain legacy and compatibility code was kept.",
    ]),
  },
];

export function findDocsPage(slug: string[]) {
  const path = slug.join("/");
  return docsPages.find((entry) => entry.slug.join("/") === path);
}
