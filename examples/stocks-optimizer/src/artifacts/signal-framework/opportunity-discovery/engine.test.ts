import assert from "node:assert/strict";
import test from "node:test";
import { discoverOpportunities } from "./engine";
import type { DiscoveryFinding, OpportunityCandidate } from "../types";

const finding: DiscoveryFinding = {
  findingId: "feature:coherence",
  pattern: "coherence recurs before successful outcomes",
  support: 80,
  confidence: 75,
  explanation: "coherence appeared repeatedly.",
  recommendations: ["Increase coherence weight."],
  feedsOpportunityTypes: ["alignment", "acceleration"],
};

test("discovers seeded and observed opportunity concepts deterministically", () => {
  const seed: OpportunityCandidate = {
    opportunityId: "manual:alignment",
    type: "alignment",
    strength: 60,
    confidence: 70,
    evidence: ["Manual structural seed."],
    emerging: true,
    persistent: false,
  };
  const candidates = discoverOpportunities({
    seeds: [seed],
    explorerFindings: [finding],
    observationSeries: [
      { id: "too-short", values: [1, 2] },
      { id: "fast", values: [1, 2, 3, 8] },
      { id: "coiled", values: [5, 5.5, 5.7] },
      { id: "steady", values: [1, 4, 7, 10] },
      { id: "forming", values: [1, 5, 9, 8] },
      { id: "fading", values: [10, 9, 8] },
    ],
  });
  const byId = new Map(candidates.map((candidate) => [candidate.opportunityId, candidate]));

  assert.equal(byId.get("manual:alignment")?.evidence.some((item) => item.startsWith("Explorer finding:")), true);
  assert.equal(byId.get("fast:acceleration")?.type, "acceleration");
  assert.equal(byId.get("coiled:compression")?.type, "compression");
  assert.equal(byId.get("steady:persistence")?.persistent, true);
  assert.equal(byId.get("forming:emergence")?.type, "emergence");
  assert.equal(byId.get("fading:divergence")?.emerging, false);
});

test("discovers system-level alignment, expansion, compression, divergence, and transitions", () => {
  const candidates = discoverOpportunities({
    perception: {
      compositeScore: 74,
      confidence: 82,
      agreement: 72,
      layers: {
        a: { score: 70, momentum: 4 },
        b: { score: 73, momentum: 2 },
        c: { score: 76, momentum: 1 },
      },
    },
    intelligence: { contradictions: 2, transitionDetected: true },
    needs: [{
      needId: "wait:60",
      category: "wait",
      severity: 60,
      confidence: 70,
      explanation: "Conflicts are active.",
      recommendations: [],
    }],
  });

  assert.deepEqual(
    new Set(candidates.map((candidate) => candidate.type)),
    new Set(["alignment", "expansion", "compression", "divergence", "transition"]),
  );
});

test("deduplicates by keeping the strongest candidate", () => {
  const candidates = discoverOpportunities({
    seeds: [
      { opportunityId: "same", type: "alignment", strength: 30, confidence: 50, evidence: ["weak"], emerging: true, persistent: false },
      { opportunityId: "same", type: "alignment", strength: 80, confidence: 50, evidence: ["strong"], emerging: true, persistent: false },
    ],
  });

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].evidence[0], "strong");
});

test("uses seed defaults and need-driven system candidates", () => {
  const candidates = discoverOpportunities({
    seeds: [
      { opportunityId: "defaulted", type: "emergence", strength: 50, confidence: 50, evidence: ["seed"] } as any,
    ],
    perception: {
      compositeScore: "bad" as any,
      confidence: 55,
      agreement: 55,
      layers: {
        a: { score: 55, momentum: "bad" as any },
        b: { score: 58, momentum: 0 },
      },
    },
    intelligence: { contradictions: 0, transitionDetected: false },
    needs: [
      { needId: "wait:55", category: "wait", severity: 55, confidence: 55, explanation: "wait", recommendations: [] },
      { needId: "discover-opportunities:55", category: "discover-opportunities", severity: 55, confidence: 55, explanation: "discover", recommendations: [] },
    ],
  });

  const byId = new Map(candidates.map((candidate) => [candidate.opportunityId, candidate]));
  assert.equal(byId.get("defaulted")?.emerging, true);
  assert.equal(byId.get("defaulted")?.persistent, false);
  assert.equal(byId.has("system:divergence"), true);
  assert.equal(byId.has("system:transition"), true);
});
