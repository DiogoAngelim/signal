---
title: Define Your First Mutation
---

# Define Your First Mutation

Use a versioned command name and declare idempotency.

## Steps

1. Choose a command name such as `payment.capture.v1`.
2. Set idempotency mode to `required` when retries are expected.
3. Define input and result schemas.
4. Emit events only after the state change is known.

## Avoid

- accepting retried writes without idempotency
- changing the payload format without a new version
- emitting events from queries
