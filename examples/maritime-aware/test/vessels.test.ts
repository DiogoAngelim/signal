import { describe, expect, it } from "vitest";
import type { VesselSnapshot } from "../src/contracts.js";
import {
  clusterVessels,
  interpolateVesselPosition,
  normalizeVesselTracks,
  projectToMap,
  projectVesselPosition,
  vesselFreshness
} from "../src/map/vessels.js";

const snapshot: VesselSnapshot = {
  id: "test-vessel",
  name: "Test Vessel",
  vesselClass: "cargo",
  latitude: 10,
  longitude: 20,
  previousLatitude: 9,
  previousLongitude: 18,
  heading: 90,
  speedKnots: 12,
  updatedAt: "2026-06-03T12:00:00.000Z",
  previousUpdatedAt: "2026-06-03T11:50:00.000Z",
  sourceId: "vessels:fixture"
};

describe("Vessel interpolation and clustering", () => {
  it("interpolates between previous and current vessel positions", () => {
    const point = interpolateVesselPosition(snapshot, new Date("2026-06-03T11:55:00.000Z"));

    expect(point).toEqual({ latitude: 9.5, longitude: 19 });
  });

  it("projects fresh vessels with speed-aware movement and freezes stale vessels", () => {
    const fresh = projectVesselPosition(snapshot, new Date("2026-06-03T12:05:00.000Z"));
    const stale = projectVesselPosition(snapshot, new Date("2026-06-03T15:30:00.000Z"));

    expect(fresh.longitude).toBeGreaterThan(snapshot.longitude);
    expect(fresh.latitude).toBeCloseTo(snapshot.latitude, 1);
    expect(stale).toEqual({ latitude: snapshot.latitude, longitude: snapshot.longitude });
  });

  it("classifies freshness and clusters dense vessel activity", () => {
    const now = new Date("2026-06-03T12:04:00.000Z");
    const vessels = normalizeVesselTracks(
      Array.from({ length: 12 }, (_, index) => ({
        ...snapshot,
        id: `vessel-${index}`,
        latitude: 10 + index * 0.002,
        longitude: 20 + index * 0.002,
        previousLatitude: 9.99 + index * 0.002,
        previousLongitude: 19.99 + index * 0.002
      })),
      now
    );
    const clusters = clusterVessels(vessels, { north: 11, south: 9, east: 21, west: 19 });

    expect(vesselFreshness(snapshot, now)).toBe("live");
    expect(clusters[0]?.count).toBeGreaterThan(1);
    expect(projectToMap({ latitude: 10, longitude: 20 }, { north: 11, south: 9, east: 21, west: 19 })).toEqual({ x: 50, y: 50 });
  });
});
