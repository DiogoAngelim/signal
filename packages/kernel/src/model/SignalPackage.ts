/**
 * SignalPackage — Immutable contract that flows through the Signal Kernel pipeline.
 * This is the single shared data contract between Kernel and all Plugins.
 */

export type SignalPackageId = string;

export type SignalPackageMeta = {
  readonly createdAt: number;
  readonly domain: string;
  readonly version: number;
  readonly source: string;
};

/**
 * SignalPackage is the immutable envelope that carries data through
 * the kernel pipeline: transform → analyze → decide → execute.
 */
export type SignalPackage<TFeatures = unknown, TAnalysis = unknown, TDecision = unknown, TResult = unknown> = {
  readonly id: SignalPackageId;
  readonly meta: SignalPackageMeta;
  readonly features: TFeatures;
  readonly analysis: TAnalysis;
  readonly decision: TDecision;
  readonly result: TResult;
  readonly trace: ReadonlyArray<SignalPackageTraceEntry>;
};

export type SignalPackageTraceEntry = {
  readonly stage: string;
  readonly timestamp: number;
  readonly pluginId: string;
  readonly durationMs: number;
  readonly payload?: Record<string, unknown>;
};

/**
 * Builder for constructing SignalPackage instances incrementally.
 * Ensures immutability of the final package.
 */
export class SignalPackageBuilder<TFeatures = unknown, TAnalysis = unknown, TDecision = unknown, TResult = unknown> {
  private _features: TFeatures = null as unknown as TFeatures;
  private _analysis: TAnalysis = null as unknown as TAnalysis;
  private _decision: TDecision = null as unknown as TDecision;
  private _result: TResult = null as unknown as TResult;
  private readonly _trace: SignalPackageTraceEntry[] = [];

  constructor(
    private readonly id: SignalPackageId,
    private readonly meta: SignalPackageMeta,
  ) {}

  withFeatures(features: TFeatures): this {
    this._features = features;
    return this;
  }

  withAnalysis(analysis: TAnalysis): this {
    this._analysis = analysis;
    return this;
  }

  withDecision(decision: TDecision): this {
    this._decision = decision;
    return this;
  }

  withResult(result: TResult): this {
    this._result = result;
    return this;
  }

  appendTrace(entry: SignalPackageTraceEntry): this {
    this._trace.push(entry);
    return this;
  }

  build(): SignalPackage<TFeatures, TAnalysis, TDecision, TResult> {
    return Object.freeze({
      id: this.id,
      meta: Object.freeze({ ...this.meta }),
      features: this._features,
      analysis: this._analysis,
      decision: this._decision,
      result: this._result,
      trace: Object.freeze([...this._trace.map((t) => Object.freeze({ ...t }))]),
    });
  }
}

export function createSignalPackage<TFeatures = unknown, TAnalysis = unknown, TDecision = unknown, TResult = unknown>(
  id: SignalPackageId,
  meta: SignalPackageMeta,
): SignalPackageBuilder<TFeatures, TAnalysis, TDecision, TResult> {
  return new SignalPackageBuilder(id, meta);
}