# @digelim/15.sync

Offline-first sync engine for Signal records. It delivers unsynced local records through a pluggable transport and marks them as synced.

## What it does

- Loads unsynced records from the store in order
- Delivers records via `SyncTransport`
- Marks successes as synced
- Records failures without deleting data
- Supports idempotency for replay-safe retries

## What it does not do

- Own any transport protocol implementation
- Persist lifecycle records locally
- Validate or mutate signal payloads

## Public API

- `SyncTransport`
- `syncPendingRecords()`
- `createCollectingTransport()`

## Example

```ts
import { InMemorySignalStore } from "@digelim/13.store";
import { InMemoryIdempotencyStore } from "@digelim/14.idempotency";
import { createCollectingTransport, syncPendingRecords } from "@digelim/15.sync";

const store = new InMemorySignalStore();
const idempotencyStore = new InMemoryIdempotencyStore();
const { transport } = createCollectingTransport();

await syncPendingRecords({
  store,
  transport,
  idempotencyStore,
});
```

## Transport contract

`deliver()` must return `{ ok: true }` on success or `{ ok: false, error }` on failure. Sync never deletes records, so it is safe to run repeatedly.
