import {
  type LifecycleTracker,
  type SignalEnvelope,
  createSignalEnvelope,
  signalNameSchema,
} from "@digelim/12.signal";

export type Intent = {
  kind: "query" | "mutation" | "event";
  name: string;
  payload: unknown;
  source?: string;
  traceId?: string;
};

export type IntentContext = {
  lifecycle?: LifecycleTracker;
  traceId?: string;
  source?: string;
};

export class IntentNormalizer {
  normalize(intent: Intent, context: IntentContext = {}): SignalEnvelope {
    context.lifecycle?.transition("received");

    signalNameSchema.parse(intent.name);
    context.lifecycle?.transition("validated");

    const envelope = createSignalEnvelope({
      kind: intent.kind,
      name: intent.name,
      payload: intent.payload,
      traceId: intent.traceId ?? context.traceId,
      source: intent.source ?? context.source,
    });

    return envelope;
  }
}
