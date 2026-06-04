import type { FixtureScenarioId, MaritimeArea, MaritimeFixtureScenario, VesselSnapshot } from "../contracts.js";

const FIXTURE_TIME = "2026-06-03T12:00:00.000Z";
const RECENT_TIME = "2026-06-03T11:56:00.000Z";
const PREVIOUS_TIME = "2026-06-03T11:46:00.000Z";
const STALE_TIME = "2026-06-03T09:10:00.000Z";
const STALE_PREVIOUS_TIME = "2026-06-03T08:40:00.000Z";

export const maritimeAreaPresets: MaritimeArea[] = [
  {
    id: "santos-port-br",
    name: "Port of Santos",
    type: "port",
    label: "Brazil port area",
    country: "Brazil",
    center: { latitude: -23.95, longitude: -46.32 },
    bounds: { north: -23.72, south: -24.16, east: -45.95, west: -46.62 },
    radiusKm: 42,
    searchTerms: ["santos", "port of santos", "brazil", "sao paulo", "trade flow"],
    fixtureId: "busy-port",
    userDefined: false,
    selection: { method: "preset" }
  },
  {
    id: "guanabara-bay-br",
    name: "Guanabara Bay",
    type: "bay",
    label: "Rio de Janeiro bay",
    country: "Brazil",
    center: { latitude: -22.82, longitude: -43.17 },
    bounds: { north: -22.62, south: -23.02, east: -42.98, west: -43.34 },
    radiusKm: 34,
    searchTerms: ["rio", "rio de janeiro", "guanabara", "bay", "brazil coastline"],
    fixtureId: "route-conflict",
    userDefined: false,
    selection: { method: "preset" }
  },
  {
    id: "south-atlantic",
    name: "South Atlantic",
    type: "ocean",
    label: "Open ocean area",
    center: { latitude: -31.6, longitude: -30.4 },
    bounds: { north: -22.5, south: -40.5, east: -18.6, west: -43.2 },
    radiusKm: 1200,
    searchTerms: ["south atlantic", "atlantic ocean", "open ocean", "south america"],
    fixtureId: "rough-sea",
    userDefined: false,
    selection: { method: "preset" }
  },
  {
    id: "valparaiso-coast-cl",
    name: "Valparaiso Coast",
    type: "coastline",
    label: "Chile coastline",
    country: "Chile",
    center: { latitude: -33.04, longitude: -71.63 },
    bounds: { north: -32.72, south: -33.34, east: -71.31, west: -72.06 },
    radiusKm: 58,
    searchTerms: ["valparaiso", "chile", "coastline", "pacific"],
    fixtureId: "stale-evidence",
    userDefined: false,
    selection: { method: "preset" }
  },
  {
    id: "chesapeake-bay-us",
    name: "Chesapeake Bay",
    type: "bay",
    label: "United States bay",
    country: "United States",
    center: { latitude: 38.15, longitude: -76.25 },
    bounds: { north: 39.55, south: 36.95, east: -75.62, west: -77.15 },
    radiusKm: 150,
    searchTerms: ["chesapeake", "maryland", "virginia", "bay", "united states"],
    fixtureId: "steady-harbor",
    userDefined: false,
    selection: { method: "preset" }
  },
  {
    id: "galapagos-protected-area-ec",
    name: "Galapagos Marine Reserve",
    type: "protected_area",
    label: "Protected marine area",
    country: "Ecuador",
    center: { latitude: -0.65, longitude: -90.55 },
    bounds: { north: 1.4, south: -2.1, east: -88.75, west: -92.3 },
    radiusKm: 220,
    searchTerms: ["galapagos", "marine reserve", "ecuador", "protected area", "fishing resources"],
    fixtureId: "environment-watch",
    userDefined: false,
    selection: { method: "preset" }
  },
  {
    id: "singapore-strait",
    name: "Singapore Strait",
    type: "coastline",
    label: "Dense maritime corridor",
    country: "Singapore",
    center: { latitude: 1.22, longitude: 103.92 },
    bounds: { north: 1.48, south: 1.02, east: 104.42, west: 103.42 },
    radiusKm: 52,
    searchTerms: ["singapore", "strait", "malacca", "port", "trade"],
    fixtureId: "busy-port",
    userDefined: false,
    selection: { method: "preset" }
  }
];

export const maritimeFixtureCatalog: Record<FixtureScenarioId, MaritimeFixtureScenario> = {
  "steady-harbor": {
    id: "steady-harbor",
    label: "Steady harbor day",
    updatedAt: FIXTURE_TIME,
    weather: {
      windSeverity: 0,
      visibilitySeverity: 0,
      windKnots: 12,
      visibilityKm: 16
    },
    ocean: {
      seaSeverity: 1,
      waveHeightM: 0.8,
      currentKnots: 0.7
    },
    port: {
      congestionSeverity: 1,
      waitingVessels: 4,
      berthDelayHours: 2
    },
    vessels: {
      congestionSeverity: 1,
      routeConflictSeverity: 0,
      snapshots: vesselsNear(-76.25, 38.15, "chesapeake")
    },
    incidents: {
      environmentalSeverity: 0,
      headline: "No public environmental incident is visible in the mock feed."
    }
  },
  "rough-sea": {
    id: "rough-sea",
    label: "Open ocean rough sea",
    updatedAt: FIXTURE_TIME,
    weather: {
      windSeverity: 3,
      visibilitySeverity: 2,
      windKnots: 35,
      visibilityKm: 5
    },
    ocean: {
      seaSeverity: 4,
      waveHeightM: 5.4,
      currentKnots: 2.2
    },
    port: {
      congestionSeverity: 0,
      waitingVessels: 0,
      berthDelayHours: 0
    },
    vessels: {
      congestionSeverity: 1,
      routeConflictSeverity: 1,
      snapshots: vesselsNear(-30.4, -31.6, "atlantic")
    },
    incidents: {
      environmentalSeverity: 0,
      headline: "No public environmental incident is visible in the mock feed."
    }
  },
  "busy-port": {
    id: "busy-port",
    label: "Busy port approach",
    updatedAt: FIXTURE_TIME,
    weather: {
      windSeverity: 1,
      visibilitySeverity: 1,
      windKnots: 17,
      visibilityKm: 11
    },
    ocean: {
      seaSeverity: 1,
      waveHeightM: 1.1,
      currentKnots: 1.1
    },
    port: {
      congestionSeverity: 3,
      waitingVessels: 24,
      berthDelayHours: 15
    },
    vessels: {
      congestionSeverity: 3,
      routeConflictSeverity: 2,
      snapshots: vesselsNear(103.92, 1.22, "singapore", 18)
    },
    incidents: {
      environmentalSeverity: 1,
      headline: "Minor shoreline notice is present, with no immediate public restriction in the mock feed."
    }
  },
  "environment-watch": {
    id: "environment-watch",
    label: "Protected area watch",
    updatedAt: FIXTURE_TIME,
    weather: {
      windSeverity: 1,
      visibilitySeverity: 0,
      windKnots: 14,
      visibilityKm: 18
    },
    ocean: {
      seaSeverity: 1,
      waveHeightM: 1.4,
      currentKnots: 1
    },
    port: {
      congestionSeverity: 0,
      waitingVessels: 0,
      berthDelayHours: 0
    },
    vessels: {
      congestionSeverity: 2,
      routeConflictSeverity: 1,
      snapshots: vesselsNear(-90.55, -0.65, "galapagos", 12)
    },
    incidents: {
      environmentalSeverity: 3,
      headline: "Protected-area notice asks vessels to avoid a sensitive shoreline zone."
    }
  },
  "route-conflict": {
    id: "route-conflict",
    label: "Crossing traffic in a bay",
    updatedAt: FIXTURE_TIME,
    weather: {
      windSeverity: 1,
      visibilitySeverity: 1,
      windKnots: 16,
      visibilityKm: 10
    },
    ocean: {
      seaSeverity: 1,
      waveHeightM: 1,
      currentKnots: 1.3
    },
    port: {
      congestionSeverity: 2,
      waitingVessels: 10,
      berthDelayHours: 7
    },
    vessels: {
      congestionSeverity: 2,
      routeConflictSeverity: 3,
      snapshots: vesselsNear(-43.17, -22.82, "rio", 14)
    },
    incidents: {
      environmentalSeverity: 1,
      headline: "Small craft advisory is visible near the bay entrance in the mock feed."
    }
  },
  "stale-evidence": {
    id: "stale-evidence",
    label: "Stale evidence mode",
    updatedAt: STALE_TIME,
    weather: {
      windSeverity: 1,
      visibilitySeverity: 1,
      windKnots: 15,
      visibilityKm: 9
    },
    ocean: {
      seaSeverity: 2,
      waveHeightM: 2.1,
      currentKnots: 1.4
    },
    port: {
      congestionSeverity: 1,
      waitingVessels: 5,
      berthDelayHours: 4
    },
    vessels: {
      congestionSeverity: 1,
      routeConflictSeverity: 1,
      snapshots: vesselsNear(-71.63, -33.04, "valparaiso", 7, STALE_TIME, STALE_PREVIOUS_TIME)
    },
    incidents: {
      environmentalSeverity: 0,
      headline: "No public environmental incident is visible, but the incident feed is stale."
    },
    unavailableSources: ["weather", "vessel_activity"]
  },
  "custom-area": {
    id: "custom-area",
    label: "Custom maritime area",
    updatedAt: FIXTURE_TIME,
    weather: {
      windSeverity: 1,
      visibilitySeverity: 0,
      windKnots: 13,
      visibilityKm: 14
    },
    ocean: {
      seaSeverity: 1,
      waveHeightM: 1.5,
      currentKnots: 0.9
    },
    port: {
      congestionSeverity: 1,
      waitingVessels: 3,
      berthDelayHours: 3
    },
    vessels: {
      congestionSeverity: 1,
      routeConflictSeverity: 1,
      snapshots: vesselsNear(-38.5, -12.8, "custom", 8)
    },
    incidents: {
      environmentalSeverity: 0,
      headline: "No public environmental incident is visible in the mock feed."
    }
  }
};

function vesselsNear(
  longitude: number,
  latitude: number,
  prefix: string,
  count = 8,
  updatedAt = RECENT_TIME,
  previousUpdatedAt = PREVIOUS_TIME
): VesselSnapshot[] {
  const classes: VesselSnapshot["vesselClass"][] = ["cargo", "tanker", "passenger", "fishing", "service"];
  return Array.from({ length: count }, (_, index) => {
    const lane = index % 4;
    const offset = (index - count / 2) * 0.018;
    const cross = (lane - 1.5) * 0.028;
    const heading = (72 + index * 29) % 360;
    const speedKnots = 6 + (index % 6) * 2.6;
    const nextLongitude = longitude + offset + cross * 0.35;
    const nextLatitude = latitude + cross + offset * 0.15;
    return {
      id: `${prefix}-vessel-${index + 1}`,
      name: `${title(prefix)} ${String(index + 1).padStart(2, "0")}`,
      vesselClass: classes[index % classes.length] ?? "unknown",
      latitude: Number(nextLatitude.toFixed(5)),
      longitude: Number(nextLongitude.toFixed(5)),
      previousLatitude: Number((nextLatitude - Math.sin((heading * Math.PI) / 180) * 0.018).toFixed(5)),
      previousLongitude: Number((nextLongitude - Math.cos((heading * Math.PI) / 180) * 0.018).toFixed(5)),
      heading,
      speedKnots,
      updatedAt,
      previousUpdatedAt,
      destination: index % 3 === 0 ? "Port approach" : index % 3 === 1 ? "Coastal route" : "Holding area",
      sourceId: "vessels:fixture"
    };
  });
}

function title(value: string): string {
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
