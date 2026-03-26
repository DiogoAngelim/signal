---
title: Escrow Release Flow
---

# Escrow Release Flow

This example models a controlled escrow release. The contract must ensure that the release happens once, even if the same request is retried.

## Operations involved

- `escrow.status.v1`: query that reads the current escrow state
- `escrow.release.v1`: mutation that moves the escrow to released
- `escrow.released.v1`: event that records the release

## Event flow

1. the client reads the escrow state
2. the client sends `escrow.release.v1` with an idempotency key
3. the runtime reserves the key and performs the release
4. the handler emits `escrow.released.v1`
5. the consumer writes the projection or triggers the external integration

## Expected retry behavior

- same key + same payload -> same logical result
- same key + different payload -> conflict
- event consumers must tolerate duplicate delivery

## What to observe in the code

- the mutation schema is intentionally small because the escrow already contains the data needed to release it
- the response remains a valid domain state
- the event includes the beneficiary, amount, currency, and release timestamp

## What to avoid

- releasing escrow without idempotency
- assuming the event will be delivered only once
- mixing authorization and release without recording the public fact

## Where it lives in the repository

- [`packages/examples/escrow-release/`](https://github.com/DiogoAngelim/signal/tree/main/packages/examples/escrow-release/)
- [`packages/examples/test/e2e.test.ts`](https://github.com/DiogoAngelim/signal/tree/main/packages/examples/test/e2e.test.ts)
