import { type SignalCapabilities, type SignalEnvelope } from "@signal/protocol";
import { buildCapabilities } from "./capabilities";
import {
  createInProcessDispatcher,
  createReplaySafeSubscriber,
} from "./dispatcher";
import { dispatchEvent } from "./event";
import { executeMutation } from "./mutation";
import { executeQuery } from "./query";
import { SignalRegistry } from "./registry";
import { normalizeRequestContext } from "./execution";
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
  envelope?: SignalEnvelope
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
    this.dispatcher = options.dispatcher ?? createInProcessDispatcher();
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
    definition: SignalQueryDefinition<TInput, TResult>
  ): SignalQueryDefinition<TInput, TResult> {
    return this.registry.registerQuery(definition);
  }

  registerMutation<TInput, TResult>(
    definition: SignalMutationDefinition<TInput, TResult>
  ): SignalMutationDefinition<TInput, TResult> {
    return this.registry.registerMutation(definition);
  }

  registerEvent<TInput, TResult>(
    definition: SignalOperationDefinition<TInput, TResult> & { kind: "event" }
  ): SignalOperationDefinition<TInput, TResult> & { kind: "event" } {
    return this.registry.registerEvent(definition);
  }

  subscribe(
    name: string,
    handler: (envelope: SignalEnvelope) => void | Promise<void>,
    options: SignalSubscriptionOptions = {}
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
    request: Partial<SignalExecutionContext["request"]> = {}
  ): Promise<SignalExecutionResult<TResult>> {
    return executeQuery(
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
      })
    );
  }

  async mutation<TInput, TResult>(
    name: string,
    input: TInput,
    request: Partial<SignalExecutionContext["request"]> & {
      idempotencyKey?: string;
    } = {}
  ): Promise<SignalExecutionResult<TResult>> {
    return executeMutation(
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
      request.idempotencyKey
    );
  }

  publish<TPayload>(
    name: string,
    payload: TPayload,
    request: Partial<SignalExecutionContext["request"]> = {}
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
      request.meta
    );
  }

  capabilities(): SignalCapabilities {
    return buildCapabilities(this.registry, this.bindings, [...this.subscriptions]);
  }

  lock(): void {
    this.registry.lock();
  }
}
