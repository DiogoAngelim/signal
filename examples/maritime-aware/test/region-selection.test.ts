import { describe, expect, it } from "vitest";
import {
  createCustomMaritimeArea,
  createMaritimeAreaService,
  parseCoordinateQuery
} from "../src/adapters.js";

describe("Maritime area selection", () => {
  it("searches presets by port, coastline, city, ocean, and protected area terms", async () => {
    const service = createMaritimeAreaService();

    await expect(service.search("Port of Santos")).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "santos-port-br", type: "port" })
    ]));
    await expect(service.search("Rio coastline")).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "guanabara-bay-br" })
    ]));
    await expect(service.search("Atlantic Ocean")).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "south-atlantic", type: "ocean" })
    ]));
    await expect(service.search("protected area Galapagos")).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "galapagos-protected-area-ec", type: "protected_area" })
    ]));
  });

  it("supports coordinates and custom map-selected areas without preset constraints", async () => {
    const service = createMaritimeAreaService();
    const coordinate = parseCoordinateQuery("-23.95, -46.32")!;
    const coordinateResult = await service.search("-23.95, -46.32");
    const mapArea = createCustomMaritimeArea({
      name: "Map selected bay",
      center: { latitude: -12.8, longitude: -38.5 },
      radiusKm: 70,
      method: "map"
    });

    expect(coordinate).toEqual({ latitude: -23.95, longitude: -46.32 });
    expect(coordinateResult[0]).toEqual(expect.objectContaining({ type: "custom", userDefined: true }));
    expect(service.get(mapArea.id)).toEqual(expect.objectContaining({ type: "custom", radiusKm: 70 }));
  });

  it("returns a custom maritime area for unknown future regions", async () => {
    const results = await createMaritimeAreaService().search("Pelagic Stewardship Zone");
    const fallback = results.find((area) => area.userDefined);

    expect(fallback).toEqual(expect.objectContaining({
      type: "custom",
      userDefined: true,
      fixtureId: "custom-area"
    }));
  });
});
