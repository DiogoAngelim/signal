import { describe, expect, it } from "vitest";
import {
  confidenceLevels,
  guidanceLevels,
  maritimeMatters,
  type MaritimeRisk
} from "../src/contracts.js";
import { collectMaritimeContext, createFixtureMaritimeAdapters, createMaritimeAreaService } from "../src/adapters.js";
import { createMaritimeBriefingFromContext } from "../src/signal.js";

const now = () => new Date("2026-06-03T12:04:00.000Z");

describe("Maritime Aware contracts", () => {
  it("keeps the required guidance vocabulary explicit and understandable", () => {
    expect(guidanceLevels).toEqual(["steady", "notice", "watch", "act", "urgent"]);
    expect(confidenceLevels).toEqual(["high", "medium", "limited", "low"]);
    expect(maritimeMatters).toEqual([
      "Human Safety",
      "Navigation",
      "Port Operations",
      "Marine Environment",
      "Trade Flow",
      "Fishing Resources",
      "Critical Infrastructure"
    ]);
  });

  it("creates risks with the full explainability shape required by the product", async () => {
    const areas = createMaritimeAreaService();
    const area = areas.get("south-atlantic")!;
    const collection = await collectMaritimeContext({
      area,
      adapters: createFixtureMaritimeAdapters("rough-sea"),
      now
    });
    const briefing = createMaritimeBriefingFromContext({
      collection,
      generatedAt: now().toISOString()
    });
    const risk = briefing.risks[0]!;

    expect(riskShape(risk)).toEqual({
      whatMatters: true,
      threat: true,
      severity: true,
      evidence: true,
      confidence: true,
      uncertainty: true,
      suggestedAction: true,
      watchNext: true
    });
  });
});

function riskShape(risk: MaritimeRisk) {
  return {
    whatMatters: Boolean(risk.whatMatters),
    threat: Boolean(risk.threat),
    severity: Number.isInteger(risk.severity),
    evidence: risk.evidence.length > 0,
    confidence: Boolean(risk.confidence),
    uncertainty: risk.uncertainty.length > 0,
    suggestedAction: Boolean(risk.suggestedAction),
    watchNext: Boolean(risk.watchNext)
  };
}
