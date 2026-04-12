import type { SignalEnvelope } from "@digelim/12.signal";

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

export type IdempotencyRecord = {
  key: string;
  messageId: string;
  traceId: string;
  createdAt: string;
  resultHash?: string;
};

export type IdempotencySource = Pick<
  SignalEnvelope,
  "kind" | "messageId" | "meta"
>;

export interface IdempotencyStore {
  has(key: string): Promise<boolean>;
  get(key: string): Promise<IdempotencyRecord | null>;
  put(record: IdempotencyRecord): Promise<void>;
}
