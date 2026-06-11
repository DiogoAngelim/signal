/**
 * StocksOptimizerPlugin — Converts the Stocks-Optimizer signal-framework
 * into a kernel-compatible plugin implementation.
 *
 * This plugin maps the signal-framework's pipeline stages to the
 * kernel's four-stage pipeline: generate → analyze → score → aggregate.
 *
 * The existing signal-framework modules are NOT modified — they are
 * wrapped through the adapter base classes.
 */

import type { SignalPlugin, PluginContext } from "../plugin/SignalPlugin";
import type { SignalGeneratorInput, SignalGeneratorOutput } from "../interfaces/SignalGenerator";
import type { AnalyzerInput, AnalyzerOutput } from "../interfaces/Analyzer";
import type { ScorerInput, ScorerOutput } from "../interfaces/Scorer";
import type { AggregatorInput, AggregatorOutput } from "../interfaces/Aggregator";
import { BaseSignalGenerator } from "../adapters/BaseSignalGenerator";
import { BaseAnalyzer } from "../adapters/BaseAnalyzer";
import { BaseScorer } from "../adapters/BaseScorer";
import { BaseAggregator } from "../adapters/BaseAggregator";

// ─── Stocks Generator ──────────────────────────────────────────
// Wraps the signal-framework's perception/synchronization stages
// (metrics ingestion, data sync, metric normalization)

export class StocksGenerator extends BaseSignalGenerator {
  readonly id = "stocks-generator";
  readonly version = 1;

  private _generateFn?: (input: SignalGeneratorInput) => Promise<SignalGeneratorOutput>;

  /**
   * Set the underlying generate function from the signal-framework.
   * This is called during plugin registration to wire the existing module.
   */
  setGenerateFn(fn: (input: SignalGeneratorInput) => Promise<SignalGeneratorOutput>): void {
    this._generateFn = fn;
  }

  protected async doGenerate(input: SignalGeneratorInput): Promise<SignalGeneratorOutput> {
    if (!this._generateFn) {
      // Default: pass-through features from input
      return { ...input };
    }
    return this._generateFn(input);
  }
}

// ─── Stocks Analyzer ───────────────────────────────────────────
// Wraps the signal-framework's reflection/calibration/judgement stages
// (regime detection, metric analysis, signal recognition)

export class StocksAnalyzer extends BaseAnalyzer {
  readonly id = "stocks-analyzer";
  readonly version = 1;

  private _analyzeFn?: (input: AnalyzerInput) => Promise<AnalyzerOutput>;

  setAnalyzeFn(fn: (input: AnalyzerInput) => Promise<AnalyzerOutput>): void {
    this._analyzeFn = fn;
  }

  protected async doAnalyze(input: AnalyzerInput): Promise<AnalyzerOutput> {
    if (!this._analyzeFn) {
      // Default: pass-through analysis
      return { ...input };
    }
    return this._analyzeFn(input);
  }
}

// ─── Stocks Scorer ─────────────────────────────────────────────
// Wraps the signal-framework's scoring/decision stages
// (viability scoring, execution readiness, opportunity ranking)

export class StocksScorer extends BaseScorer {
  readonly id = "stocks-scorer";
  readonly version = 1;

  private _scoreFn?: (input: ScorerInput) => Promise<ScorerOutput>;

  setScoreFn(fn: (input: ScorerInput) => Promise<ScorerOutput>): void {
    this._scoreFn = fn;
  }

  protected async doScore(input: ScorerInput): Promise<ScorerOutput> {
    if (!this._scoreFn) {
      // Default: neutral scoring
      return { score: 0.5, confidence: 0.5, rationale: { source: "stocks-scorer-default" } };
    }
    return this._scoreFn(input);
  }
}

// ─── Stocks Aggregator ────────────────────────────────────────
// Wraps the signal-framework's aggregation/ranking stages
// (opportunity aggregation, decision synthesis)

export class StocksAggregator extends BaseAggregator {
  readonly id = "stocks-aggregator";
  readonly version = 1;

  private _aggregateFn?: (input: AggregatorInput) => Promise<AggregatorOutput>;

  setAggregateFn(fn: (input: AggregatorInput) => Promise<AggregatorOutput>): void {
    this._aggregateFn = fn;
  }

  protected async doAggregate(input: AggregatorInput): Promise<AggregatorOutput> {
    if (!this._aggregateFn) {
      // Default: pass-through aggregation
      return { decision: "hold", weight: 0.5, metadata: { source: "stocks-aggregator-default" } };
    }
    return this._aggregateFn(input);
  }
}

// ─── Stocks Optimizer Plugin ───────────────────────────────────

export class StocksOptimizerPlugin implements SignalPlugin {
  readonly id = "stocks-optimizer";
  readonly name = "Stocks Optimizer";
  readonly version = 1;
  readonly description = "Stocks market signal analysis plugin — wraps the signal-framework pipeline stages";
  readonly domain = "stocks";
  readonly capabilities = ["generate", "analyze", "score", "aggregate"] as const;

  private readonly _generator: StocksGenerator;
  private readonly _analyzer: StocksAnalyzer;
  private readonly _scorer: StocksScorer;
  private readonly _aggregator: StocksAggregator;

  constructor() {
    this._generator = new StocksGenerator();
    this._analyzer = new StocksAnalyzer();
    this._scorer = new StocksScorer();
    this._aggregator = new StocksAggregator();
  }

  async onRegister(_context: PluginContext): Promise<void> {
    // The signal-framework modules are wired here by the consumer
    // who has access to both the kernel and the framework packages.
    // See `wireFramework()` below for the integration point.
  }

  async onDispose(): Promise<void> {
    // Clean up any framework resources
  }

  getGenerator(): StocksGenerator {
    return this._generator;
  }

  getAnalyzer(): StocksAnalyzer {
    return this._analyzer;
  }

  getScorer(): StocksScorer {
    return this._scorer;
  }

  getAggregator(): StocksAggregator {
    return this._aggregator;
  }
}

// ─── Framework Wiring Helper ───────────────────────────────────
// Consumers use this to connect the signal-framework to the plugin

export type StocksFrameworkFns = {
  generate?: (input: SignalGeneratorInput) => Promise<SignalGeneratorOutput>;
  analyze?: (input: AnalyzerInput) => Promise<AnalyzerOutput>;
  score?: (input: ScorerInput) => Promise<ScorerOutput>;
  aggregate?: (input: AggregatorInput) => Promise<AggregatorOutput>;
};

export function wireStocksFramework(plugin: StocksOptimizerPlugin, fns: StocksFrameworkFns): void {
  if (fns.generate) plugin.getGenerator().setGenerateFn(fns.generate);
  if (fns.analyze) plugin.getAnalyzer().setAnalyzeFn(fns.analyze);
  if (fns.score) plugin.getScorer().setScoreFn(fns.score);
  if (fns.aggregate) plugin.getAggregator().setAggregateFn(fns.aggregate);
}