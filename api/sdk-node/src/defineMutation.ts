import type { SignalMutationDefinition } from "@signal/runtime";

export function defineMutation<TInput, TResult>(
  definition: SignalMutationDefinition<TInput, TResult>
): SignalMutationDefinition<TInput, TResult> {
  return definition;
}
