import type { NormalizedForecast, ProviderHealth } from "@signal/climate-forecast";

export const EMERGENCY_AWARENESS_APP_ID = "emergency-awareness";
export const CLIMATE_RISK_DOMAIN = "climate-risk";

export const concernStates = [
  "No clear concern",
  "Pay attention",
  "Prepare",
  "Act carefully",
  "Unknown"
] as const;

export type ConcernState = (typeof concernStates)[number];

export type Coordinate = {
  latitude: number;
  longitude: number;
};

export type BoundingBox = {
  minLatitude: number;
  minLongitude: number;
  maxLatitude: number;
  maxLongitude: number;
};

export type GeoJsonGeometry = {
  type: "Point" | "Polygon" | "MultiPolygon";
  coordinates: unknown;
};

export type AreaPolygon = {
  id: string;
  label: string;
  coordinates: Coordinate[];
  approximate: boolean;
};

export type PlaceSearchResult = {
  id: string;
  provider: "nominatim" | "photon" | "pelias" | "demo";
  label: string;
  coordinates: Coordinate;
  region?: string;
  boundingBox?: BoundingBox;
  geometry?: GeoJsonGeometry;
  metadata: Record<string, unknown>;
};

export type ResolvedPlace = PlaceSearchResult & {
  boundary?: AreaPolygon;
  grid: AreaPolygon[];
  precisionLabel: "Known area" | "Approximate area";
  warnings: string[];
  missingInformation: string[];
};

export type RiskZone = AreaPolygon & {
  riskState: ConcernState;
  riskScore: number;
  confidence: number;
  freshness: number;
  reason: string;
  recommendedAction: string;
  warnings: string[];
  missingInformation: string[];
  source: string;
  correlationId: string;
};

export type RiskEvaluationInput = {
  place: ResolvedPlace;
  forecast: NormalizedForecast;
  memory?: MemoryGateway;
  now?: string;
  correlationId?: string;
};

export type RiskEvaluationResult = {
  place: ResolvedPlace;
  zones: RiskZone[];
  primaryConcern: ConcernState;
  confidence: number;
  freshness: number;
  warnings: string[];
  missingInformation: string[];
  source: string;
  correlationId: string;
};

export type GuidanceResult = {
  state: ConcernState;
  whatIsHappening: string;
  why: string[];
  confidence: {
    label: "Low" | "Medium" | "High" | "Unknown";
    value: number;
    explanation: string;
  };
  reasonableNextSteps: string[];
  uncertainty: string[];
  memoryContext: string[];
  warnings: string[];
  missingInformation: string[];
  source: string;
  correlationId: string;
};

export type MapLayerFeature = {
  type: "Feature";
  id: string;
  geometry: {
    type: "Polygon";
    coordinates: number[][][];
  };
  properties: {
    label: string;
    riskState: ConcernState;
    riskScore: number;
    confidence: number;
    freshness: number;
    reason: string;
    recommendedAction: string;
    approximate: boolean;
    warnings: string[];
    missingInformation: string[];
  };
};

export type MapLayerResult = {
  type: "FeatureCollection";
  features: MapLayerFeature[];
  confidence: number;
  freshness: number;
  warnings: string[];
  missingInformation: string[];
  source: string;
  correlationId: string;
};

export type MemoryScope = {
  appId: typeof EMERGENCY_AWARENESS_APP_ID;
  domain: typeof CLIMATE_RISK_DOMAIN;
  decisionId: string;
  timestamp: string;
};

export type SimilarityInsight = {
  similarCases: Array<{
    decisionId: string;
    outcomeSummary: string;
    lessonReferences: string[];
  }>;
  outcomeDistribution: Record<string, number>;
  lessonReferences: string[];
};

export type CalibrationInsight = {
  confidenceAccuracy: number;
  overconfidence: boolean;
  underconfidence: boolean;
  historicalCalibration: {
    sampleSize: number;
    averageCalibrationScore: number;
    reliabilityTrend: string;
  };
};

export type MemoryGateway = {
  recordDecision(input: {
    scope: MemoryScope;
    zone: RiskZone;
    place: ResolvedPlace;
    forecast: NormalizedForecast;
  }): Promise<void>;
  querySimilarity(input: {
    scope: MemoryScope;
    zone: RiskZone;
    place: ResolvedPlace;
    forecast: NormalizedForecast;
  }): Promise<SimilarityInsight>;
  queryCalibration(input: { scope: MemoryScope }): Promise<CalibrationInsight>;
};

export type ProviderHealthResult = {
  providers: ProviderHealth[];
  confidence: number;
  freshness: number;
  warnings: string[];
  missingInformation: string[];
  source: string;
  correlationId: string;
};
