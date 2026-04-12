import type { ProviderHealth, Region } from "../types/index.js";
import type { Provider, ProviderAlertResult, ProviderForecastResult } from "./types.js";

export class MeteoAlarmProvider implements Provider {
  // Scaffolded provider: implement when integrating MeteoAlarm feeds.
  private health: ProviderHealth = {
    provider: "meteo-alarm",
    status: "healthy",
    failureCount: 0
  };

  getName(): string {
    return "meteo-alarm";
  }

  getHealth(): ProviderHealth {
    return this.health;
  }

  supportsForecasts(): boolean {
    return false;
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
