import type { SignalCapabilities, SignalEnvelope } from "@signal/protocol";
import { buildCapabilities } from "./capabilities";
import {
  createInProcessDispatcher,
  createReplaySafeSubscriber,
} from "./dispatcher";
import { dispatchEvent } from "./event";
import { normalizeRequestContext } from "./execution";
import { executeMutation } from "./mutation";
import { PerceptionLayer } from "./perception";
import { executeQuery } from "./query";
import { SignalRegistry } from "./registry";
import type {
  SignalBinding,
  SignalDispatcher,
  SignalExecutionContext,
  SignalExecutionResult,
  SignalIdempotencyStore,
  SignalMutationDefinition,
  SignalOperationDefinition,
  SignalQueryDefinition,
  SignalRuntimeOptions,
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

export class SignalRuntime implements SignalBinding {
  readonly registry = new SignalRegistry();
  readonly dispatcher: SignalDispatcher;
  readonly perception?: PerceptionLayer;
  readonly idempotencyStore?: SignalIdempotencyStore;
  readonly runtimeName: string;
  private readonly bindings: SignalCapabilities["bindings"];
  private readonly subscriptions: Array<{
    name: string;
    consumerId?: string;
    replaySafe?: boolean;
    description?: string;
  }> = [];

  constructor(options: SignalRuntimeOptions = {}) {
    this.perception = resolvePerceptionLayer(options.perception);
    this.dispatcher = this.perception
      ? createPerceptionAwareDispatcher(
          options.dispatcher ?? createInProcessDispatcher(),
          this.perception,
        )
      : (options.dispatcher ?? createInProcessDispatcher());
    this.idempotencyStore = options.idempotencyStore;
    this.runtimeName = options.runtimeName ?? "signal-node-reference";
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

    return this.dispatcher.subscribe(name, subscriber);
  }

  async query<TInput, TResult>(
    name: string,
    input: TInput,
    request: Partial<SignalExecutionContext["request"]> = {},
  ): Promise<SignalExecutionResult<TResult>> {
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
    if (result.ok) {
      this.perception?.observeEnvelope(result.envelope);
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
    const result = await executeMutation<TInput, TResult>(
      this.registry,
      this.dispatcher,
      this.idempotencyStore,
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
    if (result.ok) {
      this.perception?.observeEnvelope(result.envelope);
    }
    return result;
  }

  publish<TPayload>(
    name: string,
    payload: TPayload,
    request: Partial<SignalExecutionContext["request"]> = {},
  ): Promise<SignalEnvelope<TPayload>> {
    return dispatchEvent(
      this.registry,
      this.dispatcher,
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
      { perception: Boolean(this.perception) },
    );
  }

  lock(): void {
    this.registry.lock();
  }
}

function resolvePerceptionLayer(
  option: SignalRuntimeOptions["perception"],
): PerceptionLayer | undefined {
  if (option === false) {
    return undefined;
  }
  if (option instanceof PerceptionLayer) {
    return option;
  }
  return new PerceptionLayer(option ?? {});
}

function createPerceptionAwareDispatcher(
  dispatcher: SignalDispatcher,
  perception: PerceptionLayer,
): SignalDispatcher {
  return {
    async dispatch(envelope): Promise<void> {
      perception.observeEnvelope(envelope);
      await dispatcher.dispatch(envelope);
    },
    subscribe(name, handler): () => void {
      return dispatcher.subscribe(name, handler);
    },
  };
}
