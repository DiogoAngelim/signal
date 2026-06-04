import type { Region } from "../contracts.js";
import {
  createObservation,
  createSource,
  createUnavailableObservation,
  scenarioFor,
  type AdapterContext,
  type AdapterRunResult,
  type SafetyDataAdapter
} from "./shared.js";

type NoaaAlertFeature = {
  properties?: {
    id?: string;
    event?: string;
    headline?: string;
    severity?: string;
    urgency?: string;
    effective?: string;
    expires?: string;
    senderName?: string;
  };
};

type NoaaAlertResponse = {
  features?: NoaaAlertFeature[];
};

export function createOfficialAlertsAdapter(context: AdapterContext): SafetyDataAdapter {
  return {
    id: "official-alerts-noaa",
    category: "official_alert",
    async collect(region: Region): Promise<AdapterRunResult> {
      const scenario = scenarioFor(region, context);
      if (scenario.unavailableSources?.includes("official_alert")) {
        return createUnavailableObservation({
          region,
          sourceId: "noaa-alerts",
          sourceName: "National Weather Service alerts",
          category: "official_alert",
          updatedAt: scenario.updatedAt,
          url: "https://api.weather.gov/",
          note: "Official alert source was intentionally unavailable in this fixture."
        }, context.now());
      }
      if (context.mode === "live-first" && context.fetcher && region.country === "United States") {
        try {
          const live = await collectLiveAlerts(region, context);
          if (live) return live;
        } catch {
          // Fall back to fixture data.
        }
      }
      return collectFixtureAlerts(region, context);
    }
  };
}

async function collectLiveAlerts(region: Region, context: AdapterContext): Promise<AdapterRunResult | undefined> {
  if (!context.fetcher) return undefined;
  const params = new URLSearchParams({
    point: `${region.latitude},${region.longitude}`
  });
  const response = await context.fetcher(`https://api.weather.gov/alerts/active?${params.toString()}`, {
    headers: {
      "Accept": "application/geo+json, application/json",
      "User-Agent": "Signal Aware Example (https://github.com/)"
    }
  });
  if (!response.ok) return undefined;
  const payload = (await response.json()) as NoaaAlertResponse;
  const feature = (payload.features ?? [])[0];
  const properties = feature?.properties;
  const updatedAt = properties?.effective ? new Date(properties.effective).toISOString() : context.now().toISOString();
  const severity = severityFromNoaa(properties?.severity, properties?.urgency);
  const source = createSource({
    id: "noaa-alerts",
    name: properties?.senderName ?? "National Weather Service alerts",
    url: "https://api.weather.gov/",
    provider: "live",
    updatedAt,
    reliability: "high",
    note: "Live official weather alert feed for supported US locations."
  }, context.now());
  return {
    sources: [source],
    observations: [
      createObservation({
        id: `${region.id}:official-alert:${properties?.id ?? "none"}`,
        region,
        category: "official_alert",
        signal: "official_alert.weather",
        observedAt: updatedAt,
        validUntil: properties?.expires ? new Date(properties.expires).toISOString() : undefined,
        severity,
        source,
        plainLanguage: severity > 0
          ? (properties?.headline ?? "An official weather alert is active for this area.")
          : "No active official weather alerts were found from the live source.",
        details: {
          event: properties?.event ?? "none",
          severity: properties?.severity ?? "none",
          urgency: properties?.urgency ?? "none",
          provider: "live"
        }
      })
    ]
  };
}

function collectFixtureAlerts(region: Region, context: AdapterContext): AdapterRunResult {
  const scenario = scenarioFor(region, context);
  const source = createSource({
    id: "fixture-official-alerts",
    name: "Aware fixture official alerts",
    provider: "fixture",
    updatedAt: scenario.updatedAt,
    reliability: "high",
    note: "Fixture alert evidence mirrors official alert style without calling live services."
  }, context.now());
  return {
    sources: [source],
    observations: [
      createObservation({
        id: `${region.id}:official-alert`,
        region,
        category: "official_alert",
        signal: "official_alert.weather",
        observedAt: scenario.updatedAt,
        validUntil: new Date(new Date(scenario.updatedAt).getTime() + 12 * 60 * 60 * 1000).toISOString(),
        severity: scenario.officialAlerts.severity,
        source,
        plainLanguage: scenario.officialAlerts.severity > 0
          ? scenario.officialAlerts.headline
          : "No active official weather alerts were found in the fixture.",
        details: {
          headline: scenario.officialAlerts.headline,
          urgency: scenario.officialAlerts.urgency,
          provider: "fixture"
        }
      })
    ]
  };
}

function severityFromNoaa(severity?: string, urgency?: string): 0 | 1 | 2 | 3 | 4 {
  const value = `${severity ?? ""} ${urgency ?? ""}`.toLowerCase();
  if (value.includes("extreme")) return 4;
  if (value.includes("severe") || value.includes("immediate")) return 3;
  if (value.includes("moderate") || value.includes("expected")) return 2;
  if (value.includes("minor") || value.includes("future") || value.includes("unknown")) return 1;
  return 0;
}
