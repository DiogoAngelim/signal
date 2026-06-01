import { describe, expect, it } from "vitest";
import { assessCoherence, createDecisionRecord, createRealitySnapshot, evaluateOutcome } from "@signal/decision";
import {
  BeliefDecayEngine,
  CalibrationEngine,
  CompactionJob,
  ProcessQualityEngine,
  RegimeMemoryEngine,
  ThesisEngine,
  MemoryLifecycle,
  SIGNAL_DECISION_MEMORY_MIGRATION_SQL,
  applyBeliefDecay,
  buildCalibrationRecord,
  buildMindChangeTriggers,
  buildProcessQualityRecord,
  createDecisionMemoryOperations,
  createInvestorLearningAssessment,
  createInMemoryDecisionMemoryStore,
  createLearningRecordFromReview,
  decisionMemoryConfigFromEnv,
  findSimilarRegimes,
  listDecisionMemoryOperations,
  rankOpportunities,
  retentionTierForCreatedAt,
  summarizeDecisionRecords,
  updateThesisStatus,
  validateDecisionRecord,
  validateRegimeSnapshot,
  validateThesis,
  type RegimeSnapshot,
} from "../src";

describe("@signal/decision-memory", () => {
  it("loads environment configuration with Neon/Postgres defaults", () => {
    const config = decisionMemoryConfigFromEnv({
      DATABASE_URL: "postgresql://user:pass@host.neon.tech/db?sslmode=require",
      SIGNAL_MEMORY_ENABLED: "true",
      SIGNAL_MEMORY_PROVIDER: "postgres",
      SIGNAL_SOURCE_ID: "stocks-optimizer",
      SIGNAL_MEMORY_RETENTION_HOT_DAYS: "10",
      SIGNAL_MEMORY_RETENTION_WARM_DAYS: "90",
      SIGNAL_MEMORY_RETENTION_COLD_DAYS: "180",
    });

    expect(config.enabled).toBe(true);
    expect(config.provider).toBe("postgres");
    expect(config.source).toBe("stocks-optimizer");
    expect(config.retentionPolicy).toMatchObject({ hotDays: 10, warmDays: 90, coldDays: 180 });
  });

  it("classifies hot, warm, cold, and expired retention tiers", () => {
    const now = new Date("2026-05-31T00:00:00.000Z");
    expect(retentionTierForCreatedAt("2026-05-20T00:00:00.000Z", undefined, now)).toBe("hot");
    expect(retentionTierForCreatedAt("2026-03-01T00:00:00.000Z", undefined, now)).toBe("warm");
    expect(retentionTierForCreatedAt("2025-08-01T00:00:00.000Z", undefined, now)).toBe("cold");
    expect(retentionTierForCreatedAt("2025-01-01T00:00:00.000Z", undefined, now)).toBe("expired");
    expect(new MemoryLifecycle().shouldCompact(record("warm", "2026-01-01T00:00:00.000Z"), now)).toBe(true);
  });

  it("stores decisions, outcomes, replay snapshots, calibration, trust, and summaries in memory", async () => {
    const store = createInMemoryDecisionMemoryStore();
    const realitySnapshot = createRealitySnapshot({
      snapshotId: "reality:decision:1",
      source: "stocks-optimizer",
      createdAt: "2026-05-31T00:00:00.000Z",
      dataQuality: 92,
      freshnessScore: 88,
      payload: { marketVenue: "BINANCE", assetUniverse: ["BTCUSDT"] },
    });
    await store.saveRealitySnapshot(realitySnapshot);
    const saved = await store.saveDecisionRecord(record("decision:1"));
    const outcome = evaluateOutcome({
      decisionId: saved.decisionId,
      actualSuccessScore: 82,
      expectedConfidence: 76,
      expectedRisk: 38,
    });
    await store.recordOutcome(outcome);
    await store.saveReplaySnapshot({
      snapshotId: "replay:1",
      decisionId: saved.decisionId,
      createdAt: saved.createdAt,
      source: saved.source,
      snapshot: { replay: true },
      retentionTier: "hot",
    });
    await store.recordCalibration({
      calibrationId: "calibration:1",
      decisionId: saved.decisionId,
      source: saved.source,
      createdAt: saved.createdAt,
      impact: outcome.calibrationImpact,
      calibration: { confidence: 76 },
    });
    await store.recordTrust({
      trustId: "trust:1",
      decisionId: saved.decisionId,
      source: saved.source,
      createdAt: saved.createdAt,
      impact: outcome.trustImpact,
      trust: { trust: 80 },
    });
    const summary = summarizeDecisionRecords({ records: [saved], outcomes: [outcome] });
    await store.saveSummary(summary);

    expect(await store.getDecisionRecord(saved.decisionId)).toMatchObject({ decisionId: saved.decisionId });
    expect(await store.getRealitySnapshot("reality:decision:1")).toMatchObject({ source: "stocks-optimizer" });
    expect(await store.listRealitySnapshots({ source: "stocks-optimizer" })).not.toHaveLength(0);
    expect(await store.listOutcomes(saved.decisionId)).toHaveLength(1);
    expect(await store.listReplaySnapshots(saved.decisionId)).toHaveLength(1);
    expect(await store.listCalibrationHistory(saved.decisionId)).toHaveLength(1);
    expect(await store.listTrustHistory(saved.decisionId)).toHaveLength(1);
    expect(await store.listSummaries({ source: saved.source })).toHaveLength(1);
  });

  it("validates learning models and stores learning records without duplicating decision storage", async () => {
    const store = createInMemoryDecisionMemoryStore();
    const assessment = createInvestorLearningAssessment({
      decisionId: "phase2:BTCUSDT",
      source: "stocks-optimizer",
      marketCategory: "crypto",
      venue: "BINANCE",
      symbol: "BTCUSDT",
      recommendation: "Buy small",
      marketHealth: 74,
      riskPressure: 34,
      trust: 76,
      confidence: 82,
      readiness: 73,
      exposure: 2,
      opportunityDensity: 62,
      volatility: 38,
      breadth: 67,
      participation: 71,
      supportingEvidence: ["Trend, timing, and coherence support a small entry."],
      contradictingEvidence: ["Volatility expansion would invalidate full sizing."],
      missingEvidence: ["More reviewed outcomes for this regime."],
      invalidationConditions: ["Invalidate if participation deteriorates."],
    });

    expect(validateThesis(assessment.thesis)).toEqual({ valid: true, errors: [] });
    expect(validateRegimeSnapshot(assessment.regimeSnapshot)).toEqual({ valid: true, errors: [] });
    expect(validateDecisionRecord(assessment.decisionRecord)).toEqual({ valid: true, errors: [] });
    expect(assessment.calibration.reliabilityTrend).toBe("insufficient-data");
    expect(assessment.processQuality.processQualityScore).toBeGreaterThan(0);
    expect(assessment.beliefFreshness.status).toBe("fresh");
    expect(assessment.disconfirmation.question).toBe("What could make this wrong?");
    await store.saveEvidence(assessment.evidence.supporting[0]!);
    await store.saveThesis(assessment.thesis);
    await store.saveRegimeSnapshot(assessment.regimeSnapshot);
    await store.saveCalibrationRecord(assessment.calibration);
    await store.saveProcessQualityRecord(assessment.processQuality);
    for (const learning of assessment.learningRecords) await store.saveLearningRecord(learning);

    expect(await store.listEvidence({ source: "stocks-optimizer" })).toHaveLength(1);
    expect(await store.getThesis(assessment.thesis.thesisId)).toMatchObject({ title: assessment.thesis.title });
    expect(await store.getRegimeSnapshot(assessment.regimeSnapshot.regimeSnapshotId)).toMatchObject({ venue: "BINANCE" });
    expect(await store.listCalibrationRecords({ decisionId: assessment.decisionRecord.decisionId })).toHaveLength(1);
    expect(await store.listProcessQualityRecords({ decisionId: assessment.decisionRecord.decisionId })).toHaveLength(1);
    expect(await store.listTheses({ source: "stocks-optimizer" })).toHaveLength(1);
    expect(await store.listRegimeSnapshots({ venue: "BINANCE" })).toHaveLength(1);
    expect(await store.listLearningRecords({ source: "stocks-optimizer" })).toHaveLength(0);
    expect(assessment.emptyStates).toContain("Outcome learning starts after decisions are reviewed.");
  });

  it("matches similar regimes, separates conviction from readiness, and creates reflection lessons", async () => {
    const current = regime("current", 74, 76, 73, "Buy small");
    const similar = regime("similar", 70, 72, 70, "Buy small", {
      classification: "correct",
      summary: "Small entries worked after breadth stayed firm.",
    });
    const distant = regime("distant", 28, 35, 20, "Avoid");

    const matches = findSimilarRegimes(current, [similar, distant], { threshold: 0.75 });
    expect(matches).toHaveLength(1);
    expect(matches[0]?.whatHappened).toContain("Small entries worked");

    const assessment = createInvestorLearningAssessment({
      decisionId: "phase2:review",
      source: "stocks-optimizer",
      marketCategory: "stocks",
      venue: "US",
      symbol: "AAPL",
      recommendation: "Watch",
      confidence: 82,
      trust: 52,
      readiness: 44,
      exposure: 0,
      riskPressure: 42,
      similarRegimeHistory: [similar],
      supportingEvidence: ["Quality is high."],
      outcome: {
        outcomeId: "outcome:review",
        decisionId: "phase2:review",
        source: "stocks-optimizer",
        recordedAt: "2026-06-01T00:00:00.000Z",
        classification: "early",
        summary: "The thesis worked later, but readiness was not present at decision time.",
        lessons: ["Confidence was high, but readiness was too early."],
      },
    });
    expect(assessment.review).not.toBeNull();
    const review = assessment.review!;
    const calibration = buildCalibrationRecord({
      decisionRecord: assessment.decisionRecord,
      outcome: {
        outcomeId: "outcome:calibration",
        decisionId: "phase2:review",
        source: "stocks-optimizer",
        recordedAt: "2026-06-01T00:00:00.000Z",
        classification: "wrong",
        confidenceAccuracy: 20,
        summary: "Confidence was too high.",
        lessons: ["Lower confidence in similar weak-readiness states."],
      },
    });
    const process = buildProcessQualityRecord({
      decisionRecord: assessment.decisionRecord,
      outcome: assessment.review
        ? {
            outcomeId: "outcome:process",
            decisionId: "phase2:review",
            source: "stocks-optimizer",
            recordedAt: "2026-06-01T00:00:00.000Z",
            classification: "early",
            summary: "The decision was early.",
            lessons: ["Readiness lagged conviction."],
          }
        : undefined,
    });

    expect(assessment.conviction.confidence).toBe(82);
    expect(assessment.readiness.actionJustified).toBe(false);
    expect(assessment.readiness.actionLanguage).toBe("watch");
    expect(review.classification).toBe("early");
    expect(calibration.overconfidenceSignal).toBe(true);
    expect(process.learningNote).toMatch(/process|outcome/i);
    expect(createLearningRecordFromReview(review).lesson).toContain("readiness");
  });

  it("tracks thesis state transitions, disconfirmation, mind changes, opportunity ranking, horizons, and portfolio fallbacks", () => {
    const assessment = createInvestorLearningAssessment({
      decisionId: "phase2:rank",
      source: "stocks-optimizer",
      marketCategory: "stocks",
      venue: "US",
      symbol: "MSFT",
      recommendation: "Buy small",
      confidence: 78,
      trust: 74,
      readiness: 76,
      exposure: 2,
      riskPressure: 30,
      opportunityDensity: 68,
      supportingEvidence: ["Earnings trend supports the thesis."],
      contradictingEvidence: ["Invalidate if breadth weakens."],
      invalidationConditions: ["Similar regimes begin failing."],
      alternatives: [
        { id: "MSFT", label: "MSFT", readiness: 76, quality: 82, trust: 74, risk: 30, exposure: 2 },
        { id: "TSLA", label: "TSLA", readiness: 38, quality: 80, trust: 50, risk: 82, exposure: 0 },
      ],
    });
    const updated = updateThesisStatus(assessment.thesis, {
      contradictingEvidence: [{
        evidenceId: "evidence:invalidating",
        observedAt: "2026-05-31T00:00:00.000Z",
        label: "Invalidation",
        description: "Breadth collapse invalidates the thesis.",
        direction: "contradicting",
        strength: 94,
        confidence: 90,
        invalidates: true,
      }],
    });
    const triggers = buildMindChangeTriggers({
      thesis: assessment.thesis,
      current: assessment.regimeSnapshot,
      similarRegimes: [],
    });
    const ranking = rankOpportunities([
      { id: "A", label: "A", readiness: 80, quality: 75, trust: 75, risk: 25, exposure: 2 },
      { id: "B", label: "B", readiness: 35, quality: 70, trust: 70, risk: 40, exposure: 0 },
    ]);

    expect(updated.status).toBe("invalidated");
    expect(triggers.some((trigger) => trigger.label === "Similar regimes begin failing.")).toBe(true);
    expect(ranking.bestOpportunity?.label).toBe("A");
    expect(ranking.notReadyYet.map((item) => item.label)).toContain("B");
    expect(assessment.horizons.map((view) => view.horizon)).toEqual(["short-term", "medium-term", "long-term"]);
    expect(assessment.portfolioContext.summary).toContain("Portfolio context is unavailable");
    expect(assessment.narrative.action).toContain("readiness");
  });

  it("exposes engine facades for durable investor judgment behaviors", () => {
    const thesis = new ThesisEngine().create({
      source: "stocks-optimizer",
      createdAt: "2026-01-01T00:00:00.000Z",
      venue: "US",
      symbol: "AAPL",
      recommendation: "Watch",
      confidence: 80,
      supportingEvidence: [{
        evidenceId: "evidence:old",
        observedAt: "2026-01-01T00:00:00.000Z",
        label: "Old evidence",
        description: "Old evidence supported the thesis.",
        direction: "supporting",
        strength: 80,
        confidence: 80,
      }],
    });
    const decayed = applyBeliefDecay(thesis, "2026-03-15T00:00:00.000Z");
    const memory = new RegimeMemoryEngine([regime("similar", 72, 74, 70, "Watch")]);
    const current = regime("current-engine", 73, 73, 69, "Watch");
    const process = new ProcessQualityEngine().evaluate({
      decisionRecord: createInvestorLearningAssessment({
        decisionId: "phase2:engine",
        source: "stocks-optimizer",
        venue: "US",
        symbol: "AAPL",
        recommendation: "Watch",
        confidence: 70,
        trust: 70,
        readiness: 60,
        supportingEvidence: ["Current evidence supports watching."],
        invalidationConditions: ["Invalidate if breadth weakens."],
      }).decisionRecord,
    });
    const calibration = new CalibrationEngine().evaluate({
      decisionRecord: createInvestorLearningAssessment({
        decisionId: "phase2:calibration-engine",
        source: "stocks-optimizer",
        venue: "US",
        symbol: "MSFT",
        recommendation: "Watch",
        confidence: 70,
      }).decisionRecord,
    });

    expect(new BeliefDecayEngine().evaluate(thesis, "2026-03-15T00:00:00.000Z").status).toBe("stale");
    expect(decayed.confidence).toBeLessThan(thesis.confidence);
    expect(memory.findSimilar(current, { threshold: 0.7 })).toHaveLength(1);
    expect(process.processQualityScore).toBeGreaterThan(0);
    expect(calibration.explanation).toContain("Calibration will improve");
  });

  it("compacts old records into lessons and removes expired raw inputs", async () => {
    const store = createInMemoryDecisionMemoryStore();
    await store.saveDecisionRecord(record("warm-decision", "2026-01-01T00:00:00.000Z"));
    await store.saveDecisionRecord(record("expired-decision", "2025-01-01T00:00:00.000Z"));

    const result = await new CompactionJob({ store }).run({
      now: new Date("2026-05-31T00:00:00.000Z"),
    });

    expect(result.compacted).toBe(1);
    expect(result.expired).toBe(1);
    expect(await store.getDecisionRecord("expired-decision")).toBeUndefined();
    expect((await store.getDecisionRecord("warm-decision"))?.observation).toMatchObject({ compacted: true });
    expect(await store.listSummaries()).not.toHaveLength(0);
  });

  it("exposes versioned operations and executable handlers", async () => {
    const store = createInMemoryDecisionMemoryStore();
    const operations = createDecisionMemoryOperations(store);
    const realityOperation = operations.find((operation) => operation.name === "reality.snapshot.record.v1");
    const recordOperation = operations.find((operation) => operation.name === "decision.record.v1");
    const summaryOperation = operations.find((operation) => operation.name === "decision.memory.summary.v1");

    expect(listDecisionMemoryOperations().map((operation) => operation.name)).toContain("decision.memory.compact.v1");
    expect(listDecisionMemoryOperations().map((operation) => operation.name)).toContain("reality.snapshot.record.v1");
    await realityOperation?.handler({
      snapshotId: "reality:operation:1",
      source: "stocks-optimizer",
      payload: { marketVenue: "BINANCE" },
    });
    expect(recordOperation).toBeTruthy();
    await recordOperation?.handler({
      decisionId: "operation:1",
      observation: { venue: "BINANCE" },
      source: "stocks-optimizer",
      modules: { discovery: 80, trust: 72, purpose: 70, recovery: 80 },
    });
    const summary = await summaryOperation?.handler({ generate: true, source: "stocks-optimizer" });
    expect(summary).toMatchObject({ count: 1 });
    expect(await store.getRealitySnapshot("reality:operation:1")).toMatchObject({ source: "stocks-optimizer" });
  });

  it("ships idempotent Postgres migrations for all shared memory tables", () => {
    for (const table of [
      "signal_decision_records",
      "signal_reality_snapshots",
      "signal_outcomes",
      "signal_evidence",
      "signal_theses",
      "signal_regime_snapshots",
      "signal_replay_snapshots",
      "signal_decision_reviews",
      "signal_learning_records",
      "signal_calibration_records",
      "signal_process_quality_records",
      "signal_calibration_history",
      "signal_trust_history",
      "signal_memory_summaries",
      "signal_retention_jobs",
    ]) {
      expect(SIGNAL_DECISION_MEMORY_MIGRATION_SQL).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    }
    expect(SIGNAL_DECISION_MEMORY_MIGRATION_SQL).toContain("CREATE INDEX IF NOT EXISTS");
  });
});

function record(decisionId: string, createdAt = "2026-05-31T00:00:00.000Z") {
  return createDecisionRecord({
    decisionId,
    createdAt,
    source: "stocks-optimizer",
    observation: { raw: "payload", duplicatedMarketSnapshot: Array.from({ length: 10 }, (_, index) => index) },
    coherence: assessCoherence({
      discovery: 80,
      judgment: 76,
      purpose: 72,
      need: 70,
      trust: 74,
      recovery: 78,
      calibration: 75,
      agency: 62,
    }),
    action: { action: "Buy", requestedExposure: 2 },
    retentionTier: "hot",
  });
}

function regime(
  id: string,
  marketHealth: number,
  trust: number,
  readiness: number,
  recommendation: string,
  outcome?: RegimeSnapshot["eventualOutcome"],
): RegimeSnapshot {
  return {
    regimeSnapshotId: `regime:${id}`,
    source: "stocks-optimizer",
    marketCategory: "stocks",
    venue: "US",
    timestamp: "2026-05-31T00:00:00.000Z",
    marketHealth,
    riskState: marketHealth > 60 ? "contained" : "elevated",
    trust,
    confidence: trust,
    readiness,
    exposureGuidance: readiness > 60 ? 2 : 0,
    opportunityDensity: marketHealth,
    volatility: 40,
    breadth: marketHealth,
    participation: marketHealth,
    finalRecommendation: recommendation,
    ...(outcome ? { eventualOutcome: outcome } : {}),
  };
}
