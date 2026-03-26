import { registerMinimalRuntime } from "@signal/examples/minimal-runtime";
import { registerPostPublication } from "@signal/examples/post-publication";
import type { SignalRuntime } from "@signal/runtime";

export function registerReferenceOperations(runtime: SignalRuntime) {
  const minimal = registerMinimalRuntime(runtime);
  const publication = registerPostPublication(runtime, undefined, {
    registerSubscriber: false,
  });

  return { minimal, publication };
}
