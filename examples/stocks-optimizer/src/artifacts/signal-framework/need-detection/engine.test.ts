import assert from "node:assert/strict";
import test from "node:test";
import { detectNeeds } from "./engine";

test("detects discovery and participation needs when conditions are healthy but sparse", () => {
  const needs = detectNeeds({
    perception: {
      compositeScore: 82,
      confidence: 78,
      agreement: 76,
      layers: { survival: { score: 82 } },
    },
    diagnostics: {
      uncertainty: 16,
      trust: 84,
      contradictionDensity: 0,
      contradictions: [],
    },
    synchronization: { score: 90 },
    executionReadiness: {
      readinessScore: 80,
      executionSuitability: 78,
      riskAdjustedExposureSuggestion: 75,
    },
    rankings: [],
    opportunityDensity: 0,
  });

  assert.equal(needs[0].category, "discover-opportunities");
  assert.equal(
    needs.some((need) => need.category === "discover-opportunities"),
    true,
  );
  assert.equal(
    needs.some((need) => need.category === "increase-participation"),
    true,
  );
  assert.equal(
    needs.every((need) => need.needId.includes(":")),
    true,
  );
});

test("detects evidence, risk, and waiting needs simultaneously", () => {
  const needs = detectNeeds({
    perception: {
      compositeScore: Number.NaN,
      confidence: 30,
      agreement: 22,
      layers: { survival: { score: 18 } },
    },
    diagnostics: {
      uncertainty: 82,
      trust: 28,
      contradictionDensity: 36,
      contradictions: [
        {
          key: "a",
          severity: 50,
          confidenceImpact: 10,
          readinessImpact: 10,
          description: "a",
          evidence: {},
        },
        {
          key: "b",
          severity: 40,
          confidenceImpact: 8,
          readinessImpact: 8,
          description: "b",
          evidence: {},
        },
      ],
    },
    synchronization: { score: 38 },
    executionReadiness: {
      readinessScore: 25,
      executionSuitability: 20,
      riskAdjustedExposureSuggestion: 12,
    },
    rankings: [
      {
        id: "x",
        score: 55,
        relativeStrength: 50,
        momentumPersistence: 50,
        volatilityAdjustedPerformance: 50,
        volumeExpansion: 50,
        liquidityQuality: 50,
        breadthParticipation: 50,
        sectorSynchronization: 50,
        emerging: true,
        acceleration: 50,
        compressionStructure: 50,
        anomalousAccumulation: 50,
      },
    ],
    opportunityDensity: 80,
  });

  assert.deepEqual(
    new Set(needs.map((need) => need.category)),
    new Set(["gather-evidence", "reduce-exposure", "wait"]),
  );
  assert.equal(needs[0].severity >= needs[1].severity, true);
});

test("emits a maintain need when no blocker is material", () => {
  const needs = detectNeeds(
    {
      perception: { compositeScore: 60, confidence: 65, agreement: 65 },
      diagnostics: {
        uncertainty: 12,
        trust: 70,
        contradictionDensity: 0,
        contradictions: [],
      },
      synchronization: { score: 70 },
      executionReadiness: {
        readinessScore: 55,
        executionSuitability: 55,
        riskAdjustedExposureSuggestion: 65,
      },
      opportunityDensity: 80,
    },
    { targetParticipation: 90 },
  );

  assert.equal(needs.length, 1);
  assert.equal(needs[0].category, "maintain");
  assert.deepEqual(needs[0].recommendations.length > 0, true);
});

test("infers opportunity density from rankings and candidates when no explicit density is supplied", () => {
  const needs = detectNeeds(
    {
      perception: { compositeScore: 66, confidence: 66, agreement: 66 },
      diagnostics: {
        uncertainty: 20,
        trust: 66,
        contradictionDensity: 0,
        contradictions: [],
      },
      synchronization: { score: 66 },
      executionReadiness: {
        readinessScore: 66,
        executionSuitability: 66,
        riskAdjustedExposureSuggestion: 66,
      },
      rankings: [
        {
          id: "A",
          score: 60,
          relativeStrength: 60,
          momentumPersistence: 60,
          volatilityAdjustedPerformance: 60,
          volumeExpansion: 60,
          liquidityQuality: 60,
          breadthParticipation: 60,
          sectorSynchronization: 60,
          emerging: true,
          acceleration: 60,
          compressionStructure: 60,
          anomalousAccumulation: 60,
        },
        {
          id: "B",
          score: 60,
          relativeStrength: 60,
          momentumPersistence: 60,
          volatilityAdjustedPerformance: 60,
          volumeExpansion: 60,
          liquidityQuality: 60,
          breadthParticipation: 60,
          sectorSynchronization: 60,
          emerging: false,
          acceleration: 60,
          compressionStructure: 60,
          anomalousAccumulation: 60,
        },
      ],
      opportunities: [
        {
          opportunityId: "A:emergence",
          type: "emergence",
          strength: 55,
          confidence: 60,
          evidence: ["A"],
          emerging: true,
          persistent: false,
        },
      ],
    },
    { minSeverity: 0, targetParticipation: 90 },
  );

  assert.equal(
    needs.some((need) => need.category === "discover-opportunities"),
    true,
  );
  assert.equal(
    [...needs].sort((a, b) => a.needId.localeCompare(b.needId)).length,
    needs.length,
  );
});
