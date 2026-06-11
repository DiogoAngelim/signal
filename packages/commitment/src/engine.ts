import { resolveCommitmentPolicy } from "./policy";
import type {
  CommitmentConstraint,
  CommitmentConstraintSeverity,
  CommitmentDecision,
  CommitmentEvaluateInput,
  CommitmentInvalidation,
  CommitmentMode,
  CommitmentMonitoringPlan,
  CommitmentPolicy,
  CommitmentRecommendation,
  CommitmentResource,
  CommitmentResult,
  CommitmentScoreBreakdown,
  CommitmentStatus,
  CommitmentStrategyName,
  SharpeLikeConfig,
} from "./types";

type NormalizedConstraint = Required<
  Pick<CommitmentConstraint, "id" | "type" | "severity" | "passed">
> &
  Omit<CommitmentConstraint, "id" | "type" | "severity" | "passed">;

type ScoredDecision = {
  decision: CommitmentDecision;
  score: CommitmentScoreBreakdown;
  constraints: NormalizedConstraint[];
  reasons: string[];
  limitedBy: string[];
  blockedBy: string[];
};

type ResourceState = {
  basis: number;
  requested?: number;
  maximum?: number;
  minimum?: number;
  assumptions: string[];
};

type StrategyPlan = {
  strategy: CommitmentStrategyName;
  weights: number[];
  scores: Record<string, number>;
  reasons: string[];
  limitedBy: string[];
};

type Allocation = {
  amounts: number[];
  unallocated: number;
  cappedBy: string[];
};

const DEFAULT_CREATED_AT = "1970-01-01T00:00:00.000Z";

export function evaluateCommitment(
  input: CommitmentEvaluateInput = {},
): CommitmentResult {
  const policy = resolveCommitmentPolicy(input.policy);
  const createdAt = normalizeDate(input.now);
  const decisions = normalizeDecisions(input);
  const resource = normalizeResource(input.resource);
  const constraints = normalizeConstraints(input.constraints);
  const reasons: string[] = [];
  const limitedBy: string[] = [];
  const cappedBy: string[] = [];
  const blockedBy: string[] = [];
  const reductions: CommitmentResult["audit"]["reductions"] = [];

  if (decisions.length === 0) {
    reasons.push("No decision was supplied.");
    return buildResult({
      status: "deferred",
      mode: "none",
      policy,
      strategy: input.strategy ?? "risk_adjusted",
      createdAt,
      resource,
      totalRecommended: 0,
      normalizedCommitment: 0,
      recommendations: [],
      reasons,
      limitedBy: ["missing_decision"],
      blockedBy,
      cappedBy,
      reductions,
      eligibleTargets: [],
      strategyScores: {},
      preConstraintCommitment: 0,
      unallocatedCommitment: 0,
    });
  }

  const globalBlocks = blockingConstraints(constraints).filter(
    (constraint) => !constraint.targetId,
  );
  if (globalBlocks.length > 0) {
    for (const constraint of globalBlocks) {
      blockedBy.push(constraint.id);
      reasons.push(`Blocked by ${constraintName(constraint)}.`);
      if (constraint.reason) reasons.push(constraint.reason);
    }

    return buildResult({
      status: "blocked",
      mode: "none",
      policy,
      strategy: input.strategy ?? "risk_adjusted",
      createdAt,
      resource,
      totalRecommended: 0,
      normalizedCommitment: 0,
      recommendations: [],
      reasons,
      limitedBy: ["hard_constraint"],
      blockedBy,
      cappedBy,
      reductions,
      eligibleTargets: [],
      strategyScores: {},
      preConstraintCommitment: 0,
      unallocatedCommitment: 0,
    });
  }

  const scored = decisions.map((decision) =>
    scoreDecision(
      decision,
      input,
      policy,
      constraints.filter((constraint) => constraint.targetId === decision.id),
    ),
  );

  const eligible = scored.filter((entry) => {
    const targetBlocks = blockingConstraints(entry.constraints);
    if (targetBlocks.length > 0) {
      for (const constraint of targetBlocks) {
        entry.blockedBy.push(constraint.id);
        entry.limitedBy.push("hard_constraint");
        entry.reasons.push(`Target blocked by ${constraintName(constraint)}.`);
      }
      return false;
    }

    if (entry.score.confidence < policy.minConfidence) {
      entry.limitedBy.push("confidence_threshold");
      entry.reasons.push(
        `Confidence ${formatPercent(entry.score.confidence)} is below policy minimum ${formatPercent(policy.minConfidence)}.`,
      );
      return false;
    }

    if (entry.score.trust < policy.minTrust) {
      entry.limitedBy.push("trust_threshold");
      entry.reasons.push(
        `Trust ${formatPercent(entry.score.trust)} is below policy minimum ${formatPercent(policy.minTrust)}.`,
      );
      return false;
    }

    return true;
  });

  if (eligible.length === 0) {
    reasons.push("No decision cleared the policy confidence and trust gates.");
    const targetBlockedBy = scored.flatMap((entry) => entry.blockedBy);
    blockedBy.push(...targetBlockedBy);
    return buildResult({
      status: targetBlockedBy.length ? "blocked" : "deferred",
      mode: "none",
      policy,
      strategy: input.strategy ?? "risk_adjusted",
      createdAt,
      resource,
      totalRecommended: 0,
      normalizedCommitment: 0,
      recommendations: scored.map((entry) => zeroRecommendation(entry)),
      reasons: unique([
        ...reasons,
        ...scored.flatMap((entry) => entry.reasons),
      ]),
      limitedBy: unique([
        "policy_gate",
        ...scored.flatMap((entry) => entry.limitedBy),
      ]),
      blockedBy,
      cappedBy,
      reductions,
      eligibleTargets: [],
      strategyScores: {},
      preConstraintCommitment: 0,
      unallocatedCommitment: 0,
    });
  }

  if (resource.basis <= 0) {
    reasons.push("Available commitment resource is zero.");
    return buildResult({
      status: "deferred",
      mode: "none",
      policy,
      strategy: input.strategy ?? "risk_adjusted",
      createdAt,
      resource,
      totalRecommended: 0,
      normalizedCommitment: 0,
      recommendations: eligible.map((entry) => zeroRecommendation(entry)),
      reasons: unique([
        ...reasons,
        ...eligible.flatMap((entry) => entry.reasons),
      ]),
      limitedBy: ["resource_available"],
      blockedBy,
      cappedBy,
      reductions,
      eligibleTargets: eligible.map((entry) => entry.decision.id),
      strategyScores: {},
      preConstraintCommitment: 0,
      unallocatedCommitment: 0,
    });
  }

  const strategyPlan = resolveStrategyPlan(
    input.strategy ?? "risk_adjusted",
    eligible,
    policy,
    input.seed,
  );
  reasons.push(...strategyPlan.reasons);
  limitedBy.push(...strategyPlan.limitedBy);

  const aggregateQuality = weightedAverage(
    eligible.map((entry) => entry.score.quality),
    strategyPlan.weights,
  );
  const requestedCap = smallestDefined(
    resource.requested,
    resource.maximum,
    resource.basis,
  );
  let preConstraintCommitment = round(
    resource.basis *
      clampUnit(
        aggregateQuality *
          policy.maxCommitmentRatio *
          policy.commitmentMultiplier,
      ),
  );

  if (requestedCap < preConstraintCommitment) {
    preConstraintCommitment = requestedCap;
    cappedBy.push(
      resource.requested != null
        ? "resource.requested"
        : resource.maximum != null
          ? "resource.maximum"
          : "resource.available",
    );
    reasons.push(
      `Capped by available/requested resource at ${formatNumber(requestedCap)}.`,
    );
  }

  for (const constraint of nonBlockingFailures(constraints).filter(
    (entry) => !entry.targetId,
  )) {
    const factor = reductionFactor(constraint, policy);
    preConstraintCommitment = round(preConstraintCommitment * factor);
    limitedBy.push(constraint.id);
    reductions.push({
      id: constraint.id,
      factor,
      reason:
        constraint.reason ??
        `${constraintName(constraint)} reduced commitment.`,
    });
    reasons.push(`${constraintName(constraint)} reduced commitment by policy.`);
  }

  const globalCap = globalConstraintCap(constraints, resource.basis);
  if (globalCap != null && globalCap < preConstraintCommitment) {
    preConstraintCommitment = globalCap;
    cappedBy.push("constraint.global_cap");
    limitedBy.push("constraint_cap");
    reasons.push(`Capped by global constraint at ${formatNumber(globalCap)}.`);
  }

  if (
    resource.minimum != null &&
    preConstraintCommitment > 0 &&
    preConstraintCommitment < resource.minimum
  ) {
    if (resource.minimum <= requestedCap) {
      preConstraintCommitment = resource.minimum;
      cappedBy.push("resource.minimum");
      reasons.push(
        `Raised to minimum commitment ${formatNumber(resource.minimum)}.`,
      );
    } else {
      reasons.push(
        `Minimum commitment ${formatNumber(resource.minimum)} could not be met.`,
      );
      limitedBy.push("resource.minimum");
    }
  }

  if (preConstraintCommitment <= 0) {
    reasons.push(
      "Commitment reduced to zero by policy, constraints, or resources.",
    );
  }

  const targetCaps = eligible.map((entry) =>
    targetCap(entry, policy, resource.basis),
  );
  const allocation = allocateByWeights(
    preConstraintCommitment,
    strategyPlan.weights,
    targetCaps,
  );
  cappedBy.push(...allocation.cappedBy);
  if (allocation.unallocated > 0) {
    limitedBy.push("target_caps");
    reasons.push(
      `${formatNumber(allocation.unallocated)} could not be allocated within target caps.`,
    );
  }

  const recommendations = eligible.map((entry, index) =>
    recommendationFor(
      entry,
      allocation.amounts[index] ?? 0,
      resource.basis,
      preConstraintCommitment,
      strategyPlan.weights[index] ?? 0,
    ),
  );

  const totalRecommended = round(
    recommendations.reduce((sum, item) => sum + item.amount, 0),
  );
  const normalizedCommitment =
    resource.basis > 0 ? round(totalRecommended / resource.basis) : 0;

  if (
    normalizedCommitment > 0 &&
    normalizedCommitment < policy.minimumViableCommitmentRatio
  ) {
    limitedBy.push("minimum_viable_commitment");
    reasons.push(
      `Recommended commitment ${formatPercent(normalizedCommitment)} is below policy minimum viable commitment ${formatPercent(
        policy.minimumViableCommitmentRatio,
      )}.`,
    );
  }

  const status: CommitmentStatus =
    normalizedCommitment <= 0 ||
    normalizedCommitment < policy.minimumViableCommitmentRatio
      ? "deferred"
      : "recommended";

  return buildResult({
    status,
    mode: modeFor(normalizedCommitment),
    policy,
    strategy: strategyPlan.strategy,
    createdAt,
    resource,
    totalRecommended: status === "recommended" ? totalRecommended : 0,
    normalizedCommitment: status === "recommended" ? normalizedCommitment : 0,
    recommendations:
      status === "recommended"
        ? recommendations
        : recommendations.map((entry) => ({
            ...entry,
            amount: 0,
            normalizedCommitment: 0,
            mode: "none",
          })),
    reasons: unique([
      ...reasons,
      ...eligible.flatMap((entry) => entry.reasons),
    ]),
    limitedBy: unique([
      ...limitedBy,
      ...eligible.flatMap((entry) => entry.limitedBy),
    ]),
    blockedBy,
    cappedBy,
    reductions,
    eligibleTargets: eligible.map((entry) => entry.decision.id),
    strategyScores: strategyPlan.scores,
    preConstraintCommitment,
    unallocatedCommitment: allocation.unallocated,
  });
}

function normalizeDecisions(
  input: CommitmentEvaluateInput,
): CommitmentDecision[] {
  const values = [
    ...(input.decision ? [input.decision] : []),
    ...(Array.isArray(input.decisions) ? input.decisions : []),
  ];
  const seen = new Set<string>();
  const normalized: CommitmentDecision[] = [];

  for (const value of values) {
    const id = String(value?.id ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    normalized.push({ ...value, id });
  }

  return normalized;
}

function normalizeResource(resource?: CommitmentResource): ResourceState {
  const available = nonNegativeNumber(resource?.available);
  const requested = nonNegativeNumber(resource?.requested);
  const maximum = nonNegativeNumber(resource?.maximum);
  const minimum = nonNegativeNumber(resource?.minimum);
  const assumptions: string[] = [];

  let basis = available ?? requested ?? maximum ?? 1;
  if (available == null && requested == null && maximum == null) {
    assumptions.push(
      "No resource was supplied; using normalized resource basis 1.",
    );
  }
  if (!Number.isFinite(basis) || basis < 0) basis = 0;

  return {
    basis,
    ...(requested != null ? { requested } : {}),
    ...(maximum != null ? { maximum } : {}),
    ...(minimum != null ? { minimum } : {}),
    assumptions,
  };
}

function normalizeConstraints(
  constraints?: CommitmentConstraint[],
): NormalizedConstraint[] {
  if (!Array.isArray(constraints)) return [];
  return constraints.map((constraint, index) => ({
    ...constraint,
    id: String(constraint.id || `constraint-${index + 1}`),
    type: constraint.type === "hard" ? "hard" : "soft",
    severity: normalizeSeverity(constraint.severity),
    passed: constraint.passed !== false,
  }));
}

function scoreDecision(
  decision: CommitmentDecision,
  input: CommitmentEvaluateInput,
  policy: CommitmentPolicy,
  inheritedConstraints: NormalizedConstraint[],
): ScoredDecision {
  const reasons: string[] = [];
  const limitedBy: string[] = [];
  const confidence = normalizeScore(
    decision.confidence,
    0,
    "confidence",
    reasons,
  );
  const userTrust = normalizeScore(
    decision.userTrust ?? decision.trust ?? input.trust?.userTrust,
    confidence,
    "user trust",
    reasons,
  );
  const systemConfidence = normalizeScore(
    decision.systemConfidence ?? input.trust?.systemConfidence,
    confidence,
    "system confidence",
    reasons,
  );
  const historicalReliability = normalizeScore(
    decision.historicalReliability ?? input.trust?.historicalReliability,
    userTrust,
    "historical reliability",
    reasons,
  );
  const trust = round(
    (userTrust + systemConfidence + historicalReliability) / 3,
  );
  const risk = normalizeScore(decision.risk, 0.5, "risk", reasons);
  const expectedUtility = normalizeScore(
    decision.expectedUtility,
    0.5,
    "expected utility",
    reasons,
  );
  const riskAdjustment = clampUnit(1 - risk * (1 - policy.riskTolerance));
  const utilityAdjustment = 0.75 + expectedUtility * 0.5;
  let quality = clampUnit(
    confidence * trust * riskAdjustment * utilityAdjustment,
  );
  const constraints = normalizeConstraints(decision.constraints).concat(
    inheritedConstraints,
  );

  for (const constraint of nonBlockingFailures(constraints)) {
    const factor = reductionFactor(constraint, policy);
    quality = clampUnit(quality * factor);
    limitedBy.push(constraint.id);
    reasons.push(`${constraintName(constraint)} reduced target quality.`);
  }

  if (confidence >= policy.minConfidence)
    reasons.push(
      `Confidence ${formatPercent(confidence)} clears policy minimum.`,
    );
  if (trust >= policy.minTrust)
    reasons.push(`Trust ${formatPercent(trust)} clears policy minimum.`);

  return {
    decision,
    score: {
      confidence,
      userTrust,
      systemConfidence,
      historicalReliability,
      trust,
      risk,
      expectedUtility,
      quality: round(quality),
    },
    constraints,
    reasons,
    limitedBy,
    blockedBy: [],
  };
}

function resolveStrategyPlan(
  requested: CommitmentStrategyName,
  entries: ScoredDecision[],
  policy: CommitmentPolicy,
  seed?: string,
): StrategyPlan {
  if (entries.length === 1) {
    return {
      strategy: requested,
      weights: [1],
      scores: { [entries[0]?.decision.id ?? "target"]: 1 },
      reasons: [
        "Single eligible decision receives all allocatable commitment.",
      ],
      limitedBy: [],
    };
  }

  if (requested === "sharpe_like") {
    const optimized = sharpeLikeWeights(entries, policy, seed);
    if (optimized) return optimized;

    const fallback = resolveStrategyPlan(
      policy.fallbackStrategy,
      entries,
      policy,
      seed,
    );
    return {
      ...fallback,
      reasons: [
        "Sharpe-like strategy requires at least two aligned outcome observations per target; using policy fallback.",
        ...fallback.reasons,
      ],
      limitedBy: unique(["strategy_fallback", ...fallback.limitedBy]),
    };
  }

  const rawScores = entries.map((entry) => {
    if (requested === "equal_weight") return 1;
    if (requested === "confidence_weighted")
      return entry.score.confidence * entry.score.trust;
    if (requested === "constraint_first")
      return constraintFirstScore(entry, policy);
    return entry.score.quality;
  });

  const weights = normalizeWeights(rawScores);
  return {
    strategy: requested,
    weights,
    scores: Object.fromEntries(
      entries.map((entry, index) => [
        entry.decision.id,
        round(rawScores[index] ?? 0),
      ]),
    ),
    reasons: [`Strategy ${requested} produced deterministic target weights.`],
    limitedBy: [],
  };
}

function sharpeLikeWeights(
  entries: ScoredDecision[],
  policy: CommitmentPolicy,
  seed?: string,
): StrategyPlan | null {
  const minLength = Math.min(
    ...entries.map((entry) => entry.decision.outcomeSeries?.length ?? 0),
  );
  if (!Number.isFinite(minLength) || minLength < 2) return null;

  const matrix = entries.map((entry) =>
    (entry.decision.outcomeSeries ?? [])
      .slice(0, minLength)
      .map((value) => (Number.isFinite(Number(value)) ? Number(value) : 0)),
  );
  const config = policy.sharpeLike;
  const weights = optimizeOutcomeMatrix(matrix, {
    ...config,
    seed:
      seed ??
      config.seed ??
      stableHash(
        JSON.stringify({
          matrix,
          policy: policy.name,
          version: policy.version,
        }),
      ),
  });
  const scoreValues = entries.map((entry, index) => {
    const single = matrix.map((series, seriesIndex) =>
      series.map((value) => (seriesIndex === index ? value : 0)),
    );
    return scoreOutcomeMetrics(
      summarizeOutcomeMetrics(unitWeight(entries.length, index), single),
      config,
    );
  });

  return {
    strategy: "sharpe_like",
    weights,
    scores: Object.fromEntries(
      entries.map((entry, index) => [
        entry.decision.id,
        round(scoreValues[index] ?? 0),
      ]),
    ),
    reasons: [
      "Sharpe-like strategy optimized reward relative to variability using deterministic seeded search.",
    ],
    limitedBy: [],
  };
}

function optimizeOutcomeMatrix(
  outcomeMatrix: number[][],
  config: Required<Omit<SharpeLikeConfig, "seed">> & { seed?: string },
): number[] {
  if (outcomeMatrix.length === 0) return [];
  if (outcomeMatrix.length === 1) return [1];

  const count = outcomeMatrix.length;
  const rng = mulberry32(hashString(config.seed ?? "signal.commitment"));
  let best = normalizeWeights(Array.from({ length: count }, () => 1));
  let bestMetrics = summarizeOutcomeMetrics(best, outcomeMatrix);
  let bestScore = scoreOutcomeMetrics(bestMetrics, config);
  const rounds =
    config.rounds == null
      ? Math.max(1000, count * 700)
      : Math.max(1, Math.floor(config.rounds));

  for (let index = 0; index < rounds; index += 1) {
    const candidate = randomWeights(count, rng);
    const metrics = summarizeOutcomeMetrics(candidate, outcomeMatrix);
    const score = scoreOutcomeMetrics(metrics, config);
    if (
      score > bestScore + 1e-12 ||
      (Math.abs(score - bestScore) <= 1e-12 &&
        preferredMetrics(metrics, bestMetrics))
    ) {
      best = candidate;
      bestMetrics = metrics;
      bestScore = score;
    }
  }

  const passes = Math.max(0, Math.floor(config.refinementPasses));
  const poolSize = Math.max(1, Math.floor(config.refinementPoolSize));
  const baseScale = Math.max(0, config.refinementScale);
  for (let pass = 0; pass < passes; pass += 1) {
    const scale = baseScale / Math.max(1, pass + 1);
    for (let index = 0; index < poolSize; index += 1) {
      const candidate = normalizeWeights(
        best.map((weight) => Math.max(0, weight + (rng() - 0.5) * scale)),
      );
      const metrics = summarizeOutcomeMetrics(candidate, outcomeMatrix);
      const score = scoreOutcomeMetrics(metrics, config);
      if (
        score > bestScore + 1e-12 ||
        (Math.abs(score - bestScore) <= 1e-12 &&
          preferredMetrics(metrics, bestMetrics))
      ) {
        best = candidate;
        bestMetrics = metrics;
        bestScore = score;
      }
    }
  }

  return normalizeWeights(best);
}

function summarizeOutcomeMetrics(weights: number[], outcomeMatrix: number[][]) {
  const series = portfolioSeries(weights, outcomeMatrix);
  if (series.length < 2) return null;

  const meanValue = mean(series);
  const variance =
    series.reduce((sum, value) => sum + (value - meanValue) ** 2, 0) /
    Math.max(1, series.length - 1);
  const variability = Math.sqrt(Math.max(variance, 1e-10)) * Math.sqrt(252);
  const annualizedReturn = meanValue * 252;
  const downsideVariance =
    series.reduce((sum, value) => sum + Math.min(0, value) ** 2, 0) /
    series.length;
  const downsideDeviation =
    Math.sqrt(Math.max(downsideVariance, 1e-10)) * Math.sqrt(252);

  let value = 1;
  let peak = 1;
  let maxDrawdown = 0;
  for (const periodReturn of series) {
    value *= Math.exp(periodReturn);
    if (value > peak) peak = value;
    const drawdown = peak > 0 ? (peak - value) / peak : 0;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  }

  const cumulativeReturn = value - 1;
  return {
    periods: series.length,
    annualizedReturn,
    variability,
    downsideDeviation,
    cumulativeReturn,
    drawdown: maxDrawdown,
    rewardToVariability: annualizedReturn / Math.max(variability, 1e-10),
    downsideAdjusted: annualizedReturn / Math.max(downsideDeviation, 1e-10),
    drawdownAdjusted: cumulativeReturn / Math.max(maxDrawdown, 1e-10),
  };
}

function scoreOutcomeMetrics(
  metrics: ReturnType<typeof summarizeOutcomeMetrics>,
  config: Required<Omit<SharpeLikeConfig, "seed">>,
): number {
  if (!metrics) return Number.NEGATIVE_INFINITY;
  if (config.objective === "downside_adjusted") return metrics.downsideAdjusted;
  if (config.objective === "drawdown_adjusted") return metrics.drawdownAdjusted;
  if (config.objective === "return") return metrics.annualizedReturn;
  if (config.objective === "composite") {
    const weights = config.objectiveWeights;
    return (
      metrics.rewardToVariability * (weights.rewardToVariabilityWeight ?? 0.8) +
      metrics.downsideAdjusted * (weights.downsideWeight ?? 0.15) +
      metrics.annualizedReturn * (weights.returnWeight ?? 0.45) -
      metrics.drawdown * (weights.drawdownWeight ?? 0.35) -
      metrics.variability * (weights.variabilityWeight ?? 0.04)
    );
  }
  return metrics.rewardToVariability;
}

function portfolioSeries(
  weights: number[],
  outcomeMatrix: number[][],
): number[] {
  const periods = outcomeMatrix[0]?.length ?? 0;
  const series: number[] = [];
  for (let period = 0; period < periods; period += 1) {
    let value = 0;
    for (let target = 0; target < weights.length; target += 1) {
      value += (weights[target] ?? 0) * (outcomeMatrix[target]?.[period] ?? 0);
    }
    series.push(value);
  }
  return series;
}

function preferredMetrics(
  candidate: ReturnType<typeof summarizeOutcomeMetrics>,
  current: ReturnType<typeof summarizeOutcomeMetrics>,
): boolean {
  if (!candidate) return false;
  if (!current) return true;
  if (
    Math.abs(candidate.rewardToVariability - current.rewardToVariability) > 1e-6
  ) {
    return candidate.rewardToVariability > current.rewardToVariability;
  }
  if (Math.abs(candidate.cumulativeReturn - current.cumulativeReturn) > 1e-6) {
    return candidate.cumulativeReturn > current.cumulativeReturn;
  }
  if (Math.abs(candidate.drawdown - current.drawdown) > 1e-6) {
    return candidate.drawdown < current.drawdown;
  }
  return candidate.variability < current.variability;
}

function targetCap(
  entry: ScoredDecision,
  policy: CommitmentPolicy,
  basis: number,
): number {
  const caps = [basis * policy.maxSingleTargetRatio];
  const maxCommitment = nonNegativeNumber(entry.decision.maxCommitment);
  if (maxCommitment != null) caps.push(maxCommitment);
  for (const constraint of entry.constraints) {
    const cap = constraintCap(constraint, basis);
    if (cap != null) caps.push(cap);
  }
  return Math.min(...caps);
}

function globalConstraintCap(
  constraints: NormalizedConstraint[],
  basis: number,
): number | undefined {
  const caps = constraints
    .filter((constraint) => !constraint.targetId)
    .map((constraint) => constraintCap(constraint, basis))
    .filter((cap): cap is number => cap != null);
  return caps.length ? Math.min(...caps) : undefined;
}

function constraintCap(
  constraint: CommitmentConstraint,
  basis: number,
): number | undefined {
  const absolute = nonNegativeNumber(constraint.maxCommitment);
  const ratio = nonNegativeNumber(constraint.maxCommitmentRatio);
  const ratioCap =
    ratio == null ? undefined : basis * normalizeRatioValue(ratio);
  return smallestDefined(absolute, ratioCap);
}

function allocateByWeights(
  totalBudget: number,
  weights: number[],
  caps: number[],
): Allocation {
  const amounts = weights.map(() => 0);
  const active = new Set(weights.map((_, index) => index));
  const cappedBy: string[] = [];
  let remaining = Math.max(0, totalBudget);

  while (active.size > 0 && remaining > 1e-9) {
    const activeIndexes = [...active];
    const totalWeight = activeIndexes.reduce(
      (sum, index) => sum + Math.max(0, weights[index] ?? 0),
      0,
    );
    const equalWeight = totalWeight <= 0 ? 1 / activeIndexes.length : 0;
    let cappedThisPass = false;

    for (const index of activeIndexes) {
      const share =
        totalWeight > 0
          ? Math.max(0, weights[index] ?? 0) / totalWeight
          : equalWeight;
      const desired = remaining * share;
      const cap = caps[index] ?? Number.POSITIVE_INFINITY;
      const capRoom = Math.max(0, cap - (amounts[index] ?? 0));
      if (desired > capRoom + 1e-9) {
        amounts[index] = round((amounts[index] ?? 0) + capRoom);
        remaining = round(remaining - capRoom);
        active.delete(index);
        cappedBy.push(`target.${index}.cap`);
        cappedThisPass = true;
      }
    }

    if (!cappedThisPass) {
      for (const index of activeIndexes) {
        const share =
          totalWeight > 0
            ? Math.max(0, weights[index] ?? 0) / totalWeight
            : equalWeight;
        amounts[index] = round((amounts[index] ?? 0) + remaining * share);
      }
      remaining = 0;
    }
  }

  return {
    amounts,
    unallocated: round(Math.max(0, remaining)),
    cappedBy,
  };
}

function recommendationFor(
  entry: ScoredDecision,
  amount: number,
  basis: number,
  budget: number,
  strategyWeight: number,
): CommitmentRecommendation {
  const normalizedCommitment = basis > 0 ? round(amount / basis) : 0;
  const budgetWeight = budget > 0 ? round(amount / budget) : 0;
  const limitedBy = unique(entry.limitedBy);
  const reasons = [...entry.reasons];
  if (amount <= 0) reasons.push("No commitment allocated to this target.");

  return {
    targetId: entry.decision.id,
    ...(entry.decision.label ? { label: entry.decision.label } : {}),
    amount: round(amount),
    normalizedCommitment,
    weight: budgetWeight || round(strategyWeight),
    mode: modeFor(normalizedCommitment),
    score: entry.score,
    reasons: unique(reasons),
    limitedBy,
  };
}

function zeroRecommendation(entry: ScoredDecision): CommitmentRecommendation {
  return {
    targetId: entry.decision.id,
    ...(entry.decision.label ? { label: entry.decision.label } : {}),
    amount: 0,
    normalizedCommitment: 0,
    weight: 0,
    mode: "none",
    score: entry.score,
    reasons: unique([
      ...entry.reasons,
      "No commitment allocated to this target.",
    ]),
    limitedBy: unique(entry.limitedBy),
  };
}

function buildResult(args: {
  status: CommitmentStatus;
  mode: CommitmentMode;
  policy: CommitmentPolicy;
  strategy: CommitmentStrategyName;
  createdAt: string;
  resource: ResourceState;
  totalRecommended: number;
  normalizedCommitment: number;
  recommendations: CommitmentRecommendation[];
  reasons: string[];
  limitedBy: string[];
  blockedBy: string[];
  cappedBy: string[];
  reductions: CommitmentResult["audit"]["reductions"];
  eligibleTargets: string[];
  strategyScores: Record<string, number>;
  preConstraintCommitment: number;
  unallocatedCommitment: number;
}): CommitmentResult {
  return {
    module: "signal.commitment",
    operation: "commitment.evaluate.v1",
    version: "v1",
    status: args.status,
    mode: args.mode,
    policy: {
      name: args.policy.name,
      version: args.policy.version,
    },
    strategy: args.strategy,
    totalRecommended: round(args.totalRecommended),
    normalizedCommitment: round(args.normalizedCommitment),
    recommendations: args.recommendations,
    reasons: unique(args.reasons),
    limitedBy: unique(args.limitedBy),
    invalidation: buildInvalidation(
      args.policy,
      args.recommendations,
      args.limitedBy,
    ),
    monitoringPlan: buildMonitoringPlan(args.policy, args.recommendations),
    audit: {
      deterministic: true,
      createdAt: args.createdAt,
      resourceBasis: round(args.resource.basis),
      ...(args.resource.requested != null
        ? { requestedCommitment: args.resource.requested }
        : {}),
      ...(args.resource.maximum != null
        ? { maxCommitment: args.resource.maximum }
        : {}),
      preConstraintCommitment: round(args.preConstraintCommitment),
      unallocatedCommitment: round(args.unallocatedCommitment),
      eligibleTargets: args.eligibleTargets,
      blockedBy: unique(args.blockedBy),
      cappedBy: unique(args.cappedBy),
      reductions: args.reductions,
      strategyScores: args.strategyScores,
      assumptions: args.resource.assumptions,
    },
  };
}

function buildInvalidation(
  policy: CommitmentPolicy,
  recommendations: CommitmentRecommendation[],
  limitedBy: string[],
): CommitmentInvalidation {
  const triggers: CommitmentInvalidation["triggers"] = [
    {
      id: "policy-confidence-floor",
      severity: "high",
      condition: `confidence falls below ${formatPercent(policy.minConfidence)}`,
    },
    {
      id: "policy-trust-floor",
      severity: "high",
      condition: `trust falls below ${formatPercent(policy.minTrust)}`,
    },
    {
      id: "resource-capacity-change",
      severity: "medium",
      condition: "available resource changes materially",
    },
  ];

  for (const recommendation of recommendations) {
    if (recommendation.amount <= 0) continue;
    triggers.push({
      id: `target-${recommendation.targetId}-confidence-deterioration`,
      targetId: recommendation.targetId,
      severity: "medium",
      condition: `confidence drops by ${formatPercent(policy.invalidationTolerance)} or more`,
    });
    triggers.push({
      id: `target-${recommendation.targetId}-risk-increase`,
      targetId: recommendation.targetId,
      severity: "medium",
      condition: `risk rises above ${formatPercent(clampUnit(recommendation.score.risk + policy.invalidationTolerance))}`,
    });
  }

  return {
    triggers,
    confidenceDeterioration: recommendations.map(
      (entry) =>
        `${entry.targetId}: invalidate if confidence drops below ${formatPercent(Math.max(policy.minConfidence, entry.score.confidence - policy.invalidationTolerance))}.`,
    ),
    evidenceDeterioration: [
      "Invalidate if supporting evidence no longer matches the decision state.",
      "Invalidate if outcome observations become stale, missing, or contradictory.",
    ],
    policyViolations: [
      `Invalidate if policy ${policy.name}@${policy.version} changes or any hard constraint fails.`,
      ...limitedBy.map((entry) => `Review existing limiter: ${entry}.`),
    ],
    resourceViolations: [
      "Invalidate if available, requested, or maximum resource no longer supports the committed amount.",
    ],
  };
}

function buildMonitoringPlan(
  policy: CommitmentPolicy,
  recommendations: CommitmentRecommendation[],
): CommitmentMonitoringPlan {
  return {
    metrics: recommendations.flatMap((entry) => [
      {
        id: "confidence",
        targetId: entry.targetId,
        threshold: round(
          Math.max(
            policy.minConfidence,
            entry.score.confidence - policy.invalidationTolerance,
          ),
        ),
        direction: "below" as const,
      },
      {
        id: "trust",
        targetId: entry.targetId,
        threshold: round(
          Math.max(
            policy.minTrust,
            entry.score.trust - policy.invalidationTolerance,
          ),
        ),
        direction: "below" as const,
      },
      {
        id: "risk",
        targetId: entry.targetId,
        threshold: round(
          clampUnit(entry.score.risk + policy.invalidationTolerance),
        ),
        direction: "above" as const,
      },
    ]),
    signals: [
      "decision.confidence.changed",
      "decision.evidence.changed",
      "constraint.failed",
      "resource.available.changed",
    ],
    events: [
      "commitment.review_due",
      "commitment.invalidated",
      "commitment.resource_limited",
    ],
    futureChecks: [
      `Re-evaluate when confidence, trust, risk, or resource changes by ${formatPercent(policy.invalidationTolerance)}.`,
      `Use monitoring sensitivity ${formatPercent(policy.monitoringSensitivity)} when prioritizing alerts.`,
    ],
  };
}

function blockingConstraints(
  constraints: NormalizedConstraint[],
): NormalizedConstraint[] {
  return constraints.filter(
    (constraint) =>
      constraint.type === "hard" &&
      !constraint.passed &&
      (constraint.severity === "high" || constraint.severity === "critical"),
  );
}

function nonBlockingFailures(
  constraints: NormalizedConstraint[],
): NormalizedConstraint[] {
  return constraints.filter(
    (constraint) =>
      !constraint.passed && !blockingConstraints([constraint]).length,
  );
}

function reductionFactor(
  constraint: NormalizedConstraint,
  policy: CommitmentPolicy,
): number {
  if (constraint.reductionFactor != null)
    return clampUnit(Number(constraint.reductionFactor));
  return constraint.type === "hard"
    ? policy.hardConstraintReduction[constraint.severity]
    : policy.softConstraintReduction[constraint.severity];
}

function constraintFirstScore(
  entry: ScoredDecision,
  policy: CommitmentPolicy,
): number {
  const cap = targetCap(entry, policy, 1);
  const failed = nonBlockingFailures(entry.constraints).length;
  return entry.score.quality * (failed > 0 ? 0.6 : 1) * clampUnit(cap);
}

function normalizeScore(
  value: unknown,
  fallback: number,
  label: string,
  reasons: string[],
): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    if (value == null)
      reasons.push(`${label} missing; using ${formatPercent(fallback)}.`);
    else reasons.push(`${label} invalid; using ${formatPercent(fallback)}.`);
    return clampUnit(fallback);
  }
  const scaled = normalizeRatioValue(numeric);
  const clamped = clampUnit(scaled);
  if (clamped !== scaled)
    reasons.push(
      `${label} outside 0-100%; clamped to ${formatPercent(clamped)}.`,
    );
  return round(clamped);
}

function normalizeRatioValue(value: number): number {
  return Math.abs(value) > 1 ? value / 100 : value;
}

function normalizeSeverity(
  value: CommitmentConstraintSeverity | undefined,
): CommitmentConstraintSeverity {
  if (
    value === "low" ||
    value === "medium" ||
    value === "high" ||
    value === "critical"
  )
    return value;
  return "medium";
}

function normalizeWeights(values: number[]): number[] {
  const positive = values.map((value) =>
    Number.isFinite(value) ? Math.max(0, value) : 0,
  );
  const sum = positive.reduce((total, value) => total + value, 0);
  if (sum <= 0)
    return positive.map(() =>
      positive.length ? round(1 / positive.length) : 0,
    );
  return positive.map((value) => round(value / sum));
}

function randomWeights(count: number, rng: () => number): number[] {
  const values = Array.from({ length: count }, () =>
    Math.max(1e-6, -Math.log(Math.max(1e-12, rng()))),
  );
  return normalizeWeights(values);
}

function unitWeight(count: number, activeIndex: number): number[] {
  return Array.from({ length: count }, (_, index) =>
    index === activeIndex ? 1 : 0,
  );
}

function weightedAverage(values: number[], weights: number[]): number {
  if (values.length === 0) return 0;
  const normalized = normalizeWeights(
    weights.length === values.length ? weights : values.map(() => 1),
  );
  return round(
    values.reduce(
      (sum, value, index) => sum + value * (normalized[index] ?? 0),
      0,
    ),
  );
}

function mean(values: number[]): number {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;
}

function nonNegativeNumber(value: unknown): number | undefined {
  if (value == null) return undefined;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return undefined;
  return Math.max(0, numeric);
}

function smallestDefined(...values: Array<number | undefined>): number {
  const defined = values.filter((value): value is number => value != null);
  return defined.length ? Math.min(...defined) : Number.POSITIVE_INFINITY;
}

function modeFor(normalizedCommitment: number): CommitmentMode {
  if (normalizedCommitment <= 0) return "none";
  if (normalizedCommitment <= 0.01) return "observe";
  if (normalizedCommitment <= 0.05) return "micro";
  if (normalizedCommitment <= 0.2) return "limited";
  if (normalizedCommitment <= 0.45) return "normal";
  if (normalizedCommitment <= 0.75) return "elevated";
  return "maximum";
}

function normalizeDate(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return DEFAULT_CREATED_AT;
  const time = Date.parse(value);
  return Number.isFinite(time)
    ? new Date(time).toISOString()
    : DEFAULT_CREATED_AT;
}

function constraintName(constraint: CommitmentConstraint): string {
  return constraint.label
    ? `${constraint.label} (${constraint.id})`
    : constraint.id;
}

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function round(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(6));
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatNumber(value: number): string {
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function stableHash(value: string): string {
  return String(hashString(value));
}

function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let next = Math.imul(value ^ (value >>> 15), 1 | value);
    next ^= next + Math.imul(next ^ (next >>> 7), 61 | next);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}
