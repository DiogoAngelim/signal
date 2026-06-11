import type {
  CommitmentConstraintSeverity,
  CommitmentObjectiveWeights,
  CommitmentPolicy,
  CommitmentPolicyName,
  CommitmentStrategyName,
  SharpeLikeConfig,
  SharpeLikeObjective,
} from "./types";

const softConstraintReduction: Record<CommitmentConstraintSeverity, number> = {
  low: 0.9,
  medium: 0.75,
  high: 0.5,
  critical: 0.25,
};

const hardConstraintReduction: Record<CommitmentConstraintSeverity, number> = {
  low: 0.75,
  medium: 0.5,
  high: 0,
  critical: 0,
};

export const DEFAULT_SHARPE_LIKE_CONFIG: Readonly<{
  objective: SharpeLikeObjective;
  rounds: number;
  refinementPasses: number;
  refinementPoolSize: number;
  refinementScale: number;
  objectiveWeights: Readonly<Required<CommitmentObjectiveWeights>>;
}> = Object.freeze({
  objective: "composite",
  rounds: 3000,
  refinementPasses: 3,
  refinementPoolSize: 420,
  refinementScale: 0.06,
  objectiveWeights: Object.freeze({
    rewardToVariabilityWeight: 0.8,
    downsideWeight: 0.15,
    returnWeight: 0.45,
    drawdownWeight: 0.35,
    variabilityWeight: 0.04,
  }),
});

function policy(
  name: CommitmentPolicyName,
  values: Omit<
    CommitmentPolicy,
    | "name"
    | "version"
    | "softConstraintReduction"
    | "hardConstraintReduction"
    | "sharpeLike"
  > & {
    version?: string;
    fallbackStrategy?: CommitmentStrategyName;
    sharpeLike?: SharpeLikeConfig;
  },
): CommitmentPolicy {
  return {
    ...values,
    name,
    version: values.version ?? "2026-06-01",
    softConstraintReduction,
    hardConstraintReduction,
    sharpeLike: {
      objective:
        values.sharpeLike?.objective ?? DEFAULT_SHARPE_LIKE_CONFIG.objective,
      rounds: values.sharpeLike?.rounds ?? DEFAULT_SHARPE_LIKE_CONFIG.rounds,
      refinementPasses:
        values.sharpeLike?.refinementPasses ??
        DEFAULT_SHARPE_LIKE_CONFIG.refinementPasses,
      refinementPoolSize:
        values.sharpeLike?.refinementPoolSize ??
        DEFAULT_SHARPE_LIKE_CONFIG.refinementPoolSize,
      refinementScale:
        values.sharpeLike?.refinementScale ??
        DEFAULT_SHARPE_LIKE_CONFIG.refinementScale,
      objectiveWeights: {
        ...DEFAULT_SHARPE_LIKE_CONFIG.objectiveWeights,
        ...(values.sharpeLike?.objectiveWeights ?? {}),
      },
      ...(values.sharpeLike?.seed ? { seed: values.sharpeLike.seed } : {}),
    },
    fallbackStrategy: values.fallbackStrategy ?? "risk_adjusted",
  };
}

export const BUILT_IN_COMMITMENT_POLICIES = Object.freeze({
  conservative: policy("conservative", {
    description:
      "Requires stronger confidence and trust, keeps commitment small, and treats risk conservatively.",
    minConfidence: 0.65,
    minTrust: 0.7,
    maxCommitmentRatio: 0.35,
    maxSingleTargetRatio: 0.45,
    riskTolerance: 0.35,
    commitmentMultiplier: 0.8,
    minimumViableCommitmentRatio: 0.02,
    fallbackStrategy: "constraint_first",
    invalidationTolerance: 0.08,
    monitoringSensitivity: 0.85,
  }),
  balanced: policy("balanced", {
    description:
      "Balances confidence, trust, constraints, and risk into moderate commitment.",
    minConfidence: 0.55,
    minTrust: 0.55,
    maxCommitmentRatio: 0.6,
    maxSingleTargetRatio: 0.55,
    riskTolerance: 0.55,
    commitmentMultiplier: 1,
    minimumViableCommitmentRatio: 0.015,
    fallbackStrategy: "risk_adjusted",
    invalidationTolerance: 0.12,
    monitoringSensitivity: 0.7,
  }),
  aggressive: policy("aggressive", {
    description:
      "Allows larger commitment when confidence and trust clear lower thresholds.",
    minConfidence: 0.45,
    minTrust: 0.45,
    maxCommitmentRatio: 0.85,
    maxSingleTargetRatio: 0.7,
    riskTolerance: 0.75,
    commitmentMultiplier: 1.15,
    minimumViableCommitmentRatio: 0.01,
    fallbackStrategy: "risk_adjusted",
    invalidationTolerance: 0.18,
    monitoringSensitivity: 0.6,
  }),
  exploratory: policy("exploratory", {
    description:
      "Permits small tests under uncertainty while preventing large commitment.",
    minConfidence: 0.25,
    minTrust: 0.3,
    maxCommitmentRatio: 0.12,
    maxSingleTargetRatio: 0.4,
    riskTolerance: 0.45,
    commitmentMultiplier: 0.55,
    minimumViableCommitmentRatio: 0.0025,
    fallbackStrategy: "equal_weight",
    invalidationTolerance: 0.05,
    monitoringSensitivity: 0.9,
  }),
  preservation: policy("preservation", {
    description:
      "Prioritizes capital, capacity, and reversibility over growth.",
    minConfidence: 0.6,
    minTrust: 0.75,
    maxCommitmentRatio: 0.25,
    maxSingleTargetRatio: 0.35,
    riskTolerance: 0.25,
    commitmentMultiplier: 0.65,
    minimumViableCommitmentRatio: 0.01,
    fallbackStrategy: "constraint_first",
    invalidationTolerance: 0.06,
    monitoringSensitivity: 0.95,
  }),
  compounding: policy("compounding", {
    description:
      "Allows steady commitment where trust and repeatability support it.",
    minConfidence: 0.6,
    minTrust: 0.6,
    maxCommitmentRatio: 0.75,
    maxSingleTargetRatio: 0.65,
    riskTolerance: 0.6,
    commitmentMultiplier: 1.05,
    minimumViableCommitmentRatio: 0.015,
    fallbackStrategy: "risk_adjusted",
    invalidationTolerance: 0.1,
    monitoringSensitivity: 0.75,
  }),
  custom: policy("custom", {
    description: "Custom policy resolved from caller supplied overrides.",
    minConfidence: 0.55,
    minTrust: 0.55,
    maxCommitmentRatio: 0.6,
    maxSingleTargetRatio: 0.55,
    riskTolerance: 0.55,
    commitmentMultiplier: 1,
    minimumViableCommitmentRatio: 0.015,
    fallbackStrategy: "risk_adjusted",
    invalidationTolerance: 0.12,
    monitoringSensitivity: 0.7,
  }),
} satisfies Record<CommitmentPolicyName, CommitmentPolicy>);

export function resolveCommitmentPolicy(
  input?: CommitmentPolicyName | Partial<CommitmentPolicy>,
): CommitmentPolicy {
  if (!input) return clonePolicy(BUILT_IN_COMMITMENT_POLICIES.balanced);
  if (typeof input === "string") {
    return clonePolicy(
      BUILT_IN_COMMITMENT_POLICIES[input] ??
        BUILT_IN_COMMITMENT_POLICIES.balanced,
    );
  }

  const baseName = input.name ?? "custom";
  const base =
    BUILT_IN_COMMITMENT_POLICIES[baseName] ??
    BUILT_IN_COMMITMENT_POLICIES.custom;
  return {
    ...clonePolicy(base),
    ...input,
    name: input.name ?? "custom",
    version: input.version ?? base.version,
    softConstraintReduction: {
      ...base.softConstraintReduction,
      ...(input.softConstraintReduction ?? {}),
    },
    hardConstraintReduction: {
      ...base.hardConstraintReduction,
      ...(input.hardConstraintReduction ?? {}),
    },
    sharpeLike: {
      ...base.sharpeLike,
      ...(input.sharpeLike ?? {}),
      objectiveWeights: {
        ...base.sharpeLike.objectiveWeights,
        ...(input.sharpeLike?.objectiveWeights ?? {}),
      },
    },
  };
}

function clonePolicy(policyValue: CommitmentPolicy): CommitmentPolicy {
  return {
    ...policyValue,
    softConstraintReduction: { ...policyValue.softConstraintReduction },
    hardConstraintReduction: { ...policyValue.hardConstraintReduction },
    sharpeLike: {
      ...policyValue.sharpeLike,
      objectiveWeights: { ...policyValue.sharpeLike.objectiveWeights },
    },
  };
}
