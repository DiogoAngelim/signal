# Escrow Release Example

This example models a release step against an escrow record.

## Operations

- `escrow.status.v1` query
- `escrow.release.v1` mutation
- `escrow.released.v1` event

## Retry Behavior

- The mutation requires an idempotency key.
- A repeated request returns the same release result.
- Conflicting payload data for the same key returns an idempotency conflict.
- The release subscriber ignores duplicate event deliveries.
