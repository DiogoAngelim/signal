export type ForecastProviderName =
  | "open-meteo"
  | "noaa"
  | "ecmwf"
  | "inmet"
  | "nasa"
  | "copernicus"
  | "river-gauge"
  | "local-sensor"
  | "fallback";

export type Coordinates = {
  latitude: number;
  longitude: number;
};

export type ForecastRequest = Coordinates & {
  timezone?: string;
  hours?: number;
  now?: string;
  correlationId?: string;
};

export type ForecastHour = {
  time: string;
  temperatureC?: number;
  relativeHumidityPercent?: number;
  precipitationMm?: number;
  precipitationProbabilityPercent?: number;
  windSpeedKph?: number;
  weatherCode?: number;
};

export type ForecastFreshness = {
  fetchedAt: string;
  expiresAt: string;
  ageMs: number;
  state: "fresh" | "stale" | "outdated" | "missing";
  score: number;
};

export type ForecastSummary = {
  nextHours: number;
  totalPrecipitationMm: number;
  maxHourlyPrecipitationMm: number;
  maxPrecipitationProbabilityPercent: number;
  maxWindSpeedKph: number;
  minTemperatureC?: number;
  maxTemperatureC?: number;
  weatherCodes: number[];
};

export type NormalizedForecast = ForecastRequest & {
  provider: ForecastProviderName;
  source: string;
  sourceUpdatedAt?: string;
  hourly: ForecastHour[];
  summary: ForecastSummary;
  confidence: number;
  freshness: ForecastFreshness;
  warnings: string[];
  missingInformation: string[];
  stale: boolean;
  fromCache: boolean;
  degraded: boolean;
  correlationId: string;
};

export type ProviderHealth = {
  provider: ForecastProviderName;
  healthy: boolean;
  status: "ok" | "degraded" | "failing" | "circuit-open" | "unknown";
  checkedAt: string;
  latencyMs?: number;
  failureCount: number;
  circuitOpenUntil?: string;
  message?: string;
};

export type ForecastProvider = {
  name: ForecastProviderName;
  source: string;
  getForecast(request: ForecastRequest, context?: ForecastProviderContext): Promise<NormalizedForecast>;
  health?(context?: ForecastProviderContext): Promise<ProviderHealth>;
};

export type ForecastProviderContext = {
  fetch?: typeof fetch;
  timeoutMs?: number;
  now?: () => Date;
};

export type ForecastCache = {
  get(key: string): Promise<NormalizedForecast | undefined>;
  set(key: string, value: NormalizedForecast): Promise<void>;
};

export type ForecastClientOptions = {
  provider: ForecastProvider;
  fallbackProviders?: ForecastProvider[];
  cache?: ForecastCache;
  fetch?: typeof fetch;
  timeoutMs?: number;
  retries?: number;
  backoffMs?: number;
  freshForMs?: number;
  staleAfterMs?: number;
  circuitBreaker?: {
    failureThreshold?: number;
    openMs?: number;
  };
  now?: () => Date;
};

export type ForecastGetOptions = ForecastRequest & {
  forceRefresh?: boolean;
};
