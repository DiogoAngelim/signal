import type { MaritimeDataAdapter, NormalizedAdapterOptions } from "./shared.js";
import { adapterSource, createObservation, fixtureFor } from "./shared.js";

export function createWeatherAdapter(context: NormalizedAdapterOptions): MaritimeDataAdapter {
  return {
    id: "weather",
    async collect(area) {
      const fixture = fixtureFor(area, context);
      const unavailable = fixture.unavailableSources?.includes("weather") ?? false;
      const source = adapterSource({
        id: "weather:fixture",
        name: "Mock maritime weather context",
        adapter: "weather",
        updatedAt: fixture.updatedAt,
        unavailable,
        note: unavailable
          ? "The mock weather feed is unavailable for this scenario."
          : "Fixture weather context shaped like future Open-Meteo, NOAA, or INMET data.",
        futureIntegration: "Open-Meteo, NOAA, INMET"
      });

      return {
        sources: [source],
        observations: [
          createObservation({
            area,
            category: "weather",
            signal: "weather.strong_wind",
            source,
            whatMatters: "Human Safety",
            threat: unavailable ? "Weather evidence is missing" : "Strong winds",
            severity: unavailable ? 2 : fixture.weather.windSeverity,
            confidence: unavailable ? "low" : source.reliability,
            evidence: unavailable
              ? ["The weather adapter did not return fresh wind information."]
              : [`Wind is around ${fixture.weather.windKnots} knots in the selected area.`],
            uncertainty: unavailable
              ? ["Local wind changes may be happening without visible evidence."]
              : ["Wind can change quickly near coastlines and port entrances."],
            plainLanguage: unavailable
              ? "Weather evidence is missing, so the guide stays cautious."
              : windCopy(fixture.weather.windSeverity),
            suggestedAction: fixture.weather.windSeverity >= 3 || unavailable
              ? "Keep plans flexible and check official local weather guidance."
              : "Continue observing normal weather changes.",
            watchNext: "Watch whether wind strengthens near port approaches or exposed coastlines.",
            details: {
              windKnots: fixture.weather.windKnots
            }
          }),
          createObservation({
            area,
            category: "weather",
            signal: "weather.poor_visibility",
            source,
            whatMatters: "Navigation",
            threat: unavailable ? "Visibility evidence is missing" : "Reduced visibility",
            severity: unavailable ? 2 : fixture.weather.visibilitySeverity,
            confidence: unavailable ? "low" : source.reliability,
            evidence: unavailable
              ? ["The weather adapter did not return fresh visibility information."]
              : [`Visibility is around ${fixture.weather.visibilityKm} km in the selected area.`],
            uncertainty: unavailable
              ? ["Fog, rain, or smoke could be affecting smaller parts of the area."]
              : ["Visibility can vary between open water, coastline, and harbor channels."],
            plainLanguage: unavailable
              ? "Visibility evidence is missing, so navigation guidance is cautious."
              : visibilityCopy(fixture.weather.visibilitySeverity),
            suggestedAction: fixture.weather.visibilitySeverity >= 2 || unavailable
              ? "Leave more room for uncertainty and check local notices before tighter navigation."
              : "No special visibility action is suggested.",
            watchNext: "Watch for signs that visibility is getting worse around crossing routes.",
            details: {
              visibilityKm: fixture.weather.visibilityKm
            }
          })
        ]
      };
    }
  };
}

function windCopy(severity: number): string {
  if (severity >= 4) return "Winds may make exposed-water activity difficult.";
  if (severity >= 3) return "Winds are strong enough to deserve attention.";
  if (severity >= 2) return "Winds may affect smaller vessels or exposed routes.";
  if (severity >= 1) return "Wind is noticeable, but not the main concern.";
  return "Wind does not stand out right now.";
}

function visibilityCopy(severity: number): string {
  if (severity >= 4) return "Seeing and judging movement may be difficult.";
  if (severity >= 3) return "Visibility may affect route choices.";
  if (severity >= 2) return "Some parts of the area may be harder to read from the water.";
  if (severity >= 1) return "Visibility is worth noticing, but not the main concern.";
  return "Visibility does not stand out right now.";
}
