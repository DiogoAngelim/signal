/**
 * PipelineRunner — Executes the four-stage kernel pipeline:
 * generate → analyze → score → aggregate
 * Each stage produces output that feeds into the next, building up
 * the SignalPackage incrementally with full trace provenance.
 */

import type { SignalPackage, SignalPackageId, SignalPackageMeta, SignalPackageTraceEntry } from "../model/SignalPackage";
import { createSignalPackage } from "../model/SignalPackage";
import type { SignalGenerator } from "../interfaces/SignalGenerator";
import type { Analyzer } from "../interfaces/Analyzer";
import type { Scorer } from "../interfaces/Scorer";
import type { Aggregator } from "../interfaces/Aggregator";
import { EventBus } from "../infrastructure/EventBus";
import { SignalStore } from "../infrastructure/SignalStore";
import { DecisionStore, type DecisionRecord } from "../infrastructure/DecisionStore";

export class PipelineRunner {
  constructor(
    private readonly eventBus: EventBus,
    private readonly signalStore: SignalStore,
    private readonly decisionStore: DecisionStore,
  ) {}

  async run(
    packageId: SignalPackageId,
    meta: SignalPackageMeta,
    input: Record<string, unknown>,
    generator: SignalGenerator,
    analyzer: Analyzer,
    scorer: Scorer,
    aggregator: Aggregator,
  ): Promise<SignalPackage> {
    const builder = createSignalPackage(packageId, meta);

    // Stage 1: Generate
    const genStart = Date.now();
    const features = await generator.generate(input);
    const genDuration = Date.now() - genStart;
    builder.appendTrace(this.traceEntry("generate", generator.id, genDuration, { inputKeys: Object.keys(input) }));
    builder.withFeatures(features);
    this.eventBus.emit("pipeline:generate-complete", { packageId, generatorId: generator.id, durationMs: genDuration }, "PipelineRunner");

    // Stage 2: Analyze
    const anaStart = Date.now();
    const analysis = await analyzer.analyze(features);
    const anaDuration = Date.now() - anaStart;
    builder.appendTrace(this.traceEntry("analyze", analyzer.id, anaDuration, {}));
    builder.withAnalysis(analysis);
    this.eventBus.emit("pipeline:analyze-complete", { packageId, analyzerId: analyzer.id, durationMs: anaDuration }, "PipelineRunner");

    // Stage 3: Score
    const scoreStart = Date.now();
    const scoredResult = await scorer.score(analysis);
    const scoreDuration = Date.now() - scoreStart;
    builder.appendTrace(this.traceEntry("score", scorer.id, scoreDuration, { score: scoredResult.score, confidence: scoredResult.confidence }));
    builder.withDecision(scoredResult);
    this.eventBus.emit("pipeline:score-complete", { packageId, scorerId: scorer.id, durationMs: scoreDuration, score: scoredResult.score }, "PipelineRunner");

    // Stage 4: Aggregate
    const aggStart = Date.now();
    const aggregateResult = await aggregator.aggregate({ ...scoredResult, analysis });
    const aggDuration = Date.now() - aggStart;
    builder.appendTrace(this.traceEntry("aggregate", aggregator.id, aggDuration, { decision: aggregateResult.decision, weight: aggregateResult.weight }));
    builder.withResult(aggregateResult);
    this.eventBus.emit("pipeline:aggregate-complete", { packageId, aggregatorId: aggregator.id, durationMs: aggDuration, decision: aggregateResult.decision }, "PipelineRunner");

    // Build final immutable package
    const pkg = builder.build();

    // Persist to stores
    await this.signalStore.store(pkg);

    const decisionRecord: DecisionRecord = {
      id: `${packageId}:decision:${Date.now()}`,
      packageId,
      decision: aggregateResult.decision,
      weight: aggregateResult.weight,
      metadata: aggregateResult.metadata,
      timestamp: Date.now(),
    };
    await this.decisionStore.store(decisionRecord);

    this.eventBus.emit("pipeline:complete", { packageId, totalStages: 4 }, "PipelineRunner");

    return pkg;
  }

  private traceEntry(stage: string, pluginId: string, durationMs: number, payload: Record<string, unknown>): SignalPackageTraceEntry {
    return {
      stage,
      timestamp: Date.now(),
      pluginId,
      durationMs,
      payload,
    };
  }
}