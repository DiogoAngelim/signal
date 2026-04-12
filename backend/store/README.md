# @digelim/13.store

Local-first persistence for Signal lifecycle records. It stores envelopes and lifecycle transitions so `received` and `validated` can succeed without network access.

## What it does

- Persists `LocalSignalRecord` entries locally
- Tracks sync status, attempts, and errors
- Supports querying unsynced records and trace groups

## What it does not do

- Deliver records externally
- Enforce business validation
- Resolve conflicts between replicas

## Public API

- `SignalStore`
- `LocalSignalRecord`
- `InMemorySignalStore`

## Example

```ts
import { InMemorySignalStore } from "@digelim/13.store";

const store = new InMemorySignalStore();
await store.append({
  id: "record-1",
  traceId: "trace-1",
  messageId: "message-1",
  protocol: "signal.v1",
  kind: "event",
  name: "portfolio.received.v1",
  lifecycle: "received",
  payload: { ok: true },
  timestamp: new Date().toISOString(),
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  synced: false,
  syncAttempts: 0,
});
```

## Offline-first flow

1. `received` appends a record.
2. `validated` updates the same record.
3. `sync` marks it as synced or records a failure.
