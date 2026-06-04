export const guidanceLevels = ["steady", "notice", "watch", "act", "urgent"] as const;
export type GuidanceLevel = (typeof guidanceLevels)[number];

export const guidanceLabels: Record<GuidanceLevel, string> = {
  steady: "Steady",
  notice: "Notice",
  watch: "Watch",
  act: "Act",
  urgent: "Urgent"
};

export const maritimeMatters = [
  "Human Safety",
  "Navigation",
  "Port Operations",
  "Marine Environment",
  "Trade Flow",
  "Fishing Resources",
  "Critical Infrastructure"
] as const;
export type MaritimeMatter = (typeof maritimeMatters)[number];

export const areaTypes = [
  "country",
  "continent",
  "ocean",
  "port",
  "bay",
  "coastline",
  "protected_area",
  "custom"
] as const;
export type MaritimeAreaType = (typeof areaTypes)[number];

export const confidenceLevels = ["high", "medium", "limited", "low"] as const;
export type ConfidenceLevel = (typeof confidenceLevels)[number];

export const freshnessStatuses = ["fresh", "recent", "stale", "missing"] as const;
export type FreshnessStatus = (typeof freshnessStatuses)[number];

export const vesselFreshnessStatuses = ["live", "recent", "stale", "offline"] as const;
export type VesselFreshnessStatus = (typeof vesselFreshnessStatuses)[number];

export type Coordinate = {
  latitude: number;
  longitude: number;
};

export type BoundingBox = {
  north: number;
  south: number;
  east: number;
  west: number;
};

export type MaritimeArea = {
  id: string;
  name: string;
  type: MaritimeAreaType;
  label: string;
  country?: string;
  center: Coordinate;
  bounds: BoundingBox;
  radiusKm: number;
  searchTerms: string[];
  fixtureId: FixtureScenarioId;
  userDefined: boolean;
  selection: {
    method: "preset" | "search" | "coordinates" | "map";
    query?: string;
  };
};

export type EvidenceSource = {
  id: string;
  name: string;
  provider: "fixture" | "mock-adapter" | "derived" | "future-live";
  adapter: "region" | "weather" | "ocean" | "vessels" | "ports" | "incidents" | "signal";
  updatedAt: string;
  reliability: ConfidenceLevel;
  freshness: FreshnessStatus;
  status: "available" | "degraded" | "unavailable";
  note: string;
  futureIntegration?: string;
};

export type ObservationCategory =
  | "weather"
  | "ocean"
  | "vessel_activity"
  | "port_operations"
  | "environment"
  | "source_status";

export type MaritimeObservation = {
  id: string;
  areaId: string;
  category: ObservationCategory;
  signal: string;
  whatMatters: MaritimeMatter;
  threat: string;
  observedAt: string;
  validUntil?: string;
  severity: 0 | 1 | 2 | 3 | 4;
  confidence: ConfidenceLevel;
  freshness: FreshnessStatus;
  source: EvidenceSource;
  evidence: string[];
  uncertainty: string[];
  plainLanguage: string;
  suggestedAction: string;
  watchNext: string;
  missing: boolean;
  degraded: boolean;
  details: Record<string, string | number | boolean | null>;
};

export type VesselClass = "cargo" | "tanker" | "passenger" | "fishing" | "service" | "unknown";

export type VesselSnapshot = {
  id: string;
  name: string;
  vesselClass: VesselClass;
  latitude: number;
  longitude: number;
  previousLatitude: number;
  previousLongitude: number;
  heading: number;
  speedKnots: number;
  updatedAt: string;
  previousUpdatedAt: string;
  destination?: string;
  sourceId: string;
};

export type VesselTrack = VesselSnapshot & {
  freshness: VesselFreshnessStatus;
  stale: boolean;
  interpolated: Coordinate;
  projected: Coordinate;
  movementLabel: string;
};

export type VesselCluster = {
  id: string;
  center: Coordinate;
  count: number;
  vesselIds: string[];
  dominantClass: VesselClass;
  freshness: VesselFreshnessStatus;
};

export type MatterStatus = {
  matter: MaritimeMatter;
  status: "healthy" | "changing" | "attention" | "unclear";
  summary: string;
  evidenceIds: string[];
};

export type MaritimeRisk = {
  id: string;
  title: string;
  whatMatters: MaritimeMatter;
  threat: string;
  severity: 0 | 1 | 2 | 3 | 4;
  guidanceLevel: GuidanceLevel;
  guidanceLabel: string;
  meaning: string;
  evidence: string[];
  confidence: ConfidenceLevel;
  uncertainty: string[];
  suggestedAction: string;
  watchNext: string;
  sourceIds: string[];
  freshness: FreshnessStatus;
  fallbackBehavior: string;
  rank: number;
};

export type MaritimeBriefing = {
  id: string;
  area: MaritimeArea;
  generatedAt: string;
  guidanceLevel: GuidanceLevel;
  guidanceLabel: string;
  summary: string;
  currentSituation: string;
  whatMatters: MatterStatus[];
  risks: MaritimeRisk[];
  vessels: VesselTrack[];
  clusters: VesselCluster[];
  vesselSummary: string;
  whatYouCanDo: string[];
  remainsUnclear: string[];
  watchNext: string[];
  sources: EvidenceSource[];
  degraded: boolean;
  degradedMessage?: string;
  operation: {
    name: "maritime.guide.get.v1";
    envelopeId?: string;
    generatedEventId?: string;
  };
  decisionMemory: {
    scope: "examples/maritime-aware";
    enabled: boolean;
    recordId?: string;
    note: string;
  };
};

export type AdapterCollectionResult = {
  area: MaritimeArea;
  observations: MaritimeObservation[];
  sources: EvidenceSource[];
  vessels: VesselTrack[];
  clusters: VesselCluster[];
  degraded: boolean;
};

export type FeedbackInput = {
  briefingId: string;
  riskId?: string;
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

export type MaritimeReviewInput = {
  briefingId: string;
  classification?: "useful" | "too_cautious" | "too_confident" | "missed_context" | "inconclusive";
  whatHappened?: string;
  lesson?: string;
  idempotencyKey?: string;
};

export type MaritimeReviewResult = {
  reviewId: string;
  briefingId: string;
  recordedAt: string;
  status: "recorded";
  memoryRecordId: string;
};

export type FixtureScenarioId =
  | "steady-harbor"
  | "rough-sea"
  | "busy-port"
  | "environment-watch"
  | "route-conflict"
  | "stale-evidence"
  | "custom-area";

export type MaritimeFixtureScenario = {
  id: FixtureScenarioId;
  label: string;
  updatedAt: string;
  weather: {
    windSeverity: 0 | 1 | 2 | 3 | 4;
    visibilitySeverity: 0 | 1 | 2 | 3 | 4;
    windKnots: number;
    visibilityKm: number;
  };
  ocean: {
    seaSeverity: 0 | 1 | 2 | 3 | 4;
    waveHeightM: number;
    currentKnots: number;
  };
  port: {
    congestionSeverity: 0 | 1 | 2 | 3 | 4;
    waitingVessels: number;
    berthDelayHours: number;
  };
  vessels: {
    congestionSeverity: 0 | 1 | 2 | 3 | 4;
    routeConflictSeverity: 0 | 1 | 2 | 3 | 4;
    snapshots: VesselSnapshot[];
  };
  incidents: {
    environmentalSeverity: 0 | 1 | 2 | 3 | 4;
    headline: string;
  };
  unavailableSources?: ObservationCategory[];
};
