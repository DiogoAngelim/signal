import type { LifecycleStage, SignalEnvelope } from "@digelim/12.signal";

export type SignalFrameworkErrorCode =
  | "VALIDATION_ERROR"
  | "TRANSITION_ERROR"
  | "PROTOCOL_ERROR"
  | "SYNC_ERROR"
  | "IDEMPOTENCY_ERROR";

export type SignalFrameworkError = {
  code: SignalFrameworkErrorCode;
  message: string;
  traceId?: string;
  details?: unknown;
};

export type LocalSignalRecord = {
  id: string;
  traceId: string;
  messageId: string;
  protocol: SignalEnvelope["protocol"];
  kind: SignalEnvelope["kind"];
  name: SignalEnvelope["name"];
  lifecycle: LifecycleStage;
  payload: SignalEnvelope["payload"];
  meta?: {
    idempotencyKey?: string;
    replay?: boolean;
  };
  source?: SignalEnvelope["source"];
  timestamp: string;
  createdAt: string;
  updatedAt: string;
  synced: boolean;
  syncAttempts: number;
  lastSyncedAt?: string;
  lastSyncError?: string;
};

export interface SignalStore {
  append(record: LocalSignalRecord): Promise<void>;
  update(record: LocalSignalRecord): Promise<void>;
  getById(id: string): Promise<LocalSignalRecord | null>;
  getByMessageId(messageId: string): Promise<LocalSignalRecord | null>;
  getUnsynced(limit?: number): Promise<LocalSignalRecord[]>;
  markSynced(id: string, syncedAt: string): Promise<void>;
  markSyncFailed(id: string, error: string): Promise<void>;
  listByTraceId(traceId: string): Promise<LocalSignalRecord[]>;
}
