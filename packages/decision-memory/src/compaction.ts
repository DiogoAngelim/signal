import type { SignalDecisionRecord } from "@signal/decision";
import {
  DEFAULT_RETENTION_POLICY,
  MemoryLifecycle,
  normalizeRetentionPolicy,
} from "./retention";
import {
  anonymizeExpiredRecord,
  compactDecisionRecord,
  summarizeDecisionRecords,
} from "./summary";
import type {
  CompactionJobInput,
  CompactionJobResult,
  DecisionMemoryStore,
  RetentionPolicy,
} from "./types";

export class CompactionJob {
  private readonly store: DecisionMemoryStore;
  private readonly lifecycle: MemoryLifecycle;

  constructor(input: {
    store: DecisionMemoryStore;
    policy?: RetentionPolicy;
  }) {
    this.store = input.store;
    this.lifecycle = new MemoryLifecycle(
      normalizeRetentionPolicy(input.policy ?? DEFAULT_RETENTION_POLICY),
    );
  }

  async run(input: CompactionJobInput = {}): Promise<CompactionJobResult> {
    const now = input.now ?? new Date();
    const jobId = `retention:${now.toISOString()}:${Math.random().toString(36).slice(2, 8)}`;
    const result: CompactionJobResult = {
      jobId,
      scanned: 0,
      compacted: 0,
      summarized: 0,
      expired: 0,
      anonymized: 0,
      deleted: 0,
      retained: 0,
    };

    await this.store.saveRetentionJob({
      jobId,
      jobType: "compact",
      status: "running",
      startedAt: now.toISOString(),
      policy: this.lifecycle.policy,
    });

    try {
      const records = await this.store.listDecisionRecords({
        source: input.source,
        limit: input.limit ?? 1_000,
      });
      result.scanned = records.length;

      const summaryCandidates: SignalDecisionRecord[] = [];
      for (const record of records) {
        const tier = this.lifecycle.tierFor(record, now);
        if (tier === "hot") {
          result.retained += 1;
          if (record.retentionTier !== "hot") {
            await this.store.saveDecisionRecord({
              ...record,
              retentionTier: "hot",
            });
          }
          continue;
        }

        if (tier === "expired") {
          result.expired += 1;
          if (this.lifecycle.policy.expiredMode === "anonymize") {
            await this.store.saveDecisionRecord(anonymizeExpiredRecord(record));
            result.anonymized += 1;
          } else if (this.store.deleteDecisionRecord) {
            await this.store.deleteDecisionRecord(record.decisionId);
            result.deleted += 1;
          } else {
            await this.store.saveDecisionRecord(anonymizeExpiredRecord(record));
            result.anonymized += 1;
          }
          continue;
        }

        summaryCandidates.push(record);
        const summary = summarizeDecisionRecords({
          records: [record],
          outcomes: record.outcome ? [record.outcome] : [],
          source: record.source,
          retentionTier: tier,
          now,
        });
        await this.store.saveSummary(summary);
        await this.store.saveDecisionRecord(
          compactDecisionRecord(record, tier, summary.summaryId),
        );
        result.compacted += 1;
        result.summarized += 1;
      }

      if (summaryCandidates.length > 1) {
        const grouped = groupBySource(summaryCandidates);
        for (const [source, sourceRecords] of grouped) {
          await this.store.saveSummary(
            summarizeDecisionRecords({
              records: sourceRecords,
              outcomes: sourceRecords.flatMap((record) =>
                record.outcome ? [record.outcome] : [],
              ),
              source,
              retentionTier: "warm",
              now,
            }),
          );
          result.summarized += 1;
        }
      }

      await this.store.updateRetentionJob(jobId, {
        status: "completed",
        completedAt: new Date().toISOString(),
        result,
      });
      return result;
    } catch (error) {
      await this.store.updateRetentionJob(jobId, {
        status: "failed",
        completedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
        result,
      });
      throw error;
    }
  }
}

function groupBySource(
  records: readonly SignalDecisionRecord[],
): Map<string, SignalDecisionRecord[]> {
  const grouped = new Map<string, SignalDecisionRecord[]>();
  for (const record of records) {
    const source = record.source || "signal";
    const bucket = grouped.get(source) ?? [];
    bucket.push(record);
    grouped.set(source, bucket);
  }
  return grouped;
}
