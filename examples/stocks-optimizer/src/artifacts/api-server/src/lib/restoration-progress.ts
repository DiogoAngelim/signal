import {
  DEFAULT_RECOVERY_THRESHOLDS,
  type RecoveryResult,
  type RecoveryThresholds,
} from "../../../signal-framework/recovery/engine";
import type { SurvivalOutcomeClass } from "../../../signal-framework/survival-memory/engine";
import type { StockSurvivalMemoryDiagnostic } from "./survival-memory-adapter";

export type RestorationProgressStatus =
  | "blocked"
  | "collecting_evidence"
  | "ready_for_restoration"
  | "restored";

export type SurvivalMemoryRestorationState = "scarred" | "watch" | "limited" | "clear";

export type RestorationProgressGate = {
  id: string;
  label: string;
  passed: boolean;
  current: string;
  target: string;
  progressPct: number;
  detail: string;
  unlockCondition?: string;
};

export type RestorationOutcomeProof = {
  requiredCleanOutcomes: number;
  reducedSizeOutcomeCount: number;
  totalCleanReducedSizeOutcomeCount: number;
  cleanReducedSizeOutcomeCount: number;
  failedReducedSizeOutcomeCount: number;
  remainingCleanReducedSizeOutcomes: number;
  activeProofBoundaryBreakCount: number;
  lastBoundaryBreakId?: string;
  cleanOutcomeRatio: number;
  survivalCostBoundary: number;
  maxDrawdownBoundary: number;
  maxAdverseExcursionBoundary: number;
  ledgerEntries: RestorationLedgerEntry[];
  recentOutcomes: RestorationLedgerEntry[];
};

export type RestorationLedgerEntry = {
  id: string;
  timestamp?: string;
  asset?: string;
  maxExposure: number;
  realizedReturn: number;
  maxDrawdown: number;
  maxAdverseExcursion: number;
  survivalCost: number;
  outcomeClass: SurvivalOutcomeClass;
  clean: boolean;
  boundaryBreaches: string[];
  maxAdverseExcursionBoundary: number;
  maxAdverseExcursionRemaining: number;
  survivalCostBoundary: number;
  survivalCostRemaining: number;
};

export type RestorationLedgerStep = {
  state: SurvivalMemoryRestorationState;
  label: string;
  passed: boolean;
  detail: string;
};

export type SurvivalMemoryRestorationLedger = {
  title: "Survival Memory Restoration Ledger";
  state: SurvivalMemoryRestorationState;
  statePath: RestorationLedgerStep[];
  entries: RestorationLedgerEntry[];
  exactUnlockCondition: string;
  boundarySummary: string;
  requiredCleanOutcomes: number;
  cleanReducedSizeOutcomeCount: number;
  failedReducedSizeOutcomeCount: number;
};

export type RestorationActionPlanStep = {
  id: string;
  label: string;
  status: "done" | "active" | "blocked";
  detail: string;
};

export type RestorationActionPlan = {
  title: "Survival Memory Restoration Plan";
  status: "collecting_evidence" | "reset_required" | "ready_for_review" | "restored";
  activeInstruction: string;
  exposureInstruction: string;
  remainingCleanOutcomes: number;
  activeBoundaryBreaks: number;
  steps: RestorationActionPlanStep[];
};

export type RestorationProgressDiagnostic = {
  module: "stocks.restoration-progress";
  name: "Restoration Progress";
  status: RestorationProgressStatus;
  restorationState: SurvivalMemoryRestorationState;
  progressPct: number;
  summary: string;
  primaryBlocker: string | null;
  currentExposureCapPct: number;
  targetNormalExposurePct: number;
  canRestoreSizing: boolean;
  gates: RestorationProgressGate[];
  ledger: SurvivalMemoryRestorationLedger;
  outcomeProof: RestorationOutcomeProof;
  actionPlan: RestorationActionPlan;
  nextActions: string[];
  invalidationConditions: string[];
};

export type RestorationProgressInput = {
  survivalMemory?: StockSurvivalMemoryDiagnostic | null;
  recovery?: RecoveryResult | null;
  trustScore?: number | null;
  calibratedConfidence?: number | null;
  discoveryConfidence?: number | null;
  discoveryMaturity?: number | null;
  dataReliability?: number | null;
  overfitRisk?: number | null;
  blockedAgencyActionCount?: number | null;
  currentExposureCapPct?: number | null;
  targetNormalExposurePct?: number | null;
};

const SURVIVAL_COST_BOUNDARY = 35;
const MAX_DRAWDOWN_BOUNDARY = 30;
const MAX_ADVERSE_EXCURSION_BOUNDARY = 35;
const REQUIRED_CLEAN_REDUCED_SIZE_OUTCOMES = 3;

export function buildRestorationProgress(input: RestorationProgressInput): RestorationProgressDiagnostic {
  const recovery = input.recovery ?? null;
  const survivalMemory = input.survivalMemory ?? null;
  const thresholds = {
    ...DEFAULT_RECOVERY_THRESHOLDS,
    ...(objectOrNull(recovery?.audit)?.thresholds ?? {}),
  } as RecoveryThresholds;
  const normalized = objectOrNull(objectOrNull(recovery?.audit)?.normalized) ?? {};
  const survivalConfidence = numberOr(
    survivalMemory?.survivalConfidence,
    normalized.survivalConfidence,
    0,
  );
  const trustScore = numberOr(input.trustScore, normalized.trustScore, 0);
  const calibratedConfidence = numberOr(
    input.calibratedConfidence,
    normalized.calibratedConfidence,
    0,
  );
  const discoveryConfidence = numberOr(
    input.discoveryConfidence,
    normalized.discoveryConfidence,
    0,
  );
  const discoveryMaturity = numberOr(
    input.discoveryMaturity,
    normalized.discoveryMaturity,
    0,
  );
  const dataReliability = numberOr(input.dataReliability, normalized.dataReliability, 0);
  const overfitRisk = numberOr(input.overfitRisk, normalized.overfitRisk, 100);
  const blockedAgencyActionCount = Math.max(
    0,
    Math.round(numberOr(input.blockedAgencyActionCount, normalized.blockedAgencyActionCount, 0)),
  );
  const currentExposureCapPct = round(
    numberOr(
      input.currentExposureCapPct,
      normalized.currentMaxExposure,
      recovery?.recommendedExposureCap,
      survivalMemory?.maxExposurePct,
      0,
    ),
  );
  const targetNormalExposurePct = round(
    Math.max(
      currentExposureCapPct,
      numberOr(
        input.targetNormalExposurePct,
        normalized.targetNormalExposure,
        currentExposureCapPct,
        0,
      ),
    ),
  );
  const outcomeProof = buildOutcomeProof({
    records: survivalMemory?.records ?? [],
    currentExposureCapPct,
    targetNormalExposurePct,
  });
  const sampleCount = numberOr(normalizedSimilarSampleCount(recovery), 0);
  const positiveOutcomeRatio = numberOr(
    objectOrNull(recovery?.audit)?.positiveOutcomeRatio,
    0,
  );
  const judgementReliability = numberOr(normalized.judgementReliability, 0);
  const outcomeStability = numberOr(normalized.outcomeStability, 0);
  const evidenceAgreement = numberOr(normalized.evidenceAgreement, 0);
  const canRestoreSizing = recovery?.canRestoreSizing === true;
  const cleanOutcomeGatePassed =
    outcomeProof.cleanReducedSizeOutcomeCount >= outcomeProof.requiredCleanOutcomes &&
    outcomeProof.activeProofBoundaryBreakCount === 0;
  const gates: RestorationProgressGate[] = [
    gate({
      id: "survival-confidence",
      label: "Survival confidence",
      passed: canRestoreSizing || survivalConfidence >= thresholds.minSurvivalConfidenceForRestore,
      currentValue: survivalConfidence,
      targetValue: thresholds.minSurvivalConfidenceForRestore,
      current: `${Math.round(survivalConfidence)}/100`,
      target: `${thresholds.minSurvivalConfidenceForRestore}/100`,
      detail: "Survival confidence must clear the normal-sizing threshold.",
      unlockCondition: `Raise survival confidence to at least ${thresholds.minSurvivalConfidenceForRestore}/100.`,
    }),
    gate({
      id: "survival-status",
      label: "Survival status",
      passed: canRestoreSizing || survivalMemory?.status === "clear",
      currentValue: survivalMemory?.status === "clear" ? 100 : 0,
      targetValue: 100,
      current: readableStatus(survivalMemory?.status),
      target: "clear",
      detail: "Survival Memory must move out of scarred/watch before normal sizing returns.",
      unlockCondition: "Clear scarred/watch Survival Memory with clean reduced-size proof.",
    }),
    gate({
      id: "clean-reduced-size-outcomes",
      label: "Clean reduced-size outcomes",
      passed: canRestoreSizing || cleanOutcomeGatePassed,
      currentValue: outcomeProof.cleanReducedSizeOutcomeCount,
      targetValue: outcomeProof.requiredCleanOutcomes,
      current: `${outcomeProof.cleanReducedSizeOutcomeCount}/${outcomeProof.requiredCleanOutcomes}`,
      target: `${outcomeProof.requiredCleanOutcomes} clean`,
      detail: "Reduced-size outcomes need acceptable drawdown, adverse excursion, and survival cost.",
      unlockCondition: "Close clean reduced-size outcomes without breaching survival boundaries.",
    }),
    gate({
      id: "trust-score",
      label: "Trust score",
      passed: canRestoreSizing || trustScore >= thresholds.minTrustScoreForRestore,
      currentValue: trustScore,
      targetValue: thresholds.minTrustScoreForRestore,
      current: `${Math.round(trustScore)}/100`,
      target: `${thresholds.minTrustScoreForRestore}/100`,
      detail: "Trust must clear the restoration threshold.",
      unlockCondition: `Raise trust score to at least ${thresholds.minTrustScoreForRestore}/100.`,
    }),
    gate({
      id: "calibrated-confidence",
      label: "Calibrated confidence",
      passed: canRestoreSizing || calibratedConfidence >= thresholds.minCalibratedConfidenceForRestore,
      currentValue: calibratedConfidence,
      targetValue: thresholds.minCalibratedConfidenceForRestore,
      current: `${Math.round(calibratedConfidence)}/100`,
      target: `${thresholds.minCalibratedConfidenceForRestore}/100`,
      detail: "Calibrated confidence must support restored exposure.",
      unlockCondition: `Raise calibrated confidence to at least ${thresholds.minCalibratedConfidenceForRestore}/100.`,
    }),
    gate({
      id: "outcome-linkage",
      label: "Outcome linkage",
      passed: canRestoreSizing ||
        (
          sampleCount >= thresholds.minSimilarSamplesForRestore &&
          positiveOutcomeRatio >= thresholds.minPositiveOutcomeRatioForRestore &&
          judgementReliability >= thresholds.minJudgementReliabilityForRestore &&
          outcomeStability >= thresholds.minOutcomeStabilityForRestore &&
          evidenceAgreement >= thresholds.minEvidenceAgreementForRestore
        ),
      currentValue: Math.min(
        sampleCount / Math.max(1, thresholds.minSimilarSamplesForRestore) * 100,
        positiveOutcomeRatio / Math.max(0.01, thresholds.minPositiveOutcomeRatioForRestore) * 100,
      ),
      targetValue: 100,
      current: `${sampleCount} samples / ${Math.round(positiveOutcomeRatio * 100)}% positive`,
      target: `${thresholds.minSimilarSamplesForRestore} samples / ${Math.round(thresholds.minPositiveOutcomeRatioForRestore * 100)}% positive`,
      detail: "Similar outcomes must be numerous, positive, stable, and agreed with judgement evidence.",
      unlockCondition: "Collect more stable positive outcomes for this comparable state.",
    }),
    gate({
      id: "discovery-maturity",
      label: "Discovery maturity",
      passed: canRestoreSizing ||
        (
          discoveryConfidence >= thresholds.minDiscoveryConfidenceForRestore &&
          discoveryMaturity >= thresholds.minDiscoveryMaturityForRestore
        ),
      currentValue: Math.min(discoveryConfidence, discoveryMaturity),
      targetValue: Math.min(
        thresholds.minDiscoveryConfidenceForRestore,
        thresholds.minDiscoveryMaturityForRestore,
      ),
      current: `${Math.round(discoveryConfidence)}/${Math.round(discoveryMaturity)}`,
      target: `${thresholds.minDiscoveryConfidenceForRestore}/${thresholds.minDiscoveryMaturityForRestore}`,
      detail: "Discovery confidence and maturity must improve before normal sizing.",
      unlockCondition: "Let discovery confidence and maturity improve before restoring normal sizing.",
    }),
    gate({
      id: "risk-and-agency",
      label: "Risk and agency",
      passed: canRestoreSizing ||
        (
          dataReliability >= thresholds.minDataReliability &&
          overfitRisk <= thresholds.maxOverfitRisk &&
          blockedAgencyActionCount === 0
        ),
      currentValue: Math.min(
        dataReliability,
        clamp(100 - overfitRisk),
        blockedAgencyActionCount === 0 ? 100 : 0,
      ),
      targetValue: thresholds.minDataReliability,
      current: `data ${Math.round(dataReliability)}, overfit ${Math.round(overfitRisk)}, blocked ${blockedAgencyActionCount}`,
      target: `data ${thresholds.minDataReliability}+, overfit <=${thresholds.maxOverfitRisk}, blocked 0`,
      detail: "Data, overfit, and agency gates must remain clean.",
      unlockCondition: "Keep data reliable, overfit contained, and agency actions unblocked.",
    }),
  ];
  const failedGates = gates.filter((item) => !item.passed);
  const status = statusFor(canRestoreSizing, recovery?.status, failedGates);
  const restorationState = restorationStateFor({
    canRestoreSizing,
    survivalStatus: survivalMemory?.status,
    survivalConfidence,
    cleanOutcomeGatePassed,
    cleanReducedSizeOutcomeCount: outcomeProof.cleanReducedSizeOutcomeCount,
    activeProofBoundaryBreakCount: outcomeProof.activeProofBoundaryBreakCount,
    threshold: thresholds.minSurvivalConfidenceForRestore,
  });
  const ledger = buildRestorationLedger({
    restorationState,
    outcomeProof,
    survivalConfidence,
    survivalConfidenceThreshold: thresholds.minSurvivalConfidenceForRestore,
    survivalStatus: survivalMemory?.status,
    canRestoreSizing,
  });
  const actionPlan = buildRestorationActionPlan({
    outcomeProof,
    ledger,
    currentExposureCapPct,
    targetNormalExposurePct,
    survivalConfidence,
    survivalConfidenceThreshold: thresholds.minSurvivalConfidenceForRestore,
    survivalStatus: survivalMemory?.status,
    canRestoreSizing,
  });
  const progressPct = canRestoreSizing
    ? 100
    : round(gates.reduce((total, item) => total + item.progressPct, 0) / Math.max(1, gates.length));
  const primaryBlocker = failedGates[0]?.detail ?? ledger.exactUnlockCondition ?? null;

  return {
    module: "stocks.restoration-progress",
    name: "Restoration Progress",
    status,
    restorationState,
    progressPct,
    summary: summaryFor(status, primaryBlocker),
    primaryBlocker,
    currentExposureCapPct,
    targetNormalExposurePct,
    canRestoreSizing,
    gates,
    ledger,
    outcomeProof,
    actionPlan,
    nextActions: unique([
      actionPlan.activeInstruction,
      ledger.exactUnlockCondition,
      ...failedGates.map((item) => item.unlockCondition).filter(isString),
    ]),
    invalidationConditions: unique([
      ...(survivalMemory?.invalidationConditions ?? []),
      ...(recovery?.invalidationConditions ?? []),
    ]),
  };
}

function buildOutcomeProof(input: {
  records: StockSurvivalMemoryDiagnostic["records"];
  currentExposureCapPct: number;
  targetNormalExposurePct: number;
}): RestorationOutcomeProof {
  const cap = Math.max(0, input.currentExposureCapPct);
  const normalCap = Math.max(cap, input.targetNormalExposurePct);
  const reducedSizeLimit = cap > 0
    ? cap * 1.05
    : normalCap > 0
      ? normalCap * 0.65
      : 0;
  const reducedSizeOutcomes = input.records.filter((record) => {
    const exposure = numberOr(record.maxExposure, 0);
    return reducedSizeLimit > 0 && exposure <= reducedSizeLimit;
  });
  const cleanOutcomes = reducedSizeOutcomes.filter(isCleanOutcome);
  const failedOutcomes = reducedSizeOutcomes.filter(isFailedOutcome);
  const ledgerEntries = reducedSizeOutcomes.map(ledgerEntryForRecord);
  const cleanStreakCount = cleanReducedSizeStreakCount(reducedSizeOutcomes);
  const lastBoundaryBreak = [...ledgerEntries].reverse().find((entry) => entry.boundaryBreaches.length > 0);
  const latestEntry = ledgerEntries[ledgerEntries.length - 1];
  const activeProofBoundaryBreakCount =
    cleanStreakCount > 0 || !latestEntry ? 0 : latestEntry.boundaryBreaches.length > 0 ? 1 : 0;

  return {
    requiredCleanOutcomes: REQUIRED_CLEAN_REDUCED_SIZE_OUTCOMES,
    reducedSizeOutcomeCount: reducedSizeOutcomes.length,
    totalCleanReducedSizeOutcomeCount: cleanOutcomes.length,
    cleanReducedSizeOutcomeCount: cleanStreakCount,
    failedReducedSizeOutcomeCount: failedOutcomes.length,
    remainingCleanReducedSizeOutcomes: Math.max(
      0,
      REQUIRED_CLEAN_REDUCED_SIZE_OUTCOMES - cleanStreakCount,
    ),
    activeProofBoundaryBreakCount,
    lastBoundaryBreakId: lastBoundaryBreak?.id,
    cleanOutcomeRatio: round(
      reducedSizeOutcomes.length ? cleanOutcomes.length / reducedSizeOutcomes.length * 100 : 0,
    ),
    survivalCostBoundary: SURVIVAL_COST_BOUNDARY,
    maxDrawdownBoundary: MAX_DRAWDOWN_BOUNDARY,
    maxAdverseExcursionBoundary: MAX_ADVERSE_EXCURSION_BOUNDARY,
    ledgerEntries,
    recentOutcomes: ledgerEntries.slice(-5),
  };
}

function cleanReducedSizeStreakCount(records: StockSurvivalMemoryDiagnostic["records"]) {
  let count = 0;

  for (let index = records.length - 1; index >= 0; index -= 1) {
    const record = records[index];
    if (!isCleanOutcome(record)) break;
    count += 1;
  }

  return count;
}

function buildRestorationLedger(input: {
  restorationState: SurvivalMemoryRestorationState;
  outcomeProof: RestorationOutcomeProof;
  survivalConfidence: number;
  survivalConfidenceThreshold: number;
  survivalStatus?: string | null;
  canRestoreSizing: boolean;
}): SurvivalMemoryRestorationLedger {
  const cleanProofPassed =
    input.outcomeProof.cleanReducedSizeOutcomeCount >= input.outcomeProof.requiredCleanOutcomes &&
    input.outcomeProof.activeProofBoundaryBreakCount === 0;
  const confidencePassed = input.survivalConfidence >= input.survivalConfidenceThreshold;
  const statusClear = input.survivalStatus === "clear" || input.canRestoreSizing;
  const entries = input.outcomeProof.ledgerEntries;
  const latestEntry = entries[entries.length - 1];
  const remainingClean = Math.max(
    0,
    input.outcomeProof.requiredCleanOutcomes - input.outcomeProof.cleanReducedSizeOutcomeCount,
  );

  return {
    title: "Survival Memory Restoration Ledger",
    state: input.restorationState,
    statePath: [
      {
        state: "scarred",
        label: "Scar recorded",
        passed: input.outcomeProof.reducedSizeOutcomeCount > 0 || confidencePassed || statusClear,
        detail: "Prior survival cost has been identified and reduced-size proof is being collected.",
      },
      {
        state: "watch",
        label: "Watch proof",
        passed: confidencePassed,
        detail: `Survival confidence ${Math.round(input.survivalConfidence)}/100; target ${input.survivalConfidenceThreshold}/100.`,
      },
      {
        state: "limited",
        label: "Limited proof",
        passed: cleanProofPassed,
        detail: `${input.outcomeProof.cleanReducedSizeOutcomeCount}/${input.outcomeProof.requiredCleanOutcomes} clean reduced-size outcomes with ${input.outcomeProof.activeProofBoundaryBreakCount} active-lane boundary breaks.`,
      },
      {
        state: "clear",
        label: "Clear",
        passed: statusClear && cleanProofPassed,
        detail: "Survival Memory is clear and clean reduced-size proof is intact.",
      },
    ],
    entries,
    exactUnlockCondition: exactUnlockConditionFor({
      state: input.restorationState,
      remainingClean,
      survivalConfidence: input.survivalConfidence,
      survivalConfidenceThreshold: input.survivalConfidenceThreshold,
      latestOutcomeFailed: latestEntry ? !latestEntry.clean && latestEntry.boundaryBreaches.length > 0 : false,
    }),
    boundarySummary: `Clean means survival cost < ${SURVIVAL_COST_BOUNDARY}/100, drawdown < ${MAX_DRAWDOWN_BOUNDARY}%, and MAE < ${MAX_ADVERSE_EXCURSION_BOUNDARY}%.`,
    requiredCleanOutcomes: input.outcomeProof.requiredCleanOutcomes,
    cleanReducedSizeOutcomeCount: input.outcomeProof.cleanReducedSizeOutcomeCount,
    failedReducedSizeOutcomeCount: input.outcomeProof.failedReducedSizeOutcomeCount,
  };
}

function buildRestorationActionPlan(input: {
  outcomeProof: RestorationOutcomeProof;
  ledger: SurvivalMemoryRestorationLedger;
  currentExposureCapPct: number;
  targetNormalExposurePct: number;
  survivalConfidence: number;
  survivalConfidenceThreshold: number;
  survivalStatus?: string | null;
  canRestoreSizing: boolean;
}): RestorationActionPlan {
  const remainingClean = input.outcomeProof.remainingCleanReducedSizeOutcomes;
  const confidencePassed = input.survivalConfidence >= input.survivalConfidenceThreshold;
  const cleanProofPassed =
    remainingClean === 0 && input.outcomeProof.activeProofBoundaryBreakCount === 0;
  const statusClear = input.survivalStatus === "clear" || input.canRestoreSizing;
  const resetRequired = input.outcomeProof.activeProofBoundaryBreakCount > 0;
  const proofLaneOpen = input.canRestoreSizing || input.currentExposureCapPct > 0;
  const planStatus: RestorationActionPlan["status"] = input.canRestoreSizing
    ? "restored"
    : resetRequired
      ? "reset_required"
      : cleanProofPassed && confidencePassed
        ? "ready_for_review"
        : "collecting_evidence";
  const activeInstruction = activeInstructionFor({
    planStatus,
    remainingClean,
    confidencePassed,
    proofLaneOpen,
    survivalConfidence: input.survivalConfidence,
    survivalConfidenceThreshold: input.survivalConfidenceThreshold,
    statusClear,
    exactUnlockCondition: input.ledger.exactUnlockCondition,
  });
  const firstStep = firstRestorationActionPlanStep({
    canRestoreSizing: input.canRestoreSizing,
    confidencePassed,
    proofLaneOpen,
    currentExposureCapPct: input.currentExposureCapPct,
    survivalConfidence: input.survivalConfidence,
    survivalConfidenceThreshold: input.survivalConfidenceThreshold,
  });
  const collectCleanOutcomesStep = collectCleanOutcomesActionPlanStep({
    cleanProofPassed,
    confidencePassed,
    proofLaneOpen,
    resetRequired,
    remainingClean,
    currentExposureCapPct: input.currentExposureCapPct,
    survivalConfidenceThreshold: input.survivalConfidenceThreshold,
  });

  return {
    title: "Survival Memory Restoration Plan",
    status: planStatus,
    activeInstruction,
    exposureInstruction: input.canRestoreSizing
      ? `Normal sizing can be reviewed against the ${formatPct(input.targetNormalExposurePct)} target.`
      : !proofLaneOpen
        ? "Stay exits-only until readiness, trust, and robustness gates reopen reduced-size proof lane capacity."
      : `Keep exposure capped at ${formatPct(input.currentExposureCapPct)} until the proof lane and Survival Memory status clear.`,
    remainingCleanOutcomes: remainingClean,
    activeBoundaryBreaks: input.outcomeProof.activeProofBoundaryBreakCount,
    steps: [
      firstStep,
      collectCleanOutcomesStep,
      {
        id: "clear-survival-memory",
        label: "Clear Survival Memory",
        status: statusClear ? "done" : cleanProofPassed && confidencePassed ? "active" : "blocked",
        detail: statusClear
          ? "Survival Memory status is clear."
          : "Promote scarred/watch status only after the clean streak and survival confidence stay intact.",
      },
    ],
  };
}

function firstRestorationActionPlanStep(input: {
  canRestoreSizing: boolean;
  confidencePassed: boolean;
  proofLaneOpen: boolean;
  currentExposureCapPct: number;
  survivalConfidence: number;
  survivalConfidenceThreshold: number;
}): RestorationActionPlanStep {
  if (input.canRestoreSizing) {
    return {
      id: "normal-sizing-review",
      label: "Normal sizing review",
      status: "done",
      detail: "Reduced-size cap has finished its restoration role.",
    };
  }

  if (!input.confidencePassed) {
    return {
      id: "raise-survival-confidence",
      label: "Raise survival confidence",
      status: "active",
      detail: `Move survival confidence from ${Math.round(input.survivalConfidence)}/100 to at least ${input.survivalConfidenceThreshold}/100 before proof outcomes can restore sizing.`,
    };
  }

  if (!input.proofLaneOpen) {
    return {
      id: "reopen-proof-lane",
      label: "Reopen proof lane",
      status: "active",
      detail: `No clean reduced-size outcomes can be collected while current cap is ${formatPct(input.currentExposureCapPct)}; resolve blocking readiness, trust, or robustness gates first.`,
    };
  }

  return {
    id: "hold-reduced-size-cap",
    label: "Hold reduced-size cap",
    status: "active",
    detail: `Do not restore normal sizing before clean proof clears; current cap is ${formatPct(input.currentExposureCapPct)}.`,
  };
}

function collectCleanOutcomesActionPlanStep(input: {
  cleanProofPassed: boolean;
  confidencePassed: boolean;
  proofLaneOpen: boolean;
  resetRequired: boolean;
  remainingClean: number;
  currentExposureCapPct: number;
  survivalConfidenceThreshold: number;
}): RestorationActionPlanStep {
  if (input.cleanProofPassed) {
    return {
      id: "collect-clean-outcomes",
      label: "Collect clean outcomes",
      status: "done",
      detail: "Clean reduced-size outcome streak is complete.",
    };
  }

  if (!input.confidencePassed && !input.proofLaneOpen) {
    return {
      id: "collect-clean-outcomes",
      label: "Collect clean outcomes",
      status: "blocked",
      detail: `Clean outcomes cannot count until survival confidence reaches ${input.survivalConfidenceThreshold}/100 and proof lane capacity reopens from ${formatPct(input.currentExposureCapPct)}.`,
    };
  }

  if (!input.confidencePassed) {
    return {
      id: "collect-clean-outcomes",
      label: "Collect clean outcomes",
      status: "blocked",
      detail: `Wait for survival confidence to reach ${input.survivalConfidenceThreshold}/100 before collecting proof outcomes.`,
    };
  }

  if (!input.proofLaneOpen) {
    return {
      id: "collect-clean-outcomes",
      label: "Collect clean outcomes",
      status: "blocked",
      detail: `Clean outcomes cannot be collected while current cap is ${formatPct(input.currentExposureCapPct)}; reopen reduced-size proof lane capacity first.`,
    };
  }

  if (input.resetRequired) {
    return {
      id: "collect-clean-outcomes",
      label: "Collect clean outcomes",
      status: "active",
      detail: "Restart the clean reduced-size streak after the latest survival-boundary break.",
    };
  }

  return {
    id: "collect-clean-outcomes",
    label: "Collect clean outcomes",
    status: "active",
    detail: `Close ${input.remainingClean} more clean reduced-size outcome${input.remainingClean === 1 ? "" : "s"} under survival, drawdown, and MAE boundaries.`,
  };
}

function ledgerEntryForRecord(record: StockSurvivalMemoryDiagnostic["records"][number]): RestorationLedgerEntry {
  const maxAdverseExcursion = round(numberOr(record.maxAdverseExcursion, 0));
  const survivalCost = round(numberOr(record.survivalCost, 0));

  return {
    id: record.id,
    timestamp: record.timestamp,
    asset: record.asset,
    maxExposure: round(numberOr(record.maxExposure, 0)),
    realizedReturn: round(numberOr(record.realizedReturn, 0)),
    maxDrawdown: round(numberOr(record.maxDrawdown, 0)),
    maxAdverseExcursion,
    survivalCost,
    outcomeClass: record.outcomeClass,
    clean: isCleanOutcome(record),
    boundaryBreaches: boundaryBreachesFor(record),
    maxAdverseExcursionBoundary: MAX_ADVERSE_EXCURSION_BOUNDARY,
    maxAdverseExcursionRemaining: round(MAX_ADVERSE_EXCURSION_BOUNDARY - maxAdverseExcursion),
    survivalCostBoundary: SURVIVAL_COST_BOUNDARY,
    survivalCostRemaining: round(SURVIVAL_COST_BOUNDARY - survivalCost),
  };
}

function isCleanOutcome(record: StockSurvivalMemoryDiagnostic["records"][number]) {
  return (
    record.outcomeClass === "comfortable_survival" ||
    (
      numberOr(record.survivalCost, 100) < SURVIVAL_COST_BOUNDARY &&
      numberOr(record.maxDrawdown, 100) < MAX_DRAWDOWN_BOUNDARY &&
      numberOr(record.maxAdverseExcursion, 100) < MAX_ADVERSE_EXCURSION_BOUNDARY
    )
  );
}

function isFailedOutcome(record: StockSurvivalMemoryDiagnostic["records"][number]) {
  return (
    record.outcomeClass === "failed_survival" ||
    numberOr(record.survivalCost, 0) >= 65 ||
    numberOr(record.maxDrawdown, 0) >= MAX_DRAWDOWN_BOUNDARY ||
    numberOr(record.maxAdverseExcursion, 0) >= MAX_ADVERSE_EXCURSION_BOUNDARY
  );
}

function boundaryBreachesFor(record: StockSurvivalMemoryDiagnostic["records"][number]) {
  const breaches: string[] = [];

  if (record.outcomeClass === "failed_survival") breaches.push("failed survival");
  if (numberOr(record.survivalCost, 0) >= SURVIVAL_COST_BOUNDARY) breaches.push("survival cost");
  if (numberOr(record.maxDrawdown, 0) >= MAX_DRAWDOWN_BOUNDARY) breaches.push("drawdown");
  if (numberOr(record.maxAdverseExcursion, 0) >= MAX_ADVERSE_EXCURSION_BOUNDARY) breaches.push("MAE");

  return unique(breaches);
}

function gate(input: {
  id: string;
  label: string;
  passed: boolean;
  currentValue: number;
  targetValue: number;
  current: string;
  target: string;
  detail: string;
  unlockCondition?: string;
}): RestorationProgressGate {
  return {
    id: input.id,
    label: input.label,
    passed: input.passed,
    current: input.current,
    target: input.target,
    progressPct: input.passed
      ? 100
      : clamp(input.currentValue / Math.max(1, input.targetValue) * 100),
    detail: input.detail,
    unlockCondition: input.unlockCondition,
  };
}

function restorationStateFor(input: {
  canRestoreSizing: boolean;
  survivalStatus?: string | null;
  survivalConfidence: number;
  cleanOutcomeGatePassed: boolean;
  cleanReducedSizeOutcomeCount: number;
  activeProofBoundaryBreakCount: number;
  threshold: number;
}): SurvivalMemoryRestorationState {
  if (input.canRestoreSizing) return "clear";
  if (input.survivalStatus === "near_ruin") return "scarred";
  if (
    input.survivalStatus === "clear" &&
    input.survivalConfidence >= input.threshold &&
    input.cleanOutcomeGatePassed
  ) {
    return "clear";
  }
  if (
    input.survivalConfidence >= input.threshold &&
    input.cleanOutcomeGatePassed &&
    input.activeProofBoundaryBreakCount === 0
  ) {
    return "limited";
  }
  if (input.survivalConfidence >= input.threshold || input.cleanReducedSizeOutcomeCount > 0) {
    return "watch";
  }
  return "scarred";
}

function exactUnlockConditionFor(input: {
  state: SurvivalMemoryRestorationState;
  remainingClean: number;
  survivalConfidence: number;
  survivalConfidenceThreshold: number;
  latestOutcomeFailed: boolean;
}) {
  if (input.state === "clear") {
    return "Survival Memory restoration ledger is clear; normal sizing can proceed through downstream controls.";
  }
  if (input.latestOutcomeFailed) {
    return "Reset the clean reduced-size proof streak by closing new micro outcomes without survival-boundary breaks.";
  }
  if (input.survivalConfidence < input.survivalConfidenceThreshold) {
    return `Raise survival confidence to at least ${input.survivalConfidenceThreshold}/100 before normal sizing can be restored.`;
  }
  if (input.remainingClean > 0) {
    return `Close ${input.remainingClean} more clean reduced-size outcome${input.remainingClean === 1 ? "" : "s"} without breaching survival boundaries.`;
  }
  return "Move Survival Memory status to clear after the clean reduced-size proof remains intact.";
}

function statusFor(
  canRestoreSizing: boolean,
  recoveryStatus: RecoveryResult["status"] | undefined,
  failedGates: RestorationProgressGate[],
): RestorationProgressStatus {
  if (canRestoreSizing) return "restored";
  if (recoveryStatus === "locked" || recoveryStatus === "regressed") return "blocked";
  if (!failedGates.length) return "ready_for_restoration";
  return "collecting_evidence";
}

function summaryFor(status: RestorationProgressStatus, primaryBlocker: string | null) {
  if (status === "restored") {
    return "Recovery evidence supports normal sizing subject to downstream execution gates.";
  }
  if (status === "ready_for_restoration") {
    return "Restoration gates are clear; normal sizing can be reviewed by downstream execution controls.";
  }
  if (primaryBlocker) return primaryBlocker;
  return "Restoration still needs clean reduced-size evidence and stable governance gates.";
}

function activeInstructionFor(input: {
  planStatus: RestorationActionPlan["status"];
  remainingClean: number;
  confidencePassed: boolean;
  proofLaneOpen: boolean;
  survivalConfidence: number;
  survivalConfidenceThreshold: number;
  statusClear: boolean;
  exactUnlockCondition: string;
}) {
  if (input.planStatus === "restored") {
    return "Normal sizing restoration is available for downstream execution review.";
  }
  if (input.planStatus === "reset_required") {
    return "Restart the reduced-size proof lane after the latest survival-boundary break.";
  }
  if (!input.confidencePassed) {
    return `Raise survival confidence from ${Math.round(input.survivalConfidence)}/100 to at least ${input.survivalConfidenceThreshold}/100 before normal sizing can be restored.`;
  }
  if (!input.proofLaneOpen) {
    return "Reopen reduced-size proof lane capacity before collecting clean outcomes.";
  }
  if (input.remainingClean > 0) {
    return `Close ${input.remainingClean} more clean reduced-size outcome${input.remainingClean === 1 ? "" : "s"} before normal sizing is reviewed.`;
  }
  if (!input.statusClear) {
    return "Promote Survival Memory from scarred/watch to clear now that reduced-size proof is intact.";
  }
  return input.exactUnlockCondition;
}

function formatPct(value: number) {
  return `${round(value)}%`;
}

function normalizedSimilarSampleCount(recovery: RecoveryResult | null) {
  const audit = objectOrNull(recovery?.audit);
  const normalized = objectOrNull(audit?.normalized);
  const sampleConfidence = numberOr(audit?.sampleConfidence, 0);
  const thresholds = objectOrNull(audit?.thresholds);
  const required = numberOr(thresholds?.minSimilarSamplesForRestore, DEFAULT_RECOVERY_THRESHOLDS.minSimilarSamplesForRestore);

  return numberOr(normalized?.similarSampleCount, sampleConfidence / 100 * required, 0);
}

function readableStatus(value: unknown) {
  const text = String(value ?? "pending");
  return text.replace(/_/g, " ");
}

function numberOr(...values: unknown[]) {
  for (const value of values) {
    const numberValue = Number(value);
    if (Number.isFinite(numberValue)) return numberValue;
  }
  return 0;
}

function objectOrNull(value: unknown): Record<string, any> | null {
  return value && typeof value === "object" ? value as Record<string, any> : null;
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(isString)));
}

function clamp(value: number, min = 0, max = 100) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function round(value: number) {
  return Number((Number.isFinite(value) ? value : 0).toFixed(2));
}
