import {
  resolveCommitment,
  type ResolveInput,
  type ResolveOutput,
} from "../../../signal-framework/resolve/engine";
import type { DiscoveryResult } from "../../../signal-framework/discovery/engine";
import type { RecognitionResult } from "../../../signal-framework/recognition/engine";
import type {
  StockAgencyDiagnostics,
  StockAgencySignal,
  StockAgencySignalAudit,
  StockAgencySummary,
} from "./agency-diagnostics";

export type StockResolveSignal = StockAgencySignal & {
  agency?: StockAgencySignalAudit;
  recognition?: RecognitionResult;
  resolve?: ResolveOutput;
};

export type StockResolveDiagnostics = {
  module: "stocks.resolve-adapter";
  primary: ResolveOutput | null;
  decisionCounts: Record<ResolveOutput["decision"], number>;
  signals: Array<{
    symbol: string;
    decision: ResolveOutput["decision"];
    commitmentLevel: ResolveOutput["commitmentLevel"];
    resolveScore: number;
    requiredScore: number;
    humanReviewRequired: boolean;
  }>;
};

export type StockResolveApplicationResult<T extends StockResolveSignal> = {
  signals: Array<T & { resolve: ResolveOutput }>;
  resolveDiagnostics: StockResolveDiagnostics;
};

export function mapStockSignalToResolveInput(input: {
  signal: StockResolveSignal;
  summary?: StockAgencySummary & Record<string, any>;
  agencyDiagnostics?: StockAgencyDiagnostics | null;
  opportunityDensity?: number | null;
  discovery?: DiscoveryResult | null;
  recognition?: RecognitionResult | null;
}): ResolveInput {
  const signal = input.signal;
  const summary = input.summary ?? {};
  const audit = signal.agency;
  const judgement = signal.judgement;
  const trustGovernor = signal.trustGovernor ?? summary.trustGovernor;
  const survivalMemory = signal.survivalMemory ?? summary.survivalMemory;
  const strategyReadiness = summary.strategyReadiness ?? {};
  const opensNewExposure = signal.signalAction === "Buy" && numeric(signal.suggestedExposure) > 0;
  const survivalMaxExposure = opensNewExposure
    ? finiteNumber(survivalMemory?.maxExposurePct)
    : undefined;
  const trustedExposure =
    trustGovernor?.maxExposure ??
    finiteNumber(summary.trustedMaxExposurePct) ??
    finiteNumber(signal.maxPositionPct) ??
    finiteNumber((strategyReadiness as any).maxPositionPct);
  const strategyComponents = (strategyReadiness as any).components ?? {};
  const robustness = summary.robustnessDiagnostics ?? {};
  const calibration = (strategyReadiness as any).calibration ?? {};
  const agencyRecommendation =
    audit?.recommendation ??
    input.agencyDiagnostics?.summary?.recommendation ??
    "wait";
  const opportunityDensity = finiteNumber(input.opportunityDensity);
  const domainMissingEvidence: string[] = [];
  const domainUnlockConditions: string[] = [];
  const domainInvalidationConditions: string[] = [
    "Invalidate if the app-specific opportunity thesis loses its leading evidence cluster.",
  ];
  const discovery = input.discovery;
  const recognition = signal.recognition ?? input.recognition ?? summary.recognitionDiagnostics?.primary ?? null;
  const recognitionClearsDiscovery = recognitionClearsDiscoveryReview(recognition);

  if (opensNewExposure && opportunityDensity != null && opportunityDensity < 50) {
    domainMissingEvidence.push("Broader opportunity density across independent candidates");
    domainUnlockConditions.push("Increase opportunity density above the app review threshold.");
  }

  if (discovery) {
    domainMissingEvidence.push(...discovery.missingEvidence.slice(0, 3));
    domainUnlockConditions.push(...discovery.foresight.unlockConditions.slice(0, 3));
    domainInvalidationConditions.push(...discovery.invalidationConditions.slice(0, 3));

    if (discovery.confidence < 50 && !recognitionClearsDiscovery) {
      domainMissingEvidence.push("Discovery confidence above the app review threshold");
      domainUnlockConditions.push(discovery.recommendedNextStep);
    } else if (discovery.confidence < 50 && recognitionClearsDiscovery) {
      domainUnlockConditions.push("Recognition recurrence evidence clears the Discovery confidence review item.");
    }
  }

  if (audit?.requiresApproval === true) {
    domainMissingEvidence.push("Agency approval for this action");
    domainUnlockConditions.push("Clear the Agency approval requirement for this action.");
  }

  if (opensNewExposure && survivalMemory?.recommendation === "wait") {
    domainMissingEvidence.push("Survival memory clearance");
    domainUnlockConditions.push(
      survivalMemory.unlockConditions?.[0] ??
        "Wait until similar states show acceptable survival cost before opening exposure.",
    );
    domainInvalidationConditions.push(
      survivalMemory.invalidationConditions?.[0] ??
        "Invalidate if similar states repeat unacceptable adverse excursion.",
    );
  } else if (opensNewExposure && survivalMemory?.recommendation === "act_with_reduced_size") {
    domainMissingEvidence.push("Reduced-size survival review");
    domainUnlockConditions.push(
      survivalMemory.unlockConditions?.[0] ??
        "Restore normal sizing only after survival confidence improves.",
    );

    if (recognitionClearsDiscovery) {
      const archetype = recognizedArchetypeLabel(recognition);
      domainUnlockConditions.push(
        `Use reduced-size outcomes with acceptable drawdown and stress cost to prove the ${archetype} archetype is survival-safe before normal sizing.`,
      );
      domainInvalidationConditions.push(
        "Do not restore normal sizing from Recognition state recurrence alone if survival-cost outcome linkage remains missing.",
      );
    }
  }

  return {
    actionName: actionNameFor(signal),
    agencyRecommendation,
    agencyTrust: audit?.trust ?? input.agencyDiagnostics?.summary?.averageTrust,
    trustScore: trustGovernor?.trustScore,
    calibratedConfidence: finiteNumber(signal.calibratedConfidence) ??
      finiteNumber(summary.calibratedConfidence) ??
      finiteNumber((strategyReadiness as any).calibratedConfidence),
    rawConfidence: finiteNumber(signal.rawConfidence) ??
      finiteNumber(summary.rawConfidence) ??
      finiteNumber((strategyReadiness as any).rawConfidence),
    judgementReliability: judgement?.reliability,
    outcomeStability: judgement?.outcomeStability,
    overfitRisk: judgement?.overfitRisk ??
      finiteNumber(robustness.overfitRisk) ??
      finiteNumber(robustness.overfitRiskPct),
    riskScore: Math.max(
      finiteNumber(signal.riskPressure) ?? 0,
      opensNewExposure ? finiteNumber(survivalMemory?.averageSurvivalCost) ?? 0 : 0,
    ),
    dataReliability: finiteNumber(strategyComponents.dataReliability?.score) ??
      finiteNumber((summary as any).dataReliability?.score) ??
      finiteNumber((summary as any).dataQualityReport?.coveragePct),
    beliefConfidence: signal.belief?.confidence,
    beliefFragility: signal.belief?.fragility,
    sizingMode: signal.sizingMode,
    suggestedExposure: signal.suggestedExposure,
    maxTrustedExposure: survivalMaxExposure == null
      ? trustedExposure
      : Math.min(trustedExposure ?? survivalMaxExposure, survivalMaxExposure),
    blockedActions: audit?.allowed === false ? 1 : 0,
    missingOutcomes: input.agencyDiagnostics?.summary?.missingOutcomes,
    similarSamples: judgement?.similarSampleSize ?? finiteNumber(calibration.sampleSize),
    positiveOutcomes: judgement?.evidence?.positiveOutcomes,
    negativeOutcomes: judgement?.evidence?.negativeOutcomes,
    evidence: {
      humanReviewRequired: audit?.requiresApproval === true,
      missingEvidence: domainMissingEvidence,
      unlockConditions: domainUnlockConditions,
      invalidationConditions: domainInvalidationConditions,
      recognition,
      recognitionClearsDiscovery,
    },
  };
}

export function recognitionClearsDiscoveryReview(recognition?: RecognitionResult | null) {
  if (!recognition) return false;
  return recognition.verdict === "recognized" &&
    recognition.recurrenceConfidence >= 70 &&
    recognition.recognitionScore >= 65 &&
    recognition.outcomeStability >= 60 &&
    recognition.discoveryNoveltyJustified === false &&
    (recognition.matchedSamples >= 5 || recognition.archetypeConfidence >= 70);
}

function recognizedArchetypeLabel(recognition: RecognitionResult) {
  return String(recognition.archetype).replace(/_/g, " ");
}

export function applyStockResolveDiagnostics<T extends StockResolveSignal>(input: {
  market: string;
  signals: T[];
  summary?: StockAgencySummary & Record<string, any>;
  agencyDiagnostics?: StockAgencyDiagnostics | null;
  opportunityDiscovery?: any;
}): StockResolveApplicationResult<T> {
  const opportunityDensity = finiteNumber(input.opportunityDiscovery?.density?.density) ??
    finiteNumber(input.opportunityDiscovery?.density?.futureDensity) ??
    finiteNumber(input.opportunityDiscovery?.density?.confidence);
  const discovery = input.opportunityDiscovery?.discovery ?? null;
  const signals = input.signals.map((signal) => {
    const resolve = resolveCommitment(mapStockSignalToResolveInput({
      signal,
      summary: input.summary,
      agencyDiagnostics: input.agencyDiagnostics,
      opportunityDensity,
      discovery,
    }));

    return {
      ...signal,
      resolve,
    };
  });

  return {
    signals,
    resolveDiagnostics: summarizeResolveDiagnostics(signals),
  };
}

function summarizeResolveDiagnostics(signals: Array<StockResolveSignal & { resolve: ResolveOutput }>): StockResolveDiagnostics {
  const decisionCounts: Record<ResolveOutput["decision"], number> = {
    commit: 0,
    wait: 0,
    escalate: 0,
    reject: 0,
    invalidate: 0,
  };

  for (const signal of signals) {
    decisionCounts[signal.resolve.decision] += 1;
  }

  const primarySignal = [...signals].sort((left, right) =>
    priorityFor(right.resolve.decision) - priorityFor(left.resolve.decision) ||
    right.resolve.resolveScore - left.resolve.resolveScore,
  )[0];

  return {
    module: "stocks.resolve-adapter",
    primary: primarySignal?.resolve ?? null,
    decisionCounts,
    signals: signals.map((signal) => ({
      symbol: symbolOf(signal),
      decision: signal.resolve.decision,
      commitmentLevel: signal.resolve.commitmentLevel,
      resolveScore: signal.resolve.resolveScore,
      requiredScore: signal.resolve.requiredScore,
      humanReviewRequired: signal.resolve.humanReviewRequired,
    })),
  };
}

function priorityFor(decision: ResolveOutput["decision"]) {
  if (decision === "commit") return 5;
  if (decision === "escalate") return 4;
  if (decision === "wait") return 3;
  if (decision === "reject") return 2;
  return 1;
}

function actionNameFor(signal: StockResolveSignal) {
  const symbol = symbolOf(signal) || "selected instrument";
  const action = signal.signalAction ?? signal.allocationAction ?? "Review";
  return `${action} ${symbol}`;
}

function symbolOf(signal: StockResolveSignal) {
  return String(signal.symbol ?? signal.ticker ?? "").trim().toUpperCase();
}

function numeric(value: unknown) {
  return finiteNumber(value) ?? 0;
}

function finiteNumber(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}
