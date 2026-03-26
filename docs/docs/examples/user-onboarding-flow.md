---
title: User Onboarding Flow
---

# User Onboarding Flow

This example shows how Signal can model initial state creation, idempotent mutation, and a completion event.

## Operations involved

- `user.profile.v1`: query that reads the current user profile
- `user.onboard.v1`: mutation that completes onboarding
- `user.onboarded.v1`: event that records that onboarding completed

## Event flow

1. the client checks the user profile or initial state
2. the client sends `user.onboard.v1` with an idempotency key
3. the runtime creates or updates the user record
4. the handler emits `user.onboarded.v1`
5. the subscriber writes a welcome message, a projection, or a similar side effect

## Expected retry behavior

- same key + same payload -> same logical result
- same key + different payload -> conflict
- the subscriber must tolerate the same `messageId` more than once

## What to observe in the code

- the handler may create the record if it does not already exist
- the final user state must remain coherent after the first successful processing
- the event carries email, plan, and onboarding timestamp

## What to avoid

- creating the user without recording the onboarding fact
- sending a welcome email without deduplication
- changing the mutation contract without a new version

## Where it lives in the repository

- [`packages/examples/user-onboarding/`](https://github.com/DiogoAngelim/signal/tree/main/packages/examples/user-onboarding/)
- [`packages/examples/test/e2e.test.ts`](https://github.com/DiogoAngelim/signal/tree/main/packages/examples/test/e2e.test.ts)
