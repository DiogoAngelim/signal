import type { VesselSnapshot } from "../contracts.js";
import type { MaritimeDataAdapter, NormalizedAdapterOptions } from "./shared.js";
import { adapterSource, createObservation, fixtureFor } from "./shared.js";

export function createVesselAdapter(context: NormalizedAdapterOptions): MaritimeDataAdapter {
  return {
    id: "vessels",
    async collect(area) {
      const fixture = fixtureFor(area, context);
      const unavailable = fixture.unavailableSources?.includes("vessel_activity") ?? false;
      const source = adapterSource({
        id: "vessels:fixture",
        name: "Mock vessel movement context",
        adapter: "vessels",
        updatedAt: fixture.updatedAt,
        unavailable,
        note: unavailable
          ? "The mock vessel feed is stale or unavailable for this scenario."
          : "Fixture vessel context shaped like future AIS provider data.",
        futureIntegration: "AISStream, AISHub, public AIS providers"
      });

      return {
        sources: [source],
        vessels: unavailable ? [] : relocateVesselsToArea(fixture.vessels.snapshots, area.center),
        observations: [
          createObservation({
            area,
            category: "vessel_activity",
            signal: "vessels.congestion",
            source,
            whatMatters: "Navigation",
            threat: unavailable ? "Vessel movement evidence is missing" : "Vessel congestion",
            severity: unavailable ? 2 : fixture.vessels.congestionSeverity,
            confidence: unavailable ? "low" : source.reliability,
            evidence: unavailable
              ? ["The vessel adapter did not return fresh movement positions."]
              : [`${fixture.vessels.snapshots.length} vessels are visible in the mock area.`],
            uncertainty: unavailable
              ? ["Vessels may still be moving through the area, but the guide cannot see them clearly."]
              : ["AIS-like positions can be delayed, incomplete, or missing for some vessels."],
            plainLanguage: unavailable
              ? "Vessel movement evidence is limited, so the map is cautious."
              : congestionCopy(fixture.vessels.congestionSeverity),
            suggestedAction: fixture.vessels.congestionSeverity >= 3 || unavailable
              ? "Leave more room for vessel movement uncertainty."
              : "Use the map as context, not as operational tracking.",
            watchNext: "Watch whether vessels begin clustering around the same routes.",
            details: {
              visibleVessels: unavailable ? 0 : fixture.vessels.snapshots.length
            }
          }),
          createObservation({
            area,
            category: "vessel_activity",
            signal: "vessels.route_conflict",
            source,
            whatMatters: "Trade Flow",
            threat: unavailable ? "Route evidence is missing" : "Route conflicts",
            severity: unavailable ? 2 : fixture.vessels.routeConflictSeverity,
            confidence: unavailable ? "low" : source.reliability,
            evidence: unavailable
              ? ["The vessel adapter did not return enough positions to compare routes."]
              : ["Some vessel headings are converging in the selected area."],
            uncertainty: [
              "The guide does not infer intent from vessel movement.",
              "A crossing route is a reason to pay attention, not proof of a problem."
            ],
            plainLanguage: unavailable
              ? "Route evidence is incomplete."
              : routeCopy(fixture.vessels.routeConflictSeverity),
            suggestedAction: fixture.vessels.routeConflictSeverity >= 3 || unavailable
              ? "Keep attention on crossing movement and avoid over-reading the map."
              : "Keep observing normal vessel flow.",
            watchNext: "Watch whether crossing movement persists or clears.",
            details: {
              routeConflictSeverity: fixture.vessels.routeConflictSeverity
            }
          })
        ]
      };
    }
  };
}

function relocateVesselsToArea(
  snapshots: readonly VesselSnapshot[],
  center: { latitude: number; longitude: number }
) {
  if (!snapshots.length) return [];
  const sourceCenter = snapshots.reduce(
    (sum, vessel) => ({
      latitude: sum.latitude + vessel.latitude / snapshots.length,
      longitude: sum.longitude + vessel.longitude / snapshots.length
    }),
    { latitude: 0, longitude: 0 }
  );
  const latitudeShift = center.latitude - sourceCenter.latitude;
  const longitudeShift = center.longitude - sourceCenter.longitude;
  return snapshots.map((vessel) => ({
    ...vessel,
    latitude: round(vessel.latitude + latitudeShift),
    longitude: round(vessel.longitude + longitudeShift),
    previousLatitude: round(vessel.previousLatitude + latitudeShift),
    previousLongitude: round(vessel.previousLongitude + longitudeShift)
  }));
}

function round(value: number): number {
  return Number(value.toFixed(5));
}

function congestionCopy(severity: number): string {
  if (severity >= 4) return "Many vessels are moving through the same area.";
  if (severity >= 3) return "Many vessels are close enough that movement deserves attention.";
  if (severity >= 2) return "Vessel activity is busier than a quiet day.";
  if (severity >= 1) return "Vessel activity is visible but manageable.";
  return "Vessel activity does not stand out right now.";
}

function routeCopy(severity: number): string {
  if (severity >= 4) return "Several routes appear to be crossing in a tight space.";
  if (severity >= 3) return "Some vessel movement may be competing for the same water.";
  if (severity >= 2) return "Some routes are crossing and worth watching.";
  if (severity >= 1) return "A few route changes are visible.";
  return "Routes do not stand out right now.";
}
