# User Onboarding Example

This example models the first step of onboarding a user record.

## Operations

- `user.profile.v1` query
- `user.onboard.v1` mutation
- `user.onboarded.v1` event

## Retry Behavior

- The mutation requires an idempotency key.
- Repeating the same request returns the same result.
- Conflicting payload data for the same key returns an idempotency conflict.
- The welcome subscriber ignores duplicate deliveries.
