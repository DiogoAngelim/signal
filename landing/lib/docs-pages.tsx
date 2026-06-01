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
    <pre className="overflow-x-auto rounded-2xl border border-white/10 bg-black/20 p-4 text-xs leading-6 text-foreground">
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
      "Signal helps applications communicate through Queries, Mutations, and Events using a predictable protocol.",
    primaryLabel: "Open quick start",
    primaryHref: "/docs/start/quick-start",
    canonicalHref: "https://diogoangelim.github.io/signal/docs/what-is-signal",
    body: bullets([
      "Queries ask for data.",
      "Mutations change data.",
      "Events announce facts.",
    ]),
  },
  {
    slug: ["start", "quick-start"],
    eyebrow: "Docs / Start",
    title: "Quick Start",
    summary:
      "Install dependencies, start the reference server, send one Query, publish one Event, and observe it.",
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
      "Register one Query, one Mutation, and one Event with the Node SDK.",
    primaryLabel: "Open HTTP server",
    primaryHref: "/docs/build/http-server",
    canonicalHref: "https://diogoangelim.github.io/signal/docs/build/first-app",
    body: bullets([
      "Use `defineQuery` for reads.",
      "Use `defineMutation` for writes.",
      "Use `defineEvent` for facts.",
    ]),
  },
  {
    slug: ["build", "http-server"],
    eyebrow: "Docs / Build",
    title: "HTTP Server",
    summary:
      "Expose a Signal runtime through HTTP without changing your operation handlers.",
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
      "Run the packaged examples to see Signal behavior before building your own app.",
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
      "Understand Queries, Mutations, Events, and Capabilities after you have seen Signal run.",
    primaryLabel: "Architecture",
    primaryHref: "/docs/understand/architecture",
    canonicalHref:
      "https://diogoangelim.github.io/signal/docs/understand/core-ideas",
    body: bullets([
      "Queries should not change state.",
      "Mutations can require idempotency.",
      "Events should be safe for replay-aware consumers.",
    ]),
  },
  {
    slug: ["understand", "architecture"],
    eyebrow: "Docs / Understand",
    title: "Architecture",
    summary:
      "Application to Source to Signal to Runtime to Action to Adapter to Result.",
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
    summary: "Find the packages and functions most apps use first.",
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
      "A Signal message is a named, versioned envelope with a payload and optional context.",
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
      "Signal failures return stable codes, categories, messages, and retry hints.",
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
      "See what is public, what is compatibility code, what was removed, and where to contribute safely.",
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
