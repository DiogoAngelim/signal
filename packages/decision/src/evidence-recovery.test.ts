import { describe, expect, it } from "vitest";
import { evaluateDecision } from "./pipeline";
import { adviseEvidenceRecovery } from "./evidence-recovery";

const MODULES = [
  "discovery","judgment","purpose","need","trust","reflection",
  "recovery","memory","learning","calibration","identity","awareness","agency",
] as const;
function deniedDecision(withAssessment: boolean) {
  return evaluateDecision({
    decisionId: "test-evidence-recovery",
    createdAt: "2026-11-14T00:00:00Z",
    observation: { synthetic: true },
    action: { operation: "never-execute" },
    modules: Object.fromEntries(MODULES.map(n => [n, 25])),
    prediction: { currentScore: 25, expectedReward: 25,
      expectedRisk: 75, uncertainty: 75, purposeAlignment: 25,
      needAlignment: 25, confidence: 25 },
    wisdom: { expectedReward: 25, downsideRisk: 75, irreversibleRisk: 75,
      survivalPriority: 90, longTermAlignment: 25, shortTermTemptation: 25,
      uncertainty: 75, confidence: 25 },
    ...(withAssessment ? { assessment: {
      known: ["This is a synthetic fixture"],
      unknowns: ["Future returns are uncertain"],
      desiredConfidence: 80, evidence: [],
    }} : {}),
  });
}
const model = {
  modelVersion: "information-synthetic-v1",
  unit: "USD net - hypothetical",
  probabilityEvidence: "subjective" as const,
  states: [{ id: "success", probability: 0.5 },
    { id: "failure", probability: 0.5 }],
  actions: [
    { id: "wait", payoffs: [{ stateId: "success", amount: 0 },
      { stateId: "failure", amount: 0 }] },
    { id: "invest", payoffs: [{ stateId: "success", amount: 100 },
      { stateId: "failure", amount: -100 }] },
  ],
};
const perfect = [
  { id: "up", likelihoods: [
    { stateId: "success", probability: 1 },
    { stateId: "failure", probability: 0 },
  ] },
  { id: "down", likelihoods: [
    { stateId: "success", probability: 0 },
    { stateId: "failure", probability: 1 },
  ] },
];
describe("native abstention evidence recovery is advisory-only", () => {
  it("proposes human review of valuable information without changing denial", () => {
    const native = deniedDecision(true);
    expect(native.actionAllowed).toBe(false);
    const before = JSON.stringify(native);
    const advice = adviseEvidenceRecovery({
      nativeDecision: native, economicModel: model,
      potentialObservations: perfect, acquisitionCost: 10,
    });
    expect(advice.status).toBe("consider_human_evidence_review");
    expect(advice.riskNeutralGrossInformationValue).toBe(50);
    expect(advice.riskNeutralNetInformationValue).toBe(40);
    expect(advice.nativePermissionClass).toBe("denied");
    expect(advice.decisionGateChanged).toBe(false);
    expect(advice.automatedCollectionPermitted).toBe(false);
    expect(advice.humanReviewRequired).toBe(true);
    expect(JSON.stringify(native)).toEqual(before);
    expect(native.record.action).toBeUndefined();
  });

  it("does not suggest an uneconomic or ungrounded information purchase", () => {
    const native = deniedDecision(true);
    expect(adviseEvidenceRecovery({
      nativeDecision: native, economicModel: model,
      potentialObservations: perfect, acquisitionCost: 50,
    }).status).toBe("remain_paused");
    expect(adviseEvidenceRecovery({
      nativeDecision: deniedDecision(false), economicModel: model,
      potentialObservations: perfect, acquisitionCost: 10,
    }).status).toBe("remain_paused");
  });

  it("rejects negative costs rather than inventing profitable evidence", () => {
    expect(() => adviseEvidenceRecovery({
      nativeDecision: deniedDecision(true), economicModel: model,
      potentialObservations: perfect, acquisitionCost: -1,
    })).toThrow(/non-negative/);
  });
});
