# Signal Conformance Checklist

## Must Implement

- Signal Protocol v1 message envelope.
- Query, mutation, and event message kinds.
- Versioned operation names in the `<domain>.<action>.<version>` form.
- Standard result and error envelopes.
- Query execution with read-only semantics.
- Mutation execution with declared idempotency mode.
- Event dispatch with duplicate-tolerant consumption expectations.
- Capability declaration for queries, mutations, published events, and subscribed events.
- In-process binding.
- HTTP binding.
- Observable `messageId`, `correlationId`, and `causationId` propagation.

## Optional

- PostgreSQL-backed idempotency storage.
- HTTP transport details beyond the reference binding.
- OpenAPI documents for the HTTP binding.
- Alternate storage adapters.
- Alternate event transports.

## Out Of Scope

- Workflow orchestration.
- Kafka or queue bindings.
- Distributed transactions.
- Permission models beyond extension points.
- Global ordering guarantees for events.
