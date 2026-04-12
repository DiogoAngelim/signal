import type { LocalSignalRecord, SignalStore } from "@digelim/13.store";
import type { IdempotencyStore } from "@digelim/14.idempotency";
import {
  createIdempotencyKey,
  createIdempotencyRecord,
  isDuplicate,
  rememberIdempotency,
} from "@digelim/14.idempotency";

export type SyncTransportResult =
  | {
    ok: true;
  }
  | {
    ok: false;
    error: string;
    retryable?: boolean;
  };

export interface SyncTransport {
  deliver(record: LocalSignalRecord): Promise<SyncTransportResult>;
}

export type SyncResult = {
  attempted: number;
  succeeded: number;
  failed: number;
};

const resolveErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return "Unknown sync error";
};

export async function syncPendingRecords(args: {
  store: SignalStore;
  transport: SyncTransport;
  idempotencyStore?: IdempotencyStore;
  limit?: number;
  now?: () => string;
}): Promise<SyncResult> {
  const pending = await args.store.getUnsynced(args.limit);
  const result: SyncResult = {
    attempted: 0,
    succeeded: 0,
    failed: 0,
  };

  for (const record of pending) {
    result.attempted += 1;
    const now = args.now ?? (() => new Date().toISOString());
    const nowIso = now();

    try {
      const key = args.idempotencyStore ? createIdempotencyKey(record) : null;

      if (args.idempotencyStore) {
        const duplicate = await isDuplicate(args.idempotencyStore, key);
        if (duplicate) {
          await args.store.markSynced(record.id, nowIso);
          result.succeeded += 1;
          continue;
        }
      }

      const delivery = await args.transport.deliver(record);

      if (delivery.ok) {
        await args.store.markSynced(record.id, nowIso);

        if (args.idempotencyStore && key) {
          await rememberIdempotency(
            args.idempotencyStore,
            createIdempotencyRecord({
              key,
              messageId: record.messageId,
              traceId: record.traceId,
              createdAt: nowIso,
            }),
          );
        }

        result.succeeded += 1;
      } else {
        await args.store.markSyncFailed(record.id, delivery.error);
        result.failed += 1;
      }
    } catch (error) {
      await args.store.markSyncFailed(record.id, resolveErrorMessage(error));
      result.failed += 1;
    }
  }

  return result;
}
