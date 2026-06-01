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
