import { describe, expect, it } from "vitest";
import {
  collectSafetyObservations,
  createFixtureAwareAdapters,
  createRegionService
} from "../src/adapters.js";

describe("Aware adapters", () => {
  it("searches supported regions with beginner-friendly labels", async () => {
    const regions = await createRegionService({ addressLookup: false }).search("miami");

    expect(regions[0]?.id).toBe("miami-fl");
    expect(regions[0]?.name).toBe("Miami");
    expect(regions[0]?.adminArea).toBe("Florida");
  });

  it("uses the address API when a query is not in the fixed region catalog", async () => {
    const regions = await createRegionService({
      fetcher: async () => new Response(JSON.stringify([
        {
          place_id: 123,
          display_name: "1600 Pennsylvania Avenue NW, Washington, District of Columbia, United States",
          lat: "38.8977",
          lon: "-77.0365",
          address: {
            road: "Pennsylvania Avenue NW",
            city: "Washington",
            state: "District of Columbia",
            country: "United States",
            country_code: "us"
          }
        }
      ]), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    }).search("1600 Pennsylvania Ave Washington DC");

    expect(regions[0]).toMatchObject({
      name: "Washington",
      adminArea: "District of Columbia",
      country: "United States",
      timezone: "auto"
    });
    expect(regions[0]?.id).toMatch(/^address-washington--/);
    expect(createRegionService({ addressLookup: false }).get(regions[0]!.id)).toMatchObject({
      name: "Washington",
      latitude: 38.8977
    });
  });

  it("normalizes weather, air, exposure, alert, and mosquito facts without recommendations", async () => {
    const region = createRegionService().get("miami-fl");
    expect(region).toBeDefined();

    const result = await collectSafetyObservations({
      region: region!,
      adapters: createFixtureAwareAdapters("strong-uv-day")
    });

    expect(result.observations.map((observation) => observation.category)).toEqual(
      expect.arrayContaining(["weather", "air_quality", "pollen", "official_alert", "mosquito"])
    );
    expect(result.sources.every((source) => source.provider === "fixture" || source.provider === "derived")).toBe(true);
    expect(result.observations.every((observation) => !("primaryAction" in observation))).toBe(true);
    expect(result.observations.find((observation) => observation.signal === "weather.uv")?.severity).toBe(2);
  });

  it("marks unavailable sources as degraded evidence instead of pretending the day is complete", async () => {
    const region = createRegionService().get("miami-fl");
    expect(region).toBeDefined();

    const result = await collectSafetyObservations({
      region: region!,
      adapters: createFixtureAwareAdapters("source-unavailable")
    });

    expect(result.degraded).toBe(true);
    expect(result.sources.some((source) => source.status === "unavailable")).toBe(true);
    expect(result.observations.some((observation) => observation.category === "source_status" && observation.missing)).toBe(true);
  });
});
