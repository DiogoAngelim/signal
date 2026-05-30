import { clamp, mean } from "../math/statistics";

export type CounterfactualScenarioKind =
  | "actual"
  | "unrestricted"
  | "normal_size"
  | "wait"
  | "alternative_candidate"
  | "ignored_restriction";

export type CounterfactualDecisionSnapshot = {
  decision?: string;
  confidence?: number;
  trust?: number;
  opportunity?: number;
  risk?: number;
  maxExposure?: number;
  expectedReturn?: number;
  expectedLoss?: number;
  reason?: string;
};

export type CounterfactualScenario = {
  id: string;
  kind: CounterfactualScenarioKind;
  label: string;
  decision: string;
  expectedOutcomeScore: number;
  expectedReturn: number;
  riskScore: number;
  regretScore: number;
  restrictionImpactScore: number;
  confidence: number;
  summary: string;
  assumptions: string[];
  realizedOutcome?: {
    returnPct?: number;
    lossAvoidedPct?: number;
    success?: boolean;
    notes?: string[];
  };
};

export type CounterfactualInput = {
  actualDecision?: CounterfactualDecisionSnapshot | null;
  unrestrictedDecision?: CounterfactualDecisionSnapshot | null;
  normalSizeDecision?: CounterfactualDecisionSnapshot | null;
  waitDecision?: CounterfactualDecisionSnapshot | null;
  alternativeCandidateDecision?: CounterfactualDecisionSnapshot | null;
  ignoredRestrictionDecision?: CounterfactualDecisionSnapshot | null;
  scenarios?: CounterfactualScenario[];
  restrictions?: Array<{ reason?: string; avoidedLossScore?: number; blockedUpsideScore?: number }>;
  realizedOutcomes?: Record<string, CounterfactualScenario["realizedOutcome"]>;
};

export type CounterfactualResult = {
  scenarios: CounterfactualScenario[];
  avoidedLossScore: number;
  missedUpsideScore: number;
  restrictionValueScore: number;
  cautionCostScore: number;
  recommendedLearning: string[];
  shouldAdjustRestrictionPolicy: boolean;
  shouldAdjustDiscoveryPolicy: boolean;
  shouldAdjustSizingPolicy: boolean;
  explanation: string;
  audit: Record<string, unknown>;
};

/**
 * Builds hypothetical and later realized learning for decisions not taken.
 *
 * @example
 * const result = evaluateCounterfactuals({
 *   actualDecision: { decision: "watch", opportunity: 68, risk: 28, maxExposure: 0 },
 *   normalSizeDecision: { decision: "buy", expectedReturn: 9, risk: 40, maxExposure: 10 },
 * });
 * result.missedUpsideScore; // high when caution likely blocked upside
 */
export function evaluateCounterfactuals(input: CounterfactualInput = {}): CounterfactualResult {
  const scenarios = applyRealizedOutcomes([
    ...scenarioInputs(input),
    ...(input.scenarios ?? []),
  ], input.realizedOutcomes ?? {});
  const actual = scenarios.find((scenario) => scenario.kind === "actual") ?? scenarioFromDecision("actual", input.actualDecision ?? {});
  const ignored = scenarios.find((scenario) => scenario.kind === "ignored_restriction");
  const unrestricted = scenarios.find((scenario) => scenario.kind === "unrestricted");
  const normalSize = scenarios.find((scenario) => scenario.kind === "normal_size");
  const wait = scenarios.find((scenario) => scenario.kind === "wait");
  const alternatives = scenarios.filter((scenario) => scenario.kind === "alternative_candidate");
  const avoidedLossScore = roundScore(mean([
    ignored ? Math.max(0, ignored.riskScore - actual.riskScore) : 0,
    ...((input.restrictions ?? []).map((restriction) => score(restriction.avoidedLossScore, 0))),
    ...scenarios
      .filter((scenario) => scenario.realizedOutcome?.lossAvoidedPct != null)
      .map((scenario) => score(scenario.realizedOutcome?.lossAvoidedPct, 0)),
  ]));
  const missedUpsideScore = roundScore(Math.max(
    0,
    ...[unrestricted, normalSize, ...alternatives]
      .filter((scenario): scenario is CounterfactualScenario => Boolean(scenario))
      .map((scenario) => scenario.expectedOutcomeScore - actual.expectedOutcomeScore),
    ...((input.restrictions ?? []).map((restriction) => score(restriction.blockedUpsideScore, 0))),
  ));
  const waitBenefit = wait ? Math.max(0, wait.expectedOutcomeScore - actual.expectedOutcomeScore) : 0;
  const restrictionValueScore = roundScore(clamp(avoidedLossScore + waitBenefit * 0.3 - missedUpsideScore * 0.35));
  const cautionCostScore = roundScore(clamp(missedUpsideScore - avoidedLossScore * 0.25));
  const recommendedLearning = learningFor({
    avoidedLossScore,
    missedUpsideScore,
    restrictionValueScore,
    cautionCostScore,
    scenarios,
  });

  return {
    scenarios,
    avoidedLossScore,
    missedUpsideScore,
    restrictionValueScore,
    cautionCostScore,
    recommendedLearning,
    shouldAdjustRestrictionPolicy: missedUpsideScore >= 65 && restrictionValueScore < 45,
    shouldAdjustDiscoveryPolicy: alternatives.some((scenario) => scenario.expectedOutcomeScore > actual.expectedOutcomeScore + 20),
    shouldAdjustSizingPolicy: normalSize ? normalSize.expectedOutcomeScore > actual.expectedOutcomeScore + 18 && normalSize.riskScore < 70 : false,
    explanation: explanationFor(avoidedLossScore, missedUpsideScore, restrictionValueScore),
    audit: {
      scenarioCount: scenarios.length,
      actualScenarioId: actual.id,
      formulas: [
        "avoidedLossScore compares ignored-restriction risk against actual risk plus realized avoided losses",
        "missedUpsideScore compares unrestricted, normal-size, and alternative scenarios against the actual decision",
        "restrictionValueScore rewards avoided loss and penalizes blocked upside",
      ],
    },
  };
}

export const evaluateCounterfactualLearning = evaluateCounterfactuals;

export function updateCounterfactualResult(
  result: CounterfactualResult,
  realizedOutcomes: Record<string, CounterfactualScenario["realizedOutcome"]>,
): CounterfactualResult {
  return evaluateCounterfactuals({
    scenarios: result.scenarios,
    realizedOutcomes,
  });
}

function scenarioInputs(input: CounterfactualInput) {
  return [
    scenarioFromDecision("actual", input.actualDecision ?? {}),
    input.unrestrictedDecision ? scenarioFromDecision("unrestricted", input.unrestrictedDecision) : null,
    input.normalSizeDecision ? scenarioFromDecision("normal_size", input.normalSizeDecision) : null,
    input.waitDecision ? scenarioFromDecision("wait", input.waitDecision) : null,
    input.alternativeCandidateDecision ? scenarioFromDecision("alternative_candidate", input.alternativeCandidateDecision) : null,
    input.ignoredRestrictionDecision ? scenarioFromDecision("ignored_restriction", input.ignoredRestrictionDecision) : null,
  ].filter((scenario): scenario is CounterfactualScenario => Boolean(scenario));
}

function scenarioFromDecision(kind: CounterfactualScenarioKind, decision: CounterfactualDecisionSnapshot): CounterfactualScenario {
  const expectedReturn = score(decision.expectedReturn, score(decision.opportunity, 50) / 10);
  const riskScore = score(decision.risk, score(decision.expectedLoss, 35));
  const confidence = score(decision.confidence, 50);
  const trust = score(decision.trust, confidence);
  const maxExposure = Math.max(0, Number(decision.maxExposure ?? 0));
  const expectedOutcomeScore = roundScore(expectedReturn * 5 + confidence * 0.25 + trust * 0.2 + maxExposure * 0.8 - riskScore * 0.45);
  const restrictionImpactScore = kind === "ignored_restriction" || kind === "unrestricted" || kind === "normal_size"
    ? roundScore(Math.max(0, expectedOutcomeScore - riskScore * 0.35))
    : 0;

  return {
    id: `counterfactual:${kind}`,
    kind,
    label: labelFor(kind),
    decision: decision.decision ?? defaultDecisionFor(kind),
    expectedOutcomeScore,
    expectedReturn: roundExposure(expectedReturn),
    riskScore,
    regretScore: roundScore(Math.max(0, expectedOutcomeScore - 50)),
    restrictionImpactScore,
    confidence,
    summary: summaryFor(kind, expectedOutcomeScore, riskScore, decision.reason),
    assumptions: assumptionsFor(kind, decision),
  };
}

function applyRealizedOutcomes(
  scenarios: CounterfactualScenario[],
  outcomes: Record<string, CounterfactualScenario["realizedOutcome"]>,
) {
  return scenarios.map((scenario) => ({
    ...scenario,
    ...(outcomes[scenario.id] ? { realizedOutcome: outcomes[scenario.id] } : {}),
  }));
}

function learningFor(input: {
  avoidedLossScore: number;
  missedUpsideScore: number;
  restrictionValueScore: number;
  cautionCostScore: number;
  scenarios: CounterfactualScenario[];
}) {
  return unique([
    input.avoidedLossScore >= 60 ? "Restrictions appear to have prevented meaningful loss; preserve the blocker until fresh evidence improves." : "",
    input.missedUpsideScore >= 60 ? "Caution likely blocked upside; review discovery confirmation and sizing thresholds." : "",
    input.restrictionValueScore < 40 ? "Restriction policy may be too costly relative to its protection value." : "",
    input.cautionCostScore >= 55 ? "Sizing policy should consider a smaller probe instead of a full wait state." : "",
    input.scenarios.some((scenario) => scenario.realizedOutcome) ? "Fold realized counterfactual outcomes back into restriction and discovery calibration." : "",
  ]);
}

function explanationFor(avoidedLossScore: number, missedUpsideScore: number, restrictionValueScore: number) {
  if (avoidedLossScore > missedUpsideScore) {
    return `Counterfactuals favor caution: avoided loss ${avoidedLossScore}/100 exceeds missed upside ${missedUpsideScore}/100.`;
  }
  if (missedUpsideScore > avoidedLossScore) {
    return `Counterfactuals show caution cost: missed upside ${missedUpsideScore}/100 exceeds avoided loss ${avoidedLossScore}/100.`;
  }
  return `Counterfactual protection and opportunity cost are balanced; restriction value is ${restrictionValueScore}/100.`;
}

function labelFor(kind: CounterfactualScenarioKind) {
  return {
    actual: "Actual decision",
    unrestricted: "Unrestricted decision",
    normal_size: "Normal-size decision",
    wait: "Wait decision",
    alternative_candidate: "Alternative candidate",
    ignored_restriction: "Ignored restriction",
  }[kind];
}

function defaultDecisionFor(kind: CounterfactualScenarioKind) {
  return kind === "wait" || kind === "actual" ? "hold" : "buy";
}

function summaryFor(kind: CounterfactualScenarioKind, expectedOutcomeScore: number, riskScore: number, reason?: string) {
  const basis = reason ? `${reason} ` : "";
  return `${basis}${labelFor(kind)} has expected outcome ${expectedOutcomeScore}/100 with risk ${riskScore}/100.`;
}

function assumptionsFor(kind: CounterfactualScenarioKind, decision: CounterfactualDecisionSnapshot) {
  return unique([
    `Scenario assumes ${labelFor(kind).toLowerCase()} could be taken without changing upstream evidence.`,
    decision.maxExposure != null ? `Exposure assumption: ${decision.maxExposure}%.` : "",
    decision.reason ? `Reason supplied: ${decision.reason}` : "",
  ]);
}

function score(value: unknown, fallback: number) {
  const numeric = Number(value);
  return Math.round(clamp(Number.isFinite(numeric) ? numeric : fallback));
}

function roundScore(value: number) {
  return Math.round(clamp(value));
}

function roundExposure(value: number) {
  return Number(value.toFixed(2));
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}
