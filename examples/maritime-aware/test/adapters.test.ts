import { describe, expect, it } from "vitest";
import {
  collectMaritimeContext,
  createFixtureMaritimeAdapters,
  createMaritimeAreaService
} from "../src/adapters.js";

const now = () => new Date("2026-06-03T12:04:00.000Z");

describe("Maritime adapters", () => {
  it("collects mock weather, ocean, vessel, port, and incident context through adapter boundaries", async () => {
    const areas = createMaritimeAreaService();
    const area = areas.get("santos-port-br")!;
    const collection = await collectMaritimeContext({
      area,
      adapters: createFixtureMaritimeAdapters("busy-port"),
      now
    });

    expect(collection.sources.map((source) => source.adapter).sort()).toEqual([
      "incidents",
      "ocean",
      "ports",
      "vessels",
      "weather"
    ]);
    expect(collection.observations.some((observation) => observation.signal === "vessels.congestion")).toBe(true);
    expect(collection.vessels.length).toBeGreaterThan(10);
    expect(collection.clusters.length).toBeGreaterThan(0);
    expect(collection.vessels.every((vessel) =>
      vessel.latitude >= area.bounds.south
      && vessel.latitude <= area.bounds.north
      && vessel.longitude >= area.bounds.west
      && vessel.longitude <= area.bounds.east
    )).toBe(true);
  });

  it("keeps future live integrations documented at the source boundary", async () => {
    const area = createMaritimeAreaService().get("galapagos-protected-area-ec")!;
    const collection = await collectMaritimeContext({
      area,
      adapters: createFixtureMaritimeAdapters("environment-watch"),
      now
    });

    expect(collection.sources.every((source) => source.provider === "mock-adapter")).toBe(true);
    expect(collection.sources.some((source) => source.futureIntegration?.includes("AIS"))).toBe(true);
    expect(collection.sources.some((source) => source.futureIntegration?.includes("Copernicus"))).toBe(true);
  });
});
