import type { DecisionPipelineInput, DecisionPipelineResult, PredictionScenario } from "./types";
import { createAccountabilityReport } from "./accountability";
import { assessDecisionEvidence } from "./assessment";
import { assessCoherence } from "./coherence";
import { createDecisionRecord } from "./decision-record";
import { buildHumanDecisionGuide, createHumanDecisionSummary } from "./human-language";
import { evaluateOutcome } from "./outcomes";
import { generatePredictionScenarios } from "./prediction";
import { simulateDecisionPaths } from "./simulation";
import { assessWisdom } from "./wisdom";

export function evaluateDecision(input: DecisionPipelineInput): DecisionPipelineResult {
  const coherence = assessCoherence(input.modules);
  const assessment = input.assessment
    ? assessDecisionEvidence({
        ...input.assessment,
        decisionId: input.assessment.decisionId ?? input.decisionId,
        createdAt: input.assessment.createdAt ?? input.createdAt,
      })
    : undefined;
  const cappedConfidence = assessment?.confidence.capped ?? coherence.score;
  const predictionScenarios = capPredictionScenarioConfidence(generatePredictionScenarios({
    ...input.prediction,
    currentScore: input.prediction?.currentScore ?? coherence.score,
    confidence: Math.min(input.prediction?.confidence ?? coherence.score, cappedConfidence),
  }), assessment?.confidence.cap);
  const simulation = simulateDecisionPaths({
    decisionId: input.decisionId,
    scenarios: predictionScenarios,
    currentExposure: coherence.actionScale * 100,
  });
  const highestDownside = maxDownside(predictionScenarios);
  const wisdom = assessWisdom({
    ...input.wisdom,
    expectedReward: input.wisdom?.expectedReward ?? averageReward(predictionScenarios),
    downsideRisk: input.wisdom?.downsideRisk ?? highestDownside,
    uncertainty: input.wisdom?.uncertainty ?? averageUncertainty(predictionScenarios),
    confidence: Math.min(input.wisdom?.confidence ?? coherence.score, cappedConfidence),
  });
  const outcome = input.outcome ? evaluateOutcome(input.outcome) : undefined;
  const preliminaryRecord = createDecisionRecord({
    decisionId: input.decisionId,
    source: input.source,
    createdAt: input.createdAt,
    realitySnapshotId: input.realitySnapshotId,
    realitySnapshot: input.realitySnapshot,
    observation: input.observation,
    discovery: input.modules.discovery,
    judgment: input.modules.judgment,
    purpose: input.modules.purpose,
    need: input.modules.need,
    coherence,
    prediction: predictionScenarios,
    simulation,
    wisdom,
    action: actionPermitted(coherence.actionAllowed, simulation.recommendedAction, wisdom.decision, assessment) ? input.action : undefined,
    outcome,
    assessment,
    retentionTier: input.retentionTier,
  });
  const accountability = createAccountabilityReport({ record: preliminaryRecord, outcome });
  const record = createDecisionRecord({
    ...preliminaryRecord,
    accountability,
    humanSummary: createHumanDecisionSummary(preliminaryRecord),
    retentionTier: input.retentionTier ?? preliminaryRecord.retentionTier,
  });
  const guide = buildHumanDecisionGuide(record);

  return {
    record,
    coherenceScore: coherence.score,
    coherenceStatus: coherence.status,
    consensusLevel: coherence.consensusLevel,
    predictionScenarios,
    simulationRecommendation: simulation.recommendedAction,
    wisdomDecision: wisdom.decision,
    ...(outcome === undefined ? {} : { outcomeAccuracy: outcome.confidenceAccuracy }),
    accountabilitySummary: accountability.humanExplanation || guide[5]?.text || record.humanSummary,
    decisionReplayAvailable: true,
    actionAllowed: actionPermitted(coherence.actionAllowed, simulation.recommendedAction, wisdom.decision, assessment),
    actionScale: finalActionScale(coherence.actionScale, simulation.recommendedAction, wisdom.decision, assessment),
  };
}

function actionPermitted(
  coherenceAllows: boolean,
  simulationRecommendation: string,
  wisdomDecision: string,
  assessment: ReturnType<typeof assessDecisionEvidence> | undefined,
): boolean {
  return coherenceAllows
    && simulationRecommendation !== "block"
    && wisdomDecision !== "avoid"
    && assessmentAllowsAction(assessment);
}

function finalActionScale(
  coherenceScale: number,
  simulationRecommendation: string,
  wisdomDecision: string,
  assessment: ReturnType<typeof assessDecisionEvidence> | undefined,
): number {
  if (wisdomDecision === "avoid" || simulationRecommendation === "block") return 0;
  if (wisdomDecision === "wait" || simulationRecommendation === "wait") return 0;
  if (assessment?.stewardship.recommendation === "avoid" || assessment?.stewardship.recommendation === "wait") return 0;
  if (
    wisdomDecision === "proceed-small"
    || simulationRecommendation === "reduce"
    || assessment?.stewardship.recommendation === "reduce"
    || assessment?.stewardship.recommendation === "proceed-reversibly"
  ) return Math.min(coherenceScale, 0.45);
  return coherenceScale;
}

function assessmentAllowsAction(assessment: ReturnType<typeof assessDecisionEvidence> | undefined): boolean {
  if (!assessment) return true;
  return assessment.governance.blockers.length === 0
    && assessment.stewardship.recommendation !== "avoid"
    && assessment.stewardship.recommendation !== "wait";
}

function maxDownside(scenarios: readonly PredictionScenario[]): number {
  return scenarios.reduce((max, scenario) => Math.max(max, scenario.downsideRisk), 0);
}

function averageReward(scenarios: readonly PredictionScenario[]): number {
  return scenarios.length
    ? scenarios.reduce((sum, scenario) => sum + scenario.expectedReward, 0) / scenarios.length
    : 50;
}

function averageUncertainty(scenarios: readonly PredictionScenario[]): number {
  return scenarios.length
    ? scenarios.reduce((sum, scenario) => sum + scenario.uncertainty, 0) / scenarios.length
    : 50;
}

function capPredictionScenarioConfidence(
  scenarios: readonly PredictionScenario[],
  confidenceCap: number | undefined,
): PredictionScenario[] {
  if (confidenceCap === undefined) return [...scenarios];
  return scenarios.map((scenario) => ({
    ...scenario,
    confidence: Math.min(scenario.confidence, confidenceCap),
  }));
}
