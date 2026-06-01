import type { LifecycleTracker, SignalEnvelope } from "@digelim/12.signal";

export type SourceContext = {
  source?: string;
  meta?: Record<string, unknown>;
  lifecycle?: LifecycleTracker;
};

export class SourceNormalizer {
  enrich<TPayload>(
    envelope: SignalEnvelope<TPayload>,
    context: SourceContext = {},
  ): SignalEnvelope<TPayload> {
    context.lifecycle?.transition("enriched");

    return {
      ...envelope,
      source: context.source ?? envelope.source,
      meta: {
        ...(envelope.meta ?? {}),
        ...(context.meta ?? {}),
      },
    };
  }
}
