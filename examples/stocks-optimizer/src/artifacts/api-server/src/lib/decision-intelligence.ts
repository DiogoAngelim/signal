import {
  assessCoherence,
  buildHumanDecisionGuide,
  createAccountabilityReport,
  createDecisionRecord,
  createInMemoryDecisionRecordStore,
  createRealitySnapshot,
  evaluateDecision,
  evaluateOutcome,
  generatePredictionScenarios,
  listDecisionOperations,
  replayDecision,
  simulateDecisionPaths,
  type CoherenceAssessment,
  type DecisionModuleInputs,
  type DecisionPipelineInput,
  type OutcomeEvaluationInput,
  type PredictionInput,
  type SimulationInput,
  type WisdomInput,
} from "@signal/decision";
import { CompactionJob } from "../../../signal-decision-memory/src/compaction";
import {
  createInvestorLearningAssessment,
  type InvestorLearningAssessment,
  type OpportunityRankingInput,
  type RegimeSnapshot,
} from "../../../signal-decision-memory/src/learning";
import { createInMemoryDecisionMemoryStore } from "../../../signal-decision-memory/src/memory-store";
import { NeonPostgresAdapter } from "../../../signal-decision-memory/src/postgres";
import {
  decisionMemoryConfigFromEnv,
  normalizeRetentionTier,
} from "../../../signal-decision-memory/src/retention";
import { summarizeDecisionRecords } from "../../../signal-decision-memory/src/summary";
import type { DecisionMemoryStore } from "../../../signal-decision-memory/src/types";

const decisionStore = createInMemoryDecisionRecordStore();
const sharedDecisionMemory: DecisionMemoryStore = createStocksDecisionMemoryStoreFromEnv({
  ...process.env,
  SIGNAL_SOURCE_ID: process.env.SIGNAL_SOURCE_ID ?? "stocks-optimizer",
});
const SIGNAL_SOURCE_ID = process.env.SIGNAL_SOURCE_ID ?? "stocks-optimizer";
const recentRegimeSnapshots: RegimeSnapshot[] = [];
const MAX_RECENT_REGIME_SNAPSHOTS = 250;
const DECISION_MEMORY_OPERATION_DEFINITIONS = [
  operationDefinition("mutation", "reality.snapshot.record.v1", "Capture a replayable external reality snapshot."),
  operationDefinition("query", "reality.snapshot.get.v1", "Read a captured external reality snapshot."),
  operationDefinition("query", "reality.snapshot.list.v1", "List captured external reality snapshots."),
  operationDefinition("mutation", "decision.record.v1", "Record a durable shared Signal decision."),
  operationDefinition("query", "decision.get.v1", "Read a durable shared Signal decision."),
  operationDefinition("query", "decision.list.v1", "List durable shared Signal decisions."),
  operationDefinition("mutation", "decision.outcome.record.v1", "Record a durable decision outcome."),
  operationDefinition("query", "decision.replay.v1", "Replay a decision from durable memory."),
  operationDefinition("mutation", "decision.memory.compact.v1", "Compact old decision memory into durable lessons."),
  operationDefinition("query", "decision.memory.summary.v1", "Read durable memory summaries."),
  operationDefinition("mutation", "decision.calibration.update.v1", "Record calibration and trust updates."),
  operationDefinition("event", "decision.recorded.v1", "A decision record was saved."),
  operationDefinition("event", "decision.outcome_recorded.v1", "A decision outcome was saved."),
  operationDefinition("event", "decision.compacted.v1", "Decision memory was compacted."),
  operationDefinition("event", "decision.replayed.v1", "A decision was replayed."),
  operationDefinition("event", "decision.calibration_updated.v1", "Calibration or trust history was updated."),
  operationDefinition("event", "reality.snapshot_recorded.v1", "A reality snapshot was saved."),
];

function createStocksDecisionMemoryStoreFromEnv(env: NodeJS.ProcessEnv): DecisionMemoryStore {
  const config = decisionMemoryConfigFromEnv(env);
  if (!config.enabled || config.provider === "memory" || !config.databaseUrl) {
    return createInMemoryDecisionMemoryStore();
  }
  return new NeonPostgresAdapter({
    connectionString: config.databaseUrl,
    source: config.source,
  });
}

function operationDefinition(kind: "query" | "mutation" | "event", name: string, description: string) {
  return {
    name,
    kind,
    description,
    stable: true,
  };
}

export function decisionCapabilitiesPayload() {
  const operations = uniqueOperations([
    ...listDecisionOperations(),
    ...DECISION_MEMORY_OPERATION_DEFINITIONS,
  ]);
  return {
    operations,
    events: operations.filter((operation) => operation.kind === "event"),
    learning: {
      phase: "phase-2",
      answers: [
        "current-thesis",
        "supporting-evidence",
        "contradicting-evidence",
        "similar-regimes",
        "conviction",
        "readiness",
        "mind-change-triggers",
        "opportunity-cost",
        "portfolio-context",
        "investor-narrative",
      ],
    },
  };
}

export function enrichStrategySignals<T extends Record<string, any>>(
  signals: T[],
  context: Record<string, any> = {},
): Array<T & Record<string, any>> {
  return signals.map((signal) => enrichStrategySignal(signal, {
    ...context,
    opportunityCandidates: context["opportunityCandidates"] ?? signals,
  }));
}

export function enrichStrategySignal<T extends Record<string, any>>(
  signal: T,
  context: Record<string, any> = {},
): T & Record<string, any> {
  const input = strategyDecisionInput(signal, context);
  const result = evaluateDecision(input);
  const scale = exposureScale(result, signal);
  const originalExposure = numeric(signal["suggestedExposure"], 0);
  const adjustedExposure = shouldExpose(signal, result.actionAllowed)
    ? clamp(originalExposure * scale, 0, originalExposure)
    : 0;
  const highDownside = result.predictionScenarios.some((scenario) => scenario.downsideRisk >= 72);
  const actionAllowed = result.actionAllowed && scale > 0;
  const sharedRecord = sharedStrategyDecisionRecord({
    record: result.record,
    signal,
    context,
    adjustedExposure,
    originalExposure,
    scale,
    actionAllowed,
  });
  const learning = buildInvestorLearningAssessment({
    sharedRecord,
    signal,
    context,
    result,
    adjustedExposure,
    originalExposure,
    actionAllowed,
    highDownside,
  });
  const decisionIntelligence = {
    coherenceScore: result.coherenceScore,
    coherenceStatus: result.coherenceStatus,
    consensusLevel: result.consensusLevel,
    predictionScenarios: result.predictionScenarios,
    simulationRecommendation: result.simulationRecommendation,
    wisdomDecision: result.wisdomDecision,
    outcomeAccuracy: result.outcomeAccuracy ?? null,
    accountabilitySummary: result.accountabilitySummary,
    decisionReplayAvailable: result.decisionReplayAvailable,
    actionAllowed,
    actionScale: scale,
    realitySnapshotId: sharedRecord.realitySnapshotId,
    humanSummary: sharedRecord.humanSummary,
    guide: buildHumanDecisionGuide(sharedRecord),
    record: sharedRecord,
    memory: {
      source: sharedRecord.source,
      realitySnapshotId: sharedRecord.realitySnapshotId,
      retentionTier: sharedRecord.retentionTier,
      remembered: true,
      summary: "Signal will remember this decision and compare it with the result later.",
    },
    learning,
  };
  const sizingReasons = [
    ...arrayOfStrings(signal["sizingReasons"]),
    sharedRecord.humanSummary,
    ...sharedRecord.coherence.explanation,
  ];

  rememberDecisionRecord(sharedRecord);
  rememberInvestorLearning(learning);

  return {
    ...signal,
    suggestedExposure: adjustedExposure,
    maxPositionPct: Math.min(numeric(signal["maxPositionPct"], adjustedExposure || 5.5), adjustedExposure || numeric(signal["maxPositionPct"], 5.5)),
    signalConfidence: clamp(numeric(signal["signalConfidence"], numeric(signal["setupQuality"], result.coherenceScore)) + result.record.coherence.confidenceAdjustment),
    calibratedConfidence: clamp(numeric(signal["calibratedConfidence"], result.coherenceScore) + result.record.coherence.confidenceAdjustment),
    riskState: riskStateFor(result.coherenceStatus, result.wisdomDecision, result.simulationRecommendation, highDownside),
    allocationAction: allocationActionFor(signal, actionAllowed, result.simulationRecommendation),
    signalStatus: actionAllowed ? signal["signalStatus"] ?? "provided" : signal["signalAction"] === "Buy" ? "blocked" : signal["signalStatus"] ?? "provided",
    sizingMode: sizingModeFor(scale, signal["sizingMode"]),
    sizingReasons,
    humanExplanation: sharedRecord.humanSummary,
    coherenceScore: result.coherenceScore,
    coherenceStatus: result.coherenceStatus,
    consensusLevel: result.consensusLevel,
    predictionScenarios: result.predictionScenarios,
    simulationRecommendation: result.simulationRecommendation,
    wisdomDecision: result.wisdomDecision,
    outcomeAccuracy: result.outcomeAccuracy ?? null,
    accountabilitySummary: result.accountabilitySummary,
    decisionReplayAvailable: result.decisionReplayAvailable,
    actionAllowed,
    actionScale: scale,
    learning,
    decisionIntelligence,
  };
}

export function summarizeStrategyDecisionIntelligence(signals: readonly Record<string, any>[]) {
  const decisions = signals
    .map((signal) => signal["decisionIntelligence"])
    .filter((value): value is Record<string, any> => value != null && typeof value === "object");
  const coherenceScores = decisions.map((decision) => numeric(decision["coherenceScore"], 0));
  const allowedCount = decisions.filter((decision) => decision["actionAllowed"] === true).length;
  const blockedCount = decisions.length - allowedCount;
  return {
    count: decisions.length,
    averageCoherenceScore: coherenceScores.length
      ? Math.round(coherenceScores.reduce((sum, value) => sum + value, 0) / coherenceScores.length)
      : null,
    allowedCount,
    blockedCount,
    primarySummary: String(decisions[0]?.["humanSummary"] ?? "Signal is still forming a decision."),
  };
}

export function evaluateDecisionOperation(payload: any) {
  const input = genericDecisionInput(payload);
  const result = evaluateDecision(input);
  const record = rememberDecisionRecord(result.record);
  return { ...result, record };
}

export function replayDecisionOperation(payload: any) {
  const decisionId = String(payload?.decisionId ?? "").trim();
  const record = decisionStore.get(decisionId);
  if (!record) {
    return {
      decisionId,
      replayResult: "inconclusive",
      explanation: "No stored decision record was found for replay.",
    };
  }
  const current = payload?.currentCoherence
    ? payload.currentCoherence as CoherenceAssessment
    : assessCoherence(moduleInputsFrom(payload?.currentModules ?? payload?.modules ?? {}));
  const replay = replayDecision({ record, currentCoherence: current });
  return {
    replay,
    event: "decision.replayed.v1",
  };
}

export function recordDecisionOutcomeOperation(payload: any) {
  const outcome = evaluateOutcome(outcomeInputFrom(payload));
  const existing = decisionStore.get(outcome.decisionId);
  const coherence = existing?.coherence ?? assessCoherence(moduleInputsFrom(payload?.modules ?? {}));
  const record = createDecisionRecord({
    ...(existing ?? {
      decisionId: outcome.decisionId,
      observation: payload?.observation ?? {},
      coherence,
    }),
    outcome,
  });
  const accountability = createAccountabilityReport({ record, outcome });
  const saved = decisionStore.save({ ...record, accountability });
  rememberDecisionOutcome(outcome);
  rememberDecisionRecord(saved);
  return {
    outcome,
    record: saved,
    event: "decision.outcome_recorded.v1",
  };
}

export async function recordDecisionOperation(payload: any) {
  const record = payload?.record && typeof payload.record === "object"
    ? normalizeSharedRecord(payload.record)
    : normalizeSharedRecord(evaluateDecision(genericDecisionInput(payload)).record);
  const saved = await sharedDecisionMemory.saveDecisionRecord(record);
  decisionStore.save(saved);
  return {
    record: saved,
    event: "decision.recorded.v1",
  };
}

export async function getDecisionOperation(payload: any) {
  const decisionId = String(payload?.decisionId ?? "").trim();
  const record = (await sharedDecisionMemory.getDecisionRecord(decisionId)) ?? decisionStore.get(decisionId);
  return {
    decisionId,
    found: Boolean(record),
    record: record ?? null,
  };
}

export async function listDecisionOperation(payload: any) {
  const retentionTier = retentionTierOrUndefined(payload?.retentionTier);
  const records = await sharedDecisionMemory.listDecisionRecords({
    source: stringOrUndefined(payload?.source),
    ...(retentionTier ? { retentionTier } : {}),
    limit: numberOrUndefined(payload?.limit),
  });
  return {
    records,
    count: records.length,
  };
}

export async function recordDecisionOutcomeOperationAsync(payload: any) {
  const result = recordDecisionOutcomeOperation(payload);
  await sharedDecisionMemory.recordOutcome(result.outcome);
  return result;
}

export async function compactDecisionMemoryOperation(payload: any) {
  return new CompactionJob({ store: sharedDecisionMemory }).run({
    source: stringOrUndefined(payload?.source),
    limit: numberOrUndefined(payload?.limit),
  });
}

export async function decisionMemorySummaryOperation(payload: any) {
  if (payload?.generate === true) {
    const records = await sharedDecisionMemory.listDecisionRecords({
      source: stringOrUndefined(payload?.source),
      limit: numberOrUndefined(payload?.limit) ?? 100,
    });
    const outcomes = await sharedDecisionMemory.listOutcomes();
    await sharedDecisionMemory.saveSummary(summarizeDecisionRecords({
      records,
      outcomes,
      source: stringOrUndefined(payload?.source) ?? records[0]?.source ?? SIGNAL_SOURCE_ID,
    }));
  }
  const summaries = await sharedDecisionMemory.listSummaries({
    source: stringOrUndefined(payload?.source),
    limit: numberOrUndefined(payload?.limit),
  });
  return {
    summaries,
    count: summaries.length,
  };
}

export async function updateDecisionCalibrationOperation(payload: any) {
  const now = new Date().toISOString();
  const decisionId = stringOrUndefined(payload?.decisionId);
  const source = stringOrUndefined(payload?.source) ?? SIGNAL_SOURCE_ID;
  const calibration = await sharedDecisionMemory.recordCalibration({
    calibrationId: stringOrUndefined(payload?.calibrationId) ?? `calibration:${decisionId ?? "global"}:${Date.now()}`,
    ...(decisionId ? { decisionId } : {}),
    source,
    createdAt: stringOrUndefined(payload?.createdAt) ?? now,
    impact: numeric(payload?.calibrationImpact, 0),
    calibration: payload?.calibration ?? payload ?? {},
  });
  const trust = await sharedDecisionMemory.recordTrust({
    trustId: stringOrUndefined(payload?.trustId) ?? `trust:${decisionId ?? "global"}:${Date.now()}`,
    ...(decisionId ? { decisionId } : {}),
    source,
    createdAt: calibration.createdAt,
    impact: numeric(payload?.trustImpact, 0),
    trust: payload?.trust ?? payload ?? {},
  });
  return {
    calibration,
    trust,
    event: "decision.calibration_updated.v1",
  };
}

export function accountabilityGetOperation(payload: any) {
  const decisionId = String(payload?.decisionId ?? "").trim();
  const record = decisionStore.get(decisionId);
  if (!record) {
    return {
      decisionId,
      found: false,
      accountability: null,
    };
  }
  const accountability = record.accountability ?? createAccountabilityReport({ record });
  if (!record.accountability) {
    decisionStore.save({ ...record, accountability });
  }
  return {
    decisionId,
    found: true,
    accountability,
  };
}

export function predictScenariosOperation(payload: any) {
  const scenarios = generatePredictionScenarios(predictionInputFrom(payload));
  return {
    scenarios,
    event: "decision.evaluated.v1",
  };
}

export function simulateOperation(payload: any) {
  const scenarios = Array.isArray(payload?.scenarios)
    ? payload.scenarios
    : generatePredictionScenarios(predictionInputFrom(payload));
  return simulateDecisionPaths({
    simulationId: stringOrUndefined(payload?.simulationId),
    decisionId: stringOrUndefined(payload?.decisionId),
    scenarios,
    actionVariants: Array.isArray(payload?.actionVariants)
      ? payload.actionVariants.map((value: unknown) => String(value))
      : undefined,
    currentExposure: numeric(payload?.currentExposure, 0),
  } satisfies SimulationInput);
}

function buildInvestorLearningAssessment(input: {
  sharedRecord: ReturnType<typeof normalizeSharedRecord>;
  signal: Record<string, any>;
  context: Record<string, any>;
  result: ReturnType<typeof evaluateDecision>;
  adjustedExposure: number;
  originalExposure: number;
  actionAllowed: boolean;
  highDownside: boolean;
}): InvestorLearningAssessment {
  const symbol = String(input.signal["symbol"] ?? input.signal["ticker"] ?? "asset").trim().toUpperCase();
  const venue = String(input.context["market"] ?? input.signal["market"] ?? "").trim().toUpperCase() || "UNKNOWN";
  const recommendation = String(input.signal["allocationAction"] ?? input.signal["signalAction"] ?? input.sharedRecord.action?.["action"] ?? "Observe");
  const confidence = firstNumber([
    input.signal["calibratedConfidence"],
    input.signal["signalConfidence"],
    input.signal["setupQuality"],
    input.result.coherenceScore,
  ], input.result.coherenceScore);
  const trust = firstNumber([
    input.signal["trustworthiness"],
    input.signal["trust"],
    input.signal["judgement"]?.trust,
    input.signal["trustGovernor"]?.trustScore,
    input.context["summary"]?.trustworthiness,
    input.result.coherenceScore,
  ], confidence);
  const riskPressure = firstNumber([
    input.signal["riskPressure"],
    input.signal["judgement"]?.overfitRisk,
    input.context["summary"]?.maxDrawdownPct,
  ], 50);
  const readiness = firstNumber([
    input.signal["readiness"]?.readinessScore,
    input.signal["strategyReadiness"]?.readinessScore,
    input.context["summary"]?.readinessScore,
    input.actionAllowed ? confidence : Math.min(confidence, 42),
  ], input.actionAllowed ? confidence : 35);
  const marketHealth = firstNumber([
    input.context["summary"]?.marketHealth,
    input.context["summary"]?.survivalScore,
    input.signal["marketHealth"],
    100 - riskPressure,
  ], 100 - riskPressure);
  const opportunityDensity = firstNumber([
    input.context["opportunityDiscovery"]?.density,
    input.context["opportunityDiscovery"]?.score,
    input.signal["opportunityDiscovery"]?.score,
    input.signal["discoveryScore"],
    confidence,
  ], confidence);
  const supportingEvidence = uniqueLearningLines([
    input.sharedRecord.humanSummary,
    input.result.accountabilitySummary,
    ...arrayOfStrings(input.signal["sizingReasons"]),
    ...arrayOfStrings(input.signal["sizingRationale"]),
    ...arrayOfStrings(input.result.record.coherence.explanation),
    input.signal["discoveryLifecycle"] ? `Discovery lifecycle: ${input.signal["discoveryLifecycle"]}.` : "",
  ]).slice(0, 8);
  const failedConstraints = Array.isArray(input.signal["sizingConstraints"])
    ? input.signal["sizingConstraints"]
        .filter((constraint: any) => constraint && constraint.passed === false)
        .map((constraint: any) => String(constraint.reason ?? constraint.label ?? "Sizing constraint remains unresolved."))
    : [];
  const contradictionDescriptions = Array.isArray(input.result.record.coherence.contradictions)
    ? input.result.record.coherence.contradictions.map((item) => item.description)
    : [];
  const contradictingEvidence = uniqueLearningLines([
    ...failedConstraints,
    ...contradictionDescriptions,
    input.highDownside ? "Prediction includes high downside risk." : "",
    riskPressure >= 70 ? "Risk pressure is elevated." : "",
    input.adjustedExposure <= 0 && recommendation === "Buy" ? "Exposure has not cleared readiness permission." : "",
  ]).slice(0, 8);
  const missingEvidence = uniqueLearningLines([
    ...arrayOfStrings(input.signal["discovery"]?.missingEvidence),
    ...arrayOfStrings(input.signal["recognition"]?.missingEvidence),
    ...arrayOfStrings(input.signal["trustGovernor"]?.unlockCriteria),
    input.actionAllowed ? "" : "Action permission has not cleared.",
    "More reviewed outcomes for similar regimes.",
  ]).slice(0, 6);
  const invalidationConditions = uniqueLearningLines([
    ...arrayOfStrings(input.signal["discovery"]?.invalidationConditions),
    ...arrayOfStrings(input.signal["recognition"]?.invalidationConditions),
    ...arrayOfStrings(input.signal["trustGovernor"]?.contradictions),
    "Participation deteriorates.",
    "Volatility expands.",
    "Trust falls below the action threshold.",
  ]).slice(0, 8);

  return createInvestorLearningAssessment({
    decisionId: input.sharedRecord.decisionId,
    source: input.sharedRecord.source,
    marketCategory: marketCategoryFor(venue),
    venue,
    symbol,
    recommendation,
    createdAt: input.sharedRecord.createdAt,
    marketHealth,
    riskState: String(input.signal["riskState"] ?? input.context["regime"]?.regime ?? "mixed"),
    riskPressure,
    trust,
    confidence,
    readiness,
    exposure: input.adjustedExposure,
    opportunityDensity,
    volatility: firstNumber([input.signal["volatilityPct"], input.signal["volatility"], riskPressure], riskPressure),
    breadth: firstNumber([input.signal["breadth"], input.context["summary"]?.breadth, marketHealth], marketHealth),
    participation: firstNumber([input.signal["participation"], input.context["summary"]?.participation, opportunityDensity], opportunityDensity),
    supportingEvidence,
    contradictingEvidence,
    missingEvidence,
    invalidationConditions,
    similarRegimeHistory: recentRegimeSnapshots.filter((snapshot) => !venue || snapshot.venue === venue).slice(0, 80),
    alternatives: learningAlternatives(input.context["opportunityCandidates"], input.signal),
    portfolioContext: learningPortfolioContext(input.context, input.signal, {
      riskPressure,
      confidence,
      exposure: input.adjustedExposure,
      originalExposure: input.originalExposure,
    }),
    metadata: {
      realitySnapshotId: input.sharedRecord.realitySnapshotId,
      actionAllowed: input.actionAllowed,
      actionScale: input.result.record.coherence.actionScale,
    },
  });
}

function rememberInvestorLearning(assessment: InvestorLearningAssessment) {
  const existingIndex = recentRegimeSnapshots.findIndex(
    (snapshot) => snapshot.regimeSnapshotId === assessment.regimeSnapshot.regimeSnapshotId,
  );
  if (existingIndex >= 0) recentRegimeSnapshots.splice(existingIndex, 1);
  recentRegimeSnapshots.unshift(assessment.regimeSnapshot);
  if (recentRegimeSnapshots.length > MAX_RECENT_REGIME_SNAPSHOTS) {
    recentRegimeSnapshots.length = MAX_RECENT_REGIME_SNAPSHOTS;
  }

  void Promise.all([
    sharedDecisionMemory.saveThesis(assessment.thesis),
    sharedDecisionMemory.saveRegimeSnapshot(assessment.regimeSnapshot),
    ...(assessment.review ? [sharedDecisionMemory.saveDecisionReview(assessment.review)] : []),
    ...assessment.learningRecords.map((record) => sharedDecisionMemory.saveLearningRecord(record)),
  ]).catch((error) => {
    logDecisionMemoryWarning("investor learning persistence failed", error);
  });
}

function learningAlternatives(value: unknown, fallbackSignal: Record<string, any>): OpportunityRankingInput[] {
  const rows = Array.isArray(value) && value.length ? value : [fallbackSignal];
  return rows
    .map((candidate: any, index) => {
      const symbol = String(candidate?.symbol ?? candidate?.ticker ?? fallbackSignal["symbol"] ?? `candidate-${index + 1}`).trim().toUpperCase();
      const risk = numeric(candidate?.riskPressure, numeric(fallbackSignal["riskPressure"], 50));
      const readiness = firstNumber([
        candidate?.readiness?.readinessScore,
        candidate?.calibratedConfidence,
        candidate?.signalConfidence,
        candidate?.setupQuality,
      ], 45);
      const quality = numeric(candidate?.setupQuality, readiness);
      const trust = firstNumber([
        candidate?.trustworthiness,
        candidate?.trust,
        candidate?.judgement?.trust,
        candidate?.trustGovernor?.trustScore,
      ], readiness);
      const exposure = numeric(candidate?.suggestedExposure, 0);
      return {
        id: symbol,
        label: symbol,
        readiness,
        quality,
        trust,
        risk,
        expectedEdge: numeric(candidate?.expectedMove, 0) + quality * 0.2,
        exposure,
        reasons: arrayOfStrings(candidate?.sizingReasons),
        risks: arrayOfStrings(candidate?.rejectionReason),
      };
    })
    .slice(0, 12);
}

function learningPortfolioContext(
  context: Record<string, any>,
  signal: Record<string, any>,
  values: { riskPressure: number; confidence: number; exposure: number; originalExposure: number },
) {
  const summary = context["summary"];
  if (!isPlainRecord(summary)) return undefined;
  const concentrationRisk = firstNumber([
    signal["concentration"]?.top1TradeContributionPct,
    signal["judgement"]?.overfitRisk,
    summary["maxDrawdownPct"],
    values.riskPressure,
  ], values.riskPressure);
  const expectedRiskAdjustedContribution = Math.max(
    0,
    values.confidence - values.riskPressure * 0.35 + values.exposure * 3,
  );
  return {
    hasData: true,
    concentrationRisk,
    diversificationBenefit: Math.max(0, 100 - concentrationRisk),
    exposureOverlap: values.originalExposure > 0 ? Math.min(100, values.originalExposure * 12) : 0,
    riskContribution: values.riskPressure,
    expectedRiskAdjustedContribution,
    summary: `Portfolio context uses current market summary; expected risk-adjusted contribution is ${Math.round(expectedRiskAdjustedContribution)}/100.`,
    warnings: concentrationRisk >= 70 ? ["Concentration risk is elevated."] : [],
    metadata: {
      configId: summary["configId"],
      tradeCount: summary["tradeCount"],
    },
  };
}

function marketCategoryFor(venue: string) {
  if (/BINANCE|CRYPTO|COIN/i.test(venue)) return "crypto";
  if (/FOREX|FX/i.test(venue)) return "forex";
  if (/BOND|TREASURY/i.test(venue)) return "bonds";
  if (/ETF|INDEX/i.test(venue)) return "indexes";
  return "stocks";
}

function uniqueLearningLines(values: readonly unknown[]) {
  return Array.from(new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean)));
}

function rememberDecisionRecord(record: ReturnType<typeof normalizeSharedRecord>) {
  const normalized = normalizeSharedRecord(record);
  decisionStore.save(normalized);
  void sharedDecisionMemory.saveDecisionRecord(normalized).catch((error) => {
    logDecisionMemoryWarning("decision record persistence failed", error);
  });
  return normalized;
}

function rememberDecisionOutcome(outcome: ReturnType<typeof evaluateOutcome>) {
  void sharedDecisionMemory.recordOutcome(outcome).catch((error) => {
    logDecisionMemoryWarning("decision outcome persistence failed", error);
  });
}

function normalizeSharedRecord(record: any) {
  const source = String(record?.source ?? SIGNAL_SOURCE_ID);
  const createdAt = String(record?.createdAt ?? new Date().toISOString());
  const observation = record?.observation ?? {};
  const realitySnapshot = record?.realitySnapshot ?? createRealitySnapshot({
    snapshotId: stringOrUndefined(record?.realitySnapshotId) ?? `reality:${record?.decisionId ?? Date.now()}`,
    source,
    createdAt,
    payload: observation,
    metadata: {
      decisionId: String(record?.decisionId ?? "decision:unknown"),
      capture: "derived-from-decision-record",
    },
  });
  return {
    ...record,
    createdAt,
    observation,
    coherence: normalizeCoherenceAssessment(record?.coherence, record?.modules),
    source,
    realitySnapshotId: realitySnapshot.snapshotId,
    realitySnapshot,
    retentionTier: normalizeRetentionTier(record?.retentionTier),
  };
}

function normalizeCoherenceAssessment(value: any, modules: any = {}): CoherenceAssessment {
  const fallback = assessCoherence(moduleInputsFrom(modules));
  const score = numberOrUndefined(value?.score) ?? fallback.score;
  const status = coherenceStatusOrUndefined(value?.status) ?? fallback.status;
  return {
    score,
    status,
    contradictions: Array.isArray(value?.contradictions) ? value.contradictions : fallback.contradictions,
    consensusLevel: numberOrUndefined(value?.consensusLevel) ?? fallback.consensusLevel,
    actionAllowed: typeof value?.actionAllowed === "boolean" ? value.actionAllowed : fallback.actionAllowed,
    actionScale: numberOrUndefined(value?.actionScale) ?? fallback.actionScale,
    trustAdjustment: numberOrUndefined(value?.trustAdjustment) ?? fallback.trustAdjustment,
    agencyAdjustment: numberOrUndefined(value?.agencyAdjustment) ?? fallback.agencyAdjustment,
    confidenceAdjustment: numberOrUndefined(value?.confidenceAdjustment) ?? fallback.confidenceAdjustment,
    explanation: Array.isArray(value?.explanation) ? value.explanation.map((line: unknown) => String(line)) : fallback.explanation,
  };
}

function sharedStrategyDecisionRecord(input: {
  record: ReturnType<typeof evaluateDecision>["record"];
  signal: Record<string, any>;
  context: Record<string, any>;
  adjustedExposure: number;
  originalExposure: number;
  scale: number;
  actionAllowed: boolean;
}) {
  const symbol = String(input.signal["symbol"] ?? input.signal["ticker"] ?? "asset").trim();
  const market = String(input.context["market"] ?? input.signal["market"] ?? "").trim().toUpperCase();
  const trust = firstNumber([
    input.signal["trustworthiness"],
    input.signal["trust"],
    input.signal["trustGovernor"]?.trustScore,
    input.context["summary"]?.trustworthiness,
  ], input.record.coherence.score);
  const confidence = firstNumber([
    input.signal["calibratedConfidence"],
    input.signal["signalConfidence"],
    input.signal["setupQuality"],
    input.record.coherence.score,
  ], input.record.coherence.score);
  const marketState = input.context["regime"] ?? {
    regime: input.signal["regime"] ?? input.context["summary"]?.regime,
    survivalScore: input.context["summary"]?.survivalScore,
  };
  return normalizeSharedRecord({
    ...input.record,
    source: SIGNAL_SOURCE_ID,
    observation: {
      ...(isPlainRecord(input.record.observation) ? input.record.observation : { value: input.record.observation }),
      marketVenue: market,
      marketState,
      selectedAssets: symbol ? [symbol] : [],
      confidence,
      trust,
      coherenceScore: input.record.coherence.score,
      wisdomDecision: input.record.wisdom?.decision,
      predictionScenarios: input.record.prediction,
      simulationResult: input.record.simulation,
      suggestedExposure: input.adjustedExposure,
      requestedExposure: input.originalExposure,
      positionSizing: {
        scale: input.scale,
        sizingMode: input.signal["sizingMode"],
        sizingResult: input.signal["sizingResult"],
        maxPositionPct: input.signal["maxPositionPct"],
      },
      actionAllowed: input.actionAllowed,
      humanExplanation: input.record.humanSummary,
      timestamp: input.record.createdAt,
    },
    action: {
      ...(isPlainRecord(input.record.action) ? input.record.action : {}),
      action: input.signal["allocationAction"] ?? input.signal["signalAction"] ?? "Hold",
      symbol,
      allowed: input.actionAllowed,
      requestedExposure: input.originalExposure,
      suggestedExposure: input.adjustedExposure,
      scale: input.scale,
    },
    retentionTier: "hot",
  });
}

function uniqueOperations<T extends { name: string }>(operations: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const operation of operations) {
    if (seen.has(operation.name)) continue;
    seen.add(operation.name);
    result.push(operation);
  }
  return result;
}

function retentionTierOrUndefined(value: unknown) {
  if (value === "hot" || value === "warm" || value === "cold" || value === "expired") return value;
  return undefined;
}

function coherenceStatusOrUndefined(value: unknown): CoherenceAssessment["status"] | undefined {
  if (
    value === "aligned" ||
    value === "stable" ||
    value === "tension" ||
    value === "unstable" ||
    value === "contradictory" ||
    value === "blocked"
  ) {
    return value;
  }
  return undefined;
}

let decisionMemoryWarningLogged = false;

function logDecisionMemoryWarning(message: string, error: unknown) {
  if (decisionMemoryWarningLogged) return;
  decisionMemoryWarningLogged = true;
  console.warn(message, error instanceof Error ? error.message : String(error));
}

function strategyDecisionInput(signal: Record<string, any>, context: Record<string, any>): DecisionPipelineInput {
  const symbol = String(signal["symbol"] ?? signal["ticker"] ?? "asset").trim();
  const action = String(signal["allocationAction"] ?? signal["signalAction"] ?? "Hold");
  const marketVenue = String(context["market"] ?? signal["market"] ?? "").trim().toUpperCase();
  const setupQuality = numeric(signal["setupQuality"], 50);
  const riskPressure = numeric(signal["riskPressure"], 50);
  const expectedMove = numeric(signal["expectedMove"], numeric(signal["changePercent"], 0));
  const trust = firstNumber([
    signal["trustworthiness"],
    signal["trust"],
    signal["trustGovernor"]?.trustScore,
    signal["judgement"]?.trust,
    signal["judgement"]?.reliability,
    context["summary"]?.trustworthiness,
  ], setupQuality);
  const calibration = firstNumber([
    signal["calibratedConfidence"],
    signal["judgement"]?.calibration,
    context["summary"]?.calibratedConfidence,
    trust,
  ], trust);
  const recovery = firstNumber([
    signal["recovery"]?.recoveryScore,
    signal["restorationProgress"]?.progressPct,
    signal["restorationProgress"]?.restorationProgress,
    100 - riskPressure,
  ], 100 - riskPressure);
  const historyReliability = firstNumber([
    context["summary"]?.survivalScore,
    signal["survivalMemory"]?.survivalConfidence,
    signal["judgement"]?.survivalMemory?.survivalConfidence,
    setupQuality,
  ], setupQuality);
  const modules: DecisionModuleInputs = {
    discovery: firstNumber([signal["discoveryScore"], signal["opportunityDiscovery"]?.score, setupQuality], setupQuality),
    judgment: firstNumber([signal["signalConfidence"], signal["judgement"]?.adjustedConfidence, setupQuality], setupQuality),
    purpose: action === "Buy" ? clamp(setupQuality - riskPressure * 0.15) : 64,
    need: clamp(50 + Math.abs(expectedMove) * 5 + Math.max(0, setupQuality - 60) * 0.4),
    trust,
    reflection: firstNumber([context["summary"]?.readinessScore, calibration], calibration),
    recovery,
    memory: historyReliability,
    learning: firstNumber([context["summary"]?.tradeCount != null ? Math.min(100, Number(context["summary"].tradeCount) * 2) : undefined, historyReliability], historyReliability),
    calibration,
    identity: action === "Buy" && riskPressure > 72 ? 42 : 68,
    awareness: firstNumber([signal["executionQuality"]?.score, signal["executionQuality"]?.qualityScore, 100 - riskPressure], 100 - riskPressure),
    agency: action === "Buy" ? clamp(55 + numeric(signal["suggestedExposure"], 0) * 5) : action === "Sell" ? 58 : 42,
  };
  const realitySnapshot = marketRealitySnapshot({
    signal,
    context,
    symbol,
    marketVenue,
    action,
    setupQuality,
    riskPressure,
    expectedMove,
    trust,
    calibration,
    recovery,
    historyReliability,
  });

  return {
    decisionId: String(signal["decisionId"] ?? `${context["market"] ?? "market"}:${symbol}:${action}:${context["summary"]?.updatedAt ?? "latest"}`),
    source: SIGNAL_SOURCE_ID,
    realitySnapshotId: realitySnapshot.snapshotId,
    realitySnapshot,
    observation: {
      market: marketVenue,
      marketVenue,
      source: SIGNAL_SOURCE_ID,
      symbol,
      selectedAssets: [symbol],
      action,
      setupQuality,
      riskPressure,
      expectedMove,
      regime: signal["regime"] ?? context["regime"]?.regime,
    },
    modules,
    prediction: {
      currentScore: setupQuality,
      expectedReward: clamp(setupQuality + Math.max(0, expectedMove) * 4),
      expectedRisk: riskPressure,
      uncertainty: 100 - calibration,
      purposeAlignment: modules.purpose as number,
      needAlignment: modules.need as number,
      confidence: calibration,
      labels: [
        "market improves",
        "market weakens",
        "market remains flat",
        "volatility expands",
        "liquidity drops",
        "signal succeeds",
        "signal fails",
      ],
    } satisfies PredictionInput,
    wisdom: {
      expectedReward: clamp(setupQuality + Math.max(0, expectedMove) * 4),
      downsideRisk: clamp(riskPressure + Math.max(0, -expectedMove) * 8),
      irreversibleRisk: clamp(riskPressure * 0.85 + numeric(signal["suggestedExposure"], 0) * 4),
      survivalPriority: 88,
      longTermAlignment: historyReliability,
      shortTermTemptation: clamp(setupQuality + Math.max(0, expectedMove) * 5),
      confidence: calibration,
    } satisfies WisdomInput,
    action: {
      action,
      symbol,
      requestedExposure: signal["suggestedExposure"],
    },
    retentionTier: "hot",
  };
}

function marketRealitySnapshot(input: {
  signal: Record<string, any>;
  context: Record<string, any>;
  symbol: string;
  marketVenue: string;
  action: string;
  setupQuality: number;
  riskPressure: number;
  expectedMove: number;
  trust: number;
  calibration: number;
  recovery: number;
  historyReliability: number;
}) {
  const timestamp = String(
    input.signal["timestamp"] ??
      input.signal["updatedAt"] ??
      input.context["summary"]?.updatedAt ??
      new Date().toISOString(),
  );
  const marketState = input.context["regime"] ?? {
    regime: input.signal["regime"] ?? input.context["summary"]?.regime ?? "unknown",
    survivalScore: input.context["summary"]?.survivalScore,
    riskPressure: input.riskPressure,
  };
  const indicatorSnapshot = {
    setupQuality: input.setupQuality,
    riskPressure: input.riskPressure,
    expectedMove: input.expectedMove,
    trust: input.trust,
    calibration: input.calibration,
    recovery: input.recovery,
    historyReliability: input.historyReliability,
    suggestedExposure: numeric(input.signal["suggestedExposure"], 0),
    signalAction: input.signal["signalAction"] ?? input.action,
  };
  const sourceRef = {
    sourceId: SIGNAL_SOURCE_ID,
    sourceType: "api" as const,
    reliabilityScore: input.trust,
    freshnessWindowMs: numeric(process.env.STOCK_SIGNAL_SNAPSHOT_FRESHNESS_MS, 15 * 60 * 1000),
    metadata: {
      adapter: "stocks-optimizer",
      rawHistoryStored: false,
    },
  };

  return createRealitySnapshot({
    snapshotId: [
      "reality",
      SIGNAL_SOURCE_ID,
      input.marketVenue || "market",
      input.symbol || "asset",
      timestamp,
    ].map(snapshotSegment).join(":"),
    source: SIGNAL_SOURCE_ID,
    createdAt: timestamp,
    dataQuality: clamp((input.setupQuality + input.trust + input.calibration + input.historyReliability) / 4),
    freshnessScore: freshnessScoreFrom(timestamp, sourceRef.freshnessWindowMs),
    payload: {
      marketVenue: input.marketVenue,
      marketState,
      assetUniverse: input.symbol ? [input.symbol] : [],
      indicatorSnapshot,
      timestamp,
    },
    sourceRef,
    metadata: {
      domain: "finance",
      storagePolicy: "decision-explanation-only",
      rawHistoricalMarketDataStored: false,
    },
  });
}

function genericDecisionInput(payload: any): DecisionPipelineInput {
  if (payload?.modules) {
    return {
      decisionId: String(payload.decisionId ?? `decision:${Date.now()}`),
      source: stringOrUndefined(payload.source) ?? SIGNAL_SOURCE_ID,
      createdAt: stringOrUndefined(payload.createdAt),
      realitySnapshotId: stringOrUndefined(payload.realitySnapshotId),
      realitySnapshot: payload.realitySnapshot,
      observation: payload.observation ?? {},
      modules: moduleInputsFrom(payload.modules),
      prediction: predictionInputFrom(payload.prediction ?? payload),
      wisdom: payload.wisdom,
      action: payload.action,
      outcome: payload.outcome,
    };
  }

  return strategyDecisionInput(payload?.signal ?? payload ?? {}, payload?.context ?? {});
}

function moduleInputsFrom(value: any): DecisionModuleInputs {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return {};
  return value as DecisionModuleInputs;
}

function predictionInputFrom(value: any): PredictionInput {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return {};
  return {
    decisionId: stringOrUndefined(value.decisionId),
    currentScore: numberOrUndefined(value.currentScore),
    expectedReward: numberOrUndefined(value.expectedReward),
    expectedRisk: numberOrUndefined(value.expectedRisk),
    uncertainty: numberOrUndefined(value.uncertainty),
    purposeAlignment: numberOrUndefined(value.purposeAlignment),
    needAlignment: numberOrUndefined(value.needAlignment),
    confidence: numberOrUndefined(value.confidence),
    labels: Array.isArray(value.labels) ? value.labels.map((label: unknown) => String(label)) : undefined,
    assumptions: Array.isArray(value.assumptions) ? value.assumptions.map((assumption: unknown) => String(assumption)) : undefined,
  };
}

function outcomeInputFrom(value: any): OutcomeEvaluationInput {
  return {
    outcomeId: stringOrUndefined(value?.outcomeId),
    decisionId: String(value?.decisionId ?? "decision:unknown"),
    horizon: value?.horizon,
    expectedConfidence: numberOrUndefined(value?.expectedConfidence),
    expectedRisk: numberOrUndefined(value?.expectedRisk),
    actualSuccessScore: numberOrUndefined(value?.actualSuccessScore),
    purposeAlignment: numberOrUndefined(value?.purposeAlignment),
    needAlignment: numberOrUndefined(value?.needAlignment),
    realizedReward: numberOrUndefined(value?.realizedReward),
    riskTaken: numberOrUndefined(value?.riskTaken),
    unexpected: value?.unexpected === true,
    inconclusive: value?.inconclusive === true,
    lessons: Array.isArray(value?.lessons) ? value.lessons.map((lesson: unknown) => String(lesson)) : undefined,
  };
}

function exposureScale(result: ReturnType<typeof evaluateDecision>, signal: Record<string, any>): number {
  let scale = result.actionScale;
  if (result.coherenceScore < 40) scale = 0;
  else if (result.coherenceScore < 60) scale = Math.min(scale, 0.1);
  else if (result.coherenceScore < 75) scale = Math.min(scale, 0.45);
  else if (result.coherenceScore < 90) scale = Math.min(scale, 0.75);
  if (result.wisdomDecision === "avoid") scale = 0;
  if (result.simulationRecommendation === "wait" || result.simulationRecommendation === "block") scale = 0;
  if (result.predictionScenarios.some((scenario) => scenario.downsideRisk >= 72)) scale *= 0.65;
  if (result.outcomeAccuracy != null && result.outcomeAccuracy < 55) scale *= 0.75;
  if (String(signal["signalAction"] ?? "").toLowerCase() !== "buy") scale = 0;
  return Number(clamp(scale, 0, 1).toFixed(3));
}

function shouldExpose(signal: Record<string, any>, actionAllowed: boolean): boolean {
  return actionAllowed && String(signal["signalAction"] ?? "").toLowerCase() === "buy";
}

function allocationActionFor(
  signal: Record<string, any>,
  actionAllowed: boolean,
  simulationRecommendation: string,
): string {
  const action = String(signal["allocationAction"] ?? signal["signalAction"] ?? "Hold");
  if (String(signal["signalAction"] ?? "").toLowerCase() !== "buy") return action;
  if (!actionAllowed) return "Blocked";
  if (simulationRecommendation === "wait") return "Watch";
  return action;
}

function sizingModeFor(scale: number, fallback: unknown): string {
  if (scale <= 0) return "none";
  if (scale <= 0.15) return "micro";
  if (scale <= 0.45) return "small";
  if (scale <= 0.75) return "normal";
  return String(fallback ?? "normal");
}

function riskStateFor(
  coherenceStatus: string,
  wisdomDecision: string,
  simulationRecommendation: string,
  highDownside: boolean,
): string {
  if (wisdomDecision === "avoid" || simulationRecommendation === "block" || coherenceStatus === "blocked") return "blocked";
  if (simulationRecommendation === "wait") return "wait";
  if (highDownside || coherenceStatus === "contradictory") return "reduced-risk";
  return "decision-aware";
}

function firstNumber(values: readonly unknown[], fallback: number): number {
  for (const value of values) {
    const number = numberOrUndefined(value);
    if (number !== undefined) return clamp(number);
  }
  return clamp(fallback);
}

function numberOrUndefined(value: unknown): number | undefined {
  if (value == null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function numeric(value: unknown, fallback = 0): number {
  return numberOrUndefined(value) ?? fallback;
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function freshnessScoreFrom(timestamp: string, freshnessWindowMs: number): number {
  const createdAt = Date.parse(timestamp);
  if (!Number.isFinite(createdAt)) return 50;
  const ageMs = Math.max(0, Date.now() - createdAt);
  if (ageMs <= freshnessWindowMs) return 100;
  return clamp(100 - ((ageMs - freshnessWindowMs) / Math.max(freshnessWindowMs, 1)) * 50);
}

function snapshotSegment(value: unknown): string {
  const text = String(value ?? "").trim().toLowerCase();
  return text.replace(/[^a-z0-9_.-]+/g, "-") || "unknown";
}

function stringOrUndefined(value: unknown): string | undefined {
  const text = String(value ?? "").trim();
  return text || undefined;
}

function arrayOfStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? "").trim()).filter(Boolean);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}
