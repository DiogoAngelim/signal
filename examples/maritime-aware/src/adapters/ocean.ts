import type { MaritimeDataAdapter, NormalizedAdapterOptions } from "./shared.js";
import { adapterSource, createObservation, fixtureFor } from "./shared.js";

export function createOceanAdapter(context: NormalizedAdapterOptions): MaritimeDataAdapter {
  return {
    id: "ocean",
    async collect(area) {
      const fixture = fixtureFor(area, context);
      const source = adapterSource({
        id: "ocean:fixture",
        name: "Mock ocean condition context",
        adapter: "ocean",
        updatedAt: fixture.updatedAt,
        note: "Fixture ocean context shaped like future Copernicus Marine or NOAA ocean data.",
        futureIntegration: "Copernicus Marine, NOAA Ocean Data"
      });

      return {
        sources: [source],
        observations: [
          createObservation({
            area,
            category: "ocean",
            signal: "ocean.rough_sea",
            source,
            whatMatters: "Navigation",
            threat: "Rough sea conditions",
            severity: fixture.ocean.seaSeverity,
            evidence: [
              `Wave height is around ${fixture.ocean.waveHeightM} m.`,
              `Current is around ${fixture.ocean.currentKnots} knots.`
            ],
            uncertainty: [
              "Open-water conditions can be smoother or rougher than the area average.",
              "Small craft and larger commercial vessels experience the same sea state differently."
            ],
            plainLanguage: seaCopy(fixture.ocean.seaSeverity),
            suggestedAction: fixture.ocean.seaSeverity >= 3
              ? "Consider delaying optional exposed-water activity."
              : "Keep watching whether sea conditions become more difficult.",
            watchNext: "Watch whether waves, wind, and vessel speed all point toward harder movement.",
            details: {
              waveHeightM: fixture.ocean.waveHeightM,
              currentKnots: fixture.ocean.currentKnots
            }
          })
        ]
      };
    }
  };
}

function seaCopy(severity: number): string {
  if (severity >= 4) return "Sea conditions may make movement difficult.";
  if (severity >= 3) return "Sea conditions are becoming more difficult.";
  if (severity >= 2) return "Sea conditions may require extra care.";
  if (severity >= 1) return "Sea conditions are mildly active.";
  return "Sea conditions do not stand out right now.";
}
