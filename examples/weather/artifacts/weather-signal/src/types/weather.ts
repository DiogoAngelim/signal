export type StatusLevel = "Calm" | "Watch" | "Warning" | "Critical";
export type SignalAction =
  | "Escalate"
  | "Warn"
  | "Watch"
  | "Dispatch"
  | "Review"
  | "Cancel"
  | "Suppress Duplicate"
  | "No Action";

export interface Alert {
  id: string;
  message: string;
  severity: StatusLevel;
  issuedAt: string;
}

export interface ForecastPoint {
  hour: string;
  riskScore: number;
  label: StatusLevel;
}

export interface RegionEvent {
  id: string;
  description: string;
  timestamp: string;
}

export interface Region {
  id: string;
  name: string;
  country: string;
  countryFlag: string;
  latitude: number;
  longitude: number;
  timezone?: string;
  state?: string;
  tags?: string[];
  status: StatusLevel;
  riskScore: number;
  topConcern: string;
  summary: string;
  riskDrivers: string[];
  signalAction?: SignalAction;
  signalConfidence?: number;
  signalSource?: "policy-engine" | "heuristic";
  signalReasons?: string[];
  alerts: Alert[];
  recentEvents: RegionEvent[];
  lastUpdated: string;
  forecastPoints: ForecastPoint[];
  trend: "improving" | "worsening" | "stable";
}

export interface LiveUpdate {
  id: string;
  regionId: string;
  regionName: string;
  message: string;
  status: StatusLevel;
  timestamp: string;
}

export interface ProviderHealthView {
  provider: string;
  status: "healthy" | "degraded" | "down";
  lastSuccessAt?: string;
  lastFailureAt?: string;
  failureCount: number;
  lastLatencyMs?: number;
  notes?: string;
}
