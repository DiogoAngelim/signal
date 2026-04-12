import type { ProviderHealth, Region } from "../types/index.js";
import type { Provider, ProviderAlertResult, ProviderForecastResult } from "./types.js";

export class InmetProvider implements Provider {
  // Scaffolded provider: implement when integrating INMET data sources.
  private health: ProviderHealth = {
    provider: "inmet",
    status: "healthy",
    failureCount: 0
  };

  getName(): string {
    return "inmet";
  }

  getHealth(): ProviderHealth {
    return this.health;
  }

  supportsForecasts(): boolean {
    return true;
  }

  supportsAlerts(): boolean {
    return true;
  }

  async fetchForecasts(_regions: Region[]): Promise<ProviderForecastResult[]> {
    return [];
  }

  async fetchAlerts(_regions: Region[]): Promise<ProviderAlertResult[]> {
    return [];
  }
}
