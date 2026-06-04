import type {
  AdapterCollectionResult,
  EvidenceSource,
  FixtureScenarioId,
  MaritimeArea,
  MaritimeObservation,
  ObservationCategory,
  VesselSnapshot
} from "../contracts.js";
import { getMaritimeFixture } from "../fixtures.js";

export type AdapterMode = "fixture" | "future-live";

export type AdapterOptions = {
  mode?: AdapterMode;
  fixtureId?: FixtureScenarioId;
  now?: () => Date;
};

export type NormalizedAdapterOptions = {
  mode: AdapterMode;
  fixtureId?: FixtureScenarioId;
  now: () => Date;
};

export type MaritimeAdapterResult = {
  observations: MaritimeObservation[];
  sources: EvidenceSource[];
  vessels?: VesselSnapshot[];
};

export type MaritimeDataAdapter = {
  id: string;
  collect(area: MaritimeArea): Promise<MaritimeAdapterResult>;
};

export function normalizeAdapterOptions(options: AdapterOptions = {}): NormalizedAdapterOptions {
  return {
    mode: options.mode ?? "fixture",
    fixtureId: options.fixtureId,
    now: options.now ?? (() => new Date())
  };
}

export function fixtureFor(area: MaritimeArea, context: NormalizedAdapterOptions) {
  return getMaritimeFixture(context.fixtureId ?? area.fixtureId);
}

export function adapterSource(input: {
  id: string;
  name: string;
  adapter: EvidenceSource["adapter"];
  updatedAt: string;
  category?: ObservationCategory;
  reliability?: EvidenceSource["reliability"];
  note: string;
  futureIntegration?: string;
  unavailable?: boolean;
  degraded?: boolean;
}): EvidenceSource {
  const stale = Date.parse(input.updatedAt) < Date.parse("2026-06-03T10:00:00.000Z");
  return {
    id: input.id,
    name: input.name,
    provider: "mock-adapter",
    adapter: input.adapter,
    updatedAt: input.updatedAt,
    reliability: input.reliability ?? (input.unavailable ? "low" : input.degraded || stale ? "limited" : "medium"),
    freshness: input.unavailable ? "missing" : stale ? "stale" : input.degraded ? "recent" : "fresh",
    status: input.unavailable ? "unavailable" : input.degraded || stale ? "degraded" : "available",
    note: input.note,
    futureIntegration: input.futureIntegration
  };
}

export function createObservation(input: {
  area: MaritimeArea;
  category: ObservationCategory;
  signal: string;
  source: EvidenceSource;
  whatMatters: MaritimeObservation["whatMatters"];
  threat: string;
  severity: MaritimeObservation["severity"];
  confidence?: MaritimeObservation["confidence"];
  evidence: string[];
  uncertainty?: string[];
  plainLanguage: string;
  suggestedAction: string;
  watchNext: string;
  details?: MaritimeObservation["details"];
}): MaritimeObservation {
  return {
    id: `${input.area.id}:${input.signal}`,
    areaId: input.area.id,
    category: input.category,
    signal: input.signal,
    whatMatters: input.whatMatters,
    threat: input.threat,
    observedAt: input.source.updatedAt,
    severity: input.severity,
    confidence: input.confidence ?? input.source.reliability,
    freshness: input.source.freshness,
    source: input.source,
    evidence: input.evidence,
    uncertainty: input.uncertainty ?? [],
    plainLanguage: input.plainLanguage,
    suggestedAction: input.suggestedAction,
    watchNext: input.watchNext,
    missing: input.source.status === "unavailable",
    degraded: input.source.status !== "available",
    details: input.details ?? {}
  };
}

export function emptyResult(): AdapterCollectionResult {
  throw new Error("emptyResult is a type helper and should not be called.");
}
