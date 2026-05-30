import assert from "node:assert/strict";
import test from "node:test";
import { evaluateOpportunityDensity } from "./density";
import type { OpportunityCandidate } from "../types";

const candidates: OpportunityCandidate[] = [
  { opportunityId: "a", type: "emergence", strength: 70, confidence: 80, evidence: ["a"], emerging: true, persistent: true },
  { opportunityId: "b", type: "compression", strength: 50, confidence: 60, evidence: ["b"], emerging: true, persistent: false },
  { opportunityId: "c", type: "alignment", strength: 80, confidence: 85, evidence: ["c"], emerging: false, persistent: true },
];

test("returns zero density when no candidates are visible", () => {
  const density = evaluateOpportunityDensity({ candidates: [] });

  assert.equal(density.density, 0);
  assert.equal(density.trend, "flat");
});

test("measures candidate quality, diversity, and flat trend without history", () => {
  const density = evaluateOpportunityDensity({ candidates });

  assert.equal(density.quality > 0, true);
  assert.equal(density.confidence > 0, true);
  assert.equal(density.trend, "flat");
  assert.match(density.explanation, /3 candidates/);
});

test("classifies improving, weakening, and unchanged density trends", () => {
  const current = evaluateOpportunityDensity({ candidates });
  const improving = evaluateOpportunityDensity({ candidates, previousDensity: current.density - 10 });
  const weakening = evaluateOpportunityDensity({ candidates, previousDensity: current.density + 10 });
  const flat = evaluateOpportunityDensity({ candidates, previousDensity: current.density + 1 });

  assert.equal(improving.trend, "improving");
  assert.equal(weakening.trend, "weakening");
  assert.equal(flat.trend, "flat");
});
