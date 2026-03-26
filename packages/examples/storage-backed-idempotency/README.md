# Storage-Backed Idempotency Example

This example swaps the in-memory idempotency store for the PostgreSQL reference store while keeping the same runtime and operation definitions.

## What It Demonstrates

- pluggable idempotency storage
- unchanged mutation semantics across stores
- the runtime remaining transport-independent

## Environment

- `DATABASE_URL`

## Run

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/signal \
pnpm --filter @signal/examples build

DATABASE_URL=postgresql://postgres:postgres@localhost:5432/signal \
node packages/examples/dist/storage-backed-idempotency/index.js
```
