import type { LocalSignalRecord } from "@digelim/13.store";
import type { SyncTransport, SyncTransportResult } from "./sync";

const cloneRecord = <T>(value: T): T => {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
};

export type CollectingTransport = {
  transport: SyncTransport;
  delivered: LocalSignalRecord[];
};

export function createCollectingTransport(
  responder?: (
    record: LocalSignalRecord,
  ) => SyncTransportResult | Promise<SyncTransportResult>,
): CollectingTransport {
  const delivered: LocalSignalRecord[] = [];

  const transport: SyncTransport = {
    async deliver(record: LocalSignalRecord): Promise<SyncTransportResult> {
      delivered.push(cloneRecord(record));
      if (responder) {
        return responder(record);
      }
      return { ok: true };
    },
  };

  return { transport, delivered };
}
