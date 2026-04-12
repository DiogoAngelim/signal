import { describe, expect, it } from "vitest";
import { mapCertainty, mapSeverity, mapUrgency } from "../../src/normalization/mappings.js";

describe("mappings", () => {
  it("maps severity", () => {
    expect(mapSeverity("Severe")).toBe("severe");
    expect(mapSeverity("unknown")).toBe("info");
  });

  it("maps certainty", () => {
    expect(mapCertainty("Observed")).toBe("observed");
    expect(mapCertainty(undefined)).toBe("unknown");
  });

  it("maps urgency", () => {
    expect(mapUrgency("Immediate")).toBe("immediate");
    expect(mapUrgency("something")).toBe("unknown");
  });
});
