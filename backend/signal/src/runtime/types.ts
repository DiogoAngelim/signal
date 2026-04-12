import type { z } from "zod";
import type {
  SignalAuth,
  SignalCapabilities,
  SignalContext,
  SignalDelivery,
  SignalEnvelope,
  SignalErrorEnvelope,
  SignalKind,
  SignalResultMeta,
} from "../protocol";

export type { SignalErrorEnvelope } from "../protocol";

export type SignalOperationKind = SignalKind;

export type SignalSchema<T> = z.ZodType<T>;

export interface SignalRequestContext {
  correlationId?: string;
  causationId?: string;
  traceId?: string;
  trace?: NonNullable<SignalContext>["trace"];
  idempotencyKey?: string;
  deadlineAt?: string;
  abortSignal?: AbortSignal;
  delivery?: SignalDelivery;
  source?:
    | string
    | {
        system?: string;
        transport?: string;
        runtime?: string;
      };
  auth?: SignalAuth;
  meta?: Record<string, unknown>;
}

export interface SignalExecutionContext {
  readonly request: SignalRequestContext;
  readonly envelope?: SignalEnvelope;
  readonly startedAt?: number;
  emit<TPayload>(
    name: string,
    payload: TPayload,
    meta?: Record<string, unknown>,
  ): Promise<SignalEnvelope<TPayload>>;
}

export interface SignalOperationDefinition<
  TInput = unknown,
  TResult = unknown,
> {
  name: string;
  kind: SignalOperationKind;
  inputSchema: SignalSchema<TInput>;
  resultSchema: SignalSchema<TResult>;
  handler(
    input: TInput,
    context: SignalExecutionContext,
  ): Promise<TResult> | TResult;
  idempotency?: "required" | "optional" | "none";
  description?: string;
  inputSchemaId?: string;
  resultSchemaId?: string;
  emits?: string[];
  normalizeIdempotencyInput?(input: TInput): unknown;
}

export interface SignalQueryDefinition<TInput = unknown, TResult = unknown>
  extends SignalOperationDefinition<TInput, TResult> {
  kind: "query";
}

export interface SignalMutationDefinition<TInput = unknown, TResult = unknown>
  extends SignalOperationDefinition<TInput, TResult> {
  kind: "mutation";
  idempotency: "required" | "optional" | "none";
}

export interface SignalEventDefinition<TInput = unknown, TResult = unknown>
  extends SignalOperationDefinition<TInput, TResult> {
  kind: "event";
}

export interface SignalExecutionOutcome<TResult = unknown> {
  ok: true;
  result: TResult;
  envelope: SignalEnvelope;
  meta: SignalResultMeta;
}

export interface SignalExecutionFailure {
  ok: false;
  error: SignalErrorEnvelope;
}

export type SignalExecutionResult<TResult = unknown> =
  | SignalExecutionOutcome<TResult>
  | SignalExecutionFailure;

export interface SignalIdempotencyRecord {
  operationName: string;
  idempotencyKey: string;
  payloadFingerprint: string;
  status: "pending" | "completed" | "failed";
  result?: unknown;
  resultMeta?: SignalResultMeta;
  error?: SignalErrorEnvelope;
  createdAt: string;
  updatedAt: string;
  messageId?: string;
}

export interface SignalIdempotencyReservation {
  state: "reserved" | "replayed" | "conflict" | "inflight";
  record?: SignalIdempotencyRecord;
}

export interface SignalIdempotencyStore {
  reserve(input: {
    operationName: string;
    idempotencyKey: string;
    payloadFingerprint: string;
  }): Promise<SignalIdempotencyReservation>;
  complete(input: {
    operationName: string;
    idempotencyKey: string;
    payloadFingerprint: string;
    result: unknown;
    resultMeta?: SignalResultMeta;
    messageId?: string;
  }): Promise<void>;
  fail(input: {
    operationName: string;
    idempotencyKey: string;
    payloadFingerprint: string;
    error: SignalErrorEnvelope;
  }): Promise<void>;
}

export interface SignalDispatcher {
  dispatch(envelope: SignalEnvelope): Promise<void>;
  subscribe(
    name: string,
    handler: (envelope: SignalEnvelope) => void | Promise<void>,
  ): () => void;
}

export interface SignalConsumerDeduper {
  remember(input: {
    consumerId: string;
    messageId: string;
    envelope: SignalEnvelope;
  }): Promise<boolean>;
}

export interface SignalSubscriptionOptions {
  consumerId?: string;
  description?: string;
  replaySafe?: boolean;
  deduper?: SignalConsumerDeduper;
}

export interface SignalRuntimeOptions {
  protocol?: string;
  idempotencyStore?: SignalIdempotencyStore;
  dispatcher?: SignalDispatcher;
  runtimeName?: string;
  bindings?: SignalCapabilities["bindings"];
}

export interface SignalCapabilityProvider {
  capabilities(): SignalCapabilities;
}

export interface SignalBinding {
  query<TInput, TResult>(
    name: string,
    input: TInput,
    request?: SignalRequestContext,
  ): Promise<SignalExecutionResult<TResult>>;
  mutation<TInput, TResult>(
    name: string,
    input: TInput,
    request?: SignalRequestContext & { idempotencyKey?: string },
  ): Promise<SignalExecutionResult<TResult>>;
}
