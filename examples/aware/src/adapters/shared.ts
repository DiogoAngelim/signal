import type {
  AttentionLevel,
  EvidenceSource,
  FixtureScenarioId,
  FreshnessStatus,
  ObservationCategory,
  Region,
  SafetyObservation,
  SourceReliability
} from "../contracts.js";
import { fixtureForRegion } from "../fixtures.js";

export type AdapterMode = "fixture" | "live-first";

export type AdapterOptions = {
  mode?: AdapterMode;
  fixtureId?: FixtureScenarioId;
  fetcher?: typeof fetch;
  now?: () => Date;
};

export type AdapterContext = Required<Pick<AdapterOptions, "mode" | "now">> & {
  fixtureId?: FixtureScenarioId;
  fetcher?: typeof fetch;
};

export type AdapterRunResult = {
  observations: SafetyObservation[];
  sources: EvidenceSource[];
};

export type SafetyDataAdapter = {
  id: string;
  category: ObservationCategory;
  collect(region: Region): Promise<AdapterRunResult>;
};

export function normalizeAdapterOptions(options: AdapterOptions = {}): AdapterContext {
  return {
    mode: options.mode ?? "live-first",
    fixtureId: options.fixtureId,
    fetcher: options.fetcher ?? globalThis.fetch,
    now: options.now ?? (() => new Date())
  };
}

export function scenarioFor(region: Region, context: AdapterContext) {
  return fixtureForRegion(region, context.fixtureId);
}

export function attentionFromSeverity(severity: number): AttentionLevel {
  if (severity >= 4) return "emergency";
  if (severity >= 3) return "urgency";
  if (severity >= 2) return "warning";
  if (severity >= 1) return "notice";
  return "normal";
}

export function freshnessFromUpdatedAt(updatedAt: string, now: Date): FreshnessStatus {
  const ageMs = Math.max(0, now.getTime() - new Date(updatedAt).getTime());
  if (!Number.isFinite(ageMs)) return "missing";
  if (ageMs <= 45 * 60 * 1000) return "fresh";
  if (ageMs <= 6 * 60 * 60 * 1000) return "recent";
  return "stale";
}

export function createSource(input: {
  id: string;
  name: string;
  url?: string;
  provider: EvidenceSource["provider"];
  updatedAt: string;
  reliability: SourceReliability;
  freshness?: FreshnessStatus;
  status?: EvidenceSource["status"];
  note: string;
}, now: Date): EvidenceSource {
  return {
    id: input.id,
    name: input.name,
    url: input.url,
    provider: input.provider,
    updatedAt: input.updatedAt,
    reliability: input.reliability,
    freshness: input.freshness ?? freshnessFromUpdatedAt(input.updatedAt, now),
    status: input.status ?? "available",
    note: input.note
  };
}

export function createObservation(input: {
  id: string;
  region: Region;
  category: ObservationCategory;
  signal: string;
  observedAt: string;
  validUntil?: string;
  severity: 0 | 1 | 2 | 3 | 4;
  source: EvidenceSource;
  plainLanguage: string;
  missing?: boolean;
  degraded?: boolean;
  details: Record<string, string | number | boolean | null>;
}): SafetyObservation {
  return {
    id: input.id,
    regionId: input.region.id,
    category: input.category,
    signal: input.signal,
    observedAt: input.observedAt,
    validUntil: input.validUntil,
    severity: input.severity,
    attentionHint: attentionFromSeverity(input.severity),
    source: input.source,
    plainLanguage: input.plainLanguage,
    missing: input.missing ?? false,
    degraded: input.degraded ?? input.source.status !== "available",
    details: input.details
  };
}

export function createUnavailableObservation(input: {
  region: Region;
  sourceId: string;
  sourceName: string;
  category: ObservationCategory;
  updatedAt: string;
  note: string;
  url?: string;
}, now: Date): AdapterRunResult {
  const source = createSource({
    id: input.sourceId,
    name: input.sourceName,
    url: input.url,
    provider: "fixture",
    updatedAt: input.updatedAt,
    reliability: "limited",
    freshness: "missing",
    status: "unavailable",
    note: input.note
  }, now);
  return {
    sources: [source],
    observations: [
      createObservation({
        id: `${input.region.id}:${input.category}:source-unavailable`,
        region: input.region,
        category: "source_status",
        signal: `${input.category}.source.unavailable`,
        observedAt: input.updatedAt,
        severity: 1,
        source,
        plainLanguage: "A source that usually helps this briefing is unavailable right now.",
        missing: true,
        degraded: true,
        details: {
          unavailableCategory: input.category,
          fallback: true
        }
      })
    ]
  };
}

export function maxSeverity(...values: Array<0 | 1 | 2 | 3 | 4>): 0 | 1 | 2 | 3 | 4 {
  return Math.max(...values) as 0 | 1 | 2 | 3 | 4;
}

export function severityFromThresholds(value: number, thresholds: {
  notice: number;
  warning: number;
  urgency: number;
  emergency?: number;
}): 0 | 1 | 2 | 3 | 4 {
  if (thresholds.emergency != null && value >= thresholds.emergency) return 4;
  if (value >= thresholds.urgency) return 3;
  if (value >= thresholds.warning) return 2;
  if (value >= thresholds.notice) return 1;
  return 0;
}

export function numberOrZero(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
