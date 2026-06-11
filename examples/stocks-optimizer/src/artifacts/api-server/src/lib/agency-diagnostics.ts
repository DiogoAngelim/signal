import {
  type AgencyAction,
  type AgencyCycleInput,
  type AgencyDecision,
  type AgencyTrace,
  type OutcomeInput,
  type SelfDiagnosisRecommendation,
  createAgencyPipeline,
  createInMemoryAgencyMemory,
  evaluateAgencyState,
} from "@signal/agency";
import type { JudgementResult } from "../../../signal-framework";
import type { TrustGovernorResult } from "../../../signal-framework/trust/engine";
import type { StockSurvivalMemoryDiagnostic } from "./survival-memory-adapter";

export type StockAgencySignal = {
  symbol?: string;
  ticker?: string;
  market?: string;
  price?: number | null;
  signalAction?: string;
  allocationAction?: string;
  signalStatus?: string;
  suggestedExposure?: number;
  maxPositionPct?: number;
  setupQuality?: number;
  riskPressure?: number;
  trendQuality?: number;
  timingQuality?: number;
  expectedMove?: number;
  signalConfidence?: number;
  rawConfidence?: number;
  calibratedConfidence?: number;
  trustworthiness?: number;
  calibrationWarnings?: string[];
  judgement?: JudgementResult;
  trustGovernor?: TrustGovernorResult;
  explanation?: string;
  rejectionReason?: string | null;
  sizingMode?: string;
  sizingReasons?: string[];
  belief?: {
    verdict?: string;
    confidence?: number;
    trustworthiness?: number;
    fragility?: number;
    reason?: string;
    blockers?: string[];
    warnings?: string[];
  } | null;
  opportunityDiscovery?: {
    candidateScore?: number;
    lifecycle?: string;
    explanation?: string;
  };
  survivalMemory?: StockSurvivalMemoryDiagnostic;
  observedAt?: string;
  signalDate?: string;
};

export type StockAgencyTrade = {
  symbol?: string;
  ticker?: string;
  entryDate?: string;
  exitDate?: string;
  returnPct?: number;
  entryExposure?: number;
};

export type StockAgencySummary = {
  updatedAt?: string;
  configId?: string;
  survivalScore?: number;
  promotionConfidence?: number;
  rawConfidence?: number;
  calibratedConfidence?: number;
  trustworthiness?: number;
  calibrationWarnings?: string[];
  productionEligible?: boolean;
  promotionBlocked?: boolean;
  maxPositionPct?: number;
  readinessLabel?: string;
  strategyReadiness?: {
    blocked?: boolean;
    maxPositionPct?: number;
    maxConfidence?: number;
    rawConfidence?: number;
    calibratedConfidence?: number;
    trustworthiness?: number;
    calibration?: {
      warnings?: string[];
    };
  };
  trustGovernor?: TrustGovernorResult;
};

export type StockAgencyDiagnosticsInput = {
  market: string;
  signals: StockAgencySignal[];
  trades?: StockAgencyTrade[];
  summary?: StockAgencySummary;
};

export type StockAgencySignalAudit = {
  traceId: string;
  symbol: string;
  decisionKind: string;
  allowed: boolean;
  requiresApproval: boolean;
  actionKind: string | null;
  outcomeLabel: string;
  trust: number;
  rawConfidence: number;
  calibratedConfidence: number;
  trustworthiness: number;
  calibrationWarnings: string[];
  survivalRecommendation?: string;
  survivalWarnings?: string[];
  recommendation: SelfDiagnosisRecommendation;
  violations: string[];
  reasons: string[];
  trustAdjustment?: number;
  trustAdjustmentReason?: string;
};

export type StockAgencyDiagnostics = {
  summary: {
    traceCount: number;
    allowedActions: number;
    blockedActions: number;
    missingOutcomes: number;
    averageTrust: number;
    baseAverageTrust?: number;
    trustAdjustment?: number;
    trustAdjustmentReason?: string;
    recommendation: SelfDiagnosisRecommendation;
  };
  state: ReturnType<typeof evaluateAgencyState>;
  traces: AgencyTrace[];
  signalAudits: StockAgencySignalAudit[];
};

export type StockAgencyApplicationResult = {
  signals: Array<
    StockAgencySignal & {
      agencyTrace?: AgencyTrace;
      agency?: StockAgencySignalAudit;
    }
  >;
  agencyDiagnostics: StockAgencyDiagnostics;
};

export function applyStockAgencyDiagnostics(
  input: StockAgencyDiagnosticsInput,
): StockAgencyApplicationResult {
  const signals = input.signals.filter((signal) => symbolOf(signal));
  const memory = createInMemoryAgencyMemory();
  const baseTimestamp = resolveBaseTimestamp(input.summary, signals);
  const latestTradeBySymbol = latestTradesBySymbol(input.trades ?? []);

  const enrichedSignals = signals.map((signal, index) => {
    const symbol = symbolOf(signal);
    const policy = {
      minimumConfidence: 0.52,
      maximumSize: maxSizeFor(signal, input.summary),
      humanApprovalRequired: requiresHumanApproval(signal, input.summary),
    };
    const pipeline = createAgencyPipeline({
      memory,
      policy,
      clock: () => new Date(baseTimestamp),
      idGenerator: () => traceIdFor(input.market, symbol, index),
      calibration: { minimumSamples: 2 },
      selfDiagnosis: { minimumTraceCount: 2 },
    });
    const trace = pipeline.runAgencyCycle(
      cycleInputForSignal({
        market: input.market,
        signal,
        summary: input.summary,
        trade: latestTradeBySymbol.get(symbol),
      }),
    );
    const audit = auditForTrace(symbol, trace);

    return {
      ...signal,
      agencyTrace: trace,
      agency: audit,
    };
  });
  const traces = memory.list();
  const state = evaluateAgencyState(traces, {
    calibration: { minimumSamples: 2 },
    selfDiagnosis: { minimumTraceCount: 2 },
  });

  return {
    signals: enrichedSignals,
    agencyDiagnostics: {
      summary: summaryFor(
        traces,
        state.selfDiagnosis.recommendation,
        enrichedSignals.map(
          (signal) => signal.agency as StockAgencySignalAudit,
        ),
      ),
      state,
      traces,
      signalAudits: enrichedSignals.map(
        (signal) => signal.agency as StockAgencySignalAudit,
      ),
    },
  };
}

function cycleInputForSignal(input: {
  market: string;
  signal: StockAgencySignal;
  summary?: StockAgencySummary;
  trade?: StockAgencyTrade;
}): AgencyCycleInput {
  const symbol = symbolOf(input.signal);
  const confidence = confidenceFor(input.signal, input.summary);
  const action = actionFor(input.signal);
  const outcome = outcomeFor(input.trade);

  return {
    perception: {
      market: input.market,
      symbol,
      price: numberOrNull(input.signal.price),
      setupQuality: numeric(input.signal.setupQuality),
      riskPressure: numeric(input.signal.riskPressure),
      opportunityScore: numeric(
        input.signal.opportunityDiscovery?.candidateScore,
      ),
    },
    intelligence: {
      signalAction: input.signal.signalAction ?? "Hold",
      allocationAction:
        input.signal.allocationAction ?? input.signal.signalAction ?? "Hold",
      expectedMove: numeric(input.signal.expectedMove),
      trendQuality: numeric(input.signal.trendQuality),
      timingQuality: numeric(input.signal.timingQuality),
      lifecycle: input.signal.opportunityDiscovery?.lifecycle ?? "Untracked",
    },
    decision: decisionFor(input.signal, confidence, symbol),
    sizing: {
      size: numeric(input.signal.suggestedExposure),
      unit: "exposure_pct",
      rationale: sizingRationaleFor(input.signal),
    },
    action,
    outcome,
    blockReasons: blockReasonsFor(input.signal, input.summary),
  };
}

function decisionFor(
  signal: StockAgencySignal,
  confidence: number,
  symbol: string,
): AgencyDecision {
  const rawConfidence = rawConfidenceFor(signal);
  const calibratedConfidence = calibratedConfidenceFor(signal, undefined);
  return {
    decisionId: `${symbol}:${signal.signalAction ?? "Hold"}`,
    kind: decisionKindFor(signal),
    confidence,
    rationale:
      signal.explanation ??
      signal.rejectionReason ??
      "Signal decision translated into an agency trace.",
    expectedOutcome: expectedOutcomeFor(signal),
    metadata: {
      symbol,
      signalAction: signal.signalAction ?? "Hold",
      allocationAction:
        signal.allocationAction ?? signal.signalAction ?? "Hold",
      sizingMode: signal.sizingMode ?? "none",
      rawConfidence,
      calibratedConfidence,
      trustworthiness:
        finiteNumber(signal.trustworthiness) ?? calibratedConfidence,
      calibrationWarnings: signal.calibrationWarnings ?? [],
      ...(signal.judgement ? { judgement: signal.judgement } : {}),
      ...(signal.trustGovernor ? { trustGovernor: signal.trustGovernor } : {}),
      ...(signal.belief ? { belief: signal.belief } : {}),
      ...(signal.survivalMemory
        ? { survivalMemory: signal.survivalMemory }
        : {}),
    },
  };
}

function actionFor(signal: StockAgencySignal): AgencyAction | undefined {
  const action = signal.signalAction ?? "Hold";
  const size = numeric(signal.suggestedExposure);

  if (action === "Buy" && size > 0) {
    return {
      kind: "request_exposure",
      payload: { symbol: symbolOf(signal), exposurePct: size },
    };
  }

  if (action === "Sell") {
    return {
      kind: "reduce_exposure",
      payload: { symbol: symbolOf(signal) },
    };
  }

  return undefined;
}

function outcomeFor(trade?: StockAgencyTrade): OutcomeInput {
  if (trade === undefined || !Number.isFinite(Number(trade.returnPct))) {
    return { success: null, outcomeLabel: "unknown" };
  }

  const returnPct = Number(trade.returnPct);
  return {
    success: returnPct > 0 ? true : returnPct < 0 ? false : null,
    reward: returnPct > 0 ? round(returnPct) : undefined,
    loss: returnPct < 0 ? round(Math.abs(returnPct)) : undefined,
    durationMs: durationMs(trade.entryDate, trade.exitDate),
  };
}

function blockReasonsFor(
  signal: StockAgencySignal,
  summary?: StockAgencySummary,
) {
  const reasons: string[] = [];
  const riskPressure = numeric(signal.riskPressure);

  if (
    signal.allocationAction === "Blocked" ||
    signal.signalStatus === "blocked"
  ) {
    reasons.push("strategy_readiness_blocked");
  }

  if (riskPressure >= 78) {
    reasons.push("risk_pressure_high");
  }

  if (signal.signalAction === "Buy" && numeric(signal.suggestedExposure) <= 0) {
    reasons.push("missing_positive_size");
  }

  if (
    signal.belief &&
    signal.belief.verdict !== "justified" &&
    (signal.allocationAction === "Blocked" ||
      signal.signalStatus === "blocked" ||
      signal.allocationAction === "Watch")
  ) {
    reasons.push(
      `belief_${String(signal.belief.verdict)
        .replace(/[^a-z0-9]+/gi, "_")
        .toLowerCase()}`,
    );
  }

  if (
    signal.judgement?.status === "blocked" ||
    signal.judgement?.status === "review_required"
  ) {
    reasons.push(`judgement_${signal.judgement.status}`);
  }

  if (
    isParticipationAction(signal) &&
    signal.survivalMemory?.recommendation === "wait"
  ) {
    reasons.push("survival_memory_wait");
  }

  if (
    signal.trustGovernor &&
    !signal.trustGovernor.allowsNewExposure &&
    isParticipationAction(signal)
  ) {
    reasons.push(
      `trust_${signal.trustGovernor.primaryBlocker ?? signal.trustGovernor.participationMode}`,
    );
  }

  if (
    summary?.promotionBlocked === true ||
    summary?.strategyReadiness?.blocked === true
  ) {
    reasons.push("system_readiness_blocked");
  }

  return reasons;
}

function auditForTrace(
  symbol: string,
  trace: AgencyTrace,
): StockAgencySignalAudit {
  const trustAdjustment = reducedSizeOutcomeTrustAdjustment(trace);
  const trustAdjustmentReason =
    trustAdjustment > 0
      ? "Clean reduced-size outcome evidence improves Agency trust without restoring normal sizing."
      : undefined;
  const adjustedTrust = round(
    clamp(trace.selfDiagnosis.trust + trustAdjustment, 0, 1),
  );
  const reasons = unique([
    ...trace.selfDiagnosis.reasons,
    ...(trustAdjustmentReason ? [trustAdjustmentReason] : []),
  ]);

  return {
    traceId: trace.traceId,
    symbol,
    decisionKind: trace.decision.kind,
    allowed: trace.policy.allowed,
    requiresApproval: trace.policy.requiresApproval,
    actionKind: trace.action?.kind ?? null,
    outcomeLabel: trace.outcome?.outcomeLabel,
    trust: adjustedTrust,
    rawConfidence: numeric((trace.decision.metadata as any)?.rawConfidence),
    calibratedConfidence: numeric(
      (trace.decision.metadata as any)?.calibratedConfidence,
    ),
    trustworthiness: numeric((trace.decision.metadata as any)?.trustworthiness),
    calibrationWarnings: Array.isArray(
      (trace.decision.metadata as any)?.calibrationWarnings,
    )
      ? (trace.decision.metadata as any).calibrationWarnings
      : [],
    survivalRecommendation: (trace.decision.metadata as any)?.survivalMemory
      ?.recommendation,
    survivalWarnings: Array.isArray(
      (trace.decision.metadata as any)?.survivalMemory?.mainWarnings,
    )
      ? (trace.decision.metadata as any).survivalMemory.mainWarnings
      : [],
    recommendation: trace.selfDiagnosis.recommendation,
    violations: trace.policy.violations,
    reasons,
    ...(trustAdjustment > 0 ? { trustAdjustment, trustAdjustmentReason } : {}),
  };
}

function summaryFor(
  traces: AgencyTrace[],
  recommendation: SelfDiagnosisRecommendation,
  audits: StockAgencySignalAudit[],
) {
  const traceCount = traces.length;
  const allowedActions = traces.filter((trace) => trace.policy.allowed).length;
  const blockedActions = traceCount - allowedActions;
  const missingOutcomes = traces.filter(
    (trace) => trace.outcome?.success === null,
  ).length;
  const baseAverageTrust = traceCount
    ? round(
        traces.reduce((sum, trace) => sum + trace.selfDiagnosis.trust, 0) /
          traceCount,
      )
    : 0;
  const averageTrust = audits.length
    ? round(audits.reduce((sum, audit) => sum + audit.trust, 0) / audits.length)
    : baseAverageTrust;
  const trustAdjustment = round(Math.max(0, averageTrust - baseAverageTrust));

  return {
    traceCount,
    allowedActions,
    blockedActions,
    missingOutcomes,
    averageTrust,
    ...(trustAdjustment > 0
      ? {
          baseAverageTrust,
          trustAdjustment,
          trustAdjustmentReason:
            "Clean reduced-size outcomes are improving Agency trust while normal sizing remains gated.",
        }
      : {}),
    recommendation,
  };
}

function reducedSizeOutcomeTrustAdjustment(trace: AgencyTrace) {
  const metadata = trace.decision.metadata as Record<string, any>;
  const survivalMemory = metadata.survivalMemory as
    | Record<string, any>
    | undefined;
  const calibratedConfidence = numeric(metadata.calibratedConfidence);
  const trustworthiness = numeric(metadata.trustworthiness);
  const survivalConfidence = numeric(survivalMemory?.survivalConfidence);
  const maxExposurePct = numeric(survivalMemory?.maxExposurePct);
  const isCleanReducedSizeTrace =
    trace.policy.allowed === true &&
    trace.policy.violations.length === 0 &&
    trace.outcome?.success === true &&
    survivalMemory?.recommendation === "act_with_reduced_size" &&
    maxExposurePct > 0 &&
    calibratedConfidence >= 60 &&
    trustworthiness >= 70 &&
    survivalConfidence >= 55;

  if (!isCleanReducedSizeTrace) return 0;

  const requestExposureCredit =
    trace.action?.kind === "request_exposure" ? 0.025 : 0.01;
  const survivalCredit = Math.min(
    0.025,
    Math.max(0, (survivalConfidence - 55) / 600),
  );
  const calibrationCredit = Math.min(
    0.02,
    Math.max(0, (calibratedConfidence - 60) / 1_000),
  );
  const trustworthinessCredit = Math.min(
    0.015,
    Math.max(0, (trustworthiness - 70) / 1_000),
  );

  return round(
    Math.min(
      0.08,
      requestExposureCredit +
        survivalCredit +
        calibrationCredit +
        trustworthinessCredit,
    ),
  );
}

function latestTradesBySymbol(trades: StockAgencyTrade[]) {
  const bySymbol = new Map<string, StockAgencyTrade>();

  for (const trade of trades) {
    const symbol = symbolOf(trade);
    if (!symbol) continue;

    const current = bySymbol.get(symbol);
    if (
      current === undefined ||
      String(trade.exitDate ?? "") >= String(current.exitDate ?? "")
    ) {
      bySymbol.set(symbol, trade);
    }
  }

  return bySymbol;
}

function resolveBaseTimestamp(
  summary: StockAgencySummary | undefined,
  signals: StockAgencySignal[],
) {
  const candidates = [
    summary?.updatedAt,
    ...signals.map((signal) => signal.observedAt),
    ...signals.map((signal) => signal.signalDate),
    "1970-01-01T00:00:00.000Z",
  ];
  const candidate = candidates.find(
    (value) => typeof value === "string" && !Number.isNaN(Date.parse(value)),
  );
  return new Date(candidate as string).toISOString();
}

function requiresHumanApproval(
  signal: StockAgencySignal,
  summary?: StockAgencySummary,
) {
  return (
    isParticipationAction(signal) &&
    (signal.survivalMemory?.recommendation === "wait" ||
      !readinessAllowsParticipation(signal, summary) ||
      signal.judgement?.status === "review_required" ||
      trustRequiresHumanApproval(signal.trustGovernor) ||
      trustRequiresHumanApproval(summary?.trustGovernor))
  );
}

function readinessAllowsParticipation(
  signal: StockAgencySignal,
  summary?: StockAgencySummary,
) {
  if (summary?.productionEligible === true) {
    return true;
  }

  if (
    summary?.promotionBlocked === true ||
    summary?.strategyReadiness?.blocked === true
  ) {
    return false;
  }

  const stage = normalizeToken(
    (summary?.strategyReadiness as { stage?: string } | undefined)?.stage ??
      summary?.readinessLabel,
  );
  const trustGovernor = signal.trustGovernor ?? summary?.trustGovernor;
  const trustAllowsLimitedLive =
    trustGovernor?.allowsNewExposure === true &&
    !trustRequiresHumanApproval(trustGovernor);

  return (
    (stage === "limited-live" || stage === "production-eligible") &&
    trustAllowsLimitedLive
  );
}

function trustRequiresHumanApproval(
  trustGovernor?: TrustGovernorResult | null,
) {
  if (!trustGovernor) {
    return false;
  }

  const hardBlocker = Array.isArray(trustGovernor.blockers)
    ? trustGovernor.blockers.some(
        (blocker) =>
          blocker.severity === "high" || blocker.severity === "critical",
      )
    : false;

  return (
    hardBlocker ||
    (trustGovernor.requiresReview === true &&
      trustGovernor.allowsNewExposure !== true)
  );
}

function maxSizeFor(signal: StockAgencySignal, summary?: StockAgencySummary) {
  if (
    isParticipationAction(signal) &&
    signal.survivalMemory?.recommendation === "wait"
  ) {
    return 0;
  }

  if (signal.trustGovernor && !signal.trustGovernor.allowsNewExposure) {
    return 0;
  }

  if (
    signal.judgement?.status === "blocked" ||
    signal.judgement?.status === "review_required"
  ) {
    return 0;
  }

  const configuredCap =
    finiteNumber(signal.trustGovernor?.maxExposure) ??
    finiteNumber(summary?.trustGovernor?.maxExposure) ??
    finiteNumber(signal.maxPositionPct) ??
    finiteNumber(summary?.maxPositionPct) ??
    finiteNumber(summary?.strategyReadiness?.maxPositionPct);
  const survivalCap = finiteNumber(signal.survivalMemory?.maxExposurePct);
  return Math.max(
    0,
    Math.min(
      configuredCap ?? numeric(signal.suggestedExposure),
      survivalCap ?? Number.POSITIVE_INFINITY,
    ),
  );
}

function confidenceFor(
  signal: StockAgencySignal,
  summary?: StockAgencySummary,
) {
  return round(clamp(calibratedConfidenceFor(signal, summary) / 100, 0, 1));
}

function rawConfidenceFor(
  signal: StockAgencySignal,
  summary?: StockAgencySummary,
) {
  return (
    finiteNumber(signal.rawConfidence) ??
    finiteNumber(signal.signalConfidence) ??
    finiteNumber(signal.setupQuality) ??
    finiteNumber(summary?.rawConfidence) ??
    finiteNumber(summary?.promotionConfidence) ??
    finiteNumber(summary?.strategyReadiness?.rawConfidence) ??
    finiteNumber(summary?.strategyReadiness?.maxConfidence) ??
    finiteNumber(summary?.survivalScore) ??
    50
  );
}

function calibratedConfidenceFor(
  signal: StockAgencySignal,
  summary?: StockAgencySummary,
) {
  return Math.min(
    rawConfidenceFor(signal, summary),
    finiteNumber(signal.calibratedConfidence) ??
      finiteNumber(summary?.calibratedConfidence) ??
      finiteNumber(summary?.strategyReadiness?.calibratedConfidence) ??
      finiteNumber(summary?.strategyReadiness?.maxConfidence) ??
      rawConfidenceFor(signal, summary),
    finiteNumber(signal.trustGovernor?.confidenceCap) ?? 100,
    finiteNumber(signal.trustGovernor?.trustScore) ?? 100,
    finiteNumber(summary?.trustGovernor?.confidenceCap) ?? 100,
    finiteNumber(signal.belief?.confidence) ?? 100,
    finiteNumber(signal.belief?.trustworthiness) ?? 100,
    finiteNumber(signal.judgement?.adjustedConfidence) ?? 100,
    finiteNumber(signal.survivalMemory?.survivalConfidence) ?? 100,
  );
}

function decisionKindFor(signal: StockAgencySignal) {
  if (isParticipationAction(signal)) return "increase_participation";
  if (signal.signalAction === "Sell") return "reduce_participation";
  if (signal.allocationAction === "Blocked") return "blocked_participation";
  return "observe";
}

function expectedOutcomeFor(signal: StockAgencySignal) {
  if (isParticipationAction(signal))
    return "Positive measured follow-through after sized participation.";
  if (signal.signalAction === "Sell")
    return "Lower exposure while risk remains elevated.";
  return "More evidence before taking a sized action.";
}

function sizingRationaleFor(signal: StockAgencySignal) {
  const reasons = Array.isArray(signal.sizingReasons)
    ? signal.sizingReasons.filter(Boolean)
    : [];
  return reasons[0] ?? "Sizing translated from the current strategy decision.";
}

function isParticipationAction(signal: StockAgencySignal) {
  return signal.signalAction === "Buy" && numeric(signal.suggestedExposure) > 0;
}

function traceIdFor(market: string, symbol: string, index: number) {
  return `agency-${cleanId(market)}-${cleanId(symbol)}-${index + 1}`;
}

function durationMs(start?: string, end?: string) {
  const startMs = Date.parse(String(start ?? ""));
  const endMs = Date.parse(String(end ?? ""));
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
    return undefined;
  }

  return endMs - startMs;
}

function symbolOf(value: { symbol?: string; ticker?: string }) {
  return String(value.symbol ?? value.ticker ?? "")
    .trim()
    .toUpperCase();
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  const resolved = finiteNumber(value);
  return resolved === undefined ? null : resolved;
}

function numeric(value: unknown) {
  return finiteNumber(value) ?? 0;
}

function finiteNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function cleanId(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "unknown"
  );
}

function normalizeToken(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-");
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function round(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}
