export type Severity = "info" | "minor" | "moderate" | "severe" | "extreme";
export type Certainty = "observed" | "likely" | "possible" | "unlikely" | "unknown";
export type Urgency = "immediate" | "expected" | "future" | "past" | "unknown";
export type Hazard =
  | "heavy_rain"
  | "flash_flood"
  | "river_flood"
  | "coastal_flood"
  | "high_wind"
  | "severe_storm"
  | "lightning"
  | "hail"
  | "extreme_heat"
  | "extreme_cold"
  | "drought"
  | "wildfire_weather"
  | "landslide_risk"
  | "marine_hazard";
export type RiskLevel = "low" | "guarded" | "elevated" | "high" | "critical";
export type PolicyDecisionType =
  | "NO_ACTION"
  | "WATCH"
  | "WARN"
  | "ESCALATE"
  | "DISPATCH"
  | "CANCEL"
  | "SUPPRESS_DUPLICATE"
  | "REQUIRE_HUMAN_REVIEW";
export type ProviderHealthStatus = "healthy" | "degraded" | "down";

export interface Region {
  id: string;
  name: string;
  country: string;
  state?: string;
  latitude: number;
  longitude: number;
  timezone: string;
  criticalityWeight?: number;
  tags?: string[];
}

export interface RegionProfile extends Region {
  profileVersion?: string;
}

export interface WeatherMetrics {
  precipitationMmNext6h: number;
  precipitationMmNext24h: number;
  windGustKphMax: number;
  temperatureCMax: number;
  temperatureCMin: number;
  weatherCodeMax?: number;
}

export interface ForecastSnapshot {
  regionId: string;
  provider: string;
  fetchedAt: string;
  validFrom: string;
  validTo: string;
  metrics: WeatherMetrics;
  raw?: unknown;
}

export interface OfficialAlert {
  provider: string;
  providerEventId: string;
  regionId: string;
  hazards: Hazard[];
  severity: Severity;
  certainty: Certainty;
  urgency: Urgency;
  status: "active" | "cancelled" | "unknown";
  headline?: string;
  description?: string;
  instruction?: string;
  sentAt?: string;
  effectiveAt?: string;
  onsetAt?: string;
  endsAt?: string;
  updatedAt?: string;
  raw?: unknown;
}

export interface RiskComponent {
  score: number;
  level: RiskLevel;
  topDrivers: Array<{
    name: string;
    weight: number;
    value: number | string | boolean;
  }>;
}

export interface RiskScore {
  regionId: string;
  computedAt: string;
  dataConfidence: number;
  precipitationRisk: RiskComponent;
  floodRisk: RiskComponent;
  windRisk: RiskComponent;
  heatRisk: RiskComponent;
  stormRisk: RiskComponent;
  landslideRisk: RiskComponent;
  compositeRisk: RiskComponent;
}

export interface PolicyDecision {
  decision: PolicyDecisionType;
  policyVersion: string;
  confidence: number;
  reasons: string[];
  topDrivers: RiskComponent["topDrivers"];
  regionId: string;
  generatedAt: string;
  correlationId?: string;
}

export interface ActionDispatch {
  action: string;
  payload: unknown;
  regionId: string;
  createdAt: string;
}

export interface ResultRecord {
  id: string;
  type: string;
  createdAt: string;
  regionId?: string;
  payload: unknown;
}

export interface ProviderHealth {
  provider: string;
  status: ProviderHealthStatus;
  lastSuccessAt?: string;
  lastFailureAt?: string;
  failureCount: number;
  lastLatencyMs?: number;
  notes?: string;
}

export interface NormalizedEvent {
  protocol: "signal.weather.v1";
  kind: "event" | "query" | "mutation";
  name: string;
  messageId: string;
  timestamp: string;
  source: {
    provider: string;
    providerEventId?: string;
    fetchedAt?: string;
    regionId?: string;
  };
  payload: unknown;
  meta?: {
    dedupeKey?: string;
    traceId?: string;
    correlationId?: string;
    replaySafe?: boolean;
    confidence?: number | null;
    rawIncluded?: boolean;
  };
}

export interface WebhookSubscription {
  id: string;
  url: string;
  createdAt: string;
  enabled: boolean;
  events?: string[];
  regionIds?: string[];
  headers?: Record<string, string>;
}

export interface WebhookDeliveryLog {
  id: string;
  subscriptionId: string;
  eventName: string;
  status: "delivered" | "failed";
  attempt: number;
  responseStatus?: number;
  deliveredAt: string;
  error?: string;
}
