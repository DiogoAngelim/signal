import { clamp, mean, numeric } from "../math/statistics";

export type ViabilityVerdict = "viable" | "marginal" | "not-viable" | "blocked";

export type ViabilitySeverity = "low" | "medium" | "high" | "critical";

export type ViabilityConstraintOperator = "<" | "<=" | ">" | ">=" | "==" | "!=";

export type ViabilityConstraintInput = {
  id: string;
  label?: string;
  type?: "hard" | "soft" | string;
  dimension?: string;
  hard?: boolean;
  passed?: boolean;
  value?: number | string | boolean | null;
  limit?: number | string | boolean | null;
  min?: number;
  max?: number;
  operator?: ViabilityConstraintOperator;
  severity?: ViabilitySeverity | string;
  weight?: number;
  reason?: string;
  warning?: string;
  blocker?: boolean;
  metadata?: Record<string, unknown>;
};

export type ViabilityConstraintResult = {
  id: string;
  label: string;
  type: string;
  dimension?: string;
  hard: boolean;
  severity: ViabilitySeverity;
  passed: boolean;
  score: number;
  weight: number;
  reason: string;
  warning?: string;
  blocker: boolean;
  metadata?: Record<string, unknown>;
};

export type ViabilityInput = {
  targetRef: string;
  actionRef?: string;
  decisionRef?: string;
  expectedBenefit: number;
  expectedCost: number;
  expectedRisk: number;
  uncertainty?: number;
  confidence?: number;
  constraints?: ViabilityConstraintInput[];
  minMarginOfSafety?: number;
  thresholds?: {
    minConfidence?: number;
    maxCost?: number;
    maxRisk?: number;
    maxUncertainty?: number;
  };
  weights?: {
    benefit?: number;
    cost?: number;
    risk?: number;
    uncertainty?: number;
  };
  context?: Record<string, unknown>;
};

export type ViabilityResult = {
  targetRef: string;
  actionRef?: string;
  decisionRef?: string;
  verdict: ViabilityVerdict;
  finalVerdict: ViabilityVerdict;
  score: number;
  expectedBenefit: number;
  expectedCost: number;
  expectedRisk: number;
  uncertainty: number;
  confidence: number;
  marginOfSafety: number;
  requiredMarginOfSafety: number;
  constraints: ViabilityConstraintResult[];
  blockers: string[];
  warnings: string[];
  reasons: string[];
  audit: {
    componentScores: {
      expectedBenefit: number;
      expectedCost: number;
      expectedRisk: number;
      uncertainty: number;
      confidence: number;
      constraintScore: number;
      marginScore: number;
    };
    weights: {
      benefit: number;
      cost: number;
      risk: number;
      uncertainty: number;
    };
    thresholds: {
      minConfidence: number;
      maxCost: number;
      maxRisk: number;
      maxUncertainty: number;
      minMarginOfSafety: number;
    };
    formulas: string[];
  };
};

type NormalizedViability = {
  benefit: number;
  cost: number;
  risk: number;
  uncertainty: number;
  confidence: number;
  weights: Required<NonNullable<ViabilityInput["weights"]>>;
};

const DEFAULT_WEIGHTS: Required<NonNullable<ViabilityInput["weights"]>> = {
  benefit: 1,
  cost: 0.35,
  risk: 0.45,
  uncertainty: 0.2,
};

const DEFAULT_THRESHOLDS = {
  minConfidence: 0.35,
  maxCost: 0.85,
  maxRisk: 0.8,
  maxUncertainty: 0.7,
  minMarginOfSafety: 0.05,
};

const FAILED_CONSTRAINT_SCORE: Record<ViabilitySeverity, number> = {
  low: 72,
  medium: 52,
  high: 24,
  critical: 0,
};

export function evaluateViability(input: ViabilityInput): ViabilityResult {
  const normalized = normalizeViability(input);
  const constraints = normalizeConstraints(input.constraints);
  const constraintScore = weightedConstraintScore(constraints);
  const requiredMarginOfSafety = normalizeMargin(
    input.minMarginOfSafety,
    DEFAULT_THRESHOLDS.minMarginOfSafety,
  );
  const thresholds = {
    minConfidence: ratio(
      input.thresholds?.minConfidence,
      DEFAULT_THRESHOLDS.minConfidence,
    ),
    maxCost: ratio(input.thresholds?.maxCost, DEFAULT_THRESHOLDS.maxCost),
    maxRisk: ratio(input.thresholds?.maxRisk, DEFAULT_THRESHOLDS.maxRisk),
    maxUncertainty: ratio(
      input.thresholds?.maxUncertainty,
      DEFAULT_THRESHOLDS.maxUncertainty,
    ),
    minMarginOfSafety: requiredMarginOfSafety,
  };
  const marginOfSafety = calculateMarginOfSafety(input);
  const blockers = constraints
    .filter((constraint) => constraint.blocker)
    .map((constraint) => constraintName(constraint));
  const warnings = collectWarnings({
    normalized,
    constraints,
    thresholds,
    marginOfSafety,
    blockers,
  });
  const verdict = resolveVerdict({
    marginOfSafety,
    requiredMarginOfSafety,
    normalized,
    thresholds,
    blockers,
    warnings,
  });
  const marginScore = clamp(50 + marginOfSafety * 100);
  const rawScore = clamp(
    marginScore * 0.55 +
      constraintScore * 0.25 +
      normalized.confidence * 100 * 0.2,
  );
  const score = capScoreByVerdict(rawScore, verdict);
  const result: ViabilityResult = {
    targetRef: String(input.targetRef ?? "target"),
    actionRef: input.actionRef,
    decisionRef: input.decisionRef,
    verdict,
    finalVerdict: verdict,
    score: roundScore(score),
    expectedBenefit: roundUnit(normalized.benefit),
    expectedCost: roundUnit(normalized.cost),
    expectedRisk: roundUnit(normalized.risk),
    uncertainty: roundUnit(normalized.uncertainty),
    confidence: roundUnit(normalized.confidence),
    marginOfSafety,
    requiredMarginOfSafety: roundUnit(requiredMarginOfSafety),
    constraints,
    blockers: unique(blockers),
    warnings,
    reasons: [],
    audit: {
      componentScores: {
        expectedBenefit: roundUnit(normalized.benefit),
        expectedCost: roundUnit(normalized.cost),
        expectedRisk: roundUnit(normalized.risk),
        uncertainty: roundUnit(normalized.uncertainty),
        confidence: roundUnit(normalized.confidence),
        constraintScore: roundScore(constraintScore),
        marginScore: roundScore(marginScore),
      },
      weights: normalized.weights,
      thresholds,
      formulas: [
        "adjustedBenefit = expectedBenefit * (0.5 + confidence * 0.5)",
        "expectedDrag = expectedCost * costWeight + expectedRisk * riskWeight + uncertainty * uncertaintyWeight",
        "marginOfSafety = adjustedBenefit * benefitWeight - expectedDrag",
      ],
    },
  };

  return {
    ...result,
    reasons: unique([
      createViabilityReason(result),
      ...constraints
        .filter((constraint) => !constraint.passed)
        .map((constraint) => constraint.reason),
      ...warnings,
    ]),
  };
}

export function evaluateViabilityConstraint(
  input: ViabilityConstraintInput,
): ViabilityConstraintResult {
  const id = String(input.id || "constraint");
  const label = input.label || id;
  const hard = input.hard ?? input.type === "hard";
  const type = input.type || (hard ? "hard" : "soft");
  const severity = normalizeSeverity(input.severity);
  const evaluation = evaluateConstraintPass(input);
  const blocker =
    !evaluation.passed &&
    (input.blocker === true ||
      (hard && (severity === "high" || severity === "critical")));
  const reason =
    input.reason ??
    evaluation.reason ??
    `${label} ${evaluation.passed ? "passed" : "failed"}.`;

  return {
    id,
    label,
    type,
    dimension: input.dimension,
    hard,
    severity,
    passed: evaluation.passed,
    score: evaluation.passed ? 100 : FAILED_CONSTRAINT_SCORE[severity],
    weight: positive(input.weight, 1),
    reason,
    warning:
      !evaluation.passed && !blocker
        ? (input.warning ?? reason)
        : input.warning,
    blocker,
    metadata: input.metadata,
  };
}

export function calculateMarginOfSafety(input: ViabilityInput): number {
  const normalized = normalizeViability(input);
  const adjustedBenefit =
    normalized.benefit *
    normalized.weights.benefit *
    (0.5 + normalized.confidence * 0.5);
  const expectedDrag =
    normalized.cost * normalized.weights.cost +
    normalized.risk * normalized.weights.risk +
    normalized.uncertainty * normalized.weights.uncertainty;
  return roundMargin(clamp(adjustedBenefit - expectedDrag, -100, 100));
}

export function createViabilityReason(result: ViabilityResult): string {
  const margin = formatSignedPercent(result.marginOfSafety);
  const confidence = formatPercent(result.confidence);

  if (result.verdict === "blocked") {
    const blocker = result.blockers[0] ?? "a hard constraint";
    return `Blocked: ${blocker} prevents the action despite a ${margin} margin of safety.`;
  }

  if (result.verdict === "not-viable") {
    return `Not viable: expected benefit does not clear cost, risk, and uncertainty with enough safety margin (${margin}, confidence ${confidence}).`;
  }

  if (result.verdict === "marginal") {
    return `Marginal: the action clears the basic viability check with a thin ${margin} margin of safety at ${confidence} confidence.`;
  }

  return `Viable: expected benefit clears cost, risk, and uncertainty with a ${margin} margin of safety at ${confidence} confidence.`;
}

function normalizeViability(input: ViabilityInput): NormalizedViability {
  const uncertaintySeed =
    input.uncertainty == null && input.confidence != null
      ? 1 - ratio(input.confidence, 0.5)
      : 0.5;
  const uncertainty = ratio(input.uncertainty, uncertaintySeed);
  const confidence = ratio(input.confidence, 1 - uncertainty);

  return {
    benefit: ratio(input.expectedBenefit, 0),
    cost: ratio(input.expectedCost, 0),
    risk: ratio(input.expectedRisk, 0),
    uncertainty,
    confidence,
    weights: {
      benefit: positive(input.weights?.benefit, DEFAULT_WEIGHTS.benefit),
      cost: positive(input.weights?.cost, DEFAULT_WEIGHTS.cost),
      risk: positive(input.weights?.risk, DEFAULT_WEIGHTS.risk),
      uncertainty: positive(
        input.weights?.uncertainty,
        DEFAULT_WEIGHTS.uncertainty,
      ),
    },
  };
}

function normalizeConstraints(
  constraints: ViabilityInput["constraints"],
): ViabilityConstraintResult[] {
  if (!Array.isArray(constraints)) return [];
  return constraints.map((constraint, index) =>
    evaluateViabilityConstraint({
      ...constraint,
      id: constraint.id || `constraint-${index + 1}`,
    }),
  );
}

function evaluateConstraintPass(input: ViabilityConstraintInput): {
  passed: boolean;
  reason?: string;
} {
  if (typeof input.passed === "boolean") {
    return { passed: input.passed };
  }

  if (input.operator) {
    return evaluateOperator(input);
  }

  const value = Number(input.value);
  if (Number.isFinite(value) && (input.min != null || input.max != null)) {
    const aboveMin = input.min == null || value >= input.min;
    const belowMax = input.max == null || value <= input.max;
    return {
      passed: aboveMin && belowMax,
      reason: `Value ${formatNumber(value)} must be between ${formatBoundary(input.min, "-infinity")} and ${formatBoundary(input.max, "infinity")}.`,
    };
  }

  if (typeof input.value === "boolean") {
    return { passed: input.value };
  }

  return {
    passed: true,
    reason:
      "Constraint supplied without an evaluable rule; treated as informational.",
  };
}

function evaluateOperator(input: ViabilityConstraintInput): {
  passed: boolean;
  reason: string;
} {
  const left = Number(input.value);
  const right = Number(input.limit);
  const operator = input.operator as ViabilityConstraintOperator;
  const numericComparison = Number.isFinite(left) && Number.isFinite(right);

  if (numericComparison) {
    return {
      passed: compareNumbers(left, right, operator),
      reason: `Value ${formatNumber(left)} must be ${operator} ${formatNumber(right)}.`,
    };
  }

  if (operator === "==" || operator === "!=") {
    const passed =
      operator === "=="
        ? Object.is(input.value, input.limit)
        : !Object.is(input.value, input.limit);
    return {
      passed,
      reason: `Value must be ${operator} ${String(input.limit)}.`,
    };
  }

  return {
    passed: false,
    reason: "Constraint could not be evaluated from non-numeric values.",
  };
}

function compareNumbers(
  left: number,
  right: number,
  operator: ViabilityConstraintOperator,
) {
  if (operator === "<") return left < right;
  if (operator === "<=") return left <= right;
  if (operator === ">") return left > right;
  if (operator === ">=") return left >= right;
  if (operator === "==") return left === right;
  return left !== right;
}

function collectWarnings(args: {
  normalized: NormalizedViability;
  constraints: ViabilityConstraintResult[];
  thresholds: ViabilityResult["audit"]["thresholds"];
  marginOfSafety: number;
  blockers: string[];
}) {
  const warnings: string[] = [];
  if (args.normalized.confidence < args.thresholds.minConfidence) {
    warnings.push(
      `Confidence ${formatPercent(args.normalized.confidence)} is below the minimum ${formatPercent(args.thresholds.minConfidence)}.`,
    );
  }
  if (args.normalized.cost > args.thresholds.maxCost) {
    warnings.push(
      `Expected cost ${formatPercent(args.normalized.cost)} exceeds the maximum ${formatPercent(args.thresholds.maxCost)}.`,
    );
  }
  if (args.normalized.risk > args.thresholds.maxRisk) {
    warnings.push(
      `Expected risk ${formatPercent(args.normalized.risk)} exceeds the maximum ${formatPercent(args.thresholds.maxRisk)}.`,
    );
  }
  if (args.normalized.uncertainty > args.thresholds.maxUncertainty) {
    warnings.push(
      `Uncertainty ${formatPercent(args.normalized.uncertainty)} exceeds the maximum ${formatPercent(args.thresholds.maxUncertainty)}.`,
    );
  }
  if (args.marginOfSafety < args.thresholds.minMarginOfSafety) {
    warnings.push(
      `Margin of safety ${formatSignedPercent(args.marginOfSafety)} is below the required ${formatPercent(args.thresholds.minMarginOfSafety)}.`,
    );
  }

  for (const constraint of args.constraints) {
    if (constraint.warning) warnings.push(constraint.warning);
  }

  if (args.blockers.length) {
    warnings.push(`Blocked by ${args.blockers.join(", ")}.`);
  }

  return unique(warnings);
}

function resolveVerdict(args: {
  marginOfSafety: number;
  requiredMarginOfSafety: number;
  normalized: NormalizedViability;
  thresholds: ViabilityResult["audit"]["thresholds"];
  blockers: string[];
  warnings: string[];
}): ViabilityVerdict {
  if (args.blockers.length > 0) return "blocked";
  if (args.marginOfSafety < 0) return "not-viable";

  const thresholdPressure =
    args.normalized.confidence < args.thresholds.minConfidence ||
    args.normalized.cost > args.thresholds.maxCost ||
    args.normalized.risk > args.thresholds.maxRisk ||
    args.normalized.uncertainty > args.thresholds.maxUncertainty;

  if (args.marginOfSafety < args.requiredMarginOfSafety) return "marginal";
  if (thresholdPressure || args.warnings.length > 0) return "marginal";
  return "viable";
}

function weightedConstraintScore(constraints: ViabilityConstraintResult[]) {
  if (!constraints.length) return 100;
  const totalWeight = constraints.reduce(
    (sum, constraint) => sum + constraint.weight,
    0,
  );
  if (totalWeight <= 0)
    return mean(constraints.map((constraint) => constraint.score));
  return (
    constraints.reduce(
      (sum, constraint) => sum + constraint.score * constraint.weight,
      0,
    ) / totalWeight
  );
}

function capScoreByVerdict(score: number, verdict: ViabilityVerdict) {
  if (verdict === "blocked") return Math.min(score, 20);
  if (verdict === "not-viable") return Math.min(score, 49);
  if (verdict === "marginal") return Math.min(score, 69);
  return score;
}

function normalizeSeverity(
  severity: ViabilityConstraintInput["severity"],
): ViabilitySeverity {
  return severity === "low" ||
    severity === "medium" ||
    severity === "high" ||
    severity === "critical"
    ? severity
    : "medium";
}

function ratio(value: unknown, fallback: number) {
  const parsed = numeric(value, fallback);
  const scaled = Math.abs(parsed) > 1 ? parsed / 100 : parsed;
  return clamp(scaled, 0, 1);
}

function positive(value: unknown, fallback: number) {
  const parsed = numeric(value, fallback);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeMargin(value: unknown, fallback: number) {
  const parsed = numeric(value, fallback);
  if (!Number.isFinite(parsed)) return fallback;
  if (Math.abs(parsed) > 1) return clamp(parsed / 100, -1, 1);
  return clamp(parsed, -1, 1);
}

function constraintName(constraint: ViabilityConstraintResult) {
  return constraint.label && constraint.label !== constraint.id
    ? `${constraint.label} (${constraint.id})`
    : constraint.id;
}

function roundUnit(value: number) {
  return Number(value.toFixed(6));
}

function roundScore(value: number) {
  return Number(value.toFixed(2));
}

function roundMargin(value: number) {
  return Number(value.toFixed(6));
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function formatSignedPercent(value: number) {
  const rounded = Math.round(value * 100);
  return `${rounded >= 0 ? "+" : ""}${rounded}%`;
}

function formatNumber(value: number) {
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function formatBoundary(value: number | undefined, fallback: string) {
  return value == null ? fallback : formatNumber(value);
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}
