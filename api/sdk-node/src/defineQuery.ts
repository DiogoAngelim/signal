import type { SignalQueryDefinition } from "@signal/runtime";

export function defineQuery<TInput, TResult>(
  definition: SignalQueryDefinition<TInput, TResult>
): SignalQueryDefinition<TInput, TResult> {
  return definition;
}
