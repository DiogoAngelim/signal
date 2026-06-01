import type { SignalEventDefinition } from "@signal/runtime";

export function defineEvent<TInput, TResult = void>(
  definition: SignalEventDefinition<TInput, TResult>
): SignalEventDefinition<TInput, TResult> {
  return definition;
}
