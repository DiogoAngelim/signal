# Worklog

## What Changed

- Reframed the repository around Signal as a protocol instead of a generic backend framework.
- Added public RFCs for the core protocol, HTTP binding, runtime reference, idempotency, and event processing.
- Added JSON Schema artifacts for envelope, result, error, capabilities, and example operations.
- Implemented `@signal/protocol`, `@signal/runtime`, `@signal/binding-http`, `@signal/idempotency-postgres`, `@signal/sdk-node`, and `@signal/examples`.
- Added a runnable Fastify reference server under `apps/reference-server`.
- Added a Docusaurus docs site under `docs/`.
- Rewrote the landing page copy direction to be protocol-first.

## Major Architecture Decisions

- `protocol` is the public contract.
- `runtime` is the execution layer.
- `binding-http` is a transport adapter, not the protocol itself.
- `idempotency-postgres` owns durable replay records.
- Example flows are published as runnable reference code rather than as pseudo-code.
- The repository stays monorepo-friendly so packages, docs, and apps can evolve separately.

## Reinterpretation Of The Old Repo

- The old framework-oriented README and landing page were replaced with protocol language.
- The previous collection-centric model was replaced with explicit query, mutation, and event operations.
- The public surface now centers on envelopes, names, capabilities, and bindings.
- Legacy files remain in the workspace only where they do not conflict with the new structure.

## Deferred To Future RFCs

- Kafka and queue bindings.
- Workflow orchestration.
- Full durable event outbox and inbox machinery.
- Rich authorization profiles.
- Additional protocol versions beyond `v1`.
