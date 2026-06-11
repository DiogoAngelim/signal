import assert from "node:assert/strict";
import test from "node:test";
import type { OpportunityCandidate, OpportunityOutcomeRecord } from "../types";
import { OpportunityExplorer, analyzeOpportunityOutcomes } from "./engine";

function candidate(
  id: string,
  type: OpportunityCandidate["type"] = "acceleration",
): OpportunityCandidate {
  return {
    opportunityId: id,
    type,
    strength: 70,
    confidence: 75,
    evidence: [id],
    emerging: true,
    persistent: type === "persistence",
  };
}

test("returns no findings without records or enough winning support", () => {
  assert.deepEqual(analyzeOpportunityOutcomes([]), []);
  assert.deepEqual(
    analyzeOpportunityOutcomes([
      {
        opportunityId: "loss",
        outcome: "losing",
        candidate: candidate("loss"),
        features: { coherence: true },
      },
    ]),
    [],
  );
});

test("finds recurring successful, blocked, and almost-qualified patterns", () => {
  const records: OpportunityOutcomeRecord[] = [
    {
      opportunityId: "w1",
      outcome: "winning",
      candidate: candidate("w1"),
      features: { coherence: true, thin: true },
    },
    {
      opportunityId: "w2",
      outcome: "winning",
      candidate: candidate("w2"),
      features: { coherence: true },
    },
    {
      opportunityId: "w3",
      outcome: "winning",
      candidate: candidate("w3", "alignment"),
      features: { coherence: true, thin: false },
    },
    {
      opportunityId: "w4",
      outcome: "winning",
      candidate: candidate("w4", "alignment"),
      features: { coherence: true, rare: true },
    },
    {
      opportunityId: "l1",
      outcome: "losing",
      candidate: candidate("l1"),
      features: { coherence: false, rare: true },
    },
    {
      opportunityId: "b1",
      outcome: "blocked",
      candidate: candidate("b1", "divergence"),
    },
    {
      opportunityId: "b2",
      outcome: "blocked",
      candidate: candidate("b2", "divergence"),
    },
    {
      opportunityId: "a1",
      outcome: "almost-qualified",
      candidate: candidate("a1", "persistence"),
    },
    {
      opportunityId: "a2",
      outcome: "almost-qualified",
      candidate: candidate("a2", "persistence"),
    },
  ];
  const findings = analyzeOpportunityOutcomes(records);
  const ids = new Set(findings.map((finding) => finding.findingId));

  assert.equal(ids.has("feature:coherence"), true);
  assert.equal(ids.has("blocked:recurrence"), true);
  assert.equal(ids.has("almost-qualified:persistence"), true);
  assert.equal(ids.has("feature:rare"), false);
});

test("stores records through the explorer class", () => {
  const explorer = new OpportunityExplorer();
  explorer
    .record({
      opportunityId: "w1",
      outcome: "winning",
      candidate: candidate("w1"),
      features: { persistentEvidence: true },
    })
    .record({
      opportunityId: "w2",
      outcome: "winning",
      candidate: candidate("w2"),
      features: { persistentEvidence: true },
    });

  assert.equal(explorer.all().length, 2);
  assert.equal(explorer.analyze()[0].findingId, "feature:persistentEvidence");
});
