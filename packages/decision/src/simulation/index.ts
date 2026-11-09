import type {
  PredictionScenario,
  SimulationInput,
  DecisionRobustnessConfig,
  DecisionRobustnessFactor,
  DecisionRobustnessResult,
  SimulationPathResult,
  SimulationRecommendation,
  SimulationResult,
} from "../types";
import { average, clamp, stableId } from "../utils";

const DEFAULT_VARIANTS = [
  "act normally",
  "act smaller",
  "wait",
  "block action",
];

const MAX_SCENARIOS = 1_000;
const MAX_ACTION_VARIANTS = 100;

const ROBUSTNESS_FACTORS: readonly DecisionRobustnessFactor[] = [
  "expectedReward",
  "expectedRisk",
  "downsideRisk",
  "uncertainty",
  "purposeAlignment",
  "needAlignment",
  "confidence",
];

export function simulateDecisionPaths(
  input: SimulationInput,
): SimulationResult {
  validateSimulationInput(input);
  const scenarios = input.scenarios.length ? input.scenarios : [];
  const variants = input.actionVariants?.length
    ? input.actionVariants
    : DEFAULT_VARIANTS;
  const pathComparisons = variants.map((variant) =>
    comparePath(variant, scenarios, input.currentExposure ?? 0),
  );
  const selected = selectPath(pathComparisons);
  const recommendedAction = recommendationFor(selected.actionVariant, selected);

  return {
    simulationId:
      input.simulationId ?? stableId("simulation", input.decisionId),
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
      selected.explanation[0] ??
        "The selected path had the best survival-adjusted score.",
    ],
    pathComparisons,
  };
}


export function evaluateDecisionRobustness(
  input: SimulationInput,
  config: DecisionRobustnessConfig = {},
): DecisionRobustnessResult {
  const perturbationPoints = config.perturbationPoints ?? 5;
  const minimumStability = config.minimumStability ?? 0.8;
  if (
    !Number.isFinite(perturbationPoints) ||
    perturbationPoints <= 0 ||
    perturbationPoints > 100
  ) {
    throw new Error("perturbationPoints must be greater than 0 and at most 100.");
  }
  if (
    !Number.isFinite(minimumStability) ||
    minimumStability < 0 ||
    minimumStability > 1
  ) {
    throw new Error("minimumStability must be between 0 and 1.");
  }

  const baseline = simulateDecisionPaths(input);
  const baselineRecommendation = baseline.recommendedAction;
  if (input.scenarios.length === 0) {
    return {
      status: "insufficient_data",
      baselineRecommendation,
      baselineActionVariant: baseline.actionVariant,
      perturbationPoints,
      stabilityRate: null,
      perturbations: [],
      explanation: ["No scenarios were supplied; robustness cannot be evaluated."],
    };
  }

  const perturbations = ROBUSTNESS_FACTORS.flatMap((factor) =>
    (["lower", "higher"] as const).map((direction) => {
      const delta = direction === "higher" ? perturbationPoints : -perturbationPoints;
      const scenarios = input.scenarios.map((scenario) => ({
        ...scenario,
        [factor]: clamp(scenario[factor] + delta),
      }));
      const perturbed = simulateDecisionPaths({
        ...input,
        scenarios,
      });
      return {
        factor,
        direction,
        actionVariant: perturbed.actionVariant,
        recommendedAction: perturbed.recommendedAction,
        changed:
          perturbed.actionVariant !== baseline.actionVariant ||
          perturbed.recommendedAction !== baselineRecommendation,
      };
    }),
  );
  const stableCount = perturbations.filter((item) => !item.changed).length;
  const stabilityRate = stableCount / perturbations.length;
  const status = stabilityRate >= minimumStability ? "robust" : "sensitive";

  return {
    status,
    baselineRecommendation,
    baselineActionVariant: baseline.actionVariant,
    perturbationPoints,
    stabilityRate: Math.round(stabilityRate * 1_000_000) / 1_000_000,
    perturbations,
    explanation: [
      `The recommendation remained unchanged in ${stableCount} of ${perturbations.length} one-factor perturbations.`,
      "This deterministic sensitivity screen tests the configured perturbation size; it is not a probability, confidence interval, exhaustive search, or guarantee outside the tested range.",
    ],
  };
}


function validateSimulationInput(input: SimulationInput): void {
  if (input.scenarios.length > MAX_SCENARIOS) {
    throw new Error(`scenarios must not exceed ${MAX_SCENARIOS}.`);
  }
  if ((input.actionVariants?.length ?? 0) > MAX_ACTION_VARIANTS) {
    throw new Error(`actionVariants must not exceed ${MAX_ACTION_VARIANTS}.`);
  }
  if (
    input.currentExposure !== undefined &&
    (!Number.isFinite(input.currentExposure) ||
      input.currentExposure < 0 ||
      input.currentExposure > 100)
  ) {
    throw new Error("currentExposure must be between 0 and 100.");
  }
  if (
    input.actionVariants?.some(
      (variant) => typeof variant !== "string" || !variant.trim(),
    )
  ) {
    throw new Error("actionVariants must contain non-empty strings.");
  }

  let totalProbability = 0;
  for (const scenario of input.scenarios) {
    if (
      !Number.isFinite(scenario.probability) ||
      scenario.probability < 0 ||
      scenario.probability > 1
    ) {
      throw new Error("scenario probabilities must be between 0 and 1.");
    }
    totalProbability += scenario.probability;
    for (const field of [
      "expectedReward",
      "expectedRisk",
      "downsideRisk",
      "uncertainty",
      "purposeAlignment",
      "needAlignment",
      "confidence",
    ] as const) {
      const value = scenario[field];
      if (!Number.isFinite(value) || value < 0 || value > 100) {
        throw new Error(`scenario ${field} must be between 0 and 100.`);
      }
    }
  }
  if (input.scenarios.length > 0 && totalProbability <= 0) {
    throw new Error("scenario probabilities must have a positive total.");
  }
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
    const outcome = clamp(
      reward * 0.38 +
        alignment * 0.28 +
        (100 - risk) * 0.2 +
        scenario.confidence * 0.14 -
        downside * 0.12,
    );
    return {
      probability: scenario.probability,
      outcome,
      downside,
      risk,
    };
  });
  const totalProbability =
    weightedScores.reduce((sum, score) => sum + score.probability, 0) || 1;
  const expected =
    weightedScores.reduce(
      (sum, score) => sum + score.outcome * score.probability,
      0,
    ) / totalProbability;
  const worst = weightedScores.length
    ? Math.min(...weightedScores.map((score) => score.outcome))
    : 50;
  const best = weightedScores.length
    ? Math.max(...weightedScores.map((score) => score.outcome))
    : 50;
  const averageDownside = average(
    weightedScores.map((score) => score.downside),
    50,
  );
  const survivalScore = clamp(
    100 -
      averageDownside -
      Math.max(0, currentExposure * exposureMultiplier - 50) * 0.35 +
      (actionVariant.includes("wait") ? 5 : 0),
  );
  const regretScore = clamp(
    best - expected + Math.max(0, 55 - survivalScore) * 0.5,
  );

  return {
    actionVariant,
    expectedOutcomeScore: Math.round(expected),
    worstCaseScore: Math.round(worst),
    bestCaseScore: Math.round(best),
    survivalScore: Math.round(survivalScore),
    regretScore: Math.round(regretScore),
    explanation: [
      `${actionVariant} scores ${Math.round(expected)}/100 with survival at ${Math.round(survivalScore)}/100.`,
      averageDownside >= 70
        ? "Downside risk is too large for this path."
        : "Downside remains within a survivable range.",
    ],
  };
}

function selectPath(
  paths: readonly SimulationPathResult[],
): SimulationPathResult {
  const sorted = [...paths].sort((a, b) => {
    const aScore =
      a.expectedOutcomeScore * 0.45 +
      a.survivalScore * 0.4 -
      a.regretScore * 0.15;
    const bScore =
      b.expectedOutcomeScore * 0.45 +
      b.survivalScore * 0.4 -
      b.regretScore * 0.15;
    return bScore - aScore;
  });
  return (
    sorted[0] ?? {
      actionVariant: "wait",
      expectedOutcomeScore: 50,
      worstCaseScore: 50,
      bestCaseScore: 50,
      survivalScore: 50,
      regretScore: 50,
      explanation: [
        "No scenarios were available, so waiting is the safest comparison.",
      ],
    }
  );
}

function recommendationFor(
  actionVariant: string,
  path: SimulationPathResult,
): SimulationRecommendation {
  if (path.survivalScore < 35 || path.worstCaseScore < 25) return "block";
  if (/block/i.test(actionVariant)) return "block";
  if (/wait/i.test(actionVariant)) return "wait";
  if (/smaller|reduce|small/i.test(actionVariant)) return "reduce";
  if (path.expectedOutcomeScore >= 82 && path.survivalScore >= 72)
    return "escalate";
  return "act";
}

function variantExposure(actionVariant: string): number {
  if (/block/i.test(actionVariant)) return 0;
  if (/wait/i.test(actionVariant)) return 0.1;
  if (/smaller|reduce|small/i.test(actionVariant)) return 0.45;
  return 1;
}
