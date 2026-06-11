import type {
  SignalAuth,
  SignalCapabilities,
  SignalContext,
  SignalDelivery,
  SignalEnvelope,
  SignalErrorEnvelope,
  SignalKind,
  SignalResultMeta,
} from "@signal/protocol";
import type { z } from "zod";

export type { SignalErrorEnvelope } from "@signal/protocol";

export type SignalOperationKind = SignalKind;

export type SignalSchema<T> = z.ZodType<T>;

export interface SignalRunOptions {
  kind?: SignalOperationKind;
  context?: Record<string, unknown>;
  meta?: Record<string, unknown>;
}

export interface SignalExecuteInput {
  kind: SignalOperationKind;
  name: string;
  payload?: unknown;
  context?: Record<string, unknown>;
  meta?: Record<string, unknown>;
}

export interface SignalExecuteSuccess<TData = unknown> {
  ok: true;
  data: TData;
  meta: Record<string, unknown>;
}

export interface SignalExecuteFailure {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
    category?: string;
    retryable?: boolean;
  };
  meta: Record<string, unknown>;
}

export type SignalExecuteResult<TData = unknown> =
  | SignalExecuteSuccess<TData>
  | SignalExecuteFailure;

export interface SignalRequestContext {
  correlationId?: string;
  causationId?: string;
  traceId?: string;
  trace?: NonNullable<SignalContext>["trace"];
  idempotencyKey?: string;
  deadlineAt?: string;
  abortSignal?: AbortSignal;
  delivery?: SignalDelivery;
  source?: {
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
  authorize?(
    input: TInput,
    context: SignalExecutionContext,
  ): Promise<void> | void;
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
