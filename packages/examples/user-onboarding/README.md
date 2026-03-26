# User Onboarding Example

This example models the first step of onboarding a user record.

## What It Demonstrates

- a query for the current user profile
- an idempotent onboarding mutation
- a `user.onboarded.v1` completion event
- a replay-safe subscriber that ignores duplicate deliveries

## Operations

- `user.profile.v1` query
- `user.onboard.v1` mutation
- `user.onboarded.v1` event

## Retry Behavior

- the mutation requires an idempotency key
- repeating the same request returns the same result
- conflicting payload data for the same key returns an idempotency conflict
- the welcome subscriber ignores duplicate deliveries

## Event Flow

1. the client reads the current user state
2. the client sends `user.onboard.v1`
3. the runtime creates or updates the user record
4. the runtime emits `user.onboarded.v1`
5. the subscriber writes a welcome-side effect once per `messageId`

See also:

- `docs/docs/examples/user-onboarding-flow.md`
- `packages/examples/test/e2e.test.ts`
