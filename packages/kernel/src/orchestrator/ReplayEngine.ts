/**
 * ReplayEngine — Replays previously executed pipelines for verification,
 * audit, and debugging. Re-executes the four-stage pipeline using stored
 * SignalPackage trace data to reproduce and validate outcomes.
 */

import type { DecisionStore } from "../infrastructure/DecisionStore";
import type { EventBus } from "../infrastructure/EventBus";
import type { SignalStore } from "../infrastructure/SignalStore";
import type { Aggregator } from "../interfaces/Aggregator";
import type { Analyzer } from "../interfaces/Analyzer";
import type { Scorer } from "../interfaces/Scorer";
import type { SignalGenerator } from "../interfaces/SignalGenerator";
import type { SignalPackage, SignalPackageId } from "../model/SignalPackage";
import type { PipelineRunner } from "./PipelineRunner";

export type ReplayResult = {
  readonly originalPackageId: SignalPackageId;
  readonly replayedPackageId: SignalPackageId;
  readonly match: boolean;
  readonly mismatches: ReadonlyArray<ReplayMismatch>;
  readonly replayedAt: number;
};

export type ReplayMismatch = {
  readonly stage: string;
  readonly field: string;
  readonly original: unknown;
  readonly replayed: unknown;
};

export class ReplayEngine {
  constructor(
    private readonly eventBus: EventBus,
    private readonly signalStore: SignalStore,
    private readonly decisionStore: DecisionStore,
    private readonly pipelineRunner: PipelineRunner,
  ) {}

  async replay(
    originalPackageId: SignalPackageId,
    input: Record<string, unknown>,
    generator: SignalGenerator,
    analyzer: Analyzer,
    scorer: Scorer,
    aggregator: Aggregator,
  ): Promise<ReplayResult> {
    this.eventBus.emit("replay:started", { originalPackageId }, "ReplayEngine");

    const original = await this.signalStore.get(originalPackageId);
    if (!original) {
      throw new Error(
        `SignalPackage not found for replay: ${originalPackageId}`,
      );
    }

    // Re-execute the pipeline with the same input
    const meta = { ...original.meta, createdAt: Date.now() };
    const replayedPackageId =
      `replay:${originalPackageId}:${Date.now()}` as SignalPackageId;

    const replayed = await this.pipelineRunner.run(
      replayedPackageId,
      meta,
      input,
      generator,
      analyzer,
      scorer,
      aggregator,
    );

    // Compare results
    const mismatches = this.comparePackages(original, replayed);
    const match = mismatches.length === 0;

    const result: ReplayResult = {
      originalPackageId,
      replayedPackageId,
      match,
      mismatches,
      replayedAt: Date.now(),
    };

    this.eventBus.emit(
      "replay:completed",
      {
        originalPackageId,
        replayedPackageId,
        match,
        mismatchCount: mismatches.length,
      },
      "ReplayEngine",
    );

    return result;
  }

  async replayRange(
    packageIds: SignalPackageId[],
    inputs: Map<SignalPackageId, Record<string, unknown>>,
    generator: SignalGenerator,
    analyzer: Analyzer,
    scorer: Scorer,
    aggregator: Aggregator,
  ): Promise<ReadonlyArray<ReplayResult>> {
    const results: ReplayResult[] = [];

    for (const packageId of packageIds) {
      const input = inputs.get(packageId);
      if (!input) {
        this.eventBus.emit(
          "replay:skipped",
          { packageId, reason: "no input" },
          "ReplayEngine",
        );
        continue;
      }

      const result = await this.replay(
        packageId,
        input,
        generator,
        analyzer,
        scorer,
        aggregator,
      );
      results.push(result);
    }

    const allMatch = results.every((r) => r.match);
    this.eventBus.emit(
      "replay:range-completed",
      {
        total: results.length,
        matched: results.filter((r) => r.match).length,
        mismatched: results.filter((r) => !r.match).length,
        allMatch,
      },
      "ReplayEngine",
    );

    return results;
  }

  private comparePackages(
    original: SignalPackage,
    replayed: SignalPackage,
  ): ReplayMismatch[] {
    const mismatches: ReplayMismatch[] = [];

    // Compare features
    this.deepCompare(
      "features",
      original.features,
      replayed.features,
      mismatches,
    );

    // Compare analysis
    this.deepCompare(
      "analysis",
      original.analysis,
      replayed.analysis,
      mismatches,
    );

    // Compare decision
    this.deepCompare(
      "decision",
      original.decision,
      replayed.decision,
      mismatches,
    );

    // Compare result
    this.deepCompare("result", original.result, replayed.result, mismatches);

    return mismatches;
  }

  private deepCompare(
    stage: string,
    original: unknown,
    replayed: unknown,
    mismatches: ReplayMismatch[],
    prefix = "",
  ): void {
    const field = prefix || stage;

    if (typeof original !== typeof replayed) {
      mismatches.push({ stage, field, original, replayed });
      return;
    }

    if (original === null || replayed === null) {
      if (original !== replayed) {
        mismatches.push({ stage, field, original, replayed });
      }
      return;
    }

    if (typeof original === "object" && typeof replayed === "object") {
      const origObj = original as Record<string, unknown>;
      const repObj = replayed as Record<string, unknown>;
      const allKeys = new Set([
        ...Object.keys(origObj),
        ...Object.keys(repObj),
      ]);

      for (const key of allKeys) {
        this.deepCompare(
          stage,
          origObj[key],
          repObj[key],
          mismatches,
          prefix ? `${prefix}.${key}` : key,
        );
      }
      return;
    }

    if (original !== replayed) {
      mismatches.push({ stage, field, original, replayed });
    }
  }
}
