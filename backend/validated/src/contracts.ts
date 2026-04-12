import type { LifecycleStage, SignalEnvelope } from "@digelim/12.signal";
import type { SignalStore } from "@digelim/13.store";

export type SignalFrameworkErrorCode =
  | "VALIDATION_ERROR"
  | "TRANSITION_ERROR"
  | "PROTOCOL_ERROR"
  | "SYNC_ERROR";

export type SignalFrameworkError = {
  code: SignalFrameworkErrorCode;
  message: string;
  traceId?: string;
  details?: unknown;
};

export type ValidationIssue = {
  path: string;
  message: string;
  rule: string;
};

export type SignalContextEnvelope<TPayload = unknown> =
  SignalEnvelope<TPayload> & {
    lifecycle: LifecycleStage;
    receivedAt?: string;
    validatedAt?: string;
  };

export type ValidateEnvelopeOptions = {
  store?: SignalStore;
  now?: () => string;
  idFactory?: () => string;
};

export type ValidationResult =
  | {
    ok: true;
    value: SignalContextEnvelope;
  }
  | {
    ok: false;
    error: SignalFrameworkError;
    issues: ValidationIssue[];
  };
