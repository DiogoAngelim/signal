import type { MaritimeDataAdapter, NormalizedAdapterOptions } from "./shared.js";
import { adapterSource, createObservation, fixtureFor } from "./shared.js";

export function createIncidentAdapter(context: NormalizedAdapterOptions): MaritimeDataAdapter {
  return {
    id: "incidents",
    async collect(area) {
      const fixture = fixtureFor(area, context);
      const source = adapterSource({
        id: "incidents:fixture",
        name: "Mock public maritime notices",
        adapter: "incidents",
        updatedAt: fixture.updatedAt,
        degraded: fixture.id === "stale-evidence",
        note: "Fixture public notices shaped like future environmental, safety, and maritime advisory feeds.",
        futureIntegration: "Environmental notices, public maritime advisories, safety notices"
      });

      return {
        sources: [source],
        observations: [
          createObservation({
            area,
            category: "environment",
            signal: "incidents.environmental_notice",
            source,
            whatMatters: "Marine Environment",
            threat: "Environmental incident or protected-area pressure",
            severity: fixture.incidents.environmentalSeverity,
            evidence: [fixture.incidents.headline],
            uncertainty: [
              "Public notices may lag what is happening on the water.",
              "The guide cannot verify private operator reports."
            ],
            plainLanguage: environmentCopy(fixture.incidents.environmentalSeverity, fixture.incidents.headline),
            suggestedAction: fixture.incidents.environmentalSeverity >= 3
              ? "Avoid adding pressure to the affected area and check the public notice source."
              : "Keep watching public notices for changes.",
            watchNext: "Watch whether the affected area expands, clears, or receives official restrictions.",
            details: {
              headline: fixture.incidents.headline
            }
          })
        ]
      };
    }
  };
}

function environmentCopy(severity: number, headline: string): string {
  if (severity >= 4) return "A public environmental notice may require immediate attention.";
  if (severity >= 3) return headline;
  if (severity >= 2) return "Environmental conditions deserve attention.";
  if (severity >= 1) return "A minor environmental notice is present.";
  return "No environmental incident stands out right now.";
}
