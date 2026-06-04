import { describe, expect, it } from "vitest";
import {
  collectMaritimeContext,
  createFixtureMaritimeAdapters,
  createMaritimeAreaService
} from "../src/adapters.js";
import { createMaritimeBriefingFromContext } from "../src/signal.js";

const now = () => new Date("2026-06-03T12:04:00.000Z");

describe("Evidence and uncertainty", () => {
  it("marks stale and missing evidence visibly instead of pretending certainty", async () => {
    const area = createMaritimeAreaService().get("valparaiso-coast-cl")!;
    const collection = await collectMaritimeContext({
      area,
      adapters: createFixtureMaritimeAdapters("stale-evidence"),
      now
    });
    const briefing = createMaritimeBriefingFromContext({
      collection,
      generatedAt: now().toISOString()
    });

    expect(briefing.degraded).toBe(true);
    expect(briefing.summary).toContain("limited");
    expect(briefing.risks.some((risk) => risk.confidence === "low" || risk.confidence === "limited")).toBe(true);
    expect(briefing.remainsUnclear.join(" ")).toContain("stale");
    expect(briefing.watchNext[0]).toContain("sources refresh");
  });

  it("scopes unclear matter statuses to the affected evidence", async () => {
    const area = createMaritimeAreaService().get("valparaiso-coast-cl")!;
    const briefing = createMaritimeBriefingFromContext({
      collection: await collectMaritimeContext({
        area,
        adapters: createFixtureMaritimeAdapters("stale-evidence"),
        now
      }),
      generatedAt: now().toISOString()
    });

    expect(briefing.whatMatters.filter((matter) => matter.status === "unclear").map((matter) => matter.matter)).toEqual(
      expect.arrayContaining(["Human Safety", "Navigation", "Trade Flow"])
    );
  });
});
