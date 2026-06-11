import type { Region } from "../contracts.js";
import {
  type AdapterContext,
  type AdapterRunResult,
  type SafetyDataAdapter,
  createObservation,
  createSource,
  numberOrZero,
  scenarioFor,
  severityFromThresholds,
} from "./shared.js";

type OpenMeteoPollenResponse = {
  hourly?: {
    time?: string[];
    grass_pollen?: number[];
    ragweed_pollen?: number[];
  };
};

export function createPollenAdapter(
  context: AdapterContext,
): SafetyDataAdapter {
  return {
    id: "environmental-exposure-open-meteo",
    category: "pollen",
    async collect(region: Region): Promise<AdapterRunResult> {
      if (context.mode === "live-first" && context.fetcher) {
        try {
          const live = await collectLivePollen(region, context);
          if (live) return live;
        } catch {}
      }
      return collectFixturePollen(region, context);
    },
  };
}

async function collectLivePollen(
  region: Region,
  context: AdapterContext,
): Promise<AdapterRunResult | undefined> {
  if (!context.fetcher) return undefined;
  const params = new URLSearchParams({
    latitude: String(region.latitude),
    longitude: String(region.longitude),
    hourly: "grass_pollen,ragweed_pollen",
    timezone: region.timezone,
  });
  const response = await context.fetcher(
    `https://air-quality-api.open-meteo.com/v1/air-quality?${params.toString()}`,
    {
      headers: { Accept: "application/json" },
    },
  );
  if (!response.ok) return undefined;
  const payload = (await response.json()) as OpenMeteoPollenResponse;
  const grass = numberOrZero(payload.hourly?.grass_pollen?.[0]);
  const ragweed = numberOrZero(payload.hourly?.ragweed_pollen?.[0]);
  const index = Math.max(grass, ragweed);
  const dominant = grass >= ragweed ? "grass" : "ragweed";
  const updatedAt = payload.hourly?.time?.[0]
    ? new Date(payload.hourly.time[0]).toISOString()
    : context.now().toISOString();
  return fromPollenValues(region, context, {
    source: createSource(
      {
        id: "open-meteo-pollen",
        name: "Open-Meteo environmental exposure",
        url: "https://open-meteo.com/",
        provider: "live",
        updatedAt,
        reliability: "limited",
        note: "Live no-key pollen-style exposure evidence where available.",
      },
      context.now(),
    ),
    observedAt: updatedAt,
    index,
    dominant,
    provider: "live",
  });
}

function collectFixturePollen(
  region: Region,
  context: AdapterContext,
): AdapterRunResult {
  const scenario = scenarioFor(region, context);
  return fromPollenValues(region, context, {
    source: createSource(
      {
        id: "fixture-pollen",
        name: "Aware fixture environmental exposure",
        provider: "fixture",
        updatedAt: scenario.updatedAt,
        reliability: "limited",
        note: "Fixture exposure evidence models pollen or similar environmental irritants.",
      },
      context.now(),
    ),
    observedAt: scenario.updatedAt,
    index: scenario.pollen.index,
    dominant: scenario.pollen.dominant,
    severity: scenario.pollen.severity,
    provider: "fixture",
  });
}

function fromPollenValues(
  region: Region,
  context: AdapterContext,
  input: {
    source: ReturnType<typeof createSource>;
    observedAt: string;
    index: number;
    dominant: string;
    severity?: 0 | 1 | 2 | 3 | 4;
    provider: "fixture" | "live";
  },
): AdapterRunResult {
  const severity =
    input.severity ??
    severityFromThresholds(input.index, {
      notice: 4,
      warning: 7,
      urgency: 10,
    });
  return {
    sources: [input.source],
    observations: [
      createObservation({
        id: `${region.id}:environmental-exposure`,
        region,
        category: "pollen",
        signal: "environmental_exposure.pollen",
        observedAt: input.observedAt,
        validUntil: new Date(
          new Date(input.observedAt).getTime() + 24 * 60 * 60 * 1000,
        ).toISOString(),
        severity,
        source: input.source,
        plainLanguage:
          severity > 0
            ? "Pollen or similar exposure may be noticeable today."
            : "Pollen-style exposure does not stand out in the available evidence.",
        details: {
          exposureIndex: input.index,
          dominant: input.dominant,
          provider: input.provider,
        },
      }),
    ],
  };
}
