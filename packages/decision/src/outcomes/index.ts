import type { DecisionModuleName, OutcomeEvaluation, OutcomeEvaluationInput, OutcomeFeedback } from "../types";
import { asScore, clamp, stableId, uniqueStrings } from "../utils";

export function evaluateOutcome(input: OutcomeEvaluationInput): OutcomeEvaluation {
  const successScore = asScore(input.actualSuccessScore ?? input.realizedReward, 50);
  const purposeAlignment = asScore(input.purposeAlignment, successScore);
  const needAlignment = asScore(input.needAlignment, successScore);
  const expectedRisk = asScore(input.expectedRisk, 50);
  const riskTaken = asScore(input.riskTaken, expectedRisk);
  const expectedConfidence = asScore(input.expectedConfidence, 50);
  const riskEfficiency = clamp(successScore - Math.max(0, riskTaken - expectedRisk) + Math.max(0, 60 - riskTaken) * 0.15);
  const confidenceAccuracy = clamp(100 - Math.abs(expectedConfidence - successScore));
  const trustImpact = Math.round((successScore - 50) * 0.35 + (purposeAlignment - 50) * 0.2 + (riskEfficiency - 50) * 0.15);
  const calibrationImpact = Math.round((confidenceAccuracy - 50) * 0.35);

  return {
    outcomeId: input.outcomeId ?? stableId("outcome", input.decisionId),
    decisionId: input.decisionId,
    ...(input.appId === undefined ? {} : { appId: input.appId }),
    ...(input.domain === undefined ? {} : { domain: input.domain }),
    ...(input.timestamp === undefined ? {} : { timestamp: input.timestamp }),
    ...(input.correlationId === undefined ? {} : { correlationId: input.correlationId }),
    ...(input.version === undefined ? {} : { version: input.version }),
    ...(input.originalDecisionId === undefined ? {} : { originalDecisionId: input.originalDecisionId }),
    category: classifyOutcome({
      successScore,
      purposeAlignment,
      needAlignment,
      unexpected: input.unexpected === true,
      inconclusive: input.inconclusive === true,
    }),
    successScore: Math.round(successScore),
    purposeAlignment: Math.round(purposeAlignment),
    needAlignment: Math.round(needAlignment),
    riskEfficiency: Math.round(riskEfficiency),
    confidenceAccuracy: Math.round(confidenceAccuracy),
    trustImpact,
    calibrationImpact,
    lessons: lessonsFor(input, successScore, confidenceAccuracy, riskEfficiency),
    ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
  };
}

export function applyOutcomeFeedback(outcome: OutcomeEvaluation): OutcomeFeedback {
  const modules: Partial<Record<DecisionModuleName, number>> = {
    trust: outcome.trustImpact,
    calibration: outcome.calibrationImpact,
    memory: outcome.category === "inconclusive" ? 2 : 8,
    learning: outcome.lessons.length * 3,
    recovery: outcome.category.includes("failure") ? -8 : 4,
    judgment: Math.round((outcome.confidenceAccuracy - 50) * 0.18),
  };

  return {
    modules,
    explanations: [
      `Outcome classified as ${outcome.category}.`,
      `Trust changes by ${outcome.trustImpact}; calibration changes by ${outcome.calibrationImpact}.`,
      "Memory and learning receive the outcome so future decisions can compare confidence with reality.",
    ],
  };
}

function classifyOutcome(input: {
  successScore: number;
  purposeAlignment: number;
  needAlignment: number;
  unexpected: boolean;
  inconclusive: boolean;
}): OutcomeEvaluation["category"] {
  if (input.inconclusive) return "inconclusive";
  const aligned = (input.purposeAlignment + input.needAlignment) / 2;
  if (input.successScore >= 72 && aligned >= 60) {
    return input.unexpected ? "unexpected-success" : "success";
  }
  if (input.successScore <= 35 || aligned <= 35) {
    return input.unexpected ? "unexpected-failure" : "failure";
  }
  return "partial-success";
}

function lessonsFor(
  input: OutcomeEvaluationInput,
  successScore: number,
  confidenceAccuracy: number,
  riskEfficiency: number,
): string[] {
  const lessons = uniqueStrings(input.lessons ?? []);
  if (successScore >= 72) lessons.push("The decision satisfied enough of its intended outcome to increase trust cautiously.");
  if (successScore <= 35) lessons.push("Future decisions should reduce trust until similar conditions improve.");
  if (confidenceAccuracy < 55) lessons.push("Confidence was not well calibrated against reality.");
  if (riskEfficiency < 50) lessons.push("Risk consumed too much of the outcome benefit.");
  if (!lessons.length) lessons.push("Outcome evidence was mixed; keep the lesson provisional.");
  return lessons;
}
