import { clamp, mean, numeric } from "../math/statistics";
import type { MeaningResult } from "../meaning/engine";
import type { PruningCandidateAssessment, PruningResult } from "../pruning/engine";
import type { DecisionQualityResult, WisdomSummary } from "../wisdom/engine";

export type PurposeBehaviorObservation = {
  ambitionSignal?: number;
  patience?: number;
  discipline?: number;
  consistency?: number;
  recovery?: number;
  conviction?: number;
  adaptation?: number;
  stressTolerance?: number;
  confidenceCalibration?: number;
  panicExit?: boolean;
  regret?: number;
  reversal?: boolean;
  abandoned?: boolean;
  sustainedProgress?: boolean;
  completed?: boolean;
  timestamp?: string | number | Date;
  metadata?: Record<string, unknown>;
};

export type PurposeExpectationRecord = {
  expectedExperience?: number;
  expectedOutcome?: number;
  actualExperience?: number;
  actualOutcome?: number;
  disappointment?: number;
  surprise?: number;
  regret?: number;
  confidenceShock?: number;
  expectationShock?: number;
  progress?: number;
  timestamp?: string | number | Date;
  metadata?: Record<string, unknown>;
};

export type PurposeFrictionRecord = {
  complexity?: number;
  mentalEffort?: number;
  attentionRequired?: number;
  interactionBurden?: number;
  cognitiveLoad?: number;
  clarity?: number;
  simplicity?: number;
  timestamp?: string | number | Date;
  metadata?: Record<string, unknown>;
};

export type PurposePathInput = {
  desiredFuture?: string;
  alignment?: number;
  progress?: number;
  survivability?: number;
  sustainability?: number;
  behaviorFit?: number;
  clarity?: number;
  usefulness?: number;
  evidenceQuality?: number;
};

export type PurposeDecisionInput = {
  id?: string;
  action?: string;
  confidence?: number;
  expectedReturn?: number;
  expectedValue?: number;
  alignment?: number;
  survivability?: number;
  priority?: number;
  friction?: number;
  uncertainty?: number;
  metadata?: Record<string, unknown>;
};

export type PurposeModuleContext = {
  score?: number;
  confidence?: number;
  trust?: number;
  status?: string;
  warnings?: string[];
  explanation?: string;
  [key: string]: unknown;
};

export type PurposeInput = {
  ambition: number;
  behavior?: PurposeBehaviorObservation[];
  expectations?: PurposeExpectationRecord[];
  outcomes?: PurposeExpectationRecord[];
  friction?: PurposeFrictionRecord | PurposeFrictionRecord[];
  currentPath?: PurposePathInput;
  decision?: PurposeDecisionInput | null;
  survivalScore?: number;
  meaning?: Partial<MeaningResult> | null;
  wisdom?: Partial<DecisionQualityResult | WisdomSummary> | PurposeModuleContext | null;
  pruning?: Partial<PruningResult> | PruningCandidateAssessment[] | null;
  selfModel?: PurposeModuleContext | null;
  governance?: PurposeModuleContext | null;
  outcome?: PurposeModuleContext | null;
  counterfactual?: PurposeModuleContext | null;
  recovery?: PurposeModuleContext | null;
  causal?: PurposeModuleContext | null;
  evidenceQuality?: number;
  now?: string | number | Date;
};

export type PurposeProfile = {
  growthPreference: number;
  preservationPreference: number;
  certaintyPreference: number;
  opportunityPreference: number;
  patiencePreference: number;
  recoveryPreference: number;
  volatilityAcceptance: number;
  progressUrgency: number;
  participationIntensity: number;
  survivalPriority: number;
};

export type BehavioralIdentity = {
  behavioralAmbition: number;
  patienceScore: number;
  disciplineScore: number;
  consistencyScore: number;
  recoveryScore: number;
  convictionScore: number;
  adaptationScore: number;
  stressToleranceScore: number;
  confidenceCalibrationScore: number;
  evidenceCount: number;
  identityConflictScore: number;
};

export type PurposeRecommendedAction =
  | "increase-priority"
  | "maintain-priority"
  | "reduce-priority"
  | "protect-survival"
  | "calibrate-expectations"
  | "review-identity";

export type PurposeTraceEntry = {
  id: string;
  label: string;
  value: number | string | boolean | null;
  score: number;
  weight: number;
  contribution: number;
  reason: string;
};

export type PurposeResult = {
  module: "purpose";
  version: "v3";
  ambition: number;
  ambitionIntensity: number;
  purposeProfile: PurposeProfile;
  behavioralIdentity: BehavioralIdentity;
  behavioralAmbition: number;
  purposeStatement: string;
  purposeScore: number;
  alignmentScore: number;
  satisfactionScore: number;
  retentionScore: number;
  advocacyScore: number;
  goalProgressScore: number;
  alignmentTrustScore: number;
  purposeConfidence: number;
  sustainableProgressScore: number;
  expectationCalibrationScore: number;
  regretScore: number;
  frictionScore: number;
  survivabilityScore: number;
  recommendedAction: PurposeRecommendedAction;
  priorityAdjustment: number;
  warnings: string[];
  explanation: string;
  trace: PurposeTraceEntry[];
};

export type PurposeMemorySnapshot = {
  behavior: PurposeBehaviorObservation[];
  expectations: PurposeExpectationRecord[];
  friction: PurposeFrictionRecord[];
};

export class PurposeIdentityMemory {
  private behavior: PurposeBehaviorObservation[];
  private expectations: PurposeExpectationRecord[];
  private friction: PurposeFrictionRecord[];

  constructor(snapshot: Partial<PurposeMemorySnapshot> = {}) {
    this.behavior = safeArray(snapshot.behavior).map(copy);
    this.expectations = safeArray(snapshot.expectations).map(copy);
    this.friction = safeArray(snapshot.friction).map(copy);
  }

  recordBehavior(observation: PurposeBehaviorObservation) {
    this.behavior = [...this.behavior, copy(observation)];
    return copy(observation);
  }

  recordExpectation(record: PurposeExpectationRecord) {
    this.expectations = [...this.expectations, copy(record)];
    return copy(record);
  }

  recordFriction(record: PurposeFrictionRecord) {
    this.friction = [...this.friction, copy(record)];
    return copy(record);
  }

  snapshot(): PurposeMemorySnapshot {
    return {
      behavior: this.behavior.map(copy),
      expectations: this.expectations.map(copy),
      friction: this.friction.map(copy),
    };
  }

  clear() {
    this.behavior = [];
    this.expectations = [];
    this.friction = [];
  }
}

export function translateAmbition(ambition: number): {
  ambition: number;
  ambitionIntensity: number;
  purposeProfile: PurposeProfile;
} {
  const declaredAmbition = score(ambition, 50);
  const exponential = ((Math.exp(declaredAmbition / 22) - 1) / (Math.exp(100 / 22) - 1)) * 100;
  const ambitionIntensity = roundScore(declaredAmbition * 0.48 + exponential * 0.52);
  const lowAmbitionPull = 100 - ambitionIntensity;
  const extremeAmbitionPull = Math.max(0, declaredAmbition - 85);

  return {
    ambition: declaredAmbition,
    ambitionIntensity,
    purposeProfile: {
      growthPreference: roundScore(18 + ambitionIntensity * 0.78),
      preservationPreference: roundScore(88 - ambitionIntensity * 0.48 + lowAmbitionPull * 0.08),
      certaintyPreference: roundScore(90 - ambitionIntensity * 0.58),
      opportunityPreference: roundScore(14 + ambitionIntensity * 0.86),
      patiencePreference: roundScore(86 - Math.abs(declaredAmbition - 42) * 0.34 + lowAmbitionPull * 0.05),
      recoveryPreference: roundScore(55 + ambitionIntensity * 0.22 + lowAmbitionPull * 0.18),
      volatilityAcceptance: roundScore(10 + ambitionIntensity * 0.78),
      progressUrgency: roundScore(18 + ambitionIntensity * 0.8),
      participationIntensity: roundScore(14 + ambitionIntensity * 0.82),
      survivalPriority: roundScore(Math.max(58, 84 - ambitionIntensity * 0.22 + extremeAmbitionPull * 0.45)),
    },
  };
}

export function evaluatePurpose(input: PurposeInput): PurposeResult {
  const translated = translateAmbition(input.ambition);
  const ambition = translated.ambition;
  const ambitionIntensity = translated.ambitionIntensity;
  const purposeProfile = translated.purposeProfile;
  const behavior = safeArray(input.behavior);
  const expectations = [...safeArray(input.expectations), ...safeArray(input.outcomes)];
  const frictionRecords = Array.isArray(input.friction)
    ? input.friction
    : input.friction
      ? [input.friction]
      : [];
  const pruning = normalizePruning(input.pruning);
  const meaning = normalizeMeaning(input.meaning);
  const moduleScores = collectModuleScores(input);
  const behavioralIdentity = learnBehavioralIdentity({
    ambition,
    purposeProfile,
    behavior,
  });
  const identityConflict = behavioralIdentity.identityConflictScore;
  const expectationCalibrationScore = expectationCalibration(expectations);
  const regretScore = scoreRegret(expectations, behavior);
  const frictionScore = scoreFriction(frictionRecords, input.decision);
  const clarityScore = firstScore(input.currentPath?.clarity, frictionScore, 70);
  const usefulnessScore = firstScore(input.currentPath?.usefulness, moduleScores.wisdom, input.currentPath?.progress, 62);
  const baseSurvivabilityScore = survivalScoreFor(input, purposeProfile, pruning);
  const survivabilityScore = meaning
    ? roundScore(Math.min(baseSurvivabilityScore, meaning.survivabilityCap))
    : baseSurvivabilityScore;
  const behaviorFitScore = roundScore(mean([
    100 - identityConflict * 0.78,
    behavioralIdentity.disciplineScore,
    behavioralIdentity.consistencyScore,
    behavioralIdentity.recoveryScore,
    behavioralIdentity.stressToleranceScore,
  ]));
  const sustainableProgressScore = roundScore(mean([
    firstScore(input.currentPath?.sustainability, 65),
    behaviorFitScore,
    survivabilityScore,
    expectationCalibrationScore,
    regretScore,
    frictionScore,
  ]));
  const goalProgressScore = roundScore(firstScore(
    input.currentPath?.progress,
    averageDefined(expectations.map((record) => finiteMaybe(record.progress))),
    moduleScores.outcome,
    moduleScores.wisdom,
    sustainableProgressScore,
  ));
  const desiredFutureAlignment = roundScore(firstScore(
    input.currentPath?.alignment,
    input.decision?.alignment,
    meaning?.alignmentScore,
    mean([goalProgressScore, purposeProfile.growthPreference, 100 - purposeProfile.certaintyPreference * 0.2]),
  ));
  const alignmentScore = roundScore(mean([
    desiredFutureAlignment,
    behaviorFitScore,
    sustainableProgressScore,
    survivabilityScore,
    expectationCalibrationScore,
    100 - pruning.falseConfidenceRisk,
  ]));
  const alignmentTrustScore = roundScore(mean([
    behaviorFitScore,
    expectationCalibrationScore,
    clarityScore,
    behavioralIdentity.confidenceCalibrationScore,
    moduleScores.selfModel,
    moduleScores.governance,
    100 - identityConflict,
  ]));
  const satisfactionScore = roundScore(mean([
    alignmentScore,
    goalProgressScore,
    regretScore,
    frictionScore,
    expectationCalibrationScore,
    usefulnessScore,
  ]));
  const retentionScore = roundScore(mean([
    alignmentScore,
    goalProgressScore,
    expectationCalibrationScore,
    alignmentTrustScore,
    frictionScore,
    sustainableProgressScore,
  ]));
  const advocacyScore = roundScore(mean([
    satisfactionScore,
    alignmentTrustScore,
    clarityScore,
    usefulnessScore,
    goalProgressScore,
  ]));
  const rawPurposeScore = roundScore(
    alignmentScore * 0.2 +
      satisfactionScore * 0.17 +
      retentionScore * 0.14 +
      advocacyScore * 0.1 +
      goalProgressScore * 0.15 +
      alignmentTrustScore * 0.14 +
      sustainableProgressScore * 0.1,
  );
  const purposeScore = roundScore(Math.min(rawPurposeScore, 40 + survivabilityScore * 0.6));
  const evidenceQuality = firstScore(input.evidenceQuality, input.currentPath?.evidenceQuality, moduleScores.evidence, 58);
  const sampleConfidence = roundScore(Math.min(100, (behavior.length + expectations.length + frictionRecords.length) * 9));
  const purposeConfidence = roundScore(
    mean([
      evidenceQuality,
      moduleScores.confidence,
      sampleConfidence || 42,
      100 - identityConflict * 0.65,
      expectationCalibrationScore,
    ]) - pruning.falseConfidenceRisk * 0.12 - (meaning?.confidencePenalty ?? 0),
  );
  const priority = decisionPriority({
    input,
    alignmentScore,
    survivabilityScore,
    purposeConfidence,
    expectationCalibrationScore,
    identityConflict,
    meaning,
  });
  const warnings = warningsFor({
    input,
    identityConflict,
    survivabilityScore,
    expectationCalibrationScore,
    regretScore,
    frictionScore,
    purposeConfidence,
    pruning,
    meaning,
  });
  const purposeStatement = buildPurposeStatement({
    ambition,
    ambitionIntensity,
    profile: purposeProfile,
    behavioralAmbition: behavioralIdentity.behavioralAmbition,
    meaning,
  });
  const trace = buildTrace({
    alignmentScore,
    satisfactionScore,
    retentionScore,
    advocacyScore,
    goalProgressScore,
    alignmentTrustScore,
    survivabilityScore,
    sustainableProgressScore,
    expectationCalibrationScore,
    regretScore,
    frictionScore,
    purposeConfidence,
    identityConflict,
    meaning,
  });

  return {
    module: "purpose",
    version: "v3",
    ambition,
    ambitionIntensity,
    purposeProfile,
    behavioralIdentity,
    behavioralAmbition: behavioralIdentity.behavioralAmbition,
    purposeStatement,
    purposeScore,
    alignmentScore,
    satisfactionScore,
    retentionScore,
    advocacyScore,
    goalProgressScore,
    alignmentTrustScore,
    purposeConfidence,
    sustainableProgressScore,
    expectationCalibrationScore,
    regretScore,
    frictionScore,
    survivabilityScore,
    recommendedAction: priority.recommendedAction,
    priorityAdjustment: priority.priorityAdjustment,
    warnings,
    explanation: explanationFor({
      purposeScore,
      alignmentScore,
      satisfactionScore,
      retentionScore,
      behavioralAmbition: behavioralIdentity.behavioralAmbition,
      ambition,
      survivabilityScore,
      priority: priority.recommendedAction,
    }),
    trace,
  };
}

export const purpose = evaluatePurpose;

function learnBehavioralIdentity(input: {
  ambition: number;
  purposeProfile: PurposeProfile;
  behavior: PurposeBehaviorObservation[];
}): BehavioralIdentity {
  const { ambition, purposeProfile, behavior } = input;
  const evidenceCount = behavior.length;
  const patienceScore = observedScore(behavior, "patience", purposeProfile.patiencePreference);
  const disciplineScore = observedScore(behavior, "discipline", 62);
  const consistencyScore = observedScore(behavior, "consistency", 62);
  const recoveryScore = observedScore(behavior, "recovery", purposeProfile.recoveryPreference);
  const convictionScore = observedScore(behavior, "conviction", purposeProfile.opportunityPreference);
  const adaptationScore = observedScore(behavior, "adaptation", 60);
  const stressToleranceScore = observedScore(behavior, "stressTolerance", purposeProfile.volatilityAcceptance);
  const confidenceCalibrationScore = observedScore(behavior, "confidenceCalibration", 62);
  const ambitionSignals = behavior
    .map((record) => finiteMaybe(record.ambitionSignal))
    .filter((value): value is number => value != null);
  const behaviorCore = mean([
    patienceScore,
    disciplineScore,
    consistencyScore,
    recoveryScore,
    convictionScore,
    adaptationScore,
    stressToleranceScore,
  ]);
  const panicRate = ratio(behavior, (record) => record.panicExit === true);
  const reversalRate = ratio(behavior, (record) => record.reversal === true);
  const abandonmentRate = ratio(behavior, (record) => record.abandoned === true);
  const sustainedRate = ratio(behavior, (record) => record.sustainedProgress === true || record.completed === true);
  const regret = averageDefined(behavior.map((record) => finiteMaybe(record.regret)));
  const observedAmbition = ambitionSignals.length ? mean(ambitionSignals) : behaviorCore * 0.72 + ambition * 0.28;
  const behavioralAmbition = evidenceCount
    ? roundScore(
        observedAmbition -
          panicRate * 18 -
          reversalRate * 10 -
          abandonmentRate * 14 -
          firstScore(regret, 0) * 0.08 +
          sustainedRate * 8,
      )
    : ambition;
  const identityConflictScore = roundScore(Math.abs(ambition - behavioralAmbition));

  return {
    behavioralAmbition,
    patienceScore,
    disciplineScore,
    consistencyScore,
    recoveryScore,
    convictionScore,
    adaptationScore,
    stressToleranceScore,
    confidenceCalibrationScore,
    evidenceCount,
    identityConflictScore,
  };
}

function expectationCalibration(records: PurposeExpectationRecord[]) {
  if (!records.length) return 72;
  const mismatches = records.flatMap((record) => {
    const experience = difference(record.expectedExperience, record.actualExperience);
    const outcome = difference(record.expectedOutcome, record.actualOutcome);
    const shock = finiteMaybe(record.expectationShock);
    return [experience, outcome, shock].filter((value): value is number => value != null);
  });
  if (!mismatches.length) return 72;
  return roundScore(100 - mean(mismatches));
}

function scoreRegret(expectations: PurposeExpectationRecord[], behavior: PurposeBehaviorObservation[]) {
  const expectationPressure = expectations.flatMap((record) => [
    finiteMaybe(record.disappointment),
    finiteMaybe(record.surprise),
    finiteMaybe(record.regret),
    finiteMaybe(record.confidenceShock),
    finiteMaybe(record.expectationShock),
  ]);
  const behaviorRegret = behavior.map((record) => finiteMaybe(record.regret));
  const pressure = averageDefined([...expectationPressure, ...behaviorRegret]);
  if (pressure == null) return 76;
  return roundScore(100 - pressure);
}

function scoreFriction(records: PurposeFrictionRecord[], decision?: PurposeDecisionInput | null) {
  const values = records.flatMap((record) => [
    finiteMaybe(record.complexity),
    finiteMaybe(record.mentalEffort),
    finiteMaybe(record.attentionRequired),
    finiteMaybe(record.interactionBurden),
    finiteMaybe(record.cognitiveLoad),
    record.clarity == null ? undefined : 100 - score(record.clarity),
    record.simplicity == null ? undefined : 100 - score(record.simplicity),
  ]);
  if (decision?.friction != null) values.push(score(decision.friction));
  const pressure = averageDefined(values);
  if (pressure == null) return 78;
  return roundScore(100 - pressure);
}

function survivalScoreFor(input: PurposeInput, profile: PurposeProfile, pruning: NormalizedPruning) {
  const direct = firstScoreMaybe(input.currentPath?.survivability, input.survivalScore, input.decision?.survivability);
  const recovery = moduleScore(input.recovery, ["recoveryScore", "score", "trustedCapacity"]);
  const governance = moduleScore(input.governance, ["score", "trust", "governanceScore"]);
  const pruningSurvival = pruning.survivalContribution || undefined;
  const blended = roundScore(mean([
    direct ?? profile.survivalPriority,
    recovery,
    governance,
    pruningSurvival ?? profile.survivalPriority,
    profile.survivalPriority,
  ]));
  return direct == null ? blended : Math.min(blended, direct);
}

type NormalizedPruning = {
  recommendedAction: string;
  falseConfidenceRisk: number;
  evidenceConfidence: number;
  survivalContribution: number;
};

type NormalizedMeaning = {
  gravityScore: number;
  needConfidence: number;
  positiveGoal: string;
  transformedGoal: string;
  literalDesireUnsafe: boolean;
  actionPermission: string;
  safetyPriority: number;
  confidencePenalty: number;
  survivabilityCap: number;
  alignmentScore: number;
  warnings: string[];
  safetyConstraints: string[];
};

function normalizeMeaning(input: PurposeInput["meaning"]): NormalizedMeaning | null {
  if (!input || typeof input !== "object") return null;
  const record = input as Partial<MeaningResult> & Record<string, unknown>;
  const purposeInputs = record.purposeInputs ?? {};
  const gravityScore = clamp(
    numeric(record.gravityScore, numeric((purposeInputs as Record<string, unknown>).gravityScore, 0)),
    -10,
    10,
  );
  const needConfidence = clamp(
    numeric(record.needConfidence, numeric((purposeInputs as Record<string, unknown>).needConfidence, 0.5)),
    0,
    1,
  );
  const literalDesireUnsafe = Boolean(
    record.purposeInputs?.literalDesireUnsafe ?? gravityScore <= -5,
  );
  const actionPermission = String(record.purposeInputs?.actionPermission ?? (
    gravityScore <= -9 ? "block" : gravityScore <= -7 ? "review" : gravityScore <= -5 ? "reduce" : "allow"
  ));
  const safetyPriority = clamp(numeric(record.purposeInputs?.safetyPriority, 55 + Math.max(0, -gravityScore) * 5));
  const confidencePenalty = roundScore(
    Math.max(0, -gravityScore) * 1.8 +
      Math.max(0, 0.65 - needConfidence) * 55 +
      (literalDesireUnsafe ? 4 : 0),
  );
  const survivabilityCap = literalDesireUnsafe
    ? roundScore(95 - Math.max(0, -gravityScore) * 5.5)
    : 100;
  const alignmentScore = roundScore(
    literalDesireUnsafe
      ? 62 - Math.max(0, -gravityScore) * 2 + needConfidence * 16
      : 64 + Math.max(0, gravityScore) * 3 + needConfidence * 8,
  );

  return {
    gravityScore,
    needConfidence,
    positiveGoal: String(record.positiveGoal ?? record.purposeInputs?.positiveGoal ?? ""),
    transformedGoal: String(record.transformedGoal ?? record.purposeInputs?.transformedGoal ?? ""),
    literalDesireUnsafe,
    actionPermission,
    safetyPriority,
    confidencePenalty,
    survivabilityCap,
    alignmentScore,
    warnings: safeArray(record.riskWarnings).map(String),
    safetyConstraints: safeArray(record.safetyConstraints).map(String),
  };
}

function normalizePruning(input: PurposeInput["pruning"]): NormalizedPruning {
  const candidates = Array.isArray(input)
    ? input
    : Array.isArray(input?.candidates)
      ? input.candidates
      : [];
  const recommendedAction = Array.isArray(input)
    ? mostSeverePruningAction(candidates.map((candidate) => String(candidate.recommendedAction ?? "keep")))
    : String(input?.recommendedAction ?? mostSeverePruningAction(candidates.map((candidate) => String(candidate.recommendedAction ?? "keep"))));
  const pruningScore = Array.isArray(input)
    ? averageDefined(candidates.map((candidate) => finiteMaybe(candidate.pruningScore))) ?? 0
    : firstScore(input?.pruningScore, averageDefined(candidates.map((candidate) => finiteMaybe(candidate.pruningScore))), 0);
  const evidenceConfidence = Array.isArray(input)
    ? averageDefined(candidates.map((candidate) => finiteMaybe(candidate.evidenceConfidence))) ?? 65
    : firstScore(input?.evidenceConfidence, averageDefined(candidates.map((candidate) => finiteMaybe(candidate.evidenceConfidence))), 65);
  const survivalContribution = Array.isArray(input)
    ? averageDefined(candidates.map((candidate) => finiteMaybe(candidate.survivalContribution))) ?? 45
    : firstScore(input?.survivalContribution, averageDefined(candidates.map((candidate) => finiteMaybe(candidate.survivalContribution))), 45);
  const actionRisk = recommendedAction === "quarantine"
    ? 38
    : recommendedAction === "ignore"
      ? 30
      : recommendedAction === "review"
        ? 24
        : recommendedAction === "reduce"
          ? 14
          : 0;

  return {
    recommendedAction,
    falseConfidenceRisk: roundScore(Math.max(actionRisk, pruningScore * 0.42 + Math.max(0, 45 - evidenceConfidence) * 0.65)),
    evidenceConfidence,
    survivalContribution,
  };
}

function collectModuleScores(input: PurposeInput) {
  const wisdom = moduleScore(input.wisdom, ["wisdomScore", "score", "decisionQuality", "learningConfidence"]);
  const selfModel = moduleScore(input.selfModel, ["score", "trust", "confidence", "selfModelScore"]);
  const governance = moduleScore(input.governance, ["score", "trust", "governanceScore"]);
  const outcome = moduleScore(input.outcome, ["score", "progress", "value", "outcomeScore"]);
  const counterfactual = moduleScore(input.counterfactual, ["score", "decisionQuality", "counterfactualConfidence"]);
  const recovery = moduleScore(input.recovery, ["recoveryScore", "score", "trustedCapacity"]);
  const causal = moduleScore(input.causal, ["score", "confidence", "causalScore"]);
  const confidence = roundScore(mean([
    moduleConfidence(input.wisdom),
    moduleConfidence(input.selfModel),
    moduleConfidence(input.governance),
    moduleConfidence(input.outcome),
    moduleConfidence(input.counterfactual),
    moduleConfidence(input.recovery),
    moduleConfidence(input.causal),
  ]));
  const evidence = roundScore(mean([wisdom, selfModel, governance, outcome, counterfactual, recovery, causal]));
  return { wisdom, selfModel, governance, outcome, counterfactual, recovery, causal, confidence, evidence };
}

function decisionPriority(input: {
  input: PurposeInput;
  alignmentScore: number;
  survivabilityScore: number;
  purposeConfidence: number;
  expectationCalibrationScore: number;
  identityConflict: number;
  meaning: NormalizedMeaning | null;
}): { recommendedAction: PurposeRecommendedAction; priorityAdjustment: number } {
  const decision = input.input.decision;
  const returnPressure = firstScore(decision?.expectedReturn, decision?.expectedValue, decision?.priority, 50);
  const explicitAlignment = firstScoreMaybe(decision?.alignment, input.input.currentPath?.alignment);
  const effectiveAlignment = explicitAlignment == null
    ? input.alignmentScore
    : Math.min(input.alignmentScore, explicitAlignment);
  const explicitSurvival = firstScoreMaybe(decision?.survivability, input.input.currentPath?.survivability, input.input.survivalScore);
  const effectiveSurvival = explicitSurvival == null
    ? input.survivabilityScore
    : Math.min(input.survivabilityScore, explicitSurvival);
  if (input.meaning?.actionPermission === "block") {
    return {
      recommendedAction: "protect-survival",
      priorityAdjustment: roundScore(-42 + effectiveSurvival * 0.18, -100, 100),
    };
  }
  if (input.meaning?.actionPermission === "review") {
    return {
      recommendedAction: "review-identity",
      priorityAdjustment: roundScore(-26 + input.meaning.gravityScore * 0.8, -100, 100),
    };
  }
  if (input.meaning?.actionPermission === "reduce") {
    return {
      recommendedAction: "reduce-priority",
      priorityAdjustment: roundScore(-18 + input.meaning.gravityScore * 0.5, -100, 100),
    };
  }
  if (effectiveSurvival < 45) {
    return {
      recommendedAction: "protect-survival",
      priorityAdjustment: roundScore(-35 + effectiveSurvival * 0.25, -100, 100),
    };
  }
  if (input.identityConflict >= 28) {
    return {
      recommendedAction: "review-identity",
      priorityAdjustment: roundScore(-input.identityConflict * 0.45, -100, 100),
    };
  }
  if (input.expectationCalibrationScore < 48) {
    return {
      recommendedAction: "calibrate-expectations",
      priorityAdjustment: roundScore((input.expectationCalibrationScore - 60) * 0.5, -100, 100),
    };
  }
  if (returnPressure >= 72 && effectiveAlignment < 55) {
    return {
      recommendedAction: "reduce-priority",
      priorityAdjustment: roundScore((effectiveAlignment - returnPressure) * 0.45, -100, 100),
    };
  }
  if (input.alignmentScore >= 72 && input.survivabilityScore >= 68 && input.purposeConfidence >= 58) {
    return {
      recommendedAction: "increase-priority",
      priorityAdjustment: roundScore((input.alignmentScore + input.survivabilityScore - 120) * 0.3, -100, 100),
    };
  }
  return {
    recommendedAction: "maintain-priority",
    priorityAdjustment: roundScore((input.alignmentScore - 60) * 0.12, -100, 100),
  };
}

function buildPurposeStatement(input: {
  ambition: number;
  ambitionIntensity: number;
  profile: PurposeProfile;
  behavioralAmbition: number;
  meaning: NormalizedMeaning | null;
}) {
  if (input.meaning?.transformedGoal) {
    const guardrail = input.meaning.literalDesireUnsafe
      ? "survival, safety, and recovery capacity"
      : "sustainability and trust";
    return `I am working toward ${sentenceFragment(input.meaning.transformedGoal)} while respecting ${guardrail}.`;
  }

  const effectiveAmbition = Math.min(input.ambition, Math.max(input.behavioralAmbition, input.ambition * 0.72));
  const sacrifice = effectiveAmbition >= 82
    ? "comfort and short-term certainty"
    : effectiveAmbition >= 58
      ? "some certainty and convenience"
      : effectiveAmbition >= 34
        ? "speed when stability needs it"
        : "unnecessary urgency";
  const achievement = effectiveAmbition >= 82
    ? "exceptional outcomes"
    : effectiveAmbition >= 58
      ? "strong growth"
      : effectiveAmbition >= 34
        ? "meaningful progress"
        : "safety and stability";
  const horizon = input.profile.progressUrgency >= 78
    ? "an ambitious but recoverable path"
    : input.profile.patiencePreference >= 72
      ? "a patient sustainable pace"
      : "a steady adaptive pace";
  const respect = input.profile.survivalPriority >= 76
    ? "long-term stability"
    : input.profile.recoveryPreference >= 70
      ? "recovery capacity"
      : "survivability";

  return `I am willing to sacrifice ${sacrifice} to achieve ${achievement} within ${horizon} while respecting ${respect}.`;
}

function warningsFor(input: {
  input: PurposeInput;
  identityConflict: number;
  survivabilityScore: number;
  expectationCalibrationScore: number;
  regretScore: number;
  frictionScore: number;
  purposeConfidence: number;
  pruning: NormalizedPruning;
  meaning: NormalizedMeaning | null;
}) {
  const warnings: string[] = [];
  if (input.identityConflict >= 24) warnings.push("Declared ambition and observed behavior are materially different.");
  if (input.survivabilityScore < 55) warnings.push("Survival protection is low; Purpose must reduce confidence before increasing priority.");
  if (input.expectationCalibrationScore < 55) warnings.push("Expectation mismatch is likely to reduce satisfaction.");
  if (input.regretScore < 55) warnings.push("Regret pressure is high enough to threaten long-term trust.");
  if (input.frictionScore < 55) warnings.push("Friction is high; simplify the path before asking for more participation.");
  if (input.purposeConfidence < 50) warnings.push("Purpose confidence is limited by weak evidence or identity conflict.");
  if (input.pruning.falseConfidenceRisk >= 25) warnings.push("Pruning found evidence that could create false confidence.");
  if (input.meaning?.literalDesireUnsafe) warnings.push("Meaning transformed an unsafe literal desire before Purpose alignment.");
  if (input.meaning && input.meaning.needConfidence < 0.45) warnings.push("Meaning confidence is low; Purpose should stay in degraded mode.");
  for (const warning of input.meaning?.warnings ?? []) warnings.push(warning);
  for (const constraint of input.meaning?.safetyConstraints ?? []) warnings.push(`Meaning safety constraint: ${constraint}`);
  for (const warning of safeArray(warningsFrom(input.input.wisdom))) warnings.push(String(warning));
  for (const warning of safeArray(warningsFrom(input.input.selfModel))) warnings.push(String(warning));
  for (const warning of safeArray(warningsFrom(input.input.governance))) warnings.push(String(warning));
  return Array.from(new Set(warnings));
}

function explanationFor(input: {
  purposeScore: number;
  alignmentScore: number;
  satisfactionScore: number;
  retentionScore: number;
  behavioralAmbition: number;
  ambition: number;
  survivabilityScore: number;
  priority: PurposeRecommendedAction;
}) {
  return `Purpose score is ${input.purposeScore}/100: alignment ${input.alignmentScore}/100, satisfaction ${input.satisfactionScore}/100, retention ${input.retentionScore}/100, behavioral ambition ${input.behavioralAmbition}/100 versus declared ambition ${input.ambition}/100, survivability ${input.survivabilityScore}/100. Recommended action: ${input.priority}.`;
}

function buildTrace(input: {
  alignmentScore: number;
  satisfactionScore: number;
  retentionScore: number;
  advocacyScore: number;
  goalProgressScore: number;
  alignmentTrustScore: number;
  survivabilityScore: number;
  sustainableProgressScore: number;
  expectationCalibrationScore: number;
  regretScore: number;
  frictionScore: number;
  purposeConfidence: number;
  identityConflict: number;
  meaning: NormalizedMeaning | null;
}): PurposeTraceEntry[] {
  const traceEntries = [
    trace("alignment", "Alignment", input.alignmentScore, 0.2, "How well the path advances the desired future and fits observed behavior."),
    trace("satisfaction", "Satisfaction", input.satisfactionScore, 0.17, "Probability the user feels helped toward the future they want."),
    trace("retention", "Retention", input.retentionScore, 0.14, "Probability the user can keep engaging over time."),
    trace("advocacy", "Advocacy", input.advocacyScore, 0.1, "Probability the user recommends the system as clear and useful."),
    trace("progress", "Goal progress", input.goalProgressScore, 0.15, "Distance closed toward the desired future."),
    trace("trust", "Alignment trust", input.alignmentTrustScore, 0.14, "Probability the user believes the system understands them."),
    trace("sustainable-progress", "Sustainable progress", input.sustainableProgressScore, 0.1, "Progress adjusted by survivability, behavior fit, regret, friction, and expectations."),
    trace("survival", "Survivability", input.survivabilityScore, 1, "Purpose can never override survival."),
    trace("expectations", "Expectation calibration", input.expectationCalibrationScore, 1, "Reality compared with expected experience and outcomes."),
    trace("regret", "Regret control", input.regretScore, 1, "Disappointment, surprise, regret, and confidence shocks."),
    trace("friction", "Friction control", input.frictionScore, 1, "Complexity, mental effort, attention, and interaction burden."),
    trace("confidence", "Purpose confidence", input.purposeConfidence, 1, "Evidence strength after identity conflict and pruning risk."),
    trace("identity-conflict", "Identity conflict", input.identityConflict, 1, "Distance between declared ambition and observed behavior."),
  ];
  if (input.meaning) {
    traceEntries.push(
      trace("meaning-gravity", "Meaning gravity", 50 + input.meaning.gravityScore * 5, 1, "Human-need gravity from literal desire to transformed goal."),
      trace("meaning-confidence", "Meaning confidence", input.meaning.needConfidence * 100, 1, "Confidence in the mapped positive human need."),
    );
  }
  return traceEntries;
}

function trace(id: string, label: string, scoreValue: number, weight: number, reason: string): PurposeTraceEntry {
  return {
    id,
    label,
    value: roundScore(scoreValue),
    score: roundScore(scoreValue),
    weight,
    contribution: roundScore(scoreValue * weight),
    reason,
  };
}

function observedScore<T extends keyof PurposeBehaviorObservation>(
  records: PurposeBehaviorObservation[],
  key: T,
  fallback: number,
) {
  const values = records
    .map((record) => finiteMaybe(record[key]))
    .filter((value): value is number => value != null);
  if (!values.length) return roundScore(fallback);
  return roundScore(mean(values));
}

function moduleScore(
  context: unknown,
  keys: string[],
  fallback = 65,
) {
  if (!context || typeof context !== "object") return fallback;
  const record = context as Record<string, unknown>;
  for (const key of keys) {
    const value = finiteMaybe(record[key]);
    if (value != null) return score(value);
  }
  return fallback;
}

function moduleConfidence(context: unknown) {
  if (!context || typeof context !== "object") return 58;
  const record = context as Record<string, unknown>;
  return firstScore(record.confidence, record.trust, record.trustworthiness, record.reliability, 58);
}

function difference(left: unknown, right: unknown) {
  const leftNumber = finiteMaybe(left);
  const rightNumber = finiteMaybe(right);
  if (leftNumber == null || rightNumber == null) return null;
  return Math.abs(score(leftNumber) - score(rightNumber));
}

function firstScore(...values: unknown[]) {
  for (const value of values) {
    const numberValue = finiteMaybe(value);
    if (numberValue != null) return score(numberValue);
  }
  return 0;
}

function firstScoreMaybe(...values: unknown[]) {
  for (const value of values) {
    const numberValue = finiteMaybe(value);
    if (numberValue != null) return score(numberValue);
  }
  return null;
}

function warningsFrom(context: unknown) {
  if (!context || typeof context !== "object") return [];
  const warnings = (context as Record<string, unknown>).warnings;
  return Array.isArray(warnings) ? warnings : [];
}

function sentenceFragment(value: string) {
  return value
    .trim()
    .replace(/[.!?]+$/g, "")
    .replace(/^I am working toward\s+/i, "")
    .replace(/^I want to\s+/i, "")
    .replace(/^I want\s+/i, "");
}

function finiteMaybe(value: unknown) {
  if (value == null) return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function averageDefined(values: Array<number | null | undefined>) {
  const usable = values.filter((value): value is number => Number.isFinite(value));
  return usable.length ? mean(usable) : null;
}

function ratio<T>(values: T[], predicate: (value: T) => boolean) {
  if (!values.length) return 0;
  return values.filter(predicate).length / values.length;
}

function score(value: unknown, fallback = 0) {
  return clamp(numeric(value, fallback));
}

function roundScore(value: number, min = 0, max = 100) {
  return Number(clamp(value, min, max).toFixed(2));
}

function safeArray<T>(value: T[] | readonly T[] | null | undefined): T[] {
  return Array.isArray(value) ? [...value] : [];
}

function copy<T>(value: T): T {
  return structuredClone(value);
}

function mostSeverePruningAction(actions: string[]) {
  const ranking: Record<string, number> = {
    keep: 0,
    reduce: 1,
    isolate: 2,
    review: 3,
    ignore: 4,
    quarantine: 5,
  };
  return actions.sort((left, right) => (ranking[right] ?? 0) - (ranking[left] ?? 0))[0] ?? "keep";
}
