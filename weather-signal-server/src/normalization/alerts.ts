import type { Hazard, OfficialAlert, Region } from "../types/index.js";
import { mapCertainty, mapSeverity, mapUrgency } from "./mappings.js";

export interface NwsAlertFeature {
  id: string;
  properties: Record<string, unknown>;
}

export function normalizeNwsAlert(feature: NwsAlertFeature, region: Region): OfficialAlert {
  const properties = feature.properties ?? {};
  const providerEventId = stringValue(properties.id) ?? feature.id;
  const messageType = (stringValue(properties.messageType) ?? "").toLowerCase();

  return {
    provider: "nws",
    providerEventId,
    regionId: region.id,
    hazards: mapNwsEventToHazards(stringValue(properties.event)),
    severity: mapSeverity(stringValue(properties.severity)),
    certainty: mapCertainty(stringValue(properties.certainty)),
    urgency: mapUrgency(stringValue(properties.urgency)),
    status: messageType === "cancel" ? "cancelled" : "active",
    headline: stringValue(properties.headline),
    description: stringValue(properties.description),
    instruction: stringValue(properties.instruction),
    sentAt: stringValue(properties.sent),
    effectiveAt: stringValue(properties.effective),
    onsetAt: stringValue(properties.onset),
    endsAt: stringValue(properties.ends),
    updatedAt: stringValue(properties.updated),
    raw: feature
  };
}

export function mapNwsEventToHazards(eventName?: string): Hazard[] {
  if (!eventName) {
    return ["severe_storm"];
  }
  const normalized = eventName.toLowerCase();
  if (normalized.includes("flash flood")) {
    return ["flash_flood"];
  }
  if (normalized.includes("flood")) {
    return ["river_flood"];
  }
  if (normalized.includes("coastal")) {
    return ["coastal_flood"];
  }
  if (normalized.includes("wind")) {
    return ["high_wind"];
  }
  if (normalized.includes("hail")) {
    return ["hail"];
  }
  if (normalized.includes("lightning")) {
    return ["lightning"];
  }
  if (normalized.includes("heat")) {
    return ["extreme_heat"];
  }
  if (normalized.includes("cold")) {
    return ["extreme_cold"];
  }
  if (normalized.includes("fire") || normalized.includes("red flag")) {
    return ["wildfire_weather"];
  }
  if (normalized.includes("marine") || normalized.includes("gale")) {
    return ["marine_hazard", "high_wind"];
  }
  if (normalized.includes("drought")) {
    return ["drought"];
  }
  return ["severe_storm"];
}

export function resolveAlertEventName(alert: OfficialAlert, messageType?: string): string {
  const normalizedType = (messageType ?? "").toLowerCase();
  if (alert.status === "cancelled" || normalizedType === "cancel") {
    return "weather.alert.cancelled";
  }
  if (normalizedType === "update") {
    return "weather.alert.updated";
  }
  return "weather.alert.issued";
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
