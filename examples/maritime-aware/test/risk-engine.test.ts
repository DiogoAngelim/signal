import { describe, expect, it } from "vitest";
import {
  collectMaritimeContext,
  createFixtureMaritimeAdapters,
  createMaritimeAreaService
} from "../src/adapters.js";
import { createMaritimeBriefingFromContext, interpretMaritimeRisks } from "../src/signal.js";

const now = () => new Date("2026-06-03T12:04:00.000Z");

describe("Maritime risk engine", () => {
  it("prioritizes rough sea and wind into understandable action guidance", async () => {
    const area = createMaritimeAreaService().get("south-atlantic")!;
    const collection = await collectMaritimeContext({
      area,
      adapters: createFixtureMaritimeAdapters("rough-sea"),
      now
    });
    const risks = interpretMaritimeRisks(collection.observations);

    expect(risks[0]).toEqual(expect.objectContaining({
      whatMatters: "Navigation",
      threat: "Rough sea conditions",
      severity: 4,
      guidanceLevel: "urgent"
    }));
    expect(risks[0]?.meaning).toContain("Immediate attention");
  });

  it("keeps normal areas steady and decision-first", async () => {
    const area = createMaritimeAreaService().get("chesapeake-bay-us")!;
    const collection = await collectMaritimeContext({
      area,
      adapters: createFixtureMaritimeAdapters("steady-harbor"),
      now
    });
    const briefing = createMaritimeBriefingFromContext({
      collection,
      generatedAt: now().toISOString()
    });

    expect(briefing.guidanceLevel).toBe("notice");
    expect(briefing.summary).toContain("few changes worth noticing");
    expect(briefing.whatYouCanDo[0]).not.toMatch(/AIS|telemetry|anomaly|model deviation/i);
  });

  it("uses plain language instead of technical risk jargon", async () => {
    const area = createMaritimeAreaService().get("singapore-strait")!;
    const collection = await collectMaritimeContext({
      area,
      adapters: createFixtureMaritimeAdapters("busy-port"),
      now
    });
    const briefing = createMaritimeBriefingFromContext({
      collection,
      generatedAt: now().toISOString()
    });
    const text = JSON.stringify(briefing).toLowerCase();

    expect(text).toContain("many vessels");
    expect(text).not.toContain("traffic density anomaly");
    expect(text).not.toContain("wave model deviation");
    expect(text).not.toContain("confidence interval");
  });
});
