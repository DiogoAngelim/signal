# `@signal/workbench-connector`

A server-side adapter for connecting an explicitly configured Signal runtime to a Workbench v2 integration.

This package is intentionally outside Signal's generic decision core. It does not decide which business events matter, infer tenant identity, train models, or change decision scores.

## Responsibilities

- Publish selected, versioned Signal events to Workbench's signed event-ingestion endpoint.
- Poll Workbench's owner-scoped outcome snapshots.
- Persist outcome pages and their cursor atomically in PostgreSQL.
- Preserve owner partitioning and immutable event-ID deduplication.

## Required configuration

Configure these values in the Signal application host's secret manager:

- `WORKBENCH_BASE_URL`: HTTPS origin for the Workbench deployment.
- `WORKBENCH_OWNER_ID`: the Workbench owner whose records are in scope.
- `WORKBENCH_SIGNAL_TOKEN`: owner-specific token provisioned in Workbench.
- `SIGNAL_WORKBENCH_DATABASE_URL`: dedicated PostgreSQL connection string for the connector inbox.

Do not use one owner's token for another owner. Do not log tokens or signed headers. The connector refuses non-HTTPS Workbench URLs outside localhost.

## Signal runtime event publishing

The host must supply an explicit, versioned event list and mapper. The mapper owns the relationship/opportunity mapping and must return `null` for events that should not be exported. It must derive a stable `eventId` from the source envelope and a monotonically increasing `sourceRevision` for each `signalId`; do not generate random IDs on retry. Never derive owner or opportunity identity from untrusted arbitrary text.

```ts
import { createSignalRuntime } from "@signal/sdk-node";
import {
  createWorkbenchConnector,
  subscribeToSignalEvents,
} from "@signal/workbench-connector";

const runtime = createSignalRuntime({ runtimeName: "my-signal-host" });

const workbench = createWorkbenchConnector({
  baseUrl: process.env.WORKBENCH_BASE_URL!,
  ownerId: process.env.WORKBENCH_OWNER_ID!,
  token: process.env.WORKBENCH_SIGNAL_TOKEN!,
});

const stopPublishing = subscribeToSignalEvents(
  runtime,
  workbench,
  ["your.domain-event.v1"],
  (envelope) => mapYourDomainEventToWorkbenchV2(envelope),
);

// Call stopPublishing() during graceful host shutdown.
```

The adapter subscribes through the public Signal runtime API with replay-safe delivery enabled. Workbench also enforces event-ID idempotency and monotonic source revisions, so a retried delivery is safe only when the same event ID is reused with the same immutable payload.

## Durable outcome polling

Apply `migrations/0001_workbench_outcome_feedback.sql` to the connector's dedicated PostgreSQL database before creating the sink. The migration enables and forces tenant row-level security.

```ts
import {
  createPostgresWorkbenchOutcomeSink,
} from "@signal/workbench-connector";

const sink = createPostgresWorkbenchOutcomeSink({
  connectionString: process.env.SIGNAL_WORKBENCH_DATABASE_URL!,
});

try {
  const result = await workbench.syncOutcomes({ sink, maxPages: 20 });
  // Persist/log aggregate counts only; avoid logging outcome payloads.
  logger.info({ pages: result.pages, accepted: result.accepted, duplicates: result.duplicates });
} finally {
  await sink.close();
}
```

Call `syncOutcomes` from the host's own durable scheduler or worker. The library intentionally does not create a timer or background process. The sink stores each page and its next cursor in one transaction; callers must not replace it with an in-memory cursor if restart-safe polling is required. The connector rejects non-advancing cursors and event pages without a continuation cursor before the sink can commit them.

## Outcome semantics and learning safeguards

Workbench exports owner-recorded outcome snapshots and net collected cash in USD. These are observations, not independently audited facts or calibrated learning labels. Cash receipts and reversals may cause a new snapshot event for the same outcome. The inbox stores each immutable snapshot revision separately.

Do not automatically turn these events into Signal `OutcomeEvaluation` records. Signal decision memory requires a matching prior decision record, a scoped outcome evaluation, and a governed review. A host must implement that mapping explicitly, including decision identity, expected confidence/risk, actual success criteria, sample sufficiency, and provenance. No such mapping is included here.

## Validation

- Unit tests cover request signing, owner isolation, schema validation, cursor paging, and event subscription validation.
- PostgreSQL integration tests run when `SIGNAL_TEST_DATABASE_URL` is configured; Signal CI supplies an isolated PostgreSQL 16 service. They verify forced row-level security, atomic page/cursor persistence, immutable duplicate handling, tenant separation, and cursor race protection.
- No live database migration, credential provisioning, deployment, or external communication is performed by this package.
