import type { PredictionScenario, SimulationInput, SimulationPathResult, SimulationRecommendation, SimulationResult } from "../types";
import { average, clamp, stableId } from "../utils";

const DEFAULT_VARIANTS = ["act normally", "act smaller", "wait", "block action"];

export function simulateDecisionPaths(input: SimulationInput): SimulationResult {
  const scenarios = input.scenarios.length ? input.scenarios : [];
  const variants = input.actionVariants?.length ? input.actionVariants : DEFAULT_VARIANTS;
  const pathComparisons = variants.map((variant) => comparePath(variant, scenarios, input.currentExposure ?? 0));
  const selected = selectPath(pathComparisons);
  const recommendedAction = recommendationFor(selected.actionVariant, selected);

  return {
    simulationId: input.simulationId ?? stableId("simulation", input.decisionId),
    ...(input.decisionId === undefined ? {} : { decisionId: input.decisionId }),
    actionVariant: selected.actionVariant,
    scenariosTested: scenarios,
    expectedOutcomeScore: selected.expectedOutcomeScore,
    worstCaseScore: selected.worstCaseScore,
    bestCaseScore: selected.bestCaseScore,
    survivalScore: selected.survivalScore,
    regretScore: selected.regretScore,
    recommendedAction,
    explanation: [
      `Signal compared ${pathComparisons.length} possible paths.`,
      selected.explanation[0] ?? "The selected path had the best survival-adjusted score.",
    ],
    pathComparisons,
  };
}

function comparePath(
  actionVariant: string,
  scenarios: readonly PredictionScenario[],
  currentExposure: number,
): SimulationPathResult {
  const exposureMultiplier = variantExposure(actionVariant);
  const weightedScores = scenarios.map((scenario) => {
    const reward = scenario.expectedReward * exposureMultiplier;
    const risk = scenario.expectedRisk * exposureMultiplier;
    const downside = scenario.downsideRisk * exposureMultiplier;
    const alignment = (scenario.purposeAlignment + scenario.needAlignment) / 2;
    const outcome = clamp(reward * 0.38 + alignment * 0.28 + (100 - risk) * 0.2 + scenario.confidence * 0.14 - downside * 0.12);
    return {
      probability: scenario.probability,
      outcome,
      downside,
      risk,
    };
  });
  const totalProbability = weightedScores.reduce((sum, score) => sum + score.probability, 0) || 1;
  const expected = weightedScores.reduce((sum, score) => sum + score.outcome * score.probability, 0) / totalProbability;
  const worst = weightedScores.length ? Math.min(...weightedScores.map((score) => score.outcome)) : 50;
  const best = weightedScores.length ? Math.max(...weightedScores.map((score) => score.outcome)) : 50;
  const averageDownside = average(weightedScores.map((score) => score.downside), 50);
  const survivalScore = clamp(100 - averageDownside - Math.max(0, currentExposure * exposureMultiplier - 50) * 0.35 + (actionVariant.includes("wait") ? 5 : 0));
  const regretScore = clamp(best - expected + Math.max(0, 55 - survivalScore) * 0.5);

  return {
    actionVariant,
    expectedOutcomeScore: Math.round(expected),
    worstCaseScore: Math.round(worst),
    bestCaseScore: Math.round(best),
    survivalScore: Math.round(survivalScore),
    regretScore: Math.round(regretScore),
    explanation: [
      `${actionVariant} scores ${Math.round(expected)}/100 with survival at ${Math.round(survivalScore)}/100.`,
      averageDownside >= 70 ? "Downside risk is too large for this path." : "Downside remains within a survivable range.",
    ],
  };
}

function selectPath(paths: readonly SimulationPathResult[]): SimulationPathResult {
  const sorted = [...paths].sort((a, b) => {
    const aScore = a.expectedOutcomeScore * 0.45 + a.survivalScore * 0.4 - a.regretScore * 0.15;
    const bScore = b.expectedOutcomeScore * 0.45 + b.survivalScore * 0.4 - b.regretScore * 0.15;
    return bScore - aScore;
  });
  return sorted[0] ?? {
    actionVariant: "wait",
    expectedOutcomeScore: 50,
    worstCaseScore: 50,
    bestCaseScore: 50,
    survivalScore: 50,
    regretScore: 50,
    explanation: ["No scenarios were available, so waiting is the safest comparison."],
  };
}

function recommendationFor(actionVariant: string, path: SimulationPathResult): SimulationRecommendation {
  if (path.survivalScore < 35 || path.worstCaseScore < 25) return "block";
  if (/block/i.test(actionVariant)) return "block";
  if (/wait/i.test(actionVariant)) return "wait";
  if (/smaller|reduce|small/i.test(actionVariant)) return "reduce";
  if (path.expectedOutcomeScore >= 82 && path.survivalScore >= 72) return "escalate";
  return "act";
}

function variantExposure(actionVariant: string): number {
  if (/block/i.test(actionVariant)) return 0;
  if (/wait/i.test(actionVariant)) return 0.1;
  if (/smaller|reduce|small/i.test(actionVariant)) return 0.45;
  return 1;
}
