import type { MaritimeDataAdapter, NormalizedAdapterOptions } from "./shared.js";
import { adapterSource, createObservation, fixtureFor } from "./shared.js";

export function createPortAdapter(context: NormalizedAdapterOptions): MaritimeDataAdapter {
  return {
    id: "ports",
    async collect(area) {
      const fixture = fixtureFor(area, context);
      const source = adapterSource({
        id: "ports:fixture",
        name: "Mock port operations context",
        adapter: "ports",
        updatedAt: fixture.updatedAt,
        note: "Fixture port context shaped like future public port information and logistics feeds.",
        futureIntegration: "Public port information and public logistics feeds"
      });

      return {
        sources: [source],
        observations: [
          createObservation({
            area,
            category: "port_operations",
            signal: "port.congestion",
            source,
            whatMatters: "Port Operations",
            threat: "Port congestion",
            severity: fixture.port.congestionSeverity,
            evidence: [
              `${fixture.port.waitingVessels} vessels are waiting in the mock port context.`,
              `Berth delay is around ${fixture.port.berthDelayHours} hours.`
            ],
            uncertainty: [
              "Port queues can change when weather, labor, customs, or berth availability changes.",
              "The guide does not know every vessel's commercial plan."
            ],
            plainLanguage: portCopy(fixture.port.congestionSeverity),
            suggestedAction: fixture.port.congestionSeverity >= 3
              ? "Expect slower movement through the area and keep timing assumptions flexible."
              : "Treat port flow as normal unless new notices appear.",
            watchNext: "Watch whether waiting vessels increase or spread into nearby routes.",
            details: {
              waitingVessels: fixture.port.waitingVessels,
              berthDelayHours: fixture.port.berthDelayHours
            }
          })
        ]
      };
    }
  };
}

function portCopy(severity: number): string {
  if (severity >= 4) return "Port movement appears heavily constrained.";
  if (severity >= 3) return "Port movement may be slower than usual.";
  if (severity >= 2) return "Some port timing may be changing.";
  if (severity >= 1) return "Port activity is present, but not the main concern.";
  return "Port activity does not stand out right now.";
}
