import type { DecisionPipelineInput, DecisionPipelineResult, PredictionScenario } from "./types";
import { createAccountabilityReport } from "./accountability";
import { assessCoherence } from "./coherence";
import { createDecisionRecord } from "./decision-record";
import { buildHumanDecisionGuide, createHumanDecisionSummary } from "./human-language";
import { evaluateOutcome } from "./outcomes";
import { generatePredictionScenarios } from "./prediction";
import { simulateDecisionPaths } from "./simulation";
import { assessWisdom } from "./wisdom";

export function evaluateDecision(input: DecisionPipelineInput): DecisionPipelineResult {
  const coherence = assessCoherence(input.modules);
  const predictionScenarios = generatePredictionScenarios({
    ...input.prediction,
    currentScore: input.prediction?.currentScore ?? coherence.score,
    confidence: input.prediction?.confidence ?? coherence.score,
  });
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
    confidence: input.wisdom?.confidence ?? coherence.score,
  });
  const outcome = input.outcome ? evaluateOutcome(input.outcome) : undefined;
  const preliminaryRecord = createDecisionRecord({
    decisionId: input.decisionId,
    createdAt: input.createdAt,
    observation: input.observation,
    discovery: input.modules.discovery,
    judgment: input.modules.judgment,
    purpose: input.modules.purpose,
    need: input.modules.need,
    coherence,
    prediction: predictionScenarios,
    simulation,
    wisdom,
    action: actionPermitted(coherence.actionAllowed, simulation.recommendedAction, wisdom.decision) ? input.action : undefined,
    outcome,
  });
  const accountability = createAccountabilityReport({ record: preliminaryRecord, outcome });
  const record = createDecisionRecord({
    ...preliminaryRecord,
    accountability,
    humanSummary: createHumanDecisionSummary(preliminaryRecord),
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
    actionAllowed: actionPermitted(coherence.actionAllowed, simulation.recommendedAction, wisdom.decision),
    actionScale: finalActionScale(coherence.actionScale, simulation.recommendedAction, wisdom.decision),
  };
}

function actionPermitted(
  coherenceAllows: boolean,
  simulationRecommendation: string,
  wisdomDecision: string,
): boolean {
  return coherenceAllows && simulationRecommendation !== "block" && wisdomDecision !== "avoid";
}

function finalActionScale(coherenceScale: number, simulationRecommendation: string, wisdomDecision: string): number {
  if (wisdomDecision === "avoid" || simulationRecommendation === "block") return 0;
  if (wisdomDecision === "wait" || simulationRecommendation === "wait") return 0;
  if (wisdomDecision === "proceed-small" || simulationRecommendation === "reduce") return Math.min(coherenceScale, 0.45);
  return coherenceScale;
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
