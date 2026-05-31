import type { PredictionInput, PredictionScenario } from "../types";
import { asScore, clamp, uniqueStrings } from "../utils";

const DEFAULT_LABELS = [
  "conditions improve",
  "conditions weaken",
  "conditions remain mixed",
  "stress expands",
  "signal succeeds",
  "signal fails",
];

export function generatePredictionScenarios(input: PredictionInput = {}): PredictionScenario[] {
  const currentScore = asScore(input.currentScore, 55);
  const reward = asScore(input.expectedReward, currentScore);
  const risk = asScore(input.expectedRisk, 100 - currentScore);
  const uncertainty = asScore(input.uncertainty, 100 - currentScore);
  const purpose = asScore(input.purposeAlignment, currentScore);
  const need = asScore(input.needAlignment, currentScore);
  const confidence = asScore(input.confidence, currentScore);
  const labels = uniqueStrings(input.labels?.length ? input.labels : DEFAULT_LABELS).slice(0, 6);
  const assumptions = uniqueStrings(input.assumptions ?? ["Current evidence remains relevant long enough to evaluate."]);
  const raw = labels.map((label, index) =>
    scenarioFor({
      index,
      label,
      reward,
      risk,
      uncertainty,
      purpose,
      need,
      confidence,
      assumptions,
    }),
  );
  const totalProbability = raw.reduce((sum, scenario) => sum + scenario.probability, 0) || 1;
  return raw.map((scenario) => ({
    ...scenario,
    probability: Number((scenario.probability / totalProbability).toFixed(4)),
  }));
}

export function mostLikelyScenario(scenarios: readonly PredictionScenario[]): PredictionScenario | undefined {
  return [...scenarios].sort((a, b) => b.probability - a.probability)[0];
}

export function mostDangerousScenario(scenarios: readonly PredictionScenario[]): PredictionScenario | undefined {
  return [...scenarios].sort((a, b) => b.downsideRisk - a.downsideRisk || b.expectedRisk - a.expectedRisk)[0];
}

export function bestPurposeScenario(scenarios: readonly PredictionScenario[]): PredictionScenario | undefined {
  return [...scenarios].sort((a, b) => b.purposeAlignment - a.purposeAlignment || b.needAlignment - a.needAlignment)[0];
}

function scenarioFor(input: {
  index: number;
  label: string;
  reward: number;
  risk: number;
  uncertainty: number;
  purpose: number;
  need: number;
  confidence: number;
  assumptions: string[];
}): PredictionScenario {
  const polarity = scenarioPolarity(input.label, input.index);
  const reward = clamp(input.reward + polarity * 18 - input.index * 1.5);
  const risk = clamp(input.risk - polarity * 10 + (input.index % 3) * 7);
  const uncertainty = clamp(input.uncertainty + (input.index % 2 === 0 ? -6 : 8));
  const downsideRisk = clamp(risk * 0.72 + uncertainty * 0.28 + (polarity < 0 ? 12 : 0));
  const confidence = clamp(input.confidence + polarity * 8 - uncertainty * 0.08);

  return {
    scenarioId: `scenario:${slug(input.label) || input.index}`,
    label: input.label,
    probability: clamp(confidence * 0.5 + (100 - uncertainty) * 0.3 + (100 - risk) * 0.2, 5, 95),
    expectedReward: Math.round(reward),
    expectedRisk: Math.round(risk),
    downsideRisk: Math.round(downsideRisk),
    uncertainty: Math.round(uncertainty),
    purposeAlignment: Math.round(clamp(input.purpose + polarity * 10 - downsideRisk * 0.05)),
    needAlignment: Math.round(clamp(input.need + polarity * 8 - downsideRisk * 0.04)),
    confidence: Math.round(confidence),
    assumptions: input.assumptions,
    warningSigns: warningSigns(input.label, risk, uncertainty, downsideRisk),
  };
}

function scenarioPolarity(label: string, index: number): number {
  if (/improve|succeed|recover|strength|upside|favorable/i.test(label)) return 1;
  if (/weaken|fail|stress|danger|drop|downside|reverse/i.test(label)) return -1;
  return index % 2 === 0 ? 0.2 : -0.2;
}

function warningSigns(label: string, risk: number, uncertainty: number, downsideRisk: number): string[] {
  const signs = [`Warning signs for "${label}" should be monitored before action scale increases.`];
  if (risk >= 65) signs.push("Expected risk is elevated.");
  if (uncertainty >= 65) signs.push("Uncertainty is high.");
  if (downsideRisk >= 70) signs.push("Downside could overwhelm the expected reward.");
  return signs;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
