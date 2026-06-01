import { createProtocolError, signalNameSchema } from "../protocol";
import type {
  SignalEventDefinition,
  SignalMutationDefinition,
  SignalOperationDefinition,
  SignalQueryDefinition,
} from "./types";

export class SignalRegistry {
  private readonly queries = new Map<string, SignalQueryDefinition>();
  private readonly mutations = new Map<string, SignalMutationDefinition>();
  private readonly events = new Map<string, SignalEventDefinition>();
  private locked = false;

  lock(): void {
    this.locked = true;
  }

  private ensureMutable(): void {
    if (this.locked) {
      throw new Error("Signal registry is locked");
    }
  }

  registerQuery<TInput, TResult>(
    definition: SignalQueryDefinition<TInput, TResult>,
  ): SignalQueryDefinition<TInput, TResult> {
    this.ensureMutable();
    this.assertName(definition.name);
    this.queries.set(definition.name, definition as SignalQueryDefinition);
    return definition;
  }

  registerMutation<TInput, TResult>(
    definition: SignalMutationDefinition<TInput, TResult>,
  ): SignalMutationDefinition<TInput, TResult> {
    this.ensureMutable();
    this.assertName(definition.name);
    this.mutations.set(definition.name, definition as SignalMutationDefinition);
    return definition;
  }

  registerEvent<TInput, TResult>(
    definition: SignalEventDefinition<TInput, TResult>,
  ): SignalEventDefinition<TInput, TResult> {
    this.ensureMutable();
    this.assertName(definition.name);
    this.events.set(definition.name, definition as SignalEventDefinition);
    return definition;
  }

  getQuery(name: string): SignalQueryDefinition {
    const definition = this.queries.get(name);
    if (!definition) {
      throw createProtocolError(
        "UNSUPPORTED_OPERATION",
        `Unknown query: ${name}`,
      );
    }
    return definition;
  }

  getMutation(name: string): SignalMutationDefinition {
    const definition = this.mutations.get(name);
    if (!definition) {
      throw createProtocolError(
        "UNSUPPORTED_OPERATION",
        `Unknown mutation: ${name}`,
      );
    }
    return definition;
  }

  getEvent(name: string): SignalEventDefinition {
    const definition = this.events.get(name);
    if (!definition) {
      throw createProtocolError(
        "UNSUPPORTED_OPERATION",
        `Unknown event: ${name}`,
      );
    }
    return definition;
  }

  listQueries(): SignalQueryDefinition[] {
    return [...this.queries.values()];
  }

  listMutations(): SignalMutationDefinition[] {
    return [...this.mutations.values()];
  }

  listEvents(): SignalEventDefinition[] {
    return [...this.events.values()];
  }

  allDefinitions(): SignalOperationDefinition[] {
    return [
      ...this.listQueries(),
      ...this.listMutations(),
      ...this.listEvents(),
    ];
  }

  private assertName(name: string): void {
    signalNameSchema.parse(name);
  }
}
