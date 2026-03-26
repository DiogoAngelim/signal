# Escrow Release Example

This example models a controlled escrow release.

## What It Demonstrates

- a read-only query for escrow status
- an idempotent release mutation
- a replay-safe `escrow.released.v1` subscriber
- a flow that can be retried without double-release

## Operations

- `escrow.status.v1` query
- `escrow.release.v1` mutation
- `escrow.released.v1` event

## Retry Behavior

- the mutation requires an idempotency key
- a repeated request returns the same release result
- conflicting payload data for the same key returns an idempotency conflict
- the release subscriber ignores duplicate deliveries

## Event Flow

1. the client reads escrow state
2. the client sends `escrow.release.v1`
3. the runtime checks idempotency before repeating the write
4. the runtime emits `escrow.released.v1`
5. the subscriber stores the release fact once

See also:

- `docs/docs/examples/escrow-release-flow.md`
- `packages/examples/test/e2e.test.ts`
