import { describe, expect, it } from "vitest";
import { createMaritimeApiService } from "../src/api.js";

const now = () => new Date("2026-06-03T12:04:00.000Z");

describe("Maritime Aware smoke flow", () => {
  it("supports choose area to current situation to sources to review", async () => {
    const service = createMaritimeApiService({ now });
    const [area] = await service.app.searchAreas("Galapagos");
    const guide = await service.app.getGuide(area!.id);
    const details = await service.app.getGuideDetails(guide.id, guide.risks[0]?.id);
    const sources = await service.app.listSources(guide.id);
    const review = await service.app.reviewGuide({
      briefingId: guide.id,
      classification: "useful",
      whatHappened: "The guide helped focus attention on the protected area notice.",
      lesson: "Keep protected-area pressure visible without sounding alarmist.",
      idempotencyKey: "integration-review"
    });

    expect(area).toEqual(expect.objectContaining({ type: "protected_area" }));
    expect(guide.currentSituation).toContain("understandable");
    expect(details.found).toBe(true);
    expect(sources.sources.length).toBeGreaterThanOrEqual(5);
    expect(review.status).toBe("recorded");
  });
});
