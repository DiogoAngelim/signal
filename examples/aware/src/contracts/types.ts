export const attentionLevels = [
  "normal",
  "notice",
  "warning",
  "urgency",
  "emergency",
] as const;
export type AttentionLevel = (typeof attentionLevels)[number];

export const attentionLabels: Record<AttentionLevel, string> = {
  normal: "Normal",
  notice: "Notice",
  warning: "Warning",
  urgency: "Urgency",
  emergency: "Emergency",
};

export const safetyActions = [
  "Observe",
  "Monitor",
  "Prepare",
  "Reduce Exposure",
  "Delay Activity",
  "Protect",
  "Shelter",
  "Relocate",
  "Seek Assistance",
] as const;
export type SafetyAction = (typeof safetyActions)[number];

export const sourceReliabilityLevels = ["high", "medium", "limited"] as const;
export type SourceReliability = (typeof sourceReliabilityLevels)[number];

export const freshnessStatuses = [
  "fresh",
  "recent",
  "stale",
  "missing",
] as const;
export type FreshnessStatus = (typeof freshnessStatuses)[number];

export type EvidenceSource = {
  id: string;
  name: string;
  url?: string;
  provider: "live" | "fixture" | "derived";
  updatedAt: string;
  reliability: SourceReliability;
  freshness: FreshnessStatus;
  status: "available" | "degraded" | "unavailable";
  note: string;
};

export type Region = {
  id: string;
  name: string;
  adminArea: string;
  country: string;
  latitude: number;
  longitude: number;
  timezone: string;
  searchTerms: string[];
  defaultFixtureId: FixtureScenarioId;
};

export type ObservationCategory =
  | "weather"
  | "air_quality"
  | "pollen"
  | "official_alert"
  | "mosquito"
  | "source_status";

export type SafetyObservation = {
  id: string;
  regionId: string;
  category: ObservationCategory;
  signal: string;
  observedAt: string;
  validUntil?: string;
  severity: 0 | 1 | 2 | 3 | 4;
  attentionHint: AttentionLevel;
  source: EvidenceSource;
  plainLanguage: string;
  missing: boolean;
  degraded: boolean;
  details: Record<string, string | number | boolean | null>;
};

export type SafetyRisk = {
  id: string;
  category: ObservationCategory;
  title: string;
  attentionLevel: AttentionLevel;
  score: number;
  meaning: string;
  primaryAction: SafetyAction;
  reasons: string[];
  observations: SafetyObservation[];
  sourceIds: string[];
  reliability: SourceReliability;
  freshness: FreshnessStatus;
  fallbackBehavior: string;
};

export type BriefingItem = {
  id: string;
  title: string;
  icon: "sun" | "cloud-rain" | "wind" | "leaf" | "shield" | "droplets" | "info";
  attentionLevel: AttentionLevel;
  attentionLabel: string;
  meaning: string;
  primaryAction: SafetyAction;
  whyThisMatters: string[];
  whatYouCanDo: string[];
  whenItMatters: string;
  plainLanguageExplanation: string;
  fallbackBehavior: string;
  reliability: SourceReliability;
  freshnessStatus: FreshnessStatus;
  updatedAt: string;
  sources: EvidenceSource[];
  technicalDetails: Array<{ label: string; value: string }>;
  rank: number;
};

export type WeatherSignal = {
  id: string;
  signal: "weather.heat" | "weather.heavy_rain" | "weather.uv";
  label: "Heat" | "Rain" | "UV";
  attentionLevel: AttentionLevel;
  attentionLabel: string;
  severity: 0 | 1 | 2 | 3 | 4;
  meaning: string;
  updatedAt: string;
  sourceIds: string[];
};

export type Briefing = {
  id: string;
  region: Region;
  generatedAt: string;
  attentionLevel: AttentionLevel;
  attentionLabel: string;
  summary: string;
  itemCountText: string;
  items: BriefingItem[];
  weatherSignals: WeatherSignal[];
  degraded: boolean;
  degradedMessage?: string;
  sources: EvidenceSource[];
  operation: {
    name: "aware.briefing.get.v1";
    envelopeId?: string;
    generatedEventId?: string;
  };
  decisionMemory: {
    scope: "examples/aware";
    enabled: boolean;
    recordId?: string;
    note: string;
  };
};

export type AdapterCollectionResult = {
  region: Region;
  observations: SafetyObservation[];
  sources: EvidenceSource[];
  degraded: boolean;
};

export type FeedbackInput = {
  briefingId: string;
  itemId?: string;
  helpful: boolean;
  comment?: string;
  idempotencyKey?: string;
};

export type FeedbackResult = {
  feedbackId: string;
  briefingId: string;
  receivedAt: string;
  status: "recorded";
  message: string;
};

export type BriefingReviewInput = {
  briefingId: string;
  classification?: "correct" | "wrong" | "early" | "late" | "inconclusive";
  whatHappened?: string;
  lesson?: string;
  idempotencyKey?: string;
};

export type BriefingReviewResult = {
  reviewId: string;
  briefingId: string;
  recordedAt: string;
  status: "recorded";
  memoryRecordId: string;
};

export type FixtureScenarioId =
  | "normal-day"
  | "strong-uv-day"
  | "heat-warning-day"
  | "heavy-rain-flood-risk-day"
  | "poor-air-quality-day"
  | "mosquito-activity-warning"
  | "multiple-simultaneous-risks"
  | "source-unavailable";

export type AwareFixtureScenario = {
  id: FixtureScenarioId;
  label: string;
  regionId: string;
  updatedAt: string;
  weather: {
    heatSeverity: 0 | 1 | 2 | 3 | 4;
    rainSeverity: 0 | 1 | 2 | 3 | 4;
    uvSeverity: 0 | 1 | 2 | 3 | 4;
    maxTemperatureC: number;
    precipitationMm: number;
    uvIndex: number;
  };
  airQuality: {
    severity: 0 | 1 | 2 | 3 | 4;
    usAqi: number;
    pm25: number;
  };
  pollen: {
    severity: 0 | 1 | 2 | 3 | 4;
    index: number;
    dominant: string;
  };
  officialAlerts: {
    severity: 0 | 1 | 2 | 3 | 4;
    headline: string;
    urgency: "none" | "minor" | "moderate" | "severe" | "extreme";
  };
  mosquito: {
    severity: 0 | 1 | 2 | 3 | 4;
    activityIndex: number;
    rationale: string;
  };
  unavailableSources?: ObservationCategory[];
};
