import type {
  BoundingBox,
  Coordinate,
  VesselCluster,
  VesselFreshnessStatus,
  VesselSnapshot,
  VesselTrack
} from "../contracts.js";

const EARTH_KM_PER_DEGREE = 111.32;

export function interpolateVesselPosition(snapshot: VesselSnapshot, at: Date): Coordinate {
  const previous = Date.parse(snapshot.previousUpdatedAt);
  const current = Date.parse(snapshot.updatedAt);
  const target = at.getTime();

  if (Number.isFinite(previous) && Number.isFinite(current) && current > previous && target <= current) {
    const progress = clamp((target - previous) / (current - previous), 0, 1);
    return {
      latitude: round(snapshot.previousLatitude + (snapshot.latitude - snapshot.previousLatitude) * progress),
      longitude: round(snapshot.previousLongitude + (snapshot.longitude - snapshot.previousLongitude) * progress)
    };
  }

  return {
    latitude: snapshot.latitude,
    longitude: snapshot.longitude
  };
}

export function projectVesselPosition(snapshot: VesselSnapshot, at: Date): Coordinate {
  const updated = Date.parse(snapshot.updatedAt);
  if (!Number.isFinite(updated)) {
    return { latitude: snapshot.latitude, longitude: snapshot.longitude };
  }
  const minutesSinceUpdate = Math.max(0, (at.getTime() - updated) / 60000);
  const freshness = vesselFreshness(snapshot, at);
  if (freshness === "stale" || freshness === "offline") {
    return { latitude: snapshot.latitude, longitude: snapshot.longitude };
  }
  const cappedMinutes = Math.min(minutesSinceUpdate, freshness === "live" ? 8 : 4);
  const distanceKm = snapshot.speedKnots * 1.852 * (cappedMinutes / 60);
  const radians = (snapshot.heading * Math.PI) / 180;
  const deltaLatitude = Math.cos(radians) * distanceKm / EARTH_KM_PER_DEGREE;
  const latitudeScale = Math.max(0.25, Math.cos((snapshot.latitude * Math.PI) / 180));
  const deltaLongitude = Math.sin(radians) * distanceKm / (EARTH_KM_PER_DEGREE * latitudeScale);

  return {
    latitude: round(snapshot.latitude + deltaLatitude),
    longitude: round(snapshot.longitude + deltaLongitude)
  };
}

export function normalizeVesselTrack(snapshot: VesselSnapshot, at: Date = new Date()): VesselTrack {
  const freshness = vesselFreshness(snapshot, at);
  return {
    ...snapshot,
    freshness,
    stale: freshness === "stale" || freshness === "offline",
    interpolated: interpolateVesselPosition(snapshot, at),
    projected: projectVesselPosition(snapshot, at),
    movementLabel: movementLabel(snapshot, freshness)
  };
}

export function normalizeVesselTracks(snapshots: readonly VesselSnapshot[], at: Date = new Date()): VesselTrack[] {
  return snapshots
    .map((snapshot) => normalizeVesselTrack(snapshot, at))
    .sort((left, right) => freshnessRank(left.freshness) - freshnessRank(right.freshness) || right.speedKnots - left.speedKnots);
}

export function vesselFreshness(snapshot: VesselSnapshot, at: Date = new Date()): VesselFreshnessStatus {
  const updated = Date.parse(snapshot.updatedAt);
  if (!Number.isFinite(updated)) return "offline";
  const minutes = Math.max(0, (at.getTime() - updated) / 60000);
  if (minutes <= 10) return "live";
  if (minutes <= 45) return "recent";
  if (minutes <= 180) return "stale";
  return "offline";
}

export function clusterVessels(vessels: readonly VesselTrack[], bounds: BoundingBox): VesselCluster[] {
  if (vessels.length < 10) return [];
  const latitudeSpan = Math.max(0.1, bounds.north - bounds.south);
  const longitudeSpan = Math.max(0.1, bounds.east - bounds.west);
  const cellLatitude = latitudeSpan / 5;
  const cellLongitude = longitudeSpan / 5;
  const cells = new Map<string, VesselTrack[]>();

  for (const vessel of vessels) {
    const point = vessel.projected;
    const x = Math.floor((point.longitude - bounds.west) / cellLongitude);
    const y = Math.floor((bounds.north - point.latitude) / cellLatitude);
    const key = `${x}:${y}`;
    const current = cells.get(key) ?? [];
    current.push(vessel);
    cells.set(key, current);
  }

  return [...cells.entries()]
    .filter(([, members]) => members.length >= 2)
    .map(([key, members]) => {
      const dominantClass = dominant(members.map((vessel) => vessel.vesselClass));
      const freshness = members.reduce<VesselFreshnessStatus>(
        (best, vessel) => freshnessRank(vessel.freshness) < freshnessRank(best) ? vessel.freshness : best,
        "offline"
      );
      return {
        id: `cluster:${key}`,
        center: {
          latitude: round(members.reduce((sum, vessel) => sum + vessel.projected.latitude, 0) / members.length),
          longitude: round(members.reduce((sum, vessel) => sum + vessel.projected.longitude, 0) / members.length)
        },
        count: members.length,
        vesselIds: members.map((vessel) => vessel.id),
        dominantClass,
        freshness
      };
    })
    .sort((left, right) => right.count - left.count || left.id.localeCompare(right.id));
}

export function projectToMap(point: Coordinate, bounds: BoundingBox): { x: number; y: number } {
  const longitudeSpan = Math.max(0.0001, bounds.east - bounds.west);
  const latitudeSpan = Math.max(0.0001, bounds.north - bounds.south);
  return {
    x: clamp(((point.longitude - bounds.west) / longitudeSpan) * 100, 0, 100),
    y: clamp(((bounds.north - point.latitude) / latitudeSpan) * 100, 0, 100)
  };
}

function movementLabel(snapshot: VesselSnapshot, freshness: VesselFreshnessStatus): string {
  if (freshness === "offline") return "position unavailable";
  if (freshness === "stale") return "older position";
  if (snapshot.speedKnots < 1) return "nearly still";
  if (snapshot.speedKnots < 8) return "moving slowly";
  if (snapshot.speedKnots < 16) return "moving steadily";
  return "moving quickly";
}

function freshnessRank(status: VesselFreshnessStatus): number {
  return { live: 0, recent: 1, stale: 2, offline: 3 }[status];
}

function dominant<T extends string>(values: readonly T[]): T {
  const counts = new Map<T, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0] ?? values[0]!;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round(value: number): number {
  return Number(value.toFixed(5));
}
