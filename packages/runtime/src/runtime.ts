import { type SignalCapabilities, type SignalEnvelope } from "@signal/protocol";
import { buildCapabilities } from "./capabilities";
import { createInProcessDispatcher } from "./dispatcher";
import { dispatchEvent } from "./event";
import { executeMutation } from "./mutation";
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
} from "./types";

function createDefaultContext(
  request: SignalExecutionContext["request"],
  envelope?: SignalEnvelope
): SignalExecutionContext {
  return {
    request,
    envelope,
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
  private readonly subscribedEventNames = new Set<string>();

  constructor(options: SignalRuntimeOptions = {}) {
    this.dispatcher = options.dispatcher ?? createInProcessDispatcher();
    this.idempotencyStore = options.idempotencyStore;
    this.runtimeName = options.runtimeName ?? "signal-node-reference";
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
    handler: (envelope: SignalEnvelope) => void | Promise<void>
  ): () => void {
    this.subscribedEventNames.add(name);
    return this.dispatcher.subscribe(name, handler);
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
        source: request.source,
        auth: request.auth,
        meta: request.meta,
      }),
      request.meta
    );
  }

  capabilities(): SignalCapabilities {
    return buildCapabilities(this.registry, {
      inProcess: true,
      http: {
        basePath: "/signal",
      },
    }, [...this.subscribedEventNames]);
  }

  lock(): void {
    this.registry.lock();
  }
}
