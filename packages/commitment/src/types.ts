export type CommitmentPolicyName =
  | "conservative"
  | "balanced"
  | "aggressive"
  | "exploratory"
  | "preservation"
  | "compounding"
  | "custom";

export type CommitmentStrategyName =
  | "equal_weight"
  | "confidence_weighted"
  | "risk_adjusted"
  | "sharpe_like"
  | "constraint_first";

export type CommitmentStatus = "blocked" | "deferred" | "recommended";

export type CommitmentMode =
  | "none"
  | "observe"
  | "micro"
  | "limited"
  | "normal"
  | "elevated"
  | "maximum";

export type CommitmentConstraintSeverity =
  | "low"
  | "medium"
  | "high"
  | "critical";

export type CommitmentConstraintType = "hard" | "soft";

export type CommitmentConstraint = {
  id: string;
  label?: string;
  type?: CommitmentConstraintType;
  severity?: CommitmentConstraintSeverity;
  passed?: boolean;
  targetId?: string;
  maxCommitment?: number;
  maxCommitmentRatio?: number;
  reductionFactor?: number;
  reason?: string;
};

export type CommitmentDecision = {
  id: string;
  label?: string;
  confidence?: number;
  trust?: number;
  userTrust?: number;
  systemConfidence?: number;
  historicalReliability?: number;
  risk?: number;
  expectedUtility?: number;
  requestedCommitment?: number;
  minCommitment?: number;
  maxCommitment?: number;
  outcomeSeries?: number[];
  constraints?: CommitmentConstraint[];
  metadata?: Record<string, unknown>;
};

export type CommitmentResource = {
  id?: string;
  available?: number;
  requested?: number;
  minimum?: number;
  maximum?: number;
};

export type CommitmentTrust = {
  userTrust?: number;
  systemConfidence?: number;
  historicalReliability?: number;
};

export type CommitmentObjectiveWeights = {
  rewardToVariabilityWeight?: number;
  downsideWeight?: number;
  returnWeight?: number;
  drawdownWeight?: number;
  variabilityWeight?: number;
};

export type SharpeLikeObjective =
  | "reward_to_variability"
  | "downside_adjusted"
  | "drawdown_adjusted"
  | "return"
  | "composite";

export type SharpeLikeConfig = {
  objective?: SharpeLikeObjective;
  rounds?: number | null;
  refinementPasses?: number;
  refinementPoolSize?: number;
  refinementScale?: number;
  objectiveWeights?: CommitmentObjectiveWeights;
  seed?: string;
};

export type CommitmentPolicy = {
  name: CommitmentPolicyName;
  version: string;
  description: string;
  minConfidence: number;
  minTrust: number;
  maxCommitmentRatio: number;
  maxSingleTargetRatio: number;
  riskTolerance: number;
  commitmentMultiplier: number;
  minimumViableCommitmentRatio: number;
  fallbackStrategy: CommitmentStrategyName;
  invalidationTolerance: number;
  monitoringSensitivity: number;
  softConstraintReduction: Record<CommitmentConstraintSeverity, number>;
  hardConstraintReduction: Record<CommitmentConstraintSeverity, number>;
  sharpeLike: Required<Omit<SharpeLikeConfig, "seed">> & { seed?: string };
};

export type CommitmentEvaluateInput = {
  decision?: CommitmentDecision;
  decisions?: CommitmentDecision[];
  resource?: CommitmentResource;
  trust?: CommitmentTrust;
  constraints?: CommitmentConstraint[];
  policy?: CommitmentPolicyName | Partial<CommitmentPolicy>;
  strategy?: CommitmentStrategyName;
  now?: string;
  seed?: string;
  metadata?: Record<string, unknown>;
};

export type CommitmentScoreBreakdown = {
  confidence: number;
  userTrust: number;
  systemConfidence: number;
  historicalReliability: number;
  trust: number;
  risk: number;
  expectedUtility: number;
  quality: number;
};

export type CommitmentRecommendation = {
  targetId: string;
  label?: string;
  amount: number;
  normalizedCommitment: number;
  weight: number;
  mode: CommitmentMode;
  score: CommitmentScoreBreakdown;
  reasons: string[];
  limitedBy: string[];
};

export type CommitmentInvalidation = {
  triggers: Array<{
    id: string;
    severity: CommitmentConstraintSeverity;
    condition: string;
    targetId?: string;
  }>;
  confidenceDeterioration: string[];
  evidenceDeterioration: string[];
  policyViolations: string[];
  resourceViolations: string[];
};

export type CommitmentMonitoringPlan = {
  metrics: Array<{
    id: string;
    targetId?: string;
    threshold: number;
    direction: "below" | "above" | "changed";
  }>;
  signals: string[];
  events: string[];
  futureChecks: string[];
};

export type CommitmentResult = {
  module: "signal.commitment";
  operation: "commitment.evaluate.v1";
  version: "v1";
  status: CommitmentStatus;
  mode: CommitmentMode;
  policy: {
    name: CommitmentPolicyName;
    version: string;
  };
  strategy: CommitmentStrategyName;
  totalRecommended: number;
  normalizedCommitment: number;
  recommendations: CommitmentRecommendation[];
  reasons: string[];
  limitedBy: string[];
  invalidation: CommitmentInvalidation;
  monitoringPlan: CommitmentMonitoringPlan;
  audit: {
    deterministic: true;
    createdAt: string;
    resourceBasis: number;
    requestedCommitment?: number;
    maxCommitment?: number;
    preConstraintCommitment: number;
    unallocatedCommitment: number;
    eligibleTargets: string[];
    blockedBy: string[];
    cappedBy: string[];
    reductions: Array<{ id: string; factor: number; reason: string }>;
    strategyScores: Record<string, number>;
    assumptions: string[];
  };
};

export type CommitmentOperationDefinition = {
  kind: "query";
  name: "commitment.evaluate.v1";
  version: "v1";
  description: string;
  idempotent: true;
  replaySafe: true;
};
