import { z } from "zod";
import type { ForecastSnapshot, ProviderHealth, Region } from "../types/index.js";
import type { Provider, ProviderAlertResult, ProviderForecastResult } from "./types.js";
import { buildForecastSnapshot } from "../normalization/forecast.js";
import { openMeteoFixture } from "../fixtures/open-meteo.js";
import { runBatched } from "../utils/batch.js";
import { fetchWithTimeout } from "../utils/fetch.js";
import { nowIso } from "../utils/time.js";

const openMeteoSchema = z.object({
  hourly: z
    .object({
      time: z.array(z.string()),
      precipitation: z.array(z.number()),
      windgusts_10m: z.array(z.number()),
      temperature_2m: z.array(z.number()),
      weathercode: z.array(z.number()).optional()
    })
    .optional(),
  daily: z
    .object({
      time: z.array(z.string()),
      precipitation_sum: z.array(z.number()),
      temperature_2m_max: z.array(z.number()),
      temperature_2m_min: z.array(z.number())
    })
    .optional()
});

interface OpenMeteoProviderOptions {
  demoMode: boolean;
  timeoutMs: number;
  batchSize: number;
  batchDelayMs: number;
}

export class OpenMeteoProvider implements Provider {
  private health: ProviderHealth = {
    provider: "open-meteo",
    status: "healthy",
    failureCount: 0
  };

  constructor(private readonly options: OpenMeteoProviderOptions) { }

  getName(): string {
    return "open-meteo";
  }

  getHealth(): ProviderHealth {
    return this.health;
  }

  supportsForecasts(): boolean {
    return true;
  }

  supportsAlerts(): boolean {
    return false;
  }

  async fetchForecasts(regions: Region[]): Promise<ProviderForecastResult[]> {
    const fetchedAt = nowIso();
    return runBatched(
      regions,
      this.options.batchSize,
      this.options.batchDelayMs,
      async (region) => {
        const payload = this.options.demoMode
          ? openMeteoFixture
          : await this.fetchRegion(region);
        const parsed = openMeteoSchema.safeParse(payload);
        if (!parsed.success) {
          throw new Error(`Invalid Open-Meteo response for ${region.id}`);
        }
        const forecast: ForecastSnapshot = buildForecastSnapshot(
          region,
          this.getName(),
          parsed.data,
          fetchedAt
        );
        return {
          regionId: region.id,
          forecast,
          raw: payload
        } satisfies ProviderForecastResult;
      }
    );
  }

  async fetchAlerts(_regions: Region[]): Promise<ProviderAlertResult[]> {
    return [];
  }

  private async fetchRegion(region: Region): Promise<unknown> {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", region.latitude.toString());
    url.searchParams.set("longitude", region.longitude.toString());
    url.searchParams.set(
      "hourly",
      "precipitation,windgusts_10m,temperature_2m,weathercode"
    );
    url.searchParams.set(
      "daily",
      "precipitation_sum,temperature_2m_max,temperature_2m_min"
    );
    url.searchParams.set("forecast_days", "2");
    url.searchParams.set("timezone", "UTC");

    const response = await fetchWithTimeout(url.toString(), { method: "GET" }, this.options.timeoutMs);
    if (!response.ok) {
      throw new Error(`Open-Meteo failed with status ${response.status}`);
    }
    return response.json();
  }
}
