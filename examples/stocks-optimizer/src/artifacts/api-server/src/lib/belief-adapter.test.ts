import assert from "node:assert/strict";
import test from "node:test";
import { evaluateBelief } from "../../../signal-framework/belief/engine";
import {
  beliefResultToTradeDiagnostic,
  evaluateTradeCandidateBelief,
  mapTradeCandidateToBeliefInput,
} from "./belief-adapter";

const candidate = {
  symbol: "AAA",
  rawAction: "Buy",
  expectedEdgePct: 6,
  rawSuggestedExposurePct: 8,
  setupQuality: 84,
  riskPressure: 28,
  volatilityPct: 3,
  liquidityScore: 95,
  signalConfidence: 91,
  maxPositionPct: 20,
  ageDays: 2,
};

const marketState = {
  market: "ADX",
  benchmarkExcessPct: 8,
  overfitRisk: 5,
  maxPositionPct: 20,
  lifecycleStage: "Production eligible",
  top1TradeContributionPct: 12,
  staleData: false,
};

const calibration = {
  status: "trusted",
  trustworthiness: 88,
  historicalAccuracy: 82,
  calibratedConfidence: 86,
};

const perception = {
  dataReliability: 94,
  walkForwardRobustness: { score: 88 },
  parameterRobustness: { score: 86 },
  similarMarketMatch: 78,
};

test("candidate maps correctly to generic BeliefInput evidence", () => {
  const input = mapTradeCandidateToBeliefInput(
    candidate,
    marketState,
    calibration,
    perception,
  );

  assert.equal(
    input.claim,
    "Candidate AAA has a justified positive opportunity.",
  );
  assert.equal(input.priorConfidence, 91);
  assert.equal(input.minimumEvidenceCount, 8);
  assert.equal(input.minimumCoverage, 70);
  assert.equal(input.contradictionTolerance, 35);
  assert.ok(
    input.evidence.some(
      (item) => item.name === "Trend strength" && item.direction === "support",
    ),
  );
  assert.ok(
    input.evidence.some(
      (item) => item.name === "Overfit risk" && item.direction === "contradict",
    ),
  );
  assert.ok(
    input.evidence.some(
      (item) => item.name === "Lifecycle stage" && item.direction === "neutral",
    ),
  );
  assert.equal((input.metadata as any).symbol, "AAA");
});

test("justified trade belief keeps compact candidate output stable", () => {
  const belief = evaluateTradeCandidateBelief(
    candidate,
    marketState,
    calibration,
    perception,
  );

  assert.equal(belief.verdict, "justified");
  assert.ok(belief.confidence >= 70);
  assert.ok(belief.trustworthiness >= 70);
  assert.ok(belief.evidenceStrength >= 70);
  assert.ok(belief.evidenceAgreement >= 70);
  assert.ok(belief.fragility <= 35);
  assert.equal(belief.blockers.length, 0);
  assert.ok(belief.supportingEvidence[0]?.name);
  assert.ok(belief.contradictoryEvidence[0]?.name);
  assert.match(belief.reason, /Belief is justified/);
});

test("unstable calibration reduces trustworthiness and adds contradiction", () => {
  const trusted = evaluateTradeCandidateBelief(
    candidate,
    marketState,
    calibration,
    perception,
  );
  const unstable = evaluateTradeCandidateBelief(
    candidate,
    marketState,
    {
      ...calibration,
      status: "unstable-outcomes",
      trustworthiness: 48,
      historicalAccuracy: 52,
    },
    perception,
  );

  assert.ok(unstable.trustworthiness < trusted.trustworthiness);
  assert.ok(
    unstable.contradictoryEvidence.some(
      (item) =>
        item.name === "Unstable calibration" && item.weightedStrength > 0,
    ),
  );
  assert.ok(unstable.warnings.length > 0 || unstable.verdict !== "justified");
});

test("overfit risk and poor data reliability increase contradiction and fragility", () => {
  const stable = evaluateTradeCandidateBelief(
    candidate,
    marketState,
    calibration,
    perception,
  );
  const fragile = evaluateTradeCandidateBelief(
    candidate,
    {
      ...marketState,
      overfitRisk: 82,
      staleData: true,
      top1TradeContributionPct: 88,
    },
    calibration,
    { ...perception, dataReliability: 35 },
  );

  assert.notEqual(fragile.verdict, "justified");
  assert.ok(fragile.fragility > stable.fragility);
  assert.ok(
    fragile.contradictoryEvidence.some((item) =>
      ["Overfit risk", "Poor data reliability", "Stale data"].includes(
        item.name,
      ),
    ),
  );
});

test("poor benchmark and negative momentum can contradict a positive-opportunity claim", () => {
  const contradicted = evaluateTradeCandidateBelief(
    {
      ...candidate,
      expectedEdgePct: -4,
      setupQuality: 35,
      riskPressure: 72,
      liquidityScore: 20,
      volatilityPct: 15,
    },
    { ...marketState, benchmarkExcessPct: -12, overfitRisk: 75 },
    {
      ...calibration,
      status: "poor-calibration",
      trustworthiness: 35,
      historicalAccuracy: 30,
    },
    { ...perception, dataReliability: 30 },
  );

  assert.equal(contradicted.verdict, "contradicted");
  assert.ok(
    contradicted.blockers.some((blocker) =>
      blocker.includes("Contradictory evidence"),
    ),
  );
});

test("compact conversion keeps only trade-facing belief fields", () => {
  const result = evaluateBelief(
    mapTradeCandidateToBeliefInput(
      candidate,
      marketState,
      calibration,
      perception,
    ),
  );
  const compact = beliefResultToTradeDiagnostic(result);

  assert.deepEqual(Object.keys(compact).sort(), [
    "blockers",
    "confidence",
    "contradictoryEvidence",
    "evidenceAgreement",
    "evidenceStrength",
    "fragility",
    "reason",
    "supportingEvidence",
    "trustworthiness",
    "verdict",
    "warnings",
  ]);
  assert.ok(compact.supportingEvidence.length <= 3);
  assert.ok(compact.contradictoryEvidence.length <= 3);
});

test("adapter handles fallback symbols, lifecycle labels, sparse agreement, and source-less evidence", () => {
  const fallback = mapTradeCandidateToBeliefInput(
    {
      watchlist: true,
      observedAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
      rawAction: "Buy",
      expectedEdgePct: 1,
      rawSuggestedExposurePct: 1,
      setupQuality: 55,
      riskPressure: 45,
      volatilityPct: 4,
      liquidityScore: 60,
      signalConfidence: 58,
      maxPositionPct: 10,
    },
    { lifecycleStage: "Paper trade" },
    {
      status: "insufficient-history",
      trustworthiness: 50,
      historicalAccuracy: 50,
    },
    { walkForwardRobustness: 90, parameterRobustness: false },
  );
  const booleanAgreement = mapTradeCandidateToBeliefInput(
    { symbol: "BOOL" },
    {},
    {},
    { walkForwardRobustness: true, parameterRobustness: true },
  );
  const sparse = mapTradeCandidateToBeliefInput(
    { targetRef: "", ageDays: 99 },
    {},
    {},
    {},
  );
  const research = mapTradeCandidateToBeliefInput(
    { symbol: "WATCH", lifecycle: "watchlist research" },
    {},
    {},
    {},
  );
  const sourceLess = beliefResultToTradeDiagnostic({
    verdict: "weak",
    confidence: 60,
    trustworthiness: 55,
    evidenceStrength: 50,
    evidenceAgreement: 50,
    evidenceCoverage: 50,
    supportStrength: 50,
    contradictionStrength: 0,
    uncertainty: 10,
    fragility: 30,
    blockers: [],
    warnings: [],
    reason: "Source-less evidence.",
    claim: "Source-less",
    supportingEvidence: [
      {
        name: "Manual review",
        direction: "support",
        strength: 60,
        confidence: 60,
        weight: 1,
        weightedStrength: 36,
        reason: "Manual review supports the claim.",
      },
    ],
    contradictoryEvidence: [],
    neutralEvidence: [],
    audit: {
      formula: "",
      inputs: { claim: "Source-less", evidence: [] },
      normalized: {},
      steps: [],
    },
  });

  assert.equal((fallback.metadata as any).symbol, "STRATEGY-SIGNAL");
  assert.equal(
    fallback.evidence.find((item) => item.name === "Cross-timeframe agreement")
      ?.strength,
    45,
  );
  assert.equal(
    booleanAgreement.evidence.find(
      (item) => item.name === "Cross-timeframe agreement",
    )?.strength,
    100,
  );
  assert.equal(
    fallback.evidence.find((item) => item.name === "Unstable calibration")
      ?.strength,
    55,
  );
  assert.equal(
    fallback.evidence.find((item) => item.name === "Watchlist presence")
      ?.strength,
    70,
  );
  assert.equal(
    fallback.evidence.find((item) => item.name === "Lifecycle stage")?.strength,
    65,
  );
  assert.ok(
    (fallback.evidence.find((item) => item.name === "Candidate age")
      ?.strength ?? 0) > 90,
  );
  assert.equal(
    sparse.evidence.find((item) => item.name === "Cross-timeframe agreement")
      ?.strength,
    50,
  );
  assert.equal(
    sparse.evidence.find(
      (item) => item.name === "Negative benchmark comparison",
    )?.reason,
    "Benchmark excess is 0.00%.",
  );
  assert.equal(
    research.evidence.find((item) => item.name === "Lifecycle stage")?.strength,
    45,
  );
  assert.equal("source" in sourceLess.supportingEvidence[0]!, false);
});
