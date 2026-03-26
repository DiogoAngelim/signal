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
    slug: ["concepts"],
    eyebrow: "Docs / Concepts",
    title: "Concepts",
    summary: "The core Signal concepts explain how queries, mutations, events, idempotency, versioning, and replay fit together.",
    primaryLabel: "Open queries",
    primaryHref: "/docs/concepts/queries",
    canonicalHref: "https://diogoangelim.github.io/signal/docs/concepts/queries",
    body: bullets([
      "Queries are read-only.",
      "Mutations may change state and may emit events.",
      "Events are immutable facts.",
    ]),
  },
  {
    slug: ["concepts", "queries"],
    eyebrow: "Docs / Concepts",
    title: "Queries",
    summary: "Queries are read-only operations. They must not change durable state and they must be safe to retry.",
    primaryLabel: "Open mutations",
    primaryHref: "/docs/concepts/mutations",
    canonicalHref: "https://diogoangelim.github.io/signal/docs/concepts/queries",
    body: bullets([
      "Return data without side effects.",
      "Do not emit domain events.",
      "Treat retries as equivalent requests.",
    ]),
  },
  {
    slug: ["concepts", "mutations"],
    eyebrow: "Docs / Concepts",
    title: "Mutations",
    summary: "Mutations are explicit state-changing commands. They may emit events and they must declare idempotency mode.",
    primaryLabel: "Open events",
    primaryHref: "/docs/concepts/events",
    canonicalHref: "https://diogoangelim.github.io/signal/docs/concepts/mutations",
    body: bullets([
      "Use versioned names.",
      "Declare required, optional, or none for idempotency.",
      "Return a structured success or error result.",
    ]),
  },
  {
    slug: ["concepts", "events"],
    eyebrow: "Docs / Concepts",
    title: "Events",
    summary: "Events are immutable facts. Consumers must tolerate duplicates and replay, and the protocol does not assume a global order.",
    primaryLabel: "Open idempotency",
    primaryHref: "/docs/concepts/idempotency",
    canonicalHref: "https://diogoangelim.github.io/signal/docs/concepts/events",
    body: bullets([
      "Use past tense where possible.",
      "Include correlation and causation where applicable.",
      "Keep consumers replay-safe.",
    ]),
  },
  {
    slug: ["concepts", "idempotency"],
    eyebrow: "Docs / Concepts",
    title: "Idempotency",
    summary: "Mutation retries use idempotency keys plus a normalized payload fingerprint to return the same logical result or a conflict.",
    primaryLabel: "Open versioning",
    primaryHref: "/docs/concepts/versioning",
    canonicalHref: "https://diogoangelim.github.io/signal/docs/concepts/idempotency",
    body: bullets([
      "same key + same payload => same logical result",
      "same key + different payload => conflict",
      "persist records durably for retry safety",
    ]),
  },
  {
    slug: ["concepts", "versioning"],
    eyebrow: "Docs / Concepts",
    title: "Versioning",
    summary: "Breaking changes require a new version suffix in the operation name.",
    primaryLabel: "Open order and replay",
    primaryHref: "/docs/concepts/order-and-replay",
    canonicalHref: "https://diogoangelim.github.io/signal/docs/concepts/versioning",
    body: bullets([
      "Use names like `payment.capture.v1`.",
      "Do not change a published contract in place.",
      "Treat version negotiation as explicit, not implicit.",
    ]),
  },
  {
    slug: ["concepts", "order-and-replay"],
    eyebrow: "Docs / Concepts",
    title: "Order and Replay",
    summary: "Signal does not promise global ordering. Consumers must process events so duplicates and replays are safe.",
    primaryLabel: "Open the envelope",
    primaryHref: "/docs/reference/envelope",
    canonicalHref: "https://diogoangelim.github.io/signal/docs/concepts/order-and-replay",
    body: bullets([
      "No implicit global sequence.",
      "Deduplicate at the consumer boundary when needed.",
      "Design handlers to tolerate repeated delivery.",
    ]),
  },
  {
    slug: ["reference", "envelope"],
    eyebrow: "Docs / Reference",
    title: "Envelope",
    summary: "The envelope normalizes every Signal message with required protocol fields and optional delivery, auth, context, and meta data.",
    primaryLabel: "Open capabilities",
    primaryHref: "/docs/reference/capabilities",
    canonicalHref: "https://diogoangelim.github.io/signal/docs/reference/envelope",
    body: codeBlock(`{
  "protocol": "signal.v1",
  "kind": "mutation",
  "name": "payment.capture.v1",
  "messageId": "…",
  "timestamp": "…",
  "payload": {}
}`),
  },
  {
    slug: ["reference", "capabilities"],
    eyebrow: "Docs / Reference",
    title: "Capabilities",
    summary: "A capability document declares supported queries, mutations, published events, subscribed events, and bindings.",
    primaryLabel: "Open errors",
    primaryHref: "/docs/reference/errors",
    canonicalHref: "https://diogoangelim.github.io/signal/docs/reference/capabilities",
    body: bullets([
      "Publish the supported surface at startup.",
      "Keep the document machine-readable.",
      "Do not hide operations behind transport-specific names.",
    ]),
  },
  {
    slug: ["reference", "errors"],
    eyebrow: "Docs / Reference",
    title: "Errors",
    summary: "Signal errors use a machine-readable code, a retryable flag when relevant, and structured detail that clients can inspect.",
    primaryLabel: "Open conformance",
    primaryHref: "/docs/reference/conformance",
    canonicalHref: "https://diogoangelim.github.io/signal/docs/reference/errors",
    body: bullets([
      "Use stable error codes.",
      "Mark retryable errors explicitly.",
      "Do not force clients to parse text messages.",
    ]),
  },
  {
    slug: ["reference", "conformance"],
    eyebrow: "Docs / Reference",
    title: "Conformance",
    summary: "Conformance explains what a Signal-compatible system must implement, what is optional, and what remains out of scope.",
    primaryLabel: "Open quickstart",
    primaryHref: "/docs/guides/quickstart",
    canonicalHref: "https://diogoangelim.github.io/signal/docs/reference/conformance",
    body: bullets([
      "Implement the core envelope and result model.",
      "Support the declared bindings.",
      "Keep optional storage and transport pieces separate.",
    ]),
  },
  {
    slug: ["guides", "define-your-first-query"],
    eyebrow: "Docs / Guides",
    title: "Define Your First Query",
    summary: "Register a read-only operation with an input schema and a result schema, then expose it through a binding.",
    primaryLabel: "Open mutation guide",
    primaryHref: "/docs/guides/define-your-first-mutation",
    canonicalHref: "https://diogoangelim.github.io/signal/docs/guides/define-your-first-query",
    body: bullets([
      "Choose a versioned name.",
      "Keep the handler side-effect free.",
      "Return a typed result shape.",
    ]),
  },
  {
    slug: ["guides", "define-your-first-mutation"],
    eyebrow: "Docs / Guides",
    title: "Define Your First Mutation",
    summary: "Register a state-changing command, declare idempotency, and emit events only after the write succeeds.",
    primaryLabel: "Open event guide",
    primaryHref: "/docs/guides/emit-and-consume-events",
    canonicalHref: "https://diogoangelim.github.io/signal/docs/guides/define-your-first-mutation",
    body: bullets([
      "Require an idempotency key when retries matter.",
      "Validate before writing.",
      "Emit events from the committed result.",
    ]),
  },
  {
    slug: ["guides", "emit-and-consume-events"],
    eyebrow: "Docs / Guides",
    title: "Emit and Consume Events",
    summary: "Emit immutable facts from mutations and consume them in a replay-safe way with duplicate tolerance.",
    primaryLabel: "Open HTTP binding guide",
    primaryHref: "/docs/guides/http-binding",
    canonicalHref: "https://diogoangelim.github.io/signal/docs/guides/emit-and-consume-events",
    body: bullets([
      "Publish event names in past tense where possible.",
      "Include correlation and causation identifiers.",
      "Treat duplicate delivery as normal.",
    ]),
  },
  {
    slug: ["guides", "http-binding"],
    eyebrow: "Docs / Guides",
    title: "HTTP Binding",
    summary: "Use the HTTP binding to execute queries and mutations over a concrete transport without changing protocol semantics.",
    primaryLabel: "Open in-process guide",
    primaryHref: "/docs/guides/in-process-runtime",
    canonicalHref: "https://diogoangelim.github.io/signal/docs/guides/http-binding",
    body: codeBlock(`POST /signal/mutation/payment.capture.v1
{
  "payload": {
    "paymentId": "pay_1001",
    "amount": 120,
    "currency": "USD"
  },
  "idempotencyKey": "capture-pay_1001-001"
}`),
  },
  {
    slug: ["guides", "in-process-runtime"],
    eyebrow: "Docs / Guides",
    title: "In-Process Runtime",
    summary: "Use the in-process binding for local execution, tests, and examples where transport separation is not needed.",
    primaryLabel: "Open payment example",
    primaryHref: "/docs/examples/payment-capture-flow",
    canonicalHref: "https://diogoangelim.github.io/signal/docs/guides/in-process-runtime",
    body: bullets([
      "Register handlers directly in code.",
      "Dispatch events without HTTP.",
      "Keep protocol validation in the runtime.",
    ]),
  },
  {
    slug: ["examples", "payment-capture-flow"],
    eyebrow: "Docs / Examples",
    title: "Payment Capture Flow",
    summary: "Capture a payment with retry-safe mutation handling and emit a payment.captured.v1 event.",
    primaryLabel: "Open escrow example",
    primaryHref: "/docs/examples/escrow-release-flow",
    canonicalHref: "https://diogoangelim.github.io/signal/docs/examples/payment-capture-flow",
    body: bullets([
      "same key + same payload => same logical result",
      "same key + different payload => conflict",
      "subscribers must tolerate duplicate event delivery",
    ]),
  },
  {
    slug: ["examples", "escrow-release-flow"],
    eyebrow: "Docs / Examples",
    title: "Escrow Release Flow",
    summary: "Release escrow after state checks, then publish escrow.released.v1 so downstream systems can react.",
    primaryLabel: "Open onboarding example",
    primaryHref: "/docs/examples/user-onboarding-flow",
    canonicalHref: "https://diogoangelim.github.io/signal/docs/examples/escrow-release-flow",
    body: bullets([
      "Validate the current escrow state before writing.",
      "Use idempotency for retried release requests.",
      "Emit the event after the write is committed.",
    ]),
  },
  {
    slug: ["examples", "user-onboarding-flow"],
    eyebrow: "Docs / Examples",
    title: "User Onboarding Flow",
    summary: "Onboard a user with explicit command handling and publish user.onboarded.v1 as the immutable completion event.",
    primaryLabel: "Open quickstart",
    primaryHref: "/docs/guides/quickstart",
    canonicalHref: "https://diogoangelim.github.io/signal/docs/examples/user-onboarding-flow",
    body: bullets([
      "Keep the command handler narrow.",
      "Persist the onboarding state once.",
      "Replay-safe consumers should ignore duplicates.",
    ]),
  },
];

export function findDocsPage(slug: string[]) {
  const path = slug.join("/");
  return docsPages.find((entry) => entry.slug.join("/") === path);
}
