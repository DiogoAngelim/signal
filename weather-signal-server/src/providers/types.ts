import type {
  ForecastSnapshot,
  OfficialAlert,
  ProviderHealth,
  Region
} from "../types/index.js";

export interface ProviderForecastResult {
  regionId: string;
  forecast: ForecastSnapshot;
  raw?: unknown;
}

export interface ProviderAlertResult {
  regionId: string;
  alerts: OfficialAlert[];
  raw?: unknown;
}

export interface Provider {
  getName(): string;
  getHealth(): ProviderHealth;
  supportsForecasts(): boolean;
  supportsAlerts(): boolean;
  fetchForecasts(regions: Region[]): Promise<ProviderForecastResult[]>;
  fetchAlerts(regions: Region[]): Promise<ProviderAlertResult[]>;
}
