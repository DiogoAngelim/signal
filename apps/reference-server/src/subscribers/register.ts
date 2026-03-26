import { createReplaySafeSubscriber } from "@signal/runtime";
import type { SignalRuntime } from "@signal/runtime";

export function registerReferenceSubscribers(runtime: SignalRuntime) {
  const seen: string[] = [];

  runtime.subscribe(
    "payment.captured.v1",
    createReplaySafeSubscriber(async (event) => {
      seen.push(event.messageId);
    })
  );

  runtime.subscribe(
    "escrow.released.v1",
    createReplaySafeSubscriber(async (event) => {
      seen.push(event.messageId);
    })
  );

  runtime.subscribe(
    "user.onboarded.v1",
    createReplaySafeSubscriber(async (event) => {
      seen.push(event.messageId);
    })
  );

  return { seen };
}
