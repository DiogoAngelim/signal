import type {
  DecisionPort,
  EventPort,
  ObservabilityPort,
  RuntimeMode,
  StoragePort,
} from "@signal/ports";
import type { SignalCapabilities, SignalEnvelope } from "@signal/protocol";
import { ZodError } from "zod";
import { buildCapabilities } from "./capabilities";
import {
  createInProcessDispatcher,
  createReplaySafeSubscriber,
} from "./dispatcher";
import { dispatchEvent } from "./event";
import {
  createExecutionSuccessMeta,
  normalizeRequestContext,
  toSignalFailure,
} from "./execution";
import { executeMutation } from "./mutation";
import { executeQuery } from "./query";
import { SignalRegistry } from "./registry";
import type {
  SignalBinding,
  SignalExecuteFailure,
  SignalExecuteInput,
  SignalExecuteResult,
  SignalExecutionContext,
  SignalExecutionResult,
  SignalMutationDefinition,
  SignalOperationDefinition,
  SignalOperationKind,
  SignalQueryDefinition,
  SignalRunOptions,
  SignalSubscriptionOptions,
} from "./types";

function createDefaultContext(
  request: SignalExecutionContext["request"],
  envelope?: SignalEnvelope,
): SignalExecutionContext {
  return {
    request: normalizeRequestContext(request),
    envelope,
    startedAt: Date.now(),
    emit: async () => {
      throw new Error("emit is only available inside mutation handlers");
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function createExecuteFailure(
  code: string,
  message: string,
  details?: unknown,
): SignalExecuteFailure {
  return {
    ok: false,
    error: {
      code,
      message,
      details,
    },
    meta: {},
  };
}

function toExecuteFailure(error: {
  code: string;
  message: string;
  details?: unknown;
  category?: string;
  retryable?: boolean;
}): SignalExecuteFailure {
  return {
    ok: false,
    error: {
      code: error.code,
      message: error.message,
      details: error.details,
      category: error.category,
      retryable: error.retryable,
    },
    meta: {},
  };
}

function toExecuteMeta(meta: unknown): Record<string, unknown> {
  return isRecord(meta) ? { ...meta } : {};
}

function toExecuteRequest(
  context: Record<string, unknown> | undefined,
  meta: Record<string, unknown> | undefined,
): Partial<SignalExecutionContext["request"]> {
  const request = isRecord(context) ? { ...context } : {};
  const { meta: requestMeta } = request;
  const contextMeta = isRecord(requestMeta) ? requestMeta : undefined;
  return {
    ...request,
    meta: isRecord(meta) ? meta : contextMeta,
  } as Partial<SignalExecutionContext["request"]>;
}

/**
 * Runtime options using injected ports instead of concrete implementations.
 * This is the dependency-inverted constructor for SignalRuntime.
 */
export interface SignalRuntimeOptions {
  /** Event port for dispatching and subscribing to events (required) */
  eventPort: EventPort;
  /** Storage port for idempotency (optional) */
  storagePort?: StoragePort;
  /** Decision port for invoking domain logic (optional) */
  decisionPort?: DecisionPort;
  /** Observability port for lifecycle hooks (optional) */
  observabilityPort?: ObservabilityPort;
  /** Runtime name identifier */
  runtimeName?: string;
  /** Execution mode (live, replay, audit) */
  mode?: RuntimeMode;
  /** Bindings configuration for capabilities */
  bindings?: SignalCapabilities["bindings"];
}

/**
 * SignalRuntime — Core correctness kernel for Signal protocol.
 *
 * Responsibilities:
 * - Deterministic execution of queries, mutations, and events
 * - Command dispatch and routing
 * - Event lifecycle coordination (runtime is the ONLY event authority)
 * - Idempotency enforcement at entry boundary
 * - Replay-safe execution
 *
 * Rules:
 * - Depends ONLY on Ports + Protocol (no domain imports)
 * - No transport awareness
 * - No side effects in domain logic
 * - Events owned exclusively here
 */
export class SignalRuntime implements SignalBinding {
  readonly registry = new SignalRegistry();
  private readonly eventPort: EventPort;
  private readonly storagePort?: StoragePort;
  private readonly decisionPort?: DecisionPort;
  private readonly observabilityPort?: ObservabilityPort;
  readonly runtimeName: string;
  readonly mode: RuntimeMode;
  readonly isReplay: boolean;
  private readonly bindings: SignalCapabilities["bindings"];
  private readonly subscriptions: Array<{
    name: string;
    consumerId?: string;
    replaySafe?: boolean;
    description?: string;
  }> = [];

  constructor(options: SignalRuntimeOptions) {
    if (!options.eventPort) {
      throw new Error("eventPort is required to construct SignalRuntime");
    }

    this.eventPort = options.eventPort;
    this.storagePort = options.storagePort;
    this.decisionPort = options.decisionPort;
    this.observabilityPort = options.observabilityPort;
    this.runtimeName = options.runtimeName ?? "signal-node-reference";
    this.mode = options.mode ?? "live";
    this.isReplay = this.mode === "replay" || this.mode === "audit";
    this.bindings = options.bindings ?? {
      inProcess: true,
      http: {
        basePath: "/signal",
      },
    };
  }

  registerQuery<TInput, TResult>(
    definition: SignalQueryDefinition<TInput, TResult>,
  ): SignalQueryDefinition<TInput, TResult> {
    return this.registry.registerQuery(definition);
  }

  registerMutation<TInput, TResult>(
    definition: SignalMutationDefinition<TInput, TResult>,
  ): SignalMutationDefinition<TInput, TResult> {
    return this.registry.registerMutation(definition);
  }

  registerEvent<TInput, TResult>(
    definition: SignalOperationDefinition<TInput, TResult> & { kind: "event" },
  ): SignalOperationDefinition<TInput, TResult> & { kind: "event" } {
    return this.registry.registerEvent(definition);
  }

  subscribe(
    name: string,
    handler: (envelope: SignalEnvelope) => void | Promise<void>,
    options: SignalSubscriptionOptions = {},
  ): () => void {
    this.subscriptions.push({
      name,
      consumerId: options.consumerId,
      replaySafe: options.replaySafe,
      description: options.description,
    });

    const subscriber =
      options.replaySafe || options.deduper
        ? createReplaySafeSubscriber(handler, {
            consumerId: options.consumerId,
            deduper: options.deduper,
          })
        : handler;

    return this.eventPort.subscribe(name, subscriber);
  }

  async query<TInput, TResult>(
    name: string,
    input: TInput,
    request: Partial<SignalExecutionContext["request"]> = {},
  ): Promise<SignalExecutionResult<TResult>> {
    const startedAt = Date.now();

    this.observabilityPort?.emit({
      event: "execution.start",
      operationName: name,
      operationKind: "query",
      correlationId: request.correlationId,
      traceId: request.traceId,
      isReplay: this.isReplay,
    });

    const result = await executeQuery<TInput, TResult>(
      this.registry,
      name,
      input,
      createDefaultContext({
        correlationId: request.correlationId,
        causationId: request.causationId,
        traceId: request.traceId,
        trace: request.trace,
        deadlineAt: request.deadlineAt,
        abortSignal: request.abortSignal,
        delivery: request.delivery,
        source: request.source,
        auth: request.auth,
        meta: request.meta,
      }),
    );

    const durationMs = Date.now() - startedAt;

    if (result.ok) {
      this.observabilityPort?.emit({
        event: "execution.end",
        operationName: name,
        operationKind: "query",
        messageId: result.envelope.messageId,
        correlationId: request.correlationId,
        traceId: request.traceId,
        durationMs,
        outcome: "completed",
        isReplay: this.isReplay,
      });
    }

    return result;
  }

  async mutation<TInput, TResult>(
    name: string,
    input: TInput,
    request: Partial<SignalExecutionContext["request"]> & {
      idempotencyKey?: string;
    } = {},
  ): Promise<SignalExecutionResult<TResult>> {
    const startedAt = Date.now();

    this.observabilityPort?.emit({
      event: "execution.start",
      operationName: name,
      operationKind: "mutation",
      correlationId: request.correlationId,
      traceId: request.traceId,
      isReplay: this.isReplay,
    });

    const result = await executeMutation<TInput, TResult>(
      this.registry,
      this.eventPort,
      this.storagePort,
      name,
      input,
      createDefaultContext({
        correlationId: request.correlationId,
        causationId: request.causationId,
        traceId: request.traceId,
        trace: request.trace,
        idempotencyKey: request.idempotencyKey,
        deadlineAt: request.deadlineAt,
        abortSignal: request.abortSignal,
        delivery: request.delivery,
        source: request.source,
        auth: request.auth,
        meta: request.meta,
      }),
      request.idempotencyKey,
    );

    const durationMs = Date.now() - startedAt;

    if (result.ok) {
      this.observabilityPort?.emit({
        event: "execution.end",
        operationName: name,
        operationKind: "mutation",
        messageId: result.envelope.messageId,
        correlationId: request.correlationId,
        traceId: request.traceId,
        durationMs,
        outcome: "completed",
        isReplay: this.isReplay,
      });
    }

    return result;
  }

  async run<TData = unknown>(
    name: string,
    payload?: unknown,
    options: SignalRunOptions = {},
  ): Promise<SignalExecuteResult<TData>> {
    if (options.kind) {
      return this.execute<TData>({
        kind: options.kind,
        name,
        payload,
        context: options.context,
        meta: options.meta,
      });
    }

    const kinds = this.findRegisteredKinds(name);

    if (kinds.length === 0) {
      return createExecuteFailure(
        "OPERATION_NOT_FOUND",
        `Unknown operation: ${name}`,
        {
          name,
        },
      );
    }

    if (kinds.length > 1) {
      return createExecuteFailure(
        "AMBIGUOUS_OPERATION_KIND",
        `Operation kind is ambiguous for ${name}; pass options.kind to run it explicitly.`,
        {
          name,
          kinds,
        },
      );
    }

    const kind = kinds[0] as SignalOperationKind;

    return this.execute<TData>({
      kind,
      name,
      payload,
      context: options.context,
      meta: options.meta,
    });
  }

  async execute<TData = unknown>(
    input: SignalExecuteInput,
  ): Promise<SignalExecuteResult<TData>> {
    const request = toExecuteRequest(input.context, input.meta);

    switch (input.kind) {
      case "query": {
        const result = await this.query<unknown, TData>(
          input.name,
          input.payload,
          request,
        );
        if (!result.ok) {
          return toExecuteFailure(result.error);
        }
        return {
          ok: true,
          data: result.result,
          meta: toExecuteMeta(result.meta),
        };
      }
      case "mutation": {
        const result = await this.mutation<unknown, TData>(
          input.name,
          input.payload,
          request,
        );
        if (!result.ok) {
          return toExecuteFailure(result.error);
        }
        return {
          ok: true,
          data: result.result,
          meta: toExecuteMeta(result.meta),
        };
      }
      case "event": {
        const normalizedRequest = normalizeRequestContext(request);
        const startedAt = Date.now();
        try {
          const envelope = await this.publish(
            input.name,
            input.payload,
            normalizedRequest,
          );

          this.observabilityPort?.emit({
            event: "event.emitted",
            operationName: input.name,
            operationKind: "event",
            messageId: envelope.messageId,
            correlationId: normalizedRequest.correlationId,
            traceId: normalizedRequest.traceId,
            durationMs: Date.now() - startedAt,
            outcome: "completed",
            isReplay: this.isReplay,
          });

          return {
            ok: true,
            data: envelope as TData,
            meta: toExecuteMeta(
              createExecutionSuccessMeta({
                outcome: "completed",
                envelope,
                request: normalizedRequest,
                startedAt,
                idempotency: {
                  status: "not-applicable",
                },
              }),
            ),
          };
        } catch (error) {
          if (error instanceof ZodError) {
            return toExecuteFailure(
              toSignalFailure(
                {
                  code: "VALIDATION_ERROR",
                  message: error.message,
                  details: { issues: error.issues },
                },
                "VALIDATION_ERROR",
                "Event payload validation failed",
              ),
            );
          }

          return toExecuteFailure(
            toSignalFailure(error, "INTERNAL_ERROR", "Event publish failed"),
          );
        }
      }
      default:
        return createExecuteFailure(
          "UNSUPPORTED_OPERATION_KIND",
          `Unsupported operation kind: ${String(input.kind)}`,
          {
            kind: input.kind,
            supportedKinds: ["query", "mutation", "event"],
          },
        );
    }
  }

  publish<TPayload>(
    name: string,
    payload: TPayload,
    request: Partial<SignalExecutionContext["request"]> = {},
  ): Promise<SignalEnvelope<TPayload>> {
    return dispatchEvent(
      this.registry,
      this.eventPort,
      name,
      payload,
      createDefaultContext({
        correlationId: request.correlationId,
        causationId: request.causationId,
        traceId: request.traceId,
        trace: request.trace,
        idempotencyKey: request.idempotencyKey,
        deadlineAt: request.deadlineAt,
        abortSignal: request.abortSignal,
        delivery: request.delivery,
        source: request.source,
        auth: request.auth,
        meta: request.meta,
      }),
      request.meta,
    );
  }

  capabilities(): SignalCapabilities {
    return buildCapabilities(
      this.registry,
      this.bindings,
      [...this.subscriptions],
      {
        decision: Boolean(this.decisionPort),
        storage: Boolean(this.storagePort),
        observability: Boolean(this.observabilityPort),
      },
    );
  }

  lock(): void {
    this.registry.lock();
  }

  private findRegisteredKinds(name: string): SignalOperationKind[] {
    const kinds: SignalOperationKind[] = [];
    if (
      this.registry.listQueries().some((definition) => definition.name === name)
    ) {
      kinds.push("query");
    }
    if (
      this.registry
        .listMutations()
        .some((definition) => definition.name === name)
    ) {
      kinds.push("mutation");
    }
    if (
      this.registry.listEvents().some((definition) => definition.name === name)
    ) {
      kinds.push("event");
    }
    return kinds;
  }
}
