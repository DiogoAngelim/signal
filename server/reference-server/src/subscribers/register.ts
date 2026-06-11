import type { SignalRuntime } from "@signal/sdk-node";
import type { HighRiskPaymentStore } from "../operations/high-risk-payment";

function captureIdFromPayload(payload: unknown): string | undefined {
  if (
    typeof payload !== "object" ||
    payload === null ||
    Array.isArray(payload)
  ) {
    return undefined;
  }

  const captureId = (payload as Record<string, unknown>).captureId;
  return typeof captureId === "string" && captureId ? captureId : undefined;
}

export function registerReferenceSubscribers(
  runtime: SignalRuntime,
  highRiskPaymentStore?: HighRiskPaymentStore,
) {
  const seen: string[] = [];

  runtime.subscribe(
    "post.published.v1",
    async (event) => {
      seen.push(event.messageId);
    },
    {
      consumerId: "reference-post-observer",
      replaySafe: true,
    },
  );

  runtime.subscribe(
    "payment.captured.v1",
    async (event) => {
      seen.push(event.messageId);
      const captureId = captureIdFromPayload(event.payload);
      if (captureId) {
        highRiskPaymentStore?.recordSubscriberDelivery({
          messageId: event.messageId,
          captureId,
        });
      }
    },
    {
      consumerId: "reference-payment-ledger",
      replaySafe: true,
    },
  );

  return { seen };
}
