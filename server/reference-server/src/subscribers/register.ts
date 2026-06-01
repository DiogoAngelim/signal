import { createReplaySafeSubscriber } from "@signal/runtime";
import type { SignalRuntime } from "@signal/runtime";

export function registerReferenceSubscribers(runtime: SignalRuntime) {
  const seen: string[] = [];

  runtime.subscribe(
    "post.published.v1",
    createReplaySafeSubscriber(async (event) => {
      seen.push(event.messageId);
    })
  );

  return { seen };
}
