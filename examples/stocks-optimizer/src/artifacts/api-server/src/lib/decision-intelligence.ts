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
import {
  CompactionJob,
  createDecisionMemoryStoreFromEnv,
  listDecisionMemoryOperations,
  normalizeRetentionTier,
  summarizeDecisionRecords,
  type DecisionMemoryStore,
} from "@signal/decision-memory";

const decisionStore = createInMemoryDecisionRecordStore();
const sharedDecisionMemory: DecisionMemoryStore = createDecisionMemoryStoreFromEnv({
  ...process.env,
  SIGNAL_SOURCE_ID: process.env.SIGNAL_SOURCE_ID ?? "stocks-optimizer",
});
const SIGNAL_SOURCE_ID = process.env.SIGNAL_SOURCE_ID ?? "stocks-optimizer";

export function decisionCapabilitiesPayload() {
  const operations = uniqueOperations([
    ...listDecisionOperations(),
    ...listDecisionMemoryOperations(),
  ]);
  return {
    operations,
    events: operations.filter((operation) => operation.kind === "event"),
  };
}

export function enrichStrategySignals<T extends Record<string, any>>(
  signals: T[],
  context: Record<string, any> = {},
): Array<T & Record<string, any>> {
  return signals.map((signal) => enrichStrategySignal(signal, context));
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
  };
  const sizingReasons = [
    ...arrayOfStrings(signal["sizingReasons"]),
    sharedRecord.humanSummary,
    ...sharedRecord.coherence.explanation,
  ];

  rememberDecisionRecord(sharedRecord);

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
