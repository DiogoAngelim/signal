export type AgencyDecision = {
  decisionId?: string;
  kind: string;
  confidence: number;
  rationale?: string;
  expectedOutcome?: string;
  metadata?: Record<string, unknown>;
};

export type AgencySizing = {
  size: number;
  unit?: string;
  rationale?: string;
  metadata?: Record<string, unknown>;
};

export type AgencyAction = {
  actionId?: string;
  kind: string;
  payload?: unknown;
  performedAt?: string;
  metadata?: Record<string, unknown>;
};

export type PolicyConfig = {
  minimumConfidence?: number;
  maximumSize?: number;
  humanApprovalRequired?: boolean;
  blockReasons?: string[];
};

export type PolicyEvaluationInput = {
  decision: AgencyDecision;
  sizing?: AgencySizing;
  config?: PolicyConfig;
  approvalGranted?: boolean;
  blockReasons?: string[];
};

export type PolicyResult = {
  allowed: boolean;
  maxSize?: number;
  recommendedSize?: number;
  requiresApproval: boolean;
  reason: string;
  violations: string[];
};

export type OutcomeLabel = "positive" | "negative" | "neutral" | "unknown";

export type OutcomeInput = {
  success?: boolean | null;
  reward?: number;
  loss?: number;
  durationMs?: number;
  outcomeLabel?: OutcomeLabel;
};

export type OutcomeResult = {
  success: boolean | null;
  reward?: number;
  loss?: number;
  durationMs?: number;
  outcomeLabel: OutcomeLabel;
};

export type CalibrationReliability =
  | "overconfident"
  | "underconfident"
  | "aligned"
  | "insufficient_data";

export type CalibrationConfig = {
  minimumSamples?: number;
  alignmentTolerance?: number;
  adjustmentRate?: number;
};

export type CalibrationResult = {
  calibratedConfidence: number;
  calibrationError: number;
  reliability: CalibrationReliability;
  sampleSize: number;
};

export type LearningConfig = {
  highConfidenceThreshold?: number;
  similarSuccessThreshold?: number;
};

export type LearningResult = {
  learnedPatterns: string[];
  confidenceAdjustment: number;
  policySuggestions: string[];
};

export type SelfDiagnosisRecommendation =
  | "act"
  | "act_with_reduced_size"
  | "wait"
  | "requires_human_review";

export type SelfDiagnosisConfig = {
  recentWindow?: number;
  minimumTraceCount?: number;
};

export type SelfDiagnosisResult = {
  trust: number;
  dataReliability: number;
  calibrationHealth: number;
  overfitRisk: number;
  recommendation: SelfDiagnosisRecommendation;
  reasons: string[];
};

export type AgencyTrace = {
  traceId: string;
  timestamp: string;
  perception?: unknown;
  intelligence?: unknown;
  decision: AgencyDecision;
  sizing?: AgencySizing;
  policy: PolicyResult;
  action?: AgencyAction;
  outcome?: OutcomeResult;
  learning?: LearningResult;
  selfDiagnosis: SelfDiagnosisResult;
};

export type AgencyCausalChain = {
  traceId: string;
  perception?: unknown;
  intelligence?: unknown;
  decision: AgencyDecision;
  sizing?: AgencySizing;
  policy: PolicyResult;
  action?: AgencyAction;
  outcome?: OutcomeResult;
};

export type AgencyMemoryStore = {
  append(trace: AgencyTrace): AgencyTrace;
  list(): AgencyTrace[];
  get(traceId: string): AgencyTrace | undefined;
  causalChain(traceId: string): AgencyCausalChain | undefined;
  clear(): void;
};

export type AgencyCycleInput = {
  perception?: unknown;
  intelligence?: unknown;
  decision: AgencyDecision;
  sizing?: AgencySizing;
  action?: AgencyAction;
  outcome?: OutcomeInput;
  approvalGranted?: boolean;
  blockReasons?: string[];
};

export type AgencyPipelineConfig = {
  policy?: PolicyConfig;
  memory?: AgencyMemoryStore;
  calibration?: CalibrationConfig;
  learning?: LearningConfig;
  selfDiagnosis?: SelfDiagnosisConfig;
  clock?: () => Date;
  idGenerator?: (input: AgencyCycleInput, sequence: number) => string;
};

export type AgencyStateEvaluation = {
  traceCount: number;
  calibration: CalibrationResult;
  learning: LearningResult;
  selfDiagnosis: SelfDiagnosisResult;
};

export type AgencyPipeline = {
  memory: AgencyMemoryStore;
  runAgencyCycle(input: AgencyCycleInput): AgencyTrace;
  evaluateAgencyState(history?: readonly AgencyTrace[]): AgencyStateEvaluation;
};
