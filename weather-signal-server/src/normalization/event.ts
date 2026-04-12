import type { NormalizedEvent } from "../types/index.js";
import { createId } from "../utils/ids.js";
import { nowIso } from "../utils/time.js";

interface EventInput {
  name: string;
  payload: unknown;
  provider: string;
  providerEventId?: string;
  fetchedAt?: string;
  regionId?: string;
  dedupeKey?: string;
  confidence?: number | null;
  rawIncluded?: boolean;
  correlationId?: string;
}

export function createNormalizedEvent(input: EventInput): NormalizedEvent {
  return {
    protocol: "signal.weather.v1",
    kind: "event",
    name: input.name,
    messageId: createId(),
    timestamp: nowIso(),
    source: {
      provider: input.provider,
      providerEventId: input.providerEventId,
      fetchedAt: input.fetchedAt,
      regionId: input.regionId
    },
    payload: input.payload,
    meta: {
      dedupeKey: input.dedupeKey,
      confidence: input.confidence ?? null,
      rawIncluded: input.rawIncluded ?? false,
      correlationId: input.correlationId
    }
  };
}
