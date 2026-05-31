import { describe, expect, it } from "vitest";
import { assessCoherence, createDecisionRecord, evaluateOutcome } from "@signal/decision";
import {
  CompactionJob,
  MemoryLifecycle,
  SIGNAL_DECISION_MEMORY_MIGRATION_SQL,
  createDecisionMemoryOperations,
  createInMemoryDecisionMemoryStore,
  decisionMemoryConfigFromEnv,
  listDecisionMemoryOperations,
  retentionTierForCreatedAt,
  summarizeDecisionRecords,
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
    expect(await store.listOutcomes(saved.decisionId)).toHaveLength(1);
    expect(await store.listReplaySnapshots(saved.decisionId)).toHaveLength(1);
    expect(await store.listCalibrationHistory(saved.decisionId)).toHaveLength(1);
    expect(await store.listTrustHistory(saved.decisionId)).toHaveLength(1);
    expect(await store.listSummaries({ source: saved.source })).toHaveLength(1);
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
    const recordOperation = operations.find((operation) => operation.name === "decision.record.v1");
    const summaryOperation = operations.find((operation) => operation.name === "decision.memory.summary.v1");

    expect(listDecisionMemoryOperations().map((operation) => operation.name)).toContain("decision.memory.compact.v1");
    expect(recordOperation).toBeTruthy();
    await recordOperation?.handler({
      decisionId: "operation:1",
      observation: { venue: "BINANCE" },
      source: "stocks-optimizer",
      modules: { discovery: 80, trust: 72, purpose: 70, recovery: 80 },
    });
    const summary = await summaryOperation?.handler({ generate: true, source: "stocks-optimizer" });
    expect(summary).toMatchObject({ count: 1 });
  });

  it("ships idempotent Postgres migrations for all shared memory tables", () => {
    for (const table of [
      "signal_decision_records",
      "signal_outcomes",
      "signal_replay_snapshots",
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
