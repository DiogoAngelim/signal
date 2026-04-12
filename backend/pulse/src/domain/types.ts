export type SubjectRef = { type: string; id: string };

export type FrameLifecycleStage =
  | "captured"
  | "normalized"
  | "scored"
  | "gated"
  | "explained"
  | "rejected";

export type FrameStatus = "pending" | "eligible" | "rejected" | "degraded";

export const ReasonCode = {
  FEATURE_MISSING: "FEATURE_MISSING",
  LOW_CONFIDENCE: "LOW_CONFIDENCE",
  FRESHNESS_EXPIRED: "FRESHNESS_EXPIRED",
  SCORE_BELOW_THRESHOLD: "SCORE_BELOW_THRESHOLD",
  PROFILE_NOT_FOUND: "PROFILE_NOT_FOUND",
  INPUT_INVALID: "INPUT_INVALID",
  ELIGIBLE: "ELIGIBLE",
  DEGRADED_PARTIAL_INPUT: "DEGRADED_PARTIAL_INPUT",
} as const;

export type ReasonCode = (typeof ReasonCode)[keyof typeof ReasonCode];

export type ConfidenceBreakdown = {
  featureCompleteness: number;
  freshness: number;
};

export type ExplanationDriverImpact = "positive" | "negative" | "neutral";

export type ExplanationDriver = {
  key: string;
  value: number;
  impact: ExplanationDriverImpact;
};

export type Explanation = {
  summary: string;
  reasonCodes: ReasonCode[];
  drivers: ExplanationDriver[];
  confidenceBreakdown: ConfidenceBreakdown;
};

export type AuditEntry = {
  stage: FrameLifecycleStage;
  at: string;
};

export type AuditTrail = {
  steps: AuditEntry[];
};

export type Provenance = {
  source: string;
  messageId?: string;
};

export type FrameWindow = {
  sizeMs: number;
};

export type Frame = {
  frameId: string;
  subject: SubjectRef;
  profileId: string;
  profileVersion: string;
  lifecycleStage: FrameLifecycleStage;
  status: FrameStatus;
  observedAt: string;
  createdAt: string;
  updatedAt: string;
  window: FrameWindow;
  freshnessMs: number;
  rawInputs: Record<string, number>;
  features: Record<string, number>;
  scores: Record<string, number>;
  confidence: number;
  confidenceBreakdown: ConfidenceBreakdown;
  reasonCodes: ReasonCode[];
  explanation: Explanation;
  audit: AuditTrail;
  provenance: Provenance;
};

export type FeatureSpec = {
  key: string;
  required?: boolean;
  weight?: number;
};

export type NormalizationMethod = "minmax" | "zscore" | "none";

export type NormalizationRule = {
  key: string;
  method: NormalizationMethod;
  min?: number;
  max?: number;
  mean?: number;
  stdDev?: number;
};

export type ScoreMethod = "weighted_sum";

export type ScoreRule = {
  scoreKey: string;
  method: ScoreMethod;
  featureWeights: Record<string, number>;
};

export type GateRule = {
  minConfidence?: number;
  minScores?: Record<string, number>;
};

export type FreshnessPolicy = {
  maxAgeMs: number;
  onExpired: "reject" | "degrade";
};

export type ExplanationConfig = {
  drivers: string[];
};

export type Profile = {
  profileId: string;
  version: string;
  subjectType: string;
  window: FrameWindow;
  features: FeatureSpec[];
  normalization: NormalizationRule[];
  scoring: ScoreRule[];
  gate: GateRule;
  freshnessPolicy: FreshnessPolicy;
  explanation: ExplanationConfig;
  enabled: boolean;
};

export type EvaluateFrameInput = {
  subject: SubjectRef;
  profileId: string;
  observedAt: string;
  inputs: Record<string, number>;
};

export type EvaluateFrameResult = {
  ok: true;
  frame: Frame;
};
