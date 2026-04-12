import { z } from "zod";
import type { ProviderHealth, Region } from "../types/index.js";
import type { Provider, ProviderAlertResult, ProviderForecastResult } from "./types.js";
import { normalizeNwsAlert } from "../normalization/alerts.js";
import { runBatched } from "../utils/batch.js";
import { fetchWithTimeout } from "../utils/fetch.js";
import { nwsAlertCancelledFixture } from "../fixtures/nws-alert-cancelled.js";
import { nwsAlertIssuedFixture } from "../fixtures/nws-alert-issued.js";
import { nwsAlertUpdatedFixture } from "../fixtures/nws-alert-updated.js";

const nwsSchema = z.object({
  features: z
    .array(
      z.object({
        id: z.string(),
        properties: z.record(z.string().or(z.number()).or(z.boolean()).or(z.null())).optional()
      })
    )
    .default([])
});

interface NwsProviderOptions {
  demoMode: boolean;
  timeoutMs: number;
  batchSize: number;
  batchDelayMs: number;
}

export class NwsProvider implements Provider {
  private health: ProviderHealth = {
    provider: "nws",
    status: "healthy",
    failureCount: 0
  };

  constructor(private readonly options: NwsProviderOptions) { }

  getName(): string {
    return "nws";
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

  async fetchAlerts(regions: Region[]): Promise<ProviderAlertResult[]> {
    const usRegions = regions.filter(isUsRegion);
    return runBatched(
      usRegions,
      this.options.batchSize,
      this.options.batchDelayMs,
      async (region) => {
        const payload = this.options.demoMode
          ? chooseDemoPayload(region)
          : await this.fetchRegion(region);
        const parsed = nwsSchema.safeParse(payload);
        if (!parsed.success) {
          throw new Error(`Invalid NWS response for ${region.id}`);
        }
        const alerts = parsed.data.features.map((feature) =>
          normalizeNwsAlert(
            {
              id: feature.id,
              properties: (feature.properties ?? {}) as Record<string, unknown>
            },
            region
          )
        );
        return {
          regionId: region.id,
          alerts,
          raw: payload
        } satisfies ProviderAlertResult;
      }
    );
  }

  private async fetchRegion(region: Region): Promise<unknown> {
    const url = new URL("https://api.weather.gov/alerts/active");
    url.searchParams.set("point", `${region.latitude},${region.longitude}`);

    const response = await fetchWithTimeout(
      url.toString(),
      {
        method: "GET",
        headers: {
          "User-Agent": "weather-signal-server/0.1.0 (contact: ops@weather-signal)"
        }
      },
      this.options.timeoutMs
    );
    if (!response.ok) {
      throw new Error(`NWS failed with status ${response.status}`);
    }
    return response.json();
  }
}

function isUsRegion(region: Region): boolean {
  const country = region.country.trim().toUpperCase();
  return country === "US" || country === "USA" || country === "UNITED STATES";
}

function chooseDemoPayload(region: Region): unknown {
  if (region.id.endsWith("updated")) {
    return nwsAlertUpdatedFixture;
  }
  if (region.id.endsWith("cancelled")) {
    return nwsAlertCancelledFixture;
  }
  return nwsAlertIssuedFixture;
}
