import {
  assessCoherence,
  createDecisionRecord,
  createRealitySnapshot,
  evaluateOutcome,
} from "@signal/decision";
import { describe, expect, it } from "vitest";
import {
  BeliefDecayEngine,
  CalibrationEngine,
  CompactionJob,
  MemoryLifecycle,
  NeonPostgresAdapter,
  ProcessQualityEngine,
  RegimeMemoryEngine,
  type RegimeSnapshot,
  SIGNAL_DECISION_MEMORY_MIGRATION_SQL,
  ThesisEngine,
  applyBeliefDecay,
  buildCalibrationRecord,
  buildMindChangeTriggers,
  buildProcessQualityRecord,
  createDecisionMemoryContractAdapter,
  createDecisionMemoryOperations,
  createInMemoryDecisionMemoryStore,
  createInvestorLearningAssessment,
  createLearningRecordFromReview,
  decisionMemoryConfigFromEnv,
  findSimilarRegimes,
  listDecisionMemoryOperations,
  memoryStorageDecisionId,
  rankOpportunities,
  retentionTierForCreatedAt,
  summarizeDecisionRecords,
  updateThesisStatus,
  validateDecisionRecord,
  validateRegimeSnapshot,
  validateThesis,
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
    expect(config.retentionPolicy).toMatchObject({
      hotDays: 10,
      warmDays: 90,
      coldDays: 180,
    });
  });

  it("classifies hot, warm, cold, and expired retention tiers", () => {
    const now = new Date("2026-05-31T00:00:00.000Z");
    expect(
      retentionTierForCreatedAt("2026-05-20T00:00:00.000Z", undefined, now),
    ).toBe("hot");
    expect(
      retentionTierForCreatedAt("2026-03-01T00:00:00.000Z", undefined, now),
    ).toBe("warm");
    expect(
      retentionTierForCreatedAt("2025-08-01T00:00:00.000Z", undefined, now),
    ).toBe("cold");
    expect(
      retentionTierForCreatedAt("2025-01-01T00:00:00.000Z", undefined, now),
    ).toBe("expired");
    expect(
      new MemoryLifecycle().shouldCompact(
        record("warm", "2026-01-01T00:00:00.000Z"),
        now,
      ),
    ).toBe(true);
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
    const summary = summarizeDecisionRecords({
      records: [saved],
      outcomes: [outcome],
    });
    await store.saveSummary(summary);

    expect(await store.getDecisionRecord(saved.decisionId)).toMatchObject({
      decisionId: saved.decisionId,
    });
    expect(await store.getRealitySnapshot("reality:decision:1")).toMatchObject({
      source: "stocks-optimizer",
    });
    expect(
      await store.listRealitySnapshots({ source: "stocks-optimizer" }),
    ).not.toHaveLength(0);
    expect(await store.listOutcomes(saved.decisionId)).toHaveLength(1);
    expect(await store.listReplaySnapshots(saved.decisionId)).toHaveLength(1);
    expect(await store.listCalibrationHistory(saved.decisionId)).toHaveLength(
      1,
    );
    expect(await store.listTrustHistory(saved.decisionId)).toHaveLength(1);
    expect(await store.listSummaries({ source: saved.source })).toHaveLength(1);
  });

  it("enforces scoped append-only memory contracts and reconstructs the decision timeline", async () => {
    const store = createInMemoryDecisionMemoryStore();
    const memory = createDecisionMemoryContractAdapter(store);
    const scope = {
      appId: "stocks-optimizer",
      domain: "capital-allocation",
      decisionId: "decision:scoped:1",
      timestamp: "2026-06-01T12:00:00.000Z",
    };

    await expect(
      memory.recordDecision({
        scope: undefined as never,
        modules: { discovery: 80 },
      }),
    ).rejects.toThrow(/scope/i);

    const decision = await memory.recordDecision({
      scope,
      correlationId: "corr:scoped:1",
      observation: { symbol: "AAPL" },
      modules: { discovery: 82, trust: 76, calibration: 70, recovery: 80 },
      action: { action: "Buy small" },
    });
    const outcome = await memory.recordOutcome({
      scope: { ...scope, timestamp: "2026-06-02T12:00:00.000Z" },
      actualSuccessScore: 78,
      expectedConfidence: 74,
      lessons: ["Small sizing preserved recovery capacity."],
    });
    const review = await memory.recordReview({
      scope: { ...scope, timestamp: "2026-06-03T12:00:00.000Z" },
      classification: "correct",
      whatWasRecommended: "Buy small",
      whyRecommended:
        "Evidence and survival memory supported limited exposure.",
      whatHappened: "The position worked without breaching survival limits.",
      lesson:
        "Keep reduced-size entries when recovery evidence is still maturing.",
    });
    const lesson = await memory.recordLesson({
      scope: { ...scope, timestamp: "2026-06-04T12:00:00.000Z" },
      lesson:
        "Reduced-size exposure can preserve optionality in recovering regimes.",
      changes: ["Keep survival memory above sizing pressure."],
    });

    await expect(
      memory.recordDecision({
        scope,
        modules: { discovery: 82 },
      }),
    ).rejects.toThrow(/append-only/i);

    const timeline = await memory.timeline({ scope });
    const calibration = await memory.queryCalibration({ scope });

    expect(decision.decisionId).toBe(memoryStorageDecisionId(scope));
    expect(decision.originalDecisionId).toBe(scope.decisionId);
    expect(outcome.originalDecisionId).toBe(scope.decisionId);
    expect(review.decisionId).toBe(decision.decisionId);
    expect(lesson.decisionId).toBe(decision.decisionId);
    expect(timeline.entries.map((entry) => entry.kind)).toEqual([
      "Decision",
      "Outcome",
      "Review",
      "Lesson",
    ]);
    expect(timeline.orphanLessons).toHaveLength(0);
    expect(calibration.historicalCalibration.sampleSize).toBe(1);
    expect(calibration.confidenceAccuracy).toBeGreaterThan(0);
  });

  it("hard-isolates Stocks Optimizer and Emergency Awareness memory", async () => {
    const store = createInMemoryDecisionMemoryStore();
    const memory = createDecisionMemoryContractAdapter(store);
    const stocksScope = {
      appId: "stocks-optimizer",
      domain: "capital-allocation",
      decisionId: "shared-decision-id",
      timestamp: "2026-06-01T12:00:00.000Z",
    };
    const emergencyScope = {
      appId: "emergency-awareness",
      domain: "climate-risk",
      decisionId: "shared-decision-id",
      timestamp: "2026-06-01T12:05:00.000Z",
    };

    await memory.recordDecision({
      scope: stocksScope,
      observation: { symbol: "MSFT" },
      modules: { discovery: 75, trust: 72 },
      action: { action: "Watch" },
    });
    await memory.recordLesson({
      scope: { ...stocksScope, timestamp: "2026-06-02T12:00:00.000Z" },
      lesson: "Capital allocation lesson stays in Stocks Optimizer.",
    });
    await memory.recordDecision({
      scope: emergencyScope,
      observation: { concern: "heat-alert" },
      modules: { discovery: 78, trust: 74, reflection: 70 },
      action: { action: "Escalate warning" },
    });
    await memory.recordLesson({
      scope: { ...emergencyScope, timestamp: "2026-06-02T13:00:00.000Z" },
      lesson: "Emergency warning lesson stays in Emergency Awareness.",
    });

    const stocksTimeline = await memory.timeline({ scope: stocksScope });
    const emergencyTimeline = await memory.timeline({ scope: emergencyScope });
    const stocksStats = await memory.stats({
      scope: { appId: "stocks-optimizer", domain: "capital-allocation" },
    });
    const emergencyStats = await memory.stats({
      scope: { appId: "emergency-awareness", domain: "climate-risk" },
    });

    expect(
      stocksTimeline.lessons.map((item) => item.lesson).join(" "),
    ).toContain("Stocks Optimizer");
    expect(
      stocksTimeline.lessons.map((item) => item.lesson).join(" "),
    ).not.toContain("Emergency Awareness");
    expect(
      emergencyTimeline.lessons.map((item) => item.lesson).join(" "),
    ).toContain("Emergency Awareness");
    expect(
      emergencyTimeline.lessons.map((item) => item.lesson).join(" "),
    ).not.toContain("Stocks Optimizer");
    expect(stocksStats).toMatchObject({ decisions: 1, lessons: 1 });
    expect(emergencyStats).toMatchObject({ decisions: 1, lessons: 1 });
  });

  it("uses existing regime similarity behind similarity.query.v1 semantics", async () => {
    const store = createInMemoryDecisionMemoryStore();
    const memory = createDecisionMemoryContractAdapter(store);
    const currentScope = {
      appId: "stocks-optimizer",
      domain: "capital-allocation",
      decisionId: "similarity-current",
      timestamp: "2026-06-01T12:00:00.000Z",
    };
    const priorScope = {
      ...currentScope,
      decisionId: "similarity-prior",
      timestamp: "2026-05-01T12:00:00.000Z",
    };

    await memory.recordDecision({
      scope: priorScope,
      modules: { discovery: 80, trust: 75, calibration: 70 },
      action: { action: "Buy small" },
    });
    await memory.recordOutcome({
      scope: { ...priorScope, timestamp: "2026-05-03T12:00:00.000Z" },
      actualSuccessScore: 82,
      expectedConfidence: 76,
      lessons: ["Similar limited entries worked."],
    });
    await memory.recordLesson({
      scope: { ...priorScope, timestamp: "2026-05-04T12:00:00.000Z" },
      lesson: "Similar limited entries worked.",
    });
    await memory.recordDecision({
      scope: currentScope,
      modules: { discovery: 81, trust: 74, calibration: 72 },
      action: { action: "Buy small" },
    });

    const result = await memory.querySimilarity({
      scope: currentScope,
      threshold: 0.5,
    });

    expect(result.similarCases[0]?.decisionId).toBe(priorScope.decisionId);
    expect(result.similarCases[0]?.similarityScore).toBeGreaterThan(0.5);
    expect(result.lessonReferences).toHaveLength(1);
    expect(result.outcomeDistribution.correct).toBe(1);
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
      supportingEvidence: [
        "Trend, timing, and coherence support a small entry.",
      ],
      contradictingEvidence: [
        "Volatility expansion would invalidate full sizing.",
      ],
      missingEvidence: ["More reviewed outcomes for this regime."],
      invalidationConditions: ["Invalidate if participation deteriorates."],
    });

    expect(validateThesis(assessment.thesis)).toEqual({
      valid: true,
      errors: [],
    });
    expect(validateRegimeSnapshot(assessment.regimeSnapshot)).toEqual({
      valid: true,
      errors: [],
    });
    expect(validateDecisionRecord(assessment.decisionRecord)).toEqual({
      valid: true,
      errors: [],
    });
    expect(assessment.calibration.reliabilityTrend).toBe("insufficient-data");
    expect(assessment.processQuality.processQualityScore).toBeGreaterThan(0);
    expect(assessment.beliefFreshness.status).toBe("fresh");
    expect(assessment.disconfirmation.question).toBe(
      "What could make this wrong?",
    );
    const supportingEvidence = assessment.evidence.supporting[0];
    if (!supportingEvidence) throw new Error("Expected supporting evidence");
    await store.saveEvidence(supportingEvidence);
    await store.saveThesis(assessment.thesis);
    await store.saveRegimeSnapshot(assessment.regimeSnapshot);
    await store.saveCalibrationRecord(assessment.calibration);
    await store.saveProcessQualityRecord(assessment.processQuality);
    for (const learning of assessment.learningRecords)
      await store.saveLearningRecord(learning);

    expect(
      await store.listEvidence({ source: "stocks-optimizer" }),
    ).toHaveLength(1);
    expect(await store.getThesis(assessment.thesis.thesisId)).toMatchObject({
      title: assessment.thesis.title,
    });
    expect(
      await store.getRegimeSnapshot(assessment.regimeSnapshot.regimeSnapshotId),
    ).toMatchObject({ venue: "BINANCE" });
    expect(
      await store.listCalibrationRecords({
        decisionId: assessment.decisionRecord.decisionId,
      }),
    ).toHaveLength(1);
    expect(
      await store.listProcessQualityRecords({
        decisionId: assessment.decisionRecord.decisionId,
      }),
    ).toHaveLength(1);
    expect(await store.listTheses({ source: "stocks-optimizer" })).toHaveLength(
      1,
    );
    expect(await store.listRegimeSnapshots({ venue: "BINANCE" })).toHaveLength(
      1,
    );
    expect(
      await store.listLearningRecords({ source: "stocks-optimizer" }),
    ).toHaveLength(0);
    expect(assessment.emptyStates).toContain(
      "Outcome learning starts after decisions are reviewed.",
    );
  });

  it("matches similar regimes, separates conviction from readiness, and creates reflection lessons", async () => {
    const current = regime("current", 74, 76, 73, "Buy small");
    const similar = regime("similar", 70, 72, 70, "Buy small", {
      classification: "correct",
      summary: "Small entries worked after breadth stayed firm.",
    });
    const distant = regime("distant", 28, 35, 20, "Avoid");

    const matches = findSimilarRegimes(current, [similar, distant], {
      threshold: 0.75,
    });
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
        summary:
          "The thesis worked later, but readiness was not present at decision time.",
        lessons: ["Confidence was high, but readiness was too early."],
      },
    });
    expect(assessment.review).not.toBeNull();
    const review = assessment.review;
    if (!review) throw new Error("Expected review");
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
    expect(createLearningRecordFromReview(review).lesson).toContain(
      "readiness",
    );
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
        {
          id: "MSFT",
          label: "MSFT",
          readiness: 76,
          quality: 82,
          trust: 74,
          risk: 30,
          exposure: 2,
        },
        {
          id: "TSLA",
          label: "TSLA",
          readiness: 38,
          quality: 80,
          trust: 50,
          risk: 82,
          exposure: 0,
        },
      ],
    });
    const updated = updateThesisStatus(assessment.thesis, {
      contradictingEvidence: [
        {
          evidenceId: "evidence:invalidating",
          observedAt: "2026-05-31T00:00:00.000Z",
          label: "Invalidation",
          description: "Breadth collapse invalidates the thesis.",
          direction: "contradicting",
          strength: 94,
          confidence: 90,
          invalidates: true,
        },
      ],
    });
    const triggers = buildMindChangeTriggers({
      thesis: assessment.thesis,
      current: assessment.regimeSnapshot,
      similarRegimes: [],
    });
    const ranking = rankOpportunities([
      {
        id: "A",
        label: "A",
        readiness: 80,
        quality: 75,
        trust: 75,
        risk: 25,
        exposure: 2,
      },
      {
        id: "B",
        label: "B",
        readiness: 35,
        quality: 70,
        trust: 70,
        risk: 40,
        exposure: 0,
      },
    ]);

    expect(updated.status).toBe("invalidated");
    expect(
      triggers.some(
        (trigger) => trigger.label === "Similar regimes begin failing.",
      ),
    ).toBe(true);
    expect(ranking.bestOpportunity?.label).toBe("A");
    expect(ranking.notReadyYet.map((item) => item.label)).toContain("B");
    expect(assessment.horizons.map((view) => view.horizon)).toEqual([
      "short-term",
      "medium-term",
      "long-term",
    ]);
    expect(assessment.portfolioContext.summary).toContain(
      "Portfolio context is unavailable",
    );
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
      supportingEvidence: [
        {
          evidenceId: "evidence:old",
          observedAt: "2026-01-01T00:00:00.000Z",
          label: "Old evidence",
          description: "Old evidence supported the thesis.",
          direction: "supporting",
          strength: 80,
          confidence: 80,
        },
      ],
    });
    const decayed = applyBeliefDecay(thesis, "2026-03-15T00:00:00.000Z");
    const memory = new RegimeMemoryEngine([
      regime("similar", 72, 74, 70, "Watch"),
    ]);
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

    expect(
      new BeliefDecayEngine().evaluate(thesis, "2026-03-15T00:00:00.000Z")
        .status,
    ).toBe("stale");
    expect(decayed.confidence).toBeLessThan(thesis.confidence);
    expect(memory.findSimilar(current, { threshold: 0.7 })).toHaveLength(1);
    expect(process.processQualityScore).toBeGreaterThan(0);
    expect(calibration.explanation).toContain("Calibration will improve");
  });

  it("compacts old records into lessons and removes expired raw inputs", async () => {
    const store = createInMemoryDecisionMemoryStore();
    await store.saveDecisionRecord(
      record("warm-decision", "2026-01-01T00:00:00.000Z"),
    );
    await store.saveDecisionRecord(
      record("expired-decision", "2025-01-01T00:00:00.000Z"),
    );

    const result = await new CompactionJob({ store }).run({
      now: new Date("2026-05-31T00:00:00.000Z"),
    });

    expect(result.compacted).toBe(1);
    expect(result.expired).toBe(1);
    expect(await store.getDecisionRecord("expired-decision")).toBeUndefined();
    expect(
      (await store.getDecisionRecord("warm-decision"))?.observation,
    ).toMatchObject({ compacted: true });
    expect(await store.listSummaries()).not.toHaveLength(0);
  });

  it("exposes versioned operations and executable handlers", async () => {
    const store = createInMemoryDecisionMemoryStore();
    const operations = createDecisionMemoryOperations(store);
    const realityOperation = operations.find(
      (operation) => operation.name === "reality.snapshot.record.v1",
    );
    const recordOperation = operations.find(
      (operation) => operation.name === "decision.record.v1",
    );
    const outcomeOperation = operations.find(
      (operation) => operation.name === "outcome.record.v1",
    );
    const timelineOperation = operations.find(
      (operation) => operation.name === "memory.timeline.v1",
    );
    const summaryOperation = operations.find(
      (operation) => operation.name === "decision.memory.summary.v1",
    );
    const scope = {
      appId: "stocks-optimizer",
      domain: "capital-allocation",
      decisionId: "operation:1",
      timestamp: "2026-06-01T00:00:00.000Z",
    };

    expect(
      listDecisionMemoryOperations().map((operation) => operation.name),
    ).toContain("decision.memory.compact.v1");
    expect(
      listDecisionMemoryOperations().map((operation) => operation.name),
    ).toContain("reality.snapshot.record.v1");
    expect(
      listDecisionMemoryOperations().map((operation) => operation.name),
    ).toContain("outcome.record.v1");
    expect(
      listDecisionMemoryOperations().map((operation) => operation.name),
    ).toContain("memory.timeline.v1");
    await realityOperation?.handler({
      scope,
      snapshotId: "reality:operation:1",
      source: "stocks-optimizer",
      payload: { marketVenue: "BINANCE" },
    });
    expect(recordOperation).toBeTruthy();
    await recordOperation?.handler({
      scope,
      observation: { venue: "BINANCE" },
      source: "stocks-optimizer",
      modules: { discovery: 80, trust: 72, purpose: 70, recovery: 80 },
    });
    await outcomeOperation?.handler({
      scope: { ...scope, timestamp: "2026-06-02T00:00:00.000Z" },
      actualSuccessScore: 82,
      expectedConfidence: 76,
    });
    const timeline = await timelineOperation?.handler({ scope });
    const summary = await summaryOperation?.handler({ scope, generate: true });
    expect(summary).toMatchObject({ count: 1 });
    expect(timeline).toMatchObject({ entries: expect.any(Array) });
    expect(await store.getRealitySnapshot("reality:operation:1")).toMatchObject(
      { source: "stocks-optimizer" },
    );
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
      expect(SIGNAL_DECISION_MEMORY_MIGRATION_SQL).toContain(
        `CREATE TABLE IF NOT EXISTS ${table}`,
      );
    }
    expect(SIGNAL_DECISION_MEMORY_MIGRATION_SQL).toContain(
      "CREATE INDEX IF NOT EXISTS",
    );
  });

  it("maps Neon/Postgres persistence calls through SQL rows without a live database", async () => {
    const pool = new FakePool();
    const adapter = new NeonPostgresAdapter({
      pool: pool as never,
      autoMigrate: false,
      source: "signal-test",
    });
    const decision = record("postgres-decision");
    const outcome = evaluateOutcome({
      decisionId: decision.decisionId,
      actualSuccessScore: 80,
      expectedConfidence: 72,
      expectedRisk: 30,
    });
    const assessment = createInvestorLearningAssessment({
      decisionId: decision.decisionId,
      source: "signal-test",
      marketCategory: "stocks",
      venue: "US",
      symbol: "AAPL",
      recommendation: "Watch",
      confidence: 70,
      supportingEvidence: ["Evidence supports watching."],
      outcome: {
        outcomeId: "outcome:postgres-review",
        decisionId: decision.decisionId,
        source: "signal-test",
        recordedAt: "2026-06-01T00:00:00.000Z",
        classification: "inconclusive",
        summary: "The outcome is still forming.",
        lessons: ["Wait for more evidence."],
      },
    });
    const realitySnapshot = createRealitySnapshot({
      snapshotId: "reality:postgres-decision",
      source: "signal-test",
      createdAt: "2026-06-01T00:00:00.000Z",
      dataQuality: 88,
      freshnessScore: 84,
      payload: { market: "US" },
    });
    const replay = {
      snapshotId: "replay:postgres",
      decisionId: decision.decisionId,
      source: "signal-test",
      createdAt: "2026-06-01T00:00:00.000Z",
      retentionTier: "hot" as const,
      snapshot: { replay: true },
    };
    const summary = summarizeDecisionRecords({
      records: [decision],
      outcomes: [outcome],
    });
    const retentionJob = {
      jobId: "retention:postgres",
      jobType: "compact" as const,
      status: "running" as const,
      startedAt: "2026-06-01T00:00:00.000Z",
      policy: { hotDays: 30, warmDays: 120, coldDays: 365 },
    };

    await adapter.migrate();
    await adapter.saveRealitySnapshot(realitySnapshot);
    await adapter.saveDecisionRecord(decision);
    await adapter.recordOutcome(outcome);
    await adapter.saveReplaySnapshot(replay);
    await adapter.recordCalibration({
      calibrationId: "calibration:postgres",
      decisionId: decision.decisionId,
      source: "signal-test",
      createdAt: "2026-06-01T00:00:00.000Z",
      impact: 4,
      calibration: { confidence: 72 },
    });
    await adapter.recordTrust({
      trustId: "trust:postgres",
      decisionId: decision.decisionId,
      source: "signal-test",
      createdAt: "2026-06-01T00:00:00.000Z",
      impact: 3,
      trust: { trust: 75 },
    });
    await adapter.saveSummary(summary);
    const supporting = assessment.evidence.supporting[0];
    if (!supporting) throw new Error("Expected supporting evidence");
    await adapter.saveEvidence(supporting);
    await adapter.saveThesis(assessment.thesis);
    await adapter.saveRegimeSnapshot(assessment.regimeSnapshot);
    if (!assessment.review) throw new Error("Expected review");
    await adapter.saveDecisionReview(assessment.review);
    const learningRecord = assessment.learningRecords[0];
    if (!learningRecord) throw new Error("Expected learning record");
    await adapter.saveLearningRecord(learningRecord);
    await adapter.saveCalibrationRecord(assessment.calibration);
    await adapter.saveProcessQualityRecord(assessment.processQuality);
    await adapter.saveRetentionJob(retentionJob);

    expect(
      await adapter.getRealitySnapshot(realitySnapshot.snapshotId),
    ).toMatchObject({
      source: "signal-test",
    });
    expect(
      await adapter.listRealitySnapshots({ source: "signal-test", limit: 2 }),
    ).toHaveLength(1);
    expect(await adapter.getDecisionRecord(decision.decisionId)).toMatchObject({
      decisionId: decision.decisionId,
      realitySnapshot: expect.objectContaining({ source: "signal-test" }),
    });
    expect(
      await adapter.listDecisionRecords({
        source: "signal-test",
        retentionTier: "hot",
      }),
    ).toHaveLength(1);
    expect(await adapter.listOutcomes(decision.decisionId)).toHaveLength(1);
    expect(await adapter.listReplaySnapshots(decision.decisionId)).toEqual([
      replay,
    ]);
    expect(
      await adapter.listCalibrationHistory(decision.decisionId),
    ).toHaveLength(1);
    expect(await adapter.listTrustHistory(decision.decisionId)).toHaveLength(1);
    expect(
      await adapter.listSummaries({ source: "signal-test", limit: 1 }),
    ).toHaveLength(1);
    expect(await adapter.listEvidence({ source: "signal-test" })).toHaveLength(
      1,
    );
    expect(await adapter.getThesis(assessment.thesis.thesisId)).toMatchObject({
      thesisId: assessment.thesis.thesisId,
    });
    expect(await adapter.listTheses({ source: "signal-test" })).toHaveLength(1);
    expect(
      await adapter.getRegimeSnapshot(
        assessment.regimeSnapshot.regimeSnapshotId,
      ),
    ).toMatchObject({
      venue: "US",
    });
    expect(await adapter.listRegimeSnapshots({ venue: "US" })).toHaveLength(1);
    expect(
      await adapter.listDecisionReviews({ decisionId: decision.decisionId }),
    ).toHaveLength(1);
    expect(
      await adapter.listLearningRecords({ decisionId: decision.decisionId }),
    ).toHaveLength(1);
    expect(
      await adapter.listCalibrationRecords({ decisionId: decision.decisionId }),
    ).toHaveLength(1);
    expect(
      await adapter.listProcessQualityRecords({
        decisionId: decision.decisionId,
      }),
    ).toHaveLength(1);
    expect(
      await adapter.updateRetentionJob("retention:postgres", {
        status: "completed",
        completedAt: "2026-06-01T00:01:00.000Z",
        result: { compacted: 1 },
      }),
    ).toMatchObject({ status: "completed", result: { compacted: 1 } });
    expect(
      await adapter.updateRetentionJob("retention:missing", {
        status: "failed",
      }),
    ).toBeUndefined();

    await adapter.deleteDecisionRecord(decision.decisionId);
    await adapter.close();

    expect(pool.closed).toBe(true);
    expect(
      pool.calls.some((call) => call.sql.includes("signal_decision_records")),
    ).toBe(true);
    expect(
      pool.calls.some(
        (call) => call.sql === SIGNAL_DECISION_MEMORY_MIGRATION_SQL,
      ),
    ).toBe(true);
  });
});

class FakePool {
  readonly calls: Array<{ sql: string; params: unknown[] }> = [];
  closed = false;

  async query(sqlInput: unknown, params: unknown[] = []) {
    const sql = String(sqlInput);
    this.calls.push({ sql, params });

    if (sql.includes("signal_reality_snapshots")) {
      return { rows: [realityRow()] };
    }
    if (sql.includes("signal_decision_records") && sql.includes("SELECT")) {
      return { rows: [decisionRow()] };
    }
    if (sql.includes("SELECT outcome")) {
      return { rows: [{ outcome: outcomeRow() }] };
    }
    if (sql.includes("signal_replay_snapshots") && sql.includes("SELECT")) {
      return { rows: [replayRow()] };
    }
    if (sql.includes("signal_calibration_history") && sql.includes("SELECT")) {
      return { rows: [calibrationHistoryRow()] };
    }
    if (sql.includes("signal_trust_history") && sql.includes("SELECT")) {
      return { rows: [trustHistoryRow()] };
    }
    if (sql.includes("signal_memory_summaries") && sql.includes("SELECT")) {
      return { rows: [summaryRow()] };
    }
    if (sql.includes("SELECT evidence")) {
      return { rows: [{ evidence: evidenceRow() }] };
    }
    if (sql.includes("signal_theses") && sql.includes("SELECT")) {
      return { rows: [thesisRow()] };
    }
    if (sql.includes("signal_regime_snapshots") && sql.includes("SELECT")) {
      return { rows: [regimeRow()] };
    }
    if (sql.includes("SELECT review")) {
      return { rows: [{ review: reviewRow() }] };
    }
    if (sql.includes("SELECT learning")) {
      return { rows: [{ learning: learningRow() }] };
    }
    if (sql.includes("SELECT calibration")) {
      return { rows: [{ calibration: calibrationRecordRow() }] };
    }
    if (sql.includes("SELECT process")) {
      return { rows: [{ process: processQualityRow() }] };
    }
    if (sql.includes("signal_retention_jobs") && sql.includes("SELECT")) {
      return params[0] === "retention:missing"
        ? { rows: [] }
        : { rows: [retentionJobRow()] };
    }
    return { rows: [] };
  }

  async end() {
    this.closed = true;
  }
}

function realityRow() {
  return {
    snapshot_id: "reality:postgres-decision",
    source: "signal-test",
    created_at: "2026-06-01T00:00:00.000Z",
    data_quality: 88,
    freshness_score: 84,
    payload: { market: "US" },
    source_ref: null,
    metadata: { test: true },
  };
}

function decisionRow() {
  return {
    decision_id: "postgres-decision",
    created_at: "2026-06-01T00:00:00.000Z",
    source: "signal-test",
    reality_snapshot_id: "reality:postgres-decision",
    observation: { raw: "payload" },
    discovery: null,
    judgment: null,
    purpose: null,
    need: null,
    coherence: null,
    prediction: null,
    simulation: null,
    wisdom: null,
    agency: null,
    action: { action: "Watch" },
    outcome: null,
    accountability: null,
    human_summary: "Decision captured.",
    retention_tier: "hot",
  };
}

function outcomeRow() {
  return evaluateOutcome({
    decisionId: "postgres-decision",
    actualSuccessScore: 80,
    expectedConfidence: 72,
    expectedRisk: 30,
  });
}

function replayRow() {
  return {
    snapshot_id: "replay:postgres",
    decision_id: "postgres-decision",
    source: "signal-test",
    created_at: "2026-06-01T00:00:00.000Z",
    retention_tier: "hot",
    snapshot: { replay: true },
  };
}

function calibrationHistoryRow() {
  return {
    calibration_id: "calibration:postgres",
    decision_id: "postgres-decision",
    source: "signal-test",
    created_at: "2026-06-01T00:00:00.000Z",
    impact: 4,
    calibration: { confidence: 72 },
  };
}

function trustHistoryRow() {
  return {
    trust_id: "trust:postgres",
    decision_id: "postgres-decision",
    source: "signal-test",
    created_at: "2026-06-01T00:00:00.000Z",
    impact: 3,
    trust: { trust: 75 },
  };
}

function summaryRow() {
  return {
    summary_id: "summary:postgres",
    source: "signal-test",
    created_at: "2026-06-01T00:00:00.000Z",
    window_start: null,
    window_end: null,
    retention_tier: "warm",
    human_summary: "Summary.",
    summary: { decisions: 1 },
  };
}

function evidenceRow() {
  return {
    evidenceId: "evidence:postgres",
    source: "signal-test",
    observedAt: "2026-06-01T00:00:00.000Z",
    label: "Evidence",
    description: "Evidence supports the decision.",
    direction: "supporting" as const,
    strength: 70,
    confidence: 70,
  };
}

function thesisRow() {
  const thesis = createInvestorLearningAssessment({
    decisionId: "postgres-decision",
    source: "signal-test",
    venue: "US",
    symbol: "AAPL",
    recommendation: "Watch",
    confidence: 70,
  }).thesis;

  return {
    thesis_id: thesis.thesisId,
    source: thesis.source,
    title: thesis.title,
    description: thesis.description,
    status: thesis.status,
    confidence: thesis.confidence,
    created_at: thesis.createdAt,
    updated_at: thesis.updatedAt,
    thesis,
  };
}

function regimeRow() {
  const snapshot = regime("postgres", 70, 72, 68, "Watch");
  return {
    regime_snapshot_id: snapshot.regimeSnapshotId,
    source: snapshot.source,
    market_category: snapshot.marketCategory,
    venue: snapshot.venue,
    captured_at: snapshot.timestamp,
    market_health: snapshot.marketHealth,
    risk_state: snapshot.riskState,
    trust: snapshot.trust,
    confidence: snapshot.confidence,
    readiness: snapshot.readiness,
    opportunity_density: snapshot.opportunityDensity,
    final_recommendation: snapshot.finalRecommendation,
    eventual_outcome: null,
    snapshot,
  };
}

function reviewRow() {
  return {
    reviewId: "review:postgres",
    decisionId: "postgres-decision",
    source: "signal-test",
    reviewedAt: "2026-06-01T00:00:00.000Z",
    classification: "inconclusive" as const,
    whatWasRecommended: "Watch",
    whyRecommended: "Evidence supported waiting.",
    whatHappened: "Outcome is still forming.",
    lesson: "Wait for more evidence.",
  };
}

function learningRow() {
  return {
    learningId: "learning:postgres",
    source: "signal-test",
    decisionId: "postgres-decision",
    createdAt: "2026-06-01T00:00:00.000Z",
    lesson: "Wait for more evidence.",
  };
}

function calibrationRecordRow() {
  return createInvestorLearningAssessment({
    decisionId: "postgres-decision",
    source: "signal-test",
    venue: "US",
    symbol: "AAPL",
    recommendation: "Watch",
    confidence: 70,
  }).calibration;
}

function processQualityRow() {
  return createInvestorLearningAssessment({
    decisionId: "postgres-decision",
    source: "signal-test",
    venue: "US",
    symbol: "AAPL",
    recommendation: "Watch",
    confidence: 70,
  }).processQuality;
}

function retentionJobRow() {
  return {
    job_id: "retention:postgres",
    job_type: "compact",
    status: "running",
    started_at: "2026-06-01T00:00:00.000Z",
    completed_at: null,
    policy: { hotDays: 30, warmDays: 120, coldDays: 365 },
    result: null,
    error: null,
  };
}

function record(decisionId: string, createdAt = "2026-05-31T00:00:00.000Z") {
  return createDecisionRecord({
    decisionId,
    createdAt,
    source: "stocks-optimizer",
    observation: {
      raw: "payload",
      duplicatedMarketSnapshot: Array.from({ length: 10 }, (_, index) => index),
    },
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
